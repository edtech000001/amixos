import Anthropic from '@anthropic-ai/sdk';
import type { AssistantChatMessage, AssistantContext, JobDraft } from './types';
import { buildSystemBlocks } from './prompt';
import {
  TOOL_DEFINITIONS,
  buildDraft,
  executeQueryClients,
  executeQueryEmployees,
  executeQueryJobs,
  executeQueryTimesheets,
  executeSuggestCrew,
} from './tools';

// The Ami agent loop: manual tool-use loop against claude-opus-4-8. The server
// is stateless — the client's text transcript is replayed each request; tool
// calls live only within one request. propose_job never writes: its handler
// normalizes a JobDraft that rides back to the client for preview + Confirmar.

const MODEL = 'claude-opus-4-8';
const MAX_ITERATIONS = 8;
const MAX_TOKENS = 2048;
const MAX_WIRE_MESSAGES = 20;

const FALLBACK_REPLY =
  'Perdón, no pude completar eso. ¿Me lo puedes repetir de otra forma?';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function executeTool(
  ctx: AssistantContext,
  name: string,
  input: Record<string, any>,
): Promise<{ result: string; draft?: JobDraft }> {
  switch (name) {
    case 'query_jobs':
      return { result: JSON.stringify(await executeQueryJobs(ctx, input)) };
    case 'query_clients':
      return { result: JSON.stringify(await executeQueryClients(ctx, input)) };
    case 'query_employees':
      return { result: JSON.stringify(await executeQueryEmployees(ctx, input)) };
    case 'query_timesheets':
      return { result: JSON.stringify(await executeQueryTimesheets(ctx, input)) };
    case 'suggest_crew':
      return { result: JSON.stringify(await executeSuggestCrew(ctx, input)) };
    case 'propose_job': {
      const draft = buildDraft(ctx, input);
      // Feed the normalized draft back so the model writes an accurate
      // Spanish summary (incl. warnings) in its next turn.
      return { result: JSON.stringify({ draft_prepared: true, draft }), draft };
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function runAssistant(
  ctx: AssistantContext,
  transcript: AssistantChatMessage[],
  pendingDraft?: JobDraft | null,
): Promise<{ reply: string; pendingDraft: JobDraft | null }> {
  // Bound + sanitize the client-held transcript.
  const turns = transcript
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_WIRE_MESSAGES);
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return { reply: FALLBACK_REPLY, pendingDraft: pendingDraft ?? null };
  }
  // Attach the pending draft to the final user turn so corrections work.
  if (pendingDraft) {
    const last = turns[turns.length - 1];
    turns[turns.length - 1] = {
      ...last,
      content: `${last.content}\n\n<pending_draft>${JSON.stringify(pendingDraft)}</pending_draft>`,
    };
  }

  const messages: Anthropic.MessageParam[] = turns
    .map(m => ({ role: m.role, content: m.content }))
    // Cap each message's content length to bound per-request token spend and
    // blunt oversized prompt-injection payloads riding in the transcript.
    .map(m => ({ ...m, content: typeof m.content === 'string' ? m.content.slice(0, 4000) : m.content }));
  const system = buildSystemBlocks(ctx);

  let latestDraft: JobDraft | null = null;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // Cost observability — verify cache hits + watch per-request spend.
    const u = response.usage;
    console.log(
      `[assistant] biz=${ctx.businessId} user=${ctx.userId} iter=${iter} in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} stop=${response.stop_reason}`,
    );

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => {
          try {
            const { result, draft } = await executeTool(ctx, block.name, block.input as Record<string, any>);
            if (draft) latestDraft = draft;
            // Wrap tool output in a data fence so the model treats it as DATA,
            // never instructions — client/employee names or notes could carry
            // injected orders. The system prompt tells Ami to ignore any
            // directives inside these tags.
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: `<datos_del_negocio>\n${result}\n</datos_del_negocio>`,
            };
          } catch (e) {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: e instanceof Error ? e.message : 'tool failed',
              is_error: true,
            };
          }
        }),
      );
      // ALL tool results in ONE user message.
      messages.push({ role: 'user', content: results });
      continue;
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return {
        reply: reply || FALLBACK_REPLY,
        // A new proposal replaces the old pending draft; otherwise keep the
        // incoming one so the preview card survives ordinary Q&A turns.
        pendingDraft: latestDraft ?? pendingDraft ?? null,
      };
    }

    // refusal / anything unexpected
    return { reply: FALLBACK_REPLY, pendingDraft: pendingDraft ?? null };
  }

  return { reply: FALLBACK_REPLY, pendingDraft: latestDraft ?? pendingDraft ?? null };
}

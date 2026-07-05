import { useCallback, useRef, useState } from 'react';
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantConfirmResponse,
  JobDraft,
} from './types';

// Platform-agnostic state machine for the Ami chat. Each platform injects a
// fetchJson built from its own getApiBaseUrl()/getJwt() helpers; this hook
// owns the transcript, the pending draft, and the send/confirm flows.

export interface AssistantFetcher {
  /** POST {path} with a JSON body; resolves the `data` payload or throws. */
  post: <T>(path: string, body: unknown) => Promise<T>;
}

export interface AssistantBubble extends AssistantChatMessage {
  /** Local-only id for list keys. */
  id: string;
  /** Attach the draft card to the assistant bubble that produced it. */
  draft?: JobDraft | null;
  /** Set on the bubble whose draft was confirmed. */
  createdJobId?: string;
}

let bubbleSeq = 0;
const nextId = () => `b${++bubbleSeq}`;

// Keep the wire transcript bounded — the server also enforces this.
const MAX_WIRE_MESSAGES = 20;

export function useAssistantCore(businessId: string | null, fetcher: AssistantFetcher) {
  const [bubbles, setBubbles] = useState<AssistantBubble[]>([]);
  const [pendingDraft, setPendingDraft] = useState<JobDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  // Guard against out-of-order responses if the user fires twice quickly.
  const seqRef = useRef(0);

  /** Sends a user message; resolves the assistant's reply text (null on error/superseded). */
  const send = useCallback(async (text: string): Promise<string | null> => {
    const trimmed = text.trim();
    if (!trimmed || !businessId || sending) return null;
    const mySeq = ++seqRef.current;
    setError(false);
    const userBubble: AssistantBubble = { id: nextId(), role: 'user', content: trimmed };
    setBubbles(prev => [...prev, userBubble]);
    setSending(true);
    try {
      const wire: AssistantChatMessage[] = [...bubbles, userBubble]
        .map(({ role, content }) => ({ role, content }))
        .slice(-MAX_WIRE_MESSAGES);
      const data = await fetcher.post<AssistantChatResponse>('/api/v1/assistant/chat', {
        business_id: businessId,
        messages: wire,
        pending_draft: pendingDraft,
      });
      if (mySeq !== seqRef.current) return null; // superseded
      setBubbles(prev => [
        ...prev,
        { id: nextId(), role: 'assistant', content: data.reply, draft: data.pending_draft ?? null },
      ]);
      setPendingDraft(data.pending_draft ?? null);
      return data.reply;
    } catch {
      if (mySeq !== seqRef.current) return null;
      setError(true);
      return null;
    } finally {
      if (mySeq === seqRef.current) setSending(false);
    }
  }, [bubbles, businessId, fetcher, pendingDraft, sending]);

  const confirm = useCallback(async (): Promise<string | null> => {
    if (!pendingDraft || !businessId || confirming) return null;
    setConfirming(true);
    setError(false);
    try {
      const data = await fetcher.post<AssistantConfirmResponse>('/api/v1/assistant/confirm', {
        business_id: businessId,
        draft: pendingDraft,
      });
      // Mark the bubble that carried this draft as created + clear the draft.
      setBubbles(prev =>
        prev.map(b =>
          b.draft?.job_id === pendingDraft.job_id ? { ...b, createdJobId: data.job_id } : b,
        ),
      );
      setPendingDraft(null);
      return data.job_id;
    } catch (e) {
      // Server-side validation (e.g. required fields the draft is missing)
      // comes back as a human-readable message — say it as Ami instead of
      // the generic error row. Machine codes / network errors stay generic.
      const msg = e instanceof Error ? e.message : '';
      if (msg && msg.includes(' ') && !/^HTTP \d+/.test(msg)) {
        setBubbles(prev => [...prev, { id: nextId(), role: 'assistant', content: msg }]);
      } else {
        setError(true);
      }
      return null;
    } finally {
      setConfirming(false);
    }
  }, [businessId, confirming, fetcher, pendingDraft]);

  const reset = useCallback(() => {
    seqRef.current++;
    setBubbles([]);
    setPendingDraft(null);
    setSending(false);
    setConfirming(false);
    setError(false);
  }, []);

  return { bubbles, pendingDraft, sending, confirming, error, send, confirm, reset };
}

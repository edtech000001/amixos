import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest, getBusinessRole } from '../middleware/auth';
import { rlsClient } from '../lib/supabaseRls';
import { runAssistant } from '../lib/assistant/loop';
import { confirmDraft, DraftValidationError } from '../lib/assistant/draft';
import type { AssistantChatMessage, AssistantContext, JobDraft } from '../lib/assistant/types';

// "Ami" — the in-app AI assistant. /chat runs the Claude tool loop (reads +
// job-draft proposals); /confirm executes a previously proposed draft. All
// business-data access happens on an RLS client scoped to the caller's JWT,
// so the assistant can never see or write anything the user couldn't.

export const assistantRouter = Router();

// Per-user limits — the Claude calls behind /chat are the expensive part.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'anon',
  standardHeaders: true,
  legacyHeaders: false,
});
const confirmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'anon',
  standardHeaders: true,
  legacyHeaders: false,
});

/** Load everything the loop + confirm need, on the caller's RLS client. */
async function buildContext(req: AuthRequest, businessId: string): Promise<AssistantContext | null> {
  const userId = req.user!.id;
  const role = await getBusinessRole(userId, businessId);
  if (!role) return null;
  const db = rlsClient(req.token!);

  const [bizRes, empRes, tplRes, roleRes] = await Promise.all([
    db.from('businesses').select('name').eq('id', businessId).maybeSingle(),
    db.from('employees').select('id, first_name, last_name, role, user_id').eq('business_id', businessId).limit(200),
    db.from('job_field_templates').select('field_key, field_label, field_type, field_options, field_config, required').eq('business_id', businessId).order('sort_order'),
    role === 'field'
      ? db.from('business_roles').select('permissions').eq('business_id', businessId).eq('key', 'field').maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const employees = (empRes.data ?? []).map((e: any) => ({
    id: e.id,
    name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
    role: e.role ?? null,
  }));
  const mine = (empRes.data ?? []).find((e: any) => e.user_id === userId);

  // Field crew without the scheduleJobs cap may only record completed work —
  // mirrors can.scheduleJobs (shared/src/lib/permissions.ts).
  const scheduleCap = !!roleRes?.data?.permissions?.caps?.scheduleJobs;
  const restrictedCreator = role === 'field' && !scheduleCap;

  return {
    businessId,
    businessName: bizRes.data?.name ?? 'tu negocio',
    userId,
    userName: mine ? `${mine.first_name ?? ''} ${mine.last_name ?? ''}`.trim() : (req.user!.email ?? ''),
    role,
    restrictedCreator,
    myEmployeeId: mine?.id ?? null,
    db,
    employees,
    fieldTemplates: (tplRes.data ?? []) as AssistantContext['fieldTemplates'],
  };
}

// POST /api/v1/assistant/chat
assistantRouter.post('/chat', authenticate, chatLimiter, async (req: AuthRequest, res: Response) => {
  const { business_id, messages, pending_draft } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages required' });
  }
  try {
    const ctx = await buildContext(req, business_id);
    if (!ctx) return res.status(403).json({ success: false, message: 'Not a member of this business' });

    const { reply, pendingDraft } = await runAssistant(
      ctx,
      messages as AssistantChatMessage[],
      (pending_draft ?? null) as JobDraft | null,
    );
    return res.json({ success: true, data: { reply, pending_draft: pendingDraft } });
  } catch (e) {
    console.error('[assistant/chat]', e);
    return res.status(500).json({ success: false, message: 'assistant_failed' });
  }
});

// POST /api/v1/assistant/confirm
assistantRouter.post('/confirm', authenticate, confirmLimiter, async (req: AuthRequest, res: Response) => {
  const { business_id, draft } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string' || !draft) {
    return res.status(400).json({ success: false, message: 'business_id and draft required' });
  }
  try {
    const ctx = await buildContext(req, business_id);
    if (!ctx) return res.status(403).json({ success: false, message: 'Not a member of this business' });

    const { jobId, alreadyExisted } = await confirmDraft(ctx, draft as JobDraft);
    return res.json({ success: true, data: { job_id: jobId, already_existed: alreadyExisted } });
  } catch (e) {
    if (e instanceof DraftValidationError) {
      return res.status(400).json({ success: false, message: e.message });
    }
    console.error('[assistant/confirm]', e);
    return res.status(500).json({ success: false, message: 'confirm_failed' });
  }
});

import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase';
import type { AssistantContext, JobDraft } from './types';

// Confirm-side validation + insert. Mirrors the job form's save() contract
// (mobile/app/dashboard/trabajos/nuevo.tsx): jobs row + job_assignments rows
// + pipeline create-stamps + audit_log. All data access runs on ctx.db (the
// caller's RLS client) so member_res('jobs','create') is the real gate; only
// the audit write uses the service-role client (same as other api routes).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DraftValidationError extends Error {}

export async function confirmDraft(
  ctx: AssistantContext,
  draft: JobDraft,
): Promise<{ jobId: string; alreadyExisted: boolean }> {
  // ── Validate ──────────────────────────────────────────────────────────────
  if (!draft || typeof draft !== 'object') throw new DraftValidationError('draft requerido');
  if (draft.business_id !== ctx.businessId) throw new DraftValidationError('business mismatch');
  const jobId = typeof draft.job_id === 'string' && draft.job_id ? draft.job_id : randomUUID();
  const title = (draft.title ?? '').trim();
  if (!title) throw new DraftValidationError('título requerido');
  let status = ['scheduled', 'in_progress', 'completed'].includes(draft.status)
    ? draft.status
    : 'scheduled';
  let publishedToCrew = true;
  // Field-role without scheduleJobs cap: force completed + published no matter
  // what the (client-supplied) draft says.
  if (ctx.restrictedCreator) status = 'completed';
  for (const d of [draft.scheduled_date, draft.end_date]) {
    if (d != null && !DATE_RE.test(d)) throw new DraftValidationError('fecha inválida');
  }
  const allDay = draft.all_day !== false;
  const numOk = (n: unknown) => n == null || (typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (!numOk(draft.total_hours) || !numOk(draft.driver_hours)) {
    throw new DraftValidationError('horas inválidas');
  }

  // Referenced ids must exist in THIS business (RLS re-checks, but fail early
  // with a clear message).
  const employeeIds = [
    ...new Set([
      ...draft.crew.map(c => c.employee_id).filter((v): v is string => !!v),
      ...(draft.driver_employee_ids ?? []),
    ]),
  ];
  if (employeeIds.length) {
    const { data } = await ctx.db
      .from('employees')
      .select('id')
      .eq('business_id', ctx.businessId)
      .in('id', employeeIds);
    const found = new Set((data ?? []).map((r: any) => r.id));
    const missing = employeeIds.filter(id => !found.has(id));
    if (missing.length) throw new DraftValidationError('empleado no encontrado');
  }
  let clientId: string | null = null;
  if (draft.client_id) {
    const { data } = await ctx.db
      .from('clients')
      .select('id')
      .eq('business_id', ctx.businessId)
      .eq('id', draft.client_id)
      .maybeSingle();
    if (!data) throw new DraftValidationError('cliente no encontrado');
    clientId = draft.client_id;
  }

  // Custom fields: only keys that exist in the business's templates.
  const templateKeys = new Set(ctx.fieldTemplates.map(f => f.field_key));
  const customFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.custom_fields ?? {})) {
    if (templateKeys.has(k)) customFields[k] = String(v);
  }

  // Crew: single valid lead (must be registered), field creator self-assigns.
  const crew = (draft.crew ?? []).filter(c => (c.worker_name ?? '').trim());
  let leadSeen = false;
  for (const c of crew) {
    if (c.is_lead) {
      if (leadSeen || !c.employee_id) c.is_lead = false;
      else leadSeen = true;
    }
  }
  if (ctx.restrictedCreator && ctx.myEmployeeId && !crew.some(c => c.employee_id === ctx.myEmployeeId)) {
    crew.push({
      employee_id: ctx.myEmployeeId,
      worker_name: ctx.userName,
      is_lead: !crew.some(c => c.is_lead),
    });
  }
  const drivers = [...new Set(draft.driver_employee_ids ?? [])];

  // ── Insert (idempotent on job_id) ────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const createStamps: Record<string, unknown> = {};
  if (status === 'scheduled' || status === 'in_progress' || status === 'completed') createStamps.scheduled_at = nowIso;
  if (status === 'in_progress' || status === 'completed') createStamps.in_progress_at = nowIso;
  if (status === 'completed') {
    createStamps.completed_at = nowIso;
    createStamps.completed_date = nowIso.split('T')[0];
  }

  const payload = {
    id: jobId,
    business_id: ctx.businessId,
    status,
    created_by: ctx.userId,
    client_id: clientId,
    title,
    description: draft.description?.trim() || null,
    priority: draft.priority ?? 'normal',
    scheduled_date: draft.scheduled_date ?? null,
    end_date: draft.end_date ?? null,
    all_day: allDay,
    time_start: allDay ? null : draft.time_start ?? null,
    time_end: allDay ? null : draft.time_end ?? null,
    total_hours: draft.total_hours ?? null,
    driver_employee_ids: drivers,
    driver_hours: drivers.length ? draft.driver_hours ?? null : null,
    location_id: null,
    job_address: null,
    job_city: null,
    job_state: null,
    job_map_link: null,
    job_lat: null,
    job_lng: null,
    internal_notes: draft.internal_notes?.trim() || null,
    worker_notes: draft.worker_notes?.trim() || null,
    published_to_crew: publishedToCrew,
    custom_fields: customFields,
    ...createStamps,
  };

  const { error: insErr } = await ctx.db.from('jobs').insert(payload);
  if (insErr) {
    // 23505 = duplicate PK → a retried confirm; treat as success.
    if ((insErr as any).code === '23505') return { jobId, alreadyExisted: true };
    throw new Error(insErr.message);
  }

  if (crew.length) {
    const rows = crew.map(c => ({
      id: randomUUID(),
      job_id: jobId,
      ...(c.employee_id ? { employee_id: c.employee_id } : {}),
      worker_name: c.worker_name,
      is_lead: !!c.is_lead,
    }));
    const { error: asgErr } = await ctx.db.from('job_assignments').insert(rows);
    if (asgErr) console.error('[assistant] assignments insert failed:', asgErr.message);
  }

  // Audit — service-role client, same shape as the rest of the api.
  await supabase.from('audit_log').insert({
    business_id: ctx.businessId,
    user_id: ctx.userId,
    action: 'job.created',
    entity_type: 'job',
    entity_id: jobId,
    details: { title, source: 'assistant' },
  });

  return { jobId, alreadyExisted: false };
}

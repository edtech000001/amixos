import { randomUUID } from 'crypto';
import { supabase } from '../../config/supabase';
import { lineItemsHash, type AssistantContext, type JobDraft, type JobUpdateDraft, type JobUndoSnapshot } from './types';
import { matchEmployeeId, type EmployeeLite } from './matchEmployee';
import { geocodeAddress } from '../geocoding';

// Confirm-side validation + insert. Mirrors the job form's save() contract
// (mobile/app/dashboard/trabajos/nuevo.tsx): jobs row + job_assignments rows
// + pipeline create-stamps + audit_log. All data access runs on ctx.db (the
// caller's RLS client) so member_res('jobs','create') is the real gate; only
// the audit write uses the service-role client (same as other api routes).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DraftValidationError extends Error {}

// ── Required-field contract ─────────────────────────────────────────────────
// Mirrors the job form's save() checks (trabajos/nuevo.tsx): per-business
// required built-ins (businesses.job_field_required, skipping hidden fields)
// + required custom field templates. KEEP IN SYNC with JOB_REQUIRABLE there.

const JOB_REQUIRABLE_LABELS: Record<string, { es: string; en: string }> = {
  client_id: { es: 'Cliente', en: 'Client' },
  description: { es: 'Descripción', en: 'Description' },
  job_address: { es: 'Dirección', en: 'Address' },
  job_city: { es: 'Ciudad', en: 'City' },
  job_state: { es: 'Estado', en: 'State' },
  coordinates: { es: 'Coordenadas', en: 'Coordinates' },
  scheduled_date: { es: 'Fecha', en: 'Date' },
  time_start: { es: 'Hora de inicio', en: 'Start time' },
  time_end: { es: 'Hora de fin', en: 'End time' },
  total_hours: { es: 'Horas totales', en: 'Total hours' },
  assigned_workers: { es: 'Trabajadores', en: 'Workers' },
  internal_notes: { es: 'Notas internas', en: 'Internal notes' },
};
// No eye toggle on the form — never treated as hidden (jobSections.ts).
const JOB_FIELDS_ALWAYS_SHOWN = ['client_id', 'priority'];
// Fields Ami drafts can't fill (no location support yet) — if the business
// requires one of these, the job must be created on the Trabajos form.
const ASSISTANT_UNSUPPORTED = new Set(['job_address', 'job_city', 'job_state', 'coordinates']);

export interface RequiredFieldCheck {
  /** Labels of required fields the draft is missing (Ami can still fill these). */
  missing: string[];
  /** Labels of required fields Ami cannot fill at all (location fields). */
  unsupported: string[];
}

export function checkRequiredFields(ctx: AssistantContext, draft: JobDraft): RequiredFieldCheck {
  const lang = ctx.locale === 'en' ? 'en' : 'es';
  const isHidden = (key: string) =>
    !JOB_FIELDS_ALWAYS_SHOWN.includes(key) && !!ctx.jobFieldHidden[key];

  const values: Record<string, string> = {
    client_id: draft.client_id && draft.client_resolved !== false ? 'x' : '',
    description: draft.description ?? '',
    job_address: '',
    job_city: '',
    job_state: '',
    coordinates: '',
    scheduled_date: draft.scheduled_date ?? '',
    time_start: draft.all_day === false ? draft.time_start ?? '' : '',
    time_end: draft.all_day === false ? draft.time_end ?? '' : '',
    total_hours: draft.total_hours != null ? 'x' : '',
    assigned_workers: draft.crew?.length ? 'x' : '',
    internal_notes: draft.internal_notes ?? '',
  };

  const missing: string[] = [];
  const unsupported: string[] = [];
  for (const [key, label] of Object.entries(JOB_REQUIRABLE_LABELS)) {
    if (!ctx.jobFieldRequired[key] || isHidden(key)) continue;
    if (String(values[key] ?? '').trim()) continue;
    (ASSISTANT_UNSUPPORTED.has(key) ? unsupported : missing).push(label[lang]);
  }
  for (const tpl of ctx.fieldTemplates) {
    if (tpl.required && !String(draft.custom_fields?.[tpl.field_key] ?? '').trim()) {
      missing.push(tpl.field_label);
    }
  }
  return { missing, unsupported };
}

export async function confirmDraft(
  ctx: AssistantContext,
  draft: JobDraft,
): Promise<{ jobId: string; alreadyExisted: boolean; undo?: JobUndoSnapshot }> {
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

  // Required fields — same contract the job form enforces on save. The draft
  // card already warned about these; confirming anyway is a hard stop.
  const reqCheck = checkRequiredFields(ctx, draft);
  if (reqCheck.missing.length || reqCheck.unsupported.length) {
    const es = ctx.locale !== 'en';
    const parts: string[] = [];
    if (reqCheck.missing.length) {
      parts.push(`${es ? 'Campos requeridos' : 'Required fields'}: ${reqCheck.missing.join(', ')}`);
    }
    if (reqCheck.unsupported.length) {
      parts.push(
        es
          ? `Este negocio requiere ${reqCheck.unsupported.join(', ')} — crea este trabajo en la pantalla Trabajos`
          : `This business requires ${reqCheck.unsupported.join(', ')} — create this job from the Jobs screen`,
      );
    }
    throw new DraftValidationError(parts.join('. '));
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

  // Resolve names the model returned WITHOUT an employee_id. The crew tool
  // makes employee_id optional, so a bare name is normal output — and a row
  // stored without it is a string, not a person: no payroll hours, no crew
  // reporting, and invisible to the job form's crew picker. Matching here means
  // that only happens when the name genuinely cannot be resolved, rather than
  // whenever the model omits the id.
  const unresolved = crew.filter(c => !c.employee_id && (c.worker_name ?? '').trim());
  if (unresolved.length) {
    const { data: roster } = await ctx.db
      .from('employees')
      .select('id, first_name, last_name, check_name, active')
      .eq('business_id', ctx.businessId);
    const employees = (roster ?? []) as EmployeeLite[];
    for (const c of unresolved) {
      const id = matchEmployeeId(c.worker_name, employees);
      // Still no confident match → keep the name. Better an unlinked worker
      // than one silently attributed to the wrong person's payroll.
      if (id) c.employee_id = id;
    }
  }
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

  return { jobId, alreadyExisted: false, undo: { job_id: jobId, job: {}, created: true } };
}

/** Applies draft.item_ops to job_items and returns the job's new money
 *  fields. Same totals rule as the job form: estimate records (tax/discount)
 *  keep subtotal+tax−discount; work jobs store the item subtotal as total. */
async function applyJobItemOps(ctx: AssistantContext, job: Record<string, any>, draft: JobUpdateDraft): Promise<Record<string, unknown>> {
  if (job.status === 'invoiced') throw new DraftValidationError('Este trabajo ya está facturado — cambia los precios en la factura.');
  const read = async () => {
    const { data, error } = await ctx.db.from('job_items').select('id, description, quantity, unit_price')
      .eq('job_id', job.id).order('created_at').order('id');
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; description: string; quantity: number; unit_price: number }[];
  };
  const items = await read();
  if (lineItemsHash(items) !== draft.items_hash) {
    throw new DraftValidationError('Las partidas de este trabajo cambiaron desde que las leí — pídemelo de nuevo.');
  }
  const okNum = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e8;
  const removeIds: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  for (const op of draft.item_ops ?? []) {
    if (op.op === 'add') {
      if (!op.description?.trim() || !okNum(op.quantity) || !okNum(op.unit_price)) throw new DraftValidationError('partida inválida');
      inserts.push({ job_id: job.id, description: op.description.trim().slice(0, 500), quantity: op.quantity, unit_price: op.unit_price });
      continue;
    }
    const it = items[op.index];
    if (!it) throw new DraftValidationError('partida no encontrada');
    if (op.op === 'remove') { removeIds.push(it.id); continue; }
    const patch: Record<string, unknown> = {};
    if (op.description !== undefined) { if (!op.description.trim()) throw new DraftValidationError('partida sin descripción'); patch.description = op.description.trim().slice(0, 500); }
    if (op.quantity !== undefined) { if (!okNum(op.quantity)) throw new DraftValidationError('cantidad inválida'); patch.quantity = op.quantity; }
    if (op.unit_price !== undefined) { if (!okNum(op.unit_price)) throw new DraftValidationError('precio inválido'); patch.unit_price = op.unit_price; }
    if (Object.keys(patch).length) {
      const { data, error } = await ctx.db.from('job_items').update(patch).eq('id', it.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new DraftValidationError('sin permiso para editar este trabajo');
    }
  }
  if (inserts.length) {
    const { error } = await ctx.db.from('job_items').insert(inserts);
    if (error) throw new Error(error.message);
  }
  if (removeIds.length) {
    const { error } = await ctx.db.from('job_items').delete().in('id', removeIds);
    if (error) throw new Error(error.message);
  }
  const dec = (n: number) => Number(n.toFixed(6));
  const subtotal = dec((await read()).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0));
  const taxRate = Number(job.tax_rate) || 0;
  const discount = Number(job.discount) || 0;
  if (taxRate || discount) {
    const tax = dec(subtotal * (taxRate / 100));
    return { subtotal_amount: subtotal, tax_amount: tax, total_amount: dec(subtotal + tax - discount) };
  }
  return { total_amount: subtotal };
}

/** Validates draft.details and turns it into a jobs-row patch. */
async function applyDetailChanges(
  ctx: AssistantContext,
  job: Record<string, any>,
  d: NonNullable<JobUpdateDraft['details']>,
): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  const required = (k: string) => !!ctx.jobFieldRequired[k] && !ctx.jobFieldHidden[k];
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 5000) : null);
  if (d.title !== undefined) {
    const t = text(d.title);
    if (!t) throw new DraftValidationError('el nombre no puede quedar vacío');
    patch.title = t.slice(0, 200);
  }
  for (const k of ['description', 'internal_notes', 'worker_notes', 'job_address', 'job_city', 'job_state'] as const) {
    if (d[k] === undefined) continue;
    const v = text(d[k]);
    if (!v && required(k)) throw new DraftValidationError(`${JOB_REQUIRABLE_LABELS[k]?.[ctx.locale] ?? k} es obligatorio`);
    patch[k] = v;
  }
  if (d.priority !== undefined) {
    if (!['low', 'normal', 'high', 'urgent'].includes(d.priority)) throw new DraftValidationError('prioridad inválida');
    patch.priority = d.priority;
  }
  if (d.total_hours !== undefined) {
    if (d.total_hours !== null && !(typeof d.total_hours === 'number' && Number.isFinite(d.total_hours) && d.total_hours >= 0)) {
      throw new DraftValidationError('horas inválidas');
    }
    patch.total_hours = d.total_hours;
  }
  if (d.client_id !== undefined) {
    if (d.client_id) {
      const { data } = await ctx.db.from('clients').select('id').eq('business_id', ctx.businessId).eq('id', d.client_id).maybeSingle();
      if (!data) throw new DraftValidationError('cliente no encontrado');
    } else if (required('client_id')) {
      throw new DraftValidationError('el cliente es obligatorio');
    }
    patch.client_id = d.client_id || null;
  }
  if (d.custom_fields) {
    const merged: Record<string, unknown> = { ...(job.custom_fields ?? {}) };
    for (const [k, v] of Object.entries(d.custom_fields)) {
      const tpl = ctx.fieldTemplates.find(t => t.field_key === k);
      if (!tpl) continue;
      if (!String(v).trim() && tpl.required) throw new DraftValidationError(`${tpl.field_label} es obligatorio`);
      merged[k] = String(v);
    }
    patch.custom_fields = merged;
  }
  // New address → re-pin the map. A failed lookup clears the pin and the old
  // map link rather than leaving them pointing at the previous address.
  if (['job_address', 'job_city', 'job_state'].some(k => k in patch)) {
    const line = ['job_address', 'job_city', 'job_state']
      .map(k => (k in patch ? patch[k] : job[k]) as string | null)
      .filter(Boolean).join(', ');
    const geo = line ? await geocodeAddress(line) : null;
    patch.job_lat = geo?.ok ? geo.lat : null;
    patch.job_lng = geo?.ok ? geo.lng : null;
    patch.job_map_link = null;
  }
  return patch;
}

// ── Confirm a reschedule / edit of an EXISTING job ──────────────────────────
export async function confirmJobUpdate(
  ctx: AssistantContext,
  draft: JobUpdateDraft,
): Promise<{ jobId: string; alreadyExisted: boolean; undo?: JobUndoSnapshot }> {
  if (!draft || typeof draft !== 'object') throw new DraftValidationError('draft requerido');
  if (draft.business_id !== ctx.businessId) throw new DraftValidationError('business mismatch');
  const jobId = typeof draft.job_id === 'string' ? draft.job_id : '';
  if (!jobId) throw new DraftValidationError('job_id requerido');

  // The row must exist in this business (RLS re-checks the write too).
  const { data: job } = await ctx.db
    .from('jobs')
    .select('id, title, all_day, status, archived_at, custom_fields, job_address, job_city, job_state, tax_rate, discount')
    .eq('business_id', ctx.businessId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) throw new DraftValidationError('trabajo no encontrado');

  for (const d of [draft.scheduled_date, draft.end_date]) {
    if (d != null && !DATE_RE.test(d)) throw new DraftValidationError('fecha inválida');
  }

  // Apply only the changed fields. all_day toggles time handling: true clears
  // times; false keeps them.
  const update: Record<string, unknown> = {};
  if (draft.scheduled_date !== undefined) {
    update.scheduled_date = draft.scheduled_date;
    update.scheduled_at = new Date().toISOString(); // re-stamp the pipeline step
  }
  if (draft.end_date !== undefined) update.end_date = draft.end_date;
  const effectiveAllDay = draft.all_day !== undefined ? draft.all_day
    : (draft.time_start !== undefined || draft.time_end !== undefined) ? false
      : undefined;
  if (effectiveAllDay !== undefined) {
    update.all_day = effectiveAllDay;
    if (effectiveAllDay) {
      update.time_start = null;
      update.time_end = null;
    } else {
      if (draft.time_start !== undefined) update.time_start = draft.time_start;
      if (draft.time_end !== undefined) update.time_end = draft.time_end;
    }
  } else {
    if (draft.time_start !== undefined) update.time_start = draft.time_start;
    if (draft.time_end !== undefined) update.time_end = draft.time_end;
  }

  // Status: same timestamps the job detail's status buttons stamp.
  const prevStatus = (job as any).status as string | null;
  if (draft.status !== undefined) {
    if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(draft.status)) {
      throw new DraftValidationError('estado inválido');
    }
    if (prevStatus === 'invoiced') throw new DraftValidationError('Este trabajo ya está facturado — cambia su estado desde la factura.');
    const now = new Date().toISOString();
    update.status = draft.status;
    if (draft.status === 'scheduled') update.scheduled_at = now;
    if (draft.status === 'in_progress') update.in_progress_at = now;
    if (draft.status === 'completed') { update.completed_at = now; update.completed_date = now.slice(0, 10); }
    if (draft.status === 'cancelled') update.cancelled_at = now;
  }
  if (draft.archived !== undefined) update.archived_at = draft.archived ? new Date().toISOString() : null;
  if (draft.details) Object.assign(update, await applyDetailChanges(ctx, job as Record<string, any>, draft.details));

  const changingCrew = Array.isArray(draft.crew);
  const changingItems = !!draft.item_ops?.length;

  // Undo snapshot: rows as they are BEFORE anything below writes.
  const undo: JobUndoSnapshot = { job_id: jobId, job: {} };
  if (changingItems) {
    const { data } = await ctx.db.from('job_items').select('id, job_id, item_type, description, quantity, unit_price, created_at').eq('job_id', jobId);
    undo.items = data ?? [];
  }
  if (changingCrew) {
    const { data } = await ctx.db.from('job_assignments').select('*').eq('job_id', jobId);
    undo.crew = data ?? [];
  }

  if (changingItems) Object.assign(update, await applyJobItemOps(ctx, job as Record<string, any>, draft));

  if (Object.keys(update).length === 0 && !changingCrew) {
    throw new DraftValidationError('sin cambios');
  }

  if (Object.keys(update).length) {
    const { data: prev } = await ctx.db.from('jobs').select(Object.keys(update).join(', ')).eq('id', jobId).maybeSingle();
    undo.job = (prev ?? {}) as Record<string, unknown>;
    // RLS returns no error when the policy filters every row — check the count,
    // or a member who can't edit jobs gets "done" while nothing changed.
    const { data: upRows, error: upErr } = await ctx.db.from('jobs').update(update).eq('id', jobId).select('id');
    if (upErr) throw new Error(upErr.message);
    if (!upRows?.length) throw new DraftValidationError('sin permiso para editar este trabajo');
  }

  // Crew: replace assignments (validate referenced ids in-business first).
  if (changingCrew) {
    const crew = (draft.crew ?? []).filter(c => (c.worker_name ?? '').trim());
    const ids = [...new Set(crew.map(c => c.employee_id).filter((v): v is string => !!v))];
    if (ids.length) {
      const { data } = await ctx.db.from('employees').select('id').eq('business_id', ctx.businessId).in('id', ids);
      const found = new Set((data ?? []).map((r: any) => r.id));
      if (ids.some(id => !found.has(id))) throw new DraftValidationError('empleado no encontrado');
    }
    // Same resolution as the create path: a bare name from the model becomes a
    // real employee link where the name is unambiguous, instead of a text row
    // that earns no payroll hours.
    const unresolvedUp = crew.filter(c => !c.employee_id && (c.worker_name ?? '').trim());
    if (unresolvedUp.length) {
      const { data: roster } = await ctx.db
        .from('employees')
        .select('id, first_name, last_name, check_name, active')
        .eq('business_id', ctx.businessId);
      const employees = (roster ?? []) as EmployeeLite[];
      for (const c of unresolvedUp) {
        const id = matchEmployeeId(c.worker_name, employees);
        if (id) c.employee_id = id;
      }
    }
    let leadSeen = false;
    for (const c of crew) {
      if (c.is_lead) { if (leadSeen || !c.employee_id) c.is_lead = false; else leadSeen = true; }
    }
    // Insert the new crew BEFORE removing the old one, so a failure part-way
    // never leaves the job with nobody assigned. The lead flag goes on last:
    // idx_job_assignments_one_lead_per_job (033) allows one lead row at a time.
    const { data: oldRows, error: oldErr } = await ctx.db.from('job_assignments').select('id').eq('job_id', jobId);
    if (oldErr) throw new Error(oldErr.message);
    const oldIds = (oldRows ?? []).map((r: { id: string }) => r.id);
    const rows = crew.map(c => ({
      id: randomUUID(),
      job_id: jobId,
      ...(c.employee_id ? { employee_id: c.employee_id } : {}),
      worker_name: c.worker_name,
      is_lead: false,
    }));
    const leadRowId = rows[crew.findIndex(c => c.is_lead)]?.id ?? null;
    if (rows.length) {
      const { error: asgErr } = await ctx.db.from('job_assignments').insert(rows);
      if (asgErr) throw new Error(asgErr.message);
    }
    if (oldIds.length) {
      const { data: gone, error: delErr } = await ctx.db.from('job_assignments').delete().in('id', oldIds).select('id');
      if (delErr || (gone ?? []).length < oldIds.length) {
        // Couldn't clear the old crew (error or RLS) — undo the new rows so the
        // job isn't left with both.
        if (rows.length) await ctx.db.from('job_assignments').delete().in('id', rows.map(r => r.id));
        throw new Error(delErr?.message ?? 'sin permiso para cambiar el equipo');
      }
    }
    if (leadRowId) {
      const { error: leadErr } = await ctx.db.from('job_assignments').update({ is_lead: true }).eq('id', leadRowId);
      if (leadErr) throw new Error(leadErr.message);
    }
  }

  const audit = (action: string, details: Record<string, unknown>) => supabase.from('audit_log').insert({
    business_id: ctx.businessId,
    user_id: ctx.userId,
    action,
    entity_type: 'job',
    entity_id: jobId,
    details: { title: (job as any).title, source: 'assistant', ...details },
  });
  const otherChange = changingCrew || Object.keys(update).some(k => !['status', 'archived_at', 'scheduled_at', 'in_progress_at', 'completed_at', 'completed_date', 'cancelled_at'].includes(k));
  if (otherChange) await audit('job.updated', { reschedule: true });
  if (draft.status !== undefined) await audit('job.status_changed', { from: prevStatus, to: draft.status, job_title: (job as any).title });
  if (draft.archived !== undefined) await audit(draft.archived ? 'job.archived' : 'job.unarchived', {});

  return { jobId, alreadyExisted: false, undo };
}


// ── Undo ("deshaz eso") ─────────────────────────────────────────────────────
// Only columns Ami can change are restorable; anything else in a snapshot is
// ignored, so a tampered snapshot can't write arbitrary job fields.
const UNDOABLE_JOB_COLS = new Set([
  'title', 'description', 'priority', 'client_id', 'total_hours', 'internal_notes', 'worker_notes',
  'job_address', 'job_city', 'job_state', 'job_lat', 'job_lng', 'job_map_link', 'custom_fields',
  'scheduled_date', 'scheduled_at', 'end_date', 'all_day', 'time_start', 'time_end',
  'status', 'in_progress_at', 'completed_at', 'completed_date', 'cancelled_at', 'archived_at',
  'subtotal_amount', 'tax_amount', 'total_amount',
]);

export async function undoJobChange(ctx: AssistantContext, snap: JobUndoSnapshot): Promise<void> {
  const jobId = typeof snap?.job_id === 'string' ? snap.job_id : '';
  const { data: job } = await ctx.db.from('jobs').select('id, created_by, created_at, status')
    .eq('business_id', ctx.businessId).eq('id', jobId).maybeSingle();
  if (!job) throw new DraftValidationError('trabajo no encontrado');
  const j = job as { created_by: string | null; created_at: string; status: string };

  if (snap.created) {
    // Only a job THIS user just created through Ami (≤ 1 h ago) is deleted.
    const fresh = Date.now() - new Date(j.created_at).getTime() < 3_600_000;
    if (j.created_by !== ctx.userId || !fresh) throw new DraftValidationError('Ese trabajo ya no se puede deshacer — elimínalo desde la app.');
    if (j.status === 'invoiced') throw new DraftValidationError('Ese trabajo ya está facturado.');
    const { data, error } = await ctx.db.from('jobs').delete().eq('id', jobId).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new DraftValidationError('sin permiso para borrar este trabajo');
    return;
  }

  const patch = Object.fromEntries(Object.entries(snap.job ?? {}).filter(([k]) => UNDOABLE_JOB_COLS.has(k)));
  if (Object.keys(patch).length) {
    const { data, error } = await ctx.db.from('jobs').update(patch).eq('id', jobId).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new DraftValidationError('sin permiso para editar este trabajo');
  }
  if (Array.isArray(snap.items)) {
    const rows = snap.items.map(r => ({
      id: r.id, job_id: jobId, item_type: r.item_type ?? 'labor', description: r.description,
      quantity: r.quantity, unit_price: r.unit_price, ...(r.created_at ? { created_at: r.created_at } : {}),
    }));
    const { error: delErr } = await ctx.db.from('job_items').delete().eq('job_id', jobId);
    if (delErr) throw new Error(delErr.message);
    if (rows.length) {
      const { error } = await ctx.db.from('job_items').insert(rows);
      if (error) throw new Error(error.message);
    }
  }
  if (Array.isArray(snap.crew)) {
    const rows = snap.crew.map(r => ({
      id: r.id, job_id: jobId, worker_name: r.worker_name, is_lead: false,
      ...(r.employee_id ? { employee_id: r.employee_id } : {}),
    }));
    const lead = snap.crew.find(r => r.is_lead)?.id as string | undefined;
    const { error: delErr } = await ctx.db.from('job_assignments').delete().eq('job_id', jobId);
    if (delErr) throw new Error(delErr.message);
    if (rows.length) {
      const { error } = await ctx.db.from('job_assignments').insert(rows);
      if (error) throw new Error(error.message);
    }
    if (lead) await ctx.db.from('job_assignments').update({ is_lead: true }).eq('id', lead);
  }
}

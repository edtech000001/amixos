import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Delegate a job from one business to another. Copies the job + its client
 * + line items into the target business, sets delegation lineage on both
 * sides, and returns the new job's id.
 *
 * Both the source and the target must be businesses the calling user is a
 * member of (RLS enforces this).
 *
 * Phase 1: copy-on-delegate. After delegation the two job records are
 * independent — edits to one don't sync to the other.
 */
export type DelegateJobResult =
  | { ok: true; newJobId: string; newClientId: string | null }
  | { ok: false; error: string };

interface ClientRow {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
}

interface JobRow {
  id: string;
  business_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  scheduled_date: string | null;
  total_amount: number;
  internal_notes: string | null;
  estimate_number: string | null;
  notes: string | null;
  delegated_to_business_id: string | null;
}

interface JobItemRow {
  job_id: string;
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

const CLIENT_COPY_FIELDS = [
  'first_name', 'last_name', 'company',
  'phone_cell', 'phone_office', 'email_office', 'email_home',
  'address', 'address_line2', 'city', 'state', 'zip_code',
  'notes', 'custom_fields',
] as const;

export async function delegateJob(
  supabase: SupabaseClient,
  jobId: string,
  targetBusinessId: string,
): Promise<DelegateJobResult> {
  // 1. Source job
  const { data: srcJob, error: jobErr } = await supabase
    .from('jobs')
    .select(
      'id, business_id, client_id, title, description, status, priority, job_address, job_city, job_state, scheduled_date, total_amount, internal_notes, estimate_number, notes, delegated_to_business_id',
    )
    .eq('id', jobId)
    .single();
  if (jobErr || !srcJob) return { ok: false, error: 'Source job not found' };
  const job = srcJob as JobRow;
  if (job.delegated_to_business_id) return { ok: false, error: 'Already delegated' };
  if (job.business_id === targetBusinessId) return { ok: false, error: 'Same business' };

  // 2. Source client (if any) + find-or-create in target
  let newClientId: string | null = null;
  if (job.client_id) {
    const { data: srcClient } = await supabase
      .from('clients')
      .select('*')
      .eq('id', job.client_id)
      .single();
    const client = srcClient as ClientRow | null;

    if (client) {
      // Try to find an existing client in target by email or phone
      const orFilters: string[] = [];
      if (client.email_office) orFilters.push(`email_office.eq.${client.email_office}`);
      if (client.phone_cell) orFilters.push(`phone_cell.eq.${client.phone_cell}`);
      let existingId: string | null = null;
      if (orFilters.length) {
        const { data: matches } = await supabase
          .from('clients')
          .select('id')
          .eq('business_id', targetBusinessId)
          .or(orFilters.join(','))
          .limit(1);
        if (matches && matches.length > 0) existingId = (matches[0] as { id: string }).id;
      }

      if (existingId) {
        newClientId = existingId;
      } else {
        const payload: Record<string, unknown> = { business_id: targetBusinessId };
        for (const f of CLIENT_COPY_FIELDS) {
          payload[f] = (client as unknown as Record<string, unknown>)[f] ?? null;
        }
        const { data: inserted, error: insErr } = await supabase
          .from('clients')
          .insert(payload)
          .select('id')
          .single();
        if (insErr || !inserted) return { ok: false, error: `Client copy failed: ${insErr?.message}` };
        newClientId = (inserted as { id: string }).id;
      }
    }
  }

  // 3. Insert the new job in target. Reset status to a sensible starting point.
  const newStatus = job.estimate_number ? 'proposal' : 'scheduled';
  const { data: newJob, error: newJobErr } = await supabase
    .from('jobs')
    .insert({
      business_id: targetBusinessId,
      client_id: newClientId,
      title: job.title,
      description: job.description,
      status: newStatus,
      priority: job.priority,
      job_address: job.job_address,
      job_city: job.job_city,
      job_state: job.job_state,
      scheduled_date: job.scheduled_date,
      total_amount: job.total_amount,
      internal_notes: job.internal_notes,
      estimate_number: null, // target gets its own numbering if it converts to proposal
      notes: job.notes,
      delegated_from_business_id: job.business_id,
    })
    .select('id')
    .single();
  if (newJobErr || !newJob) return { ok: false, error: `Job copy failed: ${newJobErr?.message}` };
  const newJobId = (newJob as { id: string }).id;

  // 4. Copy line items
  const { data: srcItems } = await supabase
    .from('job_items')
    .select('item_type, description, quantity, unit_price, total')
    .eq('job_id', jobId);
  const items = (srcItems as JobItemRow[] | null) ?? [];
  if (items.length > 0) {
    await supabase
      .from('job_items')
      .insert(items.map((it) => ({ ...it, job_id: newJobId })));
  }

  // 5. Mark source as delegated
  await supabase
    .from('jobs')
    .update({
      delegated_to_business_id: targetBusinessId,
      delegated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // 6. Audit log — write on BOTH sides so each business has a record of the
  // movement. Best-effort: don't fail the operation if logging fails.
  const { data: targetBiz } = await supabase
    .from('businesses').select('name').eq('id', targetBusinessId).single();
  const { data: sourceBiz } = await supabase
    .from('businesses').select('name').eq('id', job.business_id).single();
  const targetName = (targetBiz as { name: string } | null)?.name ?? null;
  const sourceName = (sourceBiz as { name: string } | null)?.name ?? null;

  await Promise.all([
    supabase.from('audit_log').insert({
      business_id: job.business_id,
      action: 'job.delegated',
      entity_type: 'job',
      entity_id: jobId,
      details: {
        direction: 'out',
        target_business_id: targetBusinessId,
        target_business_name: targetName,
        new_job_id: newJobId,
        job_title: job.title,
      },
    }),
    supabase.from('audit_log').insert({
      business_id: targetBusinessId,
      action: 'job.delegated',
      entity_type: 'job',
      entity_id: newJobId,
      details: {
        direction: 'in',
        source_business_id: job.business_id,
        source_business_name: sourceName,
        source_job_id: jobId,
        job_title: job.title,
      },
    }),
  ]);

  return { ok: true, newJobId, newClientId };
}

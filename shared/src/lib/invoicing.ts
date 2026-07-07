// Shared invoicing operations used by web + mobile.
//
// Model:
//  - `jobs.invoice_id` is the source of truth for which invoice a job is on.
//    Many jobs can point at one invoice (one invoice : many jobs).
//  - Invoice line items live in the `invoices.line_items` JSONB. Each item we
//    create here is TAGGED with `job_id` so a job's lines can be located,
//    moved, or removed later, and totals recomputed.
//  - An invoice is restricted to a single client (validated here).
//
// These functions take a Supabase client instance (web or mobile) — both expose
// the same PostgREST query builder, so one implementation serves both.

import { invoiceDefaultLanguage, nextInvoiceNumber } from './invoiceTemplate';

// Minimal shape of the Supabase client we rely on (web + mobile both satisfy it).
type Supa = { from: (table: string) => any };

export interface JobItemRow {
  id: string;
  job_id: string;
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface InvoiceLineItem {
  description: string;
  // The invoice document + PDF read `qty` / `rate` (NOT quantity/unit_price) —
  // match that canonical shape or amounts render as $0.
  qty: number;
  rate: number;
  /** Source job, so the line can be moved/removed with its job. Legacy lines
   *  (created before this feature) may be undefined. */
  job_id?: string | null;
}

/** Build the line items for one job from its job_items, tagged with the job id
 *  and prefixed with the localized item-type label (e.g. "Mano de obra: ...").
 *  An item with no description falls back to the JOB TITLE as its name, so you
 *  can log a bare amount + cost and it still reads sensibly on the invoice
 *  (e.g. "Material: Reparación de cerca"). */
export function lineItemsForJob(
  jobId: string,
  jobTitle: string,
  jobItems: JobItemRow[],
  itemTypeLabels: Record<string, string>,
  /** When the business has item-type categories turned off
   *  (businesses.job_item_types_enabled = false), drop the "Tipo:" prefix so
   *  lines read as plain "descripción" instead of "Mano de obra: descripción". */
  opts?: { hideTypes?: boolean },
): InvoiceLineItem[] {
  const own = jobItems.filter(i => i.job_id === jobId);
  // A job with no logged items still gets ONE placeholder line — its title at
  // qty 1 × $0 — so the attached job is visible on the invoice instead of
  // linking silently (it shows "Facturado" but nothing on the bill otherwise).
  // The amount fills in once items are added to the job.
  if (own.length === 0) {
    return [{ description: jobTitle, qty: 1, rate: 0, job_id: jobId }];
  }
  return own.map(i => {
    const desc = (i.description ?? '').trim();
    // With a description → "Tipo: descripción" (or just "descripción" when types
    // are off); without one → just the job title (so a bare amount + cost reads
    // as the job name on the invoice).
    const name = opts?.hideTypes
      ? (desc || jobTitle)
      : (desc ? `${itemTypeLabels[i.item_type] ?? i.item_type}: ${desc}` : jobTitle);
    return {
      description: name,
      qty: i.quantity,
      rate: i.unit_price,
      job_id: jobId,
    };
  });
}

/** Recompute money fields from line items + a tax rate (%) and discount.
 *  Each line's amount is qty × rate (the canonical invoice shape). */
export function computeTotals(
  lineItems: InvoiceLineItem[],
  taxRate: number,
  discount: number,
): { subtotal: number; tax: number; total: number } {
  const subtotal = lineItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const tax = subtotal * ((taxRate ?? 0) / 100);
  const total = subtotal + tax - (discount ?? 0);
  return { subtotal, tax, total };
}

const today = () => new Date().toISOString().split('T')[0];
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

export type CreateInvoiceResult =
  | { ok: true; invoice: any }
  | { ok: false; error: 'no_jobs' | 'multiple_clients' | 'insert_failed' };

/** Create ONE draft invoice from one or more completed jobs of the SAME client,
 *  attaching each job (status → invoiced, invoice_id, invoiced_at). */
export async function createInvoiceFromJobs(
  supabase: Supa,
  opts: {
    businessId: string;
    jobIds: string[];
    invoiceTemplate: unknown;
    itemTypeLabels: Record<string, string>;
    /** "Trabajos" / "Jobs" — used to seed the invoice notes. */
    notesLabel: string;
    /** Business's configured starting invoice number (businesses.invoice_start_number). */
    startNumber?: number;
    /** Drop the item-type prefix on lines (businesses.job_item_types_enabled = false). */
    hideItemTypes?: boolean;
    /** Tax percentage for the new invoice (businesses.invoice_tax_rate). */
    taxRate?: number;
  },
): Promise<CreateInvoiceResult> {
  if (!opts.jobIds.length) return { ok: false, error: 'no_jobs' };

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, client_id')
    .in('id', opts.jobIds);
  if (!jobs?.length) return { ok: false, error: 'no_jobs' };

  const clientIds = Array.from(new Set(jobs.map((j: any) => j.client_id ?? null)));
  if (clientIds.length > 1) return { ok: false, error: 'multiple_clients' };
  const clientId = clientIds[0] ?? null;

  const { data: jobItems } = await supabase
    .from('job_items')
    .select('*')
    .in('job_id', opts.jobIds);

  // Preserve the order the caller passed the jobs in.
  const byId = new Map<string, any>(jobs.map((j: any) => [j.id, j]));
  const orderedJobs: any[] = opts.jobIds.map(id => byId.get(id)).filter(Boolean);
  const lineItems: InvoiceLineItem[] = [];
  for (const j of orderedJobs) {
    lineItems.push(...lineItemsForJob(j.id, j.title ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes }));
  }

  const taxRate = opts.taxRate ?? 0;
  const discount = 0;
  const { subtotal, tax, total } = computeTotals(lineItems, taxRate, discount);

  const lang = invoiceDefaultLanguage(opts.invoiceTemplate);
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', opts.businessId);
  const invoiceNumber = nextInvoiceNumber(lang, opts.startNumber, count ?? 0);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      business_id: opts.businessId,
      client_id: clientId,
      invoice_number: invoiceNumber,
      status: 'draft',
      language: lang,
      issue_date: today(),
      due_date: plusDays(30),
      line_items: lineItems,
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      discount,
      total_amount: total,
      // Notes are the user's to write — don't auto-fill with job titles.
      notes: null,
    })
    .select()
    .single();

  if (error || !invoice) return { ok: false, error: 'insert_failed' };

  const nowIso = new Date().toISOString();
  await supabase
    .from('jobs')
    .update({ status: 'invoiced', invoice_id: invoice.id, invoiced_at: nowIso })
    .in('id', opts.jobIds);

  return { ok: true, invoice };
}

/** Re-derive a DRAFT invoice's line items from its currently-attached jobs'
 *  job_items, so items added/edited on a job AFTER it was invoiced flow through.
 *  Manual (non job-tagged) line items are preserved; job lines are rebuilt.
 *  No-ops for sent/paid invoices (frozen) and writes only when something
 *  actually changed. */
export async function rebuildInvoiceLineItems(
  supabase: Supa,
  opts: { invoiceId: string; itemTypeLabels: Record<string, string>; hideItemTypes?: boolean },
): Promise<{ changed: boolean }> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, line_items, tax_rate, discount')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv || inv.status !== 'draft') return { changed: false };

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title')
    .eq('invoice_id', opts.invoiceId)
    .order('created_at');
  const jobIds = (jobs ?? []).map((j: any) => j.id);
  // No attached jobs → a manual invoice; leave its line items alone entirely.
  if (jobIds.length === 0) return { changed: false };

  const { data: jobItems } = await supabase.from('job_items').select('*').in('job_id', jobIds);

  // Job lines are rebuilt fresh (exactly one set per job — no pile-up). Manual,
  // hand-entered lines (no job_id, e.g. a travel charge) are PRESERVED, except
  // any stale untagged line that exactly duplicates a rebuilt job line (those
  // are leftovers from before line items were tagged).
  const existing = (inv.line_items ?? []) as InvoiceLineItem[];
  const jobLines: InvoiceLineItem[] = [];
  for (const j of (jobs ?? []) as any[]) {
    jobLines.push(...lineItemsForJob(j.id, j.title ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes }));
  }
  const lineKey = (l: InvoiceLineItem) => `${l.description}|${l.qty}|${l.rate}`;
  const jobLineKeys = new Set(jobLines.map(lineKey));
  const manual = existing.filter(li => !li.job_id && !jobLineKeys.has(lineKey(li)));
  const next: InvoiceLineItem[] = [...manual, ...jobLines];
  if (JSON.stringify(next) === JSON.stringify(existing)) return { changed: false };

  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);
  return { changed: true };
}

/** Append a hand-entered (non-job) line item to an invoice — e.g. a travel
 *  charge — and recompute totals. The line has no job_id so it survives the
 *  job-driven rebuild. */
export async function addManualLineItem(
  supabase: Supa,
  opts: { invoiceId: string; description: string; qty: number; rate: number },
): Promise<{ ok: boolean }> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, line_items, tax_rate, discount')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv) return { ok: false };
  const next: InvoiceLineItem[] = [
    ...((inv.line_items ?? []) as InvoiceLineItem[]),
    { description: opts.description, qty: opts.qty, rate: opts.rate },
  ];
  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);
  return { ok: true };
}

/** Update a single hand-entered (manual) line item by index and recompute
 *  totals. Spreads the existing row so any extra fields (e.g. job_id) survive,
 *  though this is only used for manual lines. */
export async function updateLineItemAt(
  supabase: Supa,
  opts: { invoiceId: string; index: number; description: string; qty: number; rate: number },
): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, line_items, tax_rate, discount')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv) return;
  const items = (inv.line_items ?? []) as InvoiceLineItem[];
  if (opts.index < 0 || opts.index >= items.length) return;
  const next = items.map((li, i) =>
    i === opts.index
      ? { ...li, description: opts.description, qty: opts.qty, rate: opts.rate }
      : li,
  );
  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);
}

/** Remove a single line item by index (used for hand-entered/manual lines) and
 *  recompute totals. */
export async function removeLineItemAt(
  supabase: Supa,
  opts: { invoiceId: string; index: number },
): Promise<void> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, line_items, tax_rate, discount')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv) return;
  const next = ((inv.line_items ?? []) as InvoiceLineItem[]).filter((_, i) => i !== opts.index);
  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);
}

/** Detach a job from its invoice: revert the job to `completed`, strip its
 *  tagged line items from the invoice, and recompute the invoice totals.
 *  Returns the invoice's remaining line-item count (so the caller can offer to
 *  delete a now-empty invoice). Legacy line items without a job_id tag are left
 *  untouched. */
export async function removeJobFromInvoice(
  supabase: Supa,
  opts: {
    jobId: string;
    invoice: { id: string; line_items: InvoiceLineItem[] | null; tax_rate?: number; discount?: number };
  },
): Promise<{ remaining: number }> {
  const all = (opts.invoice.line_items ?? []) as InvoiceLineItem[];
  const remaining = all.filter(li => li.job_id !== opts.jobId);
  // Only rewrite line items + totals when this job actually had tagged lines.
  // Legacy invoices (line items with no job_id) are left untouched so we never
  // corrupt totals computed under a different line-item shape.
  if (remaining.length !== all.length) {
    const { subtotal, tax, total } = computeTotals(
      remaining,
      opts.invoice.tax_rate ?? 0,
      opts.invoice.discount ?? 0,
    );
    await supabase
      .from('invoices')
      .update({ line_items: remaining, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
      .eq('id', opts.invoice.id);
  }
  await supabase
    .from('jobs')
    .update({ status: 'completed', invoice_id: null, invoiced_at: null })
    .eq('id', opts.jobId);
  return { remaining: remaining.length };
}

/** Move a job (and its tagged line items) from one invoice to another invoice of
 *  the same client. Recomputes both invoices. */
export async function moveJobToInvoice(
  supabase: Supa,
  opts: {
    jobId: string;
    from: { id: string; line_items: InvoiceLineItem[] | null; tax_rate?: number; discount?: number };
    to: { id: string; line_items: InvoiceLineItem[] | null; tax_rate?: number; discount?: number };
  },
): Promise<{ fromRemaining: number }> {
  const fromAll = (opts.from.line_items ?? []) as InvoiceLineItem[];
  const moved = fromAll.filter(li => li.job_id === opts.jobId);
  const fromRemaining = fromAll.filter(li => li.job_id !== opts.jobId);

  // Only shuffle line items when this job has tagged lines on the source invoice.
  // Otherwise just repoint the job (legacy invoices keep their line items intact).
  if (moved.length > 0) {
    const toAll = [...((opts.to.line_items ?? []) as InvoiceLineItem[]), ...moved];
    const fromTotals = computeTotals(fromRemaining, opts.from.tax_rate ?? 0, opts.from.discount ?? 0);
    const toTotals = computeTotals(toAll, opts.to.tax_rate ?? 0, opts.to.discount ?? 0);
    await supabase.from('invoices').update({
      line_items: fromRemaining,
      subtotal_amount: fromTotals.subtotal,
      tax_amount: fromTotals.tax,
      total_amount: fromTotals.total,
    }).eq('id', opts.from.id);
    await supabase.from('invoices').update({
      line_items: toAll,
      subtotal_amount: toTotals.subtotal,
      tax_amount: toTotals.tax,
      total_amount: toTotals.total,
    }).eq('id', opts.to.id);
  }

  await supabase.from('jobs').update({ invoice_id: opts.to.id }).eq('id', opts.jobId);

  return { fromRemaining: fromRemaining.length };
}

/** Attach already-completed jobs (same client) to an EXISTING invoice: append
 *  their line items, recompute, and mark the jobs invoiced. Returns false if a
 *  job belongs to a different client than the invoice. */
export async function addJobsToInvoice(
  supabase: Supa,
  opts: {
    invoice: { id: string; client_id: string | null; line_items: InvoiceLineItem[] | null; tax_rate?: number; discount?: number };
    jobIds: string[];
    itemTypeLabels: Record<string, string>;
    hideItemTypes?: boolean;
  },
): Promise<{ ok: boolean }> {
  if (!opts.jobIds.length) return { ok: true };

  const { data: jobs } = await supabase.from('jobs').select('id, client_id, title').in('id', opts.jobIds);
  if (!jobs?.length) return { ok: false };
  if (jobs.some((j: any) => (j.client_id ?? null) !== (opts.invoice.client_id ?? null))) {
    return { ok: false };
  }
  const titleById = new Map<string, string>(jobs.map((j: any) => [j.id, j.title ?? '']));

  const { data: jobItems } = await supabase.from('job_items').select('*').in('job_id', opts.jobIds);
  const added: InvoiceLineItem[] = [];
  for (const jid of opts.jobIds) {
    added.push(...lineItemsForJob(jid, titleById.get(jid) ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes }));
  }
  const next = [...((opts.invoice.line_items ?? []) as InvoiceLineItem[]), ...added];
  const { subtotal, tax, total } = computeTotals(next, opts.invoice.tax_rate ?? 0, opts.invoice.discount ?? 0);

  await supabase.from('invoices').update({
    line_items: next,
    subtotal_amount: subtotal,
    tax_amount: tax,
    total_amount: total,
  }).eq('id', opts.invoice.id);

  const nowIso = new Date().toISOString();
  await supabase
    .from('jobs')
    .update({ status: 'invoiced', invoice_id: opts.invoice.id, invoiced_at: nowIso })
    .in('id', opts.jobIds);

  return { ok: true };
}

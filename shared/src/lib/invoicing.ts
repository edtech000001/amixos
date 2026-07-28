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
import { type PriceSheetItem, suggestPriceItemDetailed, extractQuantity, autopriceLine, matchingAddons, diagnosePriceMatches } from './priceSheet';
import { US_STATE_NAME_TO_ABBR } from './usStates';

/** Normalize a state to its 2-letter code ("Kansas" → "KS", "ks" → "KS") so it
 *  matches how per-state price overrides are keyed. Null/blank → null. */
function normStateCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  if (t.length === 2) return t.toUpperCase();
  return US_STATE_NAME_TO_ABBR[t.toLowerCase()] ?? t.toUpperCase();
}

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
  /** Hand-edited on the invoice: the draft rebuild keeps this job's lines
   *  as-is instead of re-deriving them from job_items. */
  edited?: boolean;
  /** This line is a flat add-on/surcharge (e.g. a $600 loading fee) that
   *  autoprice split off its base job line. It carries the base line's job_id
   *  so it moves/removes with the job, but the UI shows its own description
   *  instead of substituting the job title. */
  addon?: boolean;
  /** Summary of per-unit add-ons folded into this line's rate, shown as a small
   *  indicator under the line (e.g. "+Polly/Aluminum $0.50/ft"). */
  addonNote?: string | null;
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
  opts?: { hideTypes?: boolean; placeholderQty?: number },
): InvoiceLineItem[] {
  const own = jobItems.filter(i => i.job_id === jobId);
  const placeholderQ = Number.isFinite(opts?.placeholderQty) && (opts!.placeholderQty as number) > 0 ? (opts!.placeholderQty as number) : 1;
  // A job with no logged items — OR, with Materials & Labor disabled, only
  // "bare" items (no description, $0) — bills as ONE placeholder line: its
  // title at the mapped qty (invoice_qty_field, e.g. "Total ft") × $0. This is
  // the common case with M&L off; the amount fills in once Autoprice runs.
  const allBare = own.length > 0 && own.every(i => !(i.description ?? '').trim() && !(Number(i.unit_price) > 0));
  if (own.length === 0 || (opts?.hideTypes && allBare)) {
    return [{ description: jobTitle, qty: placeholderQ, rate: 0, job_id: jobId }];
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
  // Stored amounts keep FULL DECIMAL precision (mirror of the source data);
  // rounding to cents happens ONCE, at display time. dec() strips float
  // binary noise (….125 computes as .124999… in floats) without altering
  // the decimal value — source data has ≤4 decimals, 6 is lossless.
  const dec = (n: number) => Number(n.toFixed(6));
  const subtotal = dec(lineItems.reduce((s, i) => s + dec((Number(i.qty) || 0) * (Number(i.rate) || 0)), 0));
  const tax = dec(subtotal * ((taxRate ?? 0) / 100));
  const total = dec(subtotal + tax - (discount ?? 0));
  return { subtotal, tax, total };
}

const today = () => new Date().toISOString().split('T')[0];
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

export type CreateInvoiceResult =
  | { ok: true; invoice: any }
  | { ok: false; error: 'no_jobs' | 'multiple_clients' | 'insert_failed' };

export type CreateInvoicesResult =
  | { ok: true; invoices: any[] }
  | { ok: false; error: 'no_jobs' | 'insert_failed' };

/** Create ONE draft invoice from one or more completed jobs of the SAME client,
 *  attaching each job (status → invoiced, invoice_id, invoiced_at). */
/** The placeholder line quantity for a job with no items — a mapped custom
 *  field (businesses.invoice_qty_field, e.g. "Total ft") when set + numeric,
 *  else undefined (falls back to 1). */
export function placeholderQtyFor(job: { custom_fields?: Record<string, unknown> | null }, qtyField?: string | null): number | undefined {
  if (!qtyField) return undefined;
  const raw = (job.custom_fields ?? {})[qtyField];
  if (raw == null || raw === '') return undefined;
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

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
    /** Job custom-field key to use as the qty for no-items lines (invoice_qty_field). */
    qtyField?: string | null;
  },
): Promise<CreateInvoiceResult> {
  if (!opts.jobIds.length) return { ok: false, error: 'no_jobs' };

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, client_id, custom_fields, location_id')
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
    lineItems.push(...lineItemsForJob(j.id, j.title ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes, placeholderQty: placeholderQtyFor(j, opts.qtyField) }));
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
      // Branch: inherit from the covered jobs (all one client, ~one branch).
      location_id: (jobs[0] as any)?.location_id ?? null,
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

/**
 * Create draft invoices from completed jobs that may span MULTIPLE clients —
 * one invoice per distinct client. Jobs with no client are grouped together.
 * Efficient: one jobs fetch, one job_items fetch, one invoice-count read, then
 * a sequential insert per client group so invoice numbers stay unique. Each
 * group's jobs are attached (status → invoiced) to that group's invoice.
 */
export async function createInvoicesFromJobs(
  supabase: Supa,
  opts: {
    businessId: string;
    jobIds: string[];
    invoiceTemplate: unknown;
    itemTypeLabels: Record<string, string>;
    notesLabel: string;
    startNumber?: number;
    hideItemTypes?: boolean;
    taxRate?: number;
    /** Job custom-field key to use as the qty for no-items lines (invoice_qty_field). */
    qtyField?: string | null;
  },
): Promise<CreateInvoicesResult> {
  if (!opts.jobIds.length) return { ok: false, error: 'no_jobs' };

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, client_id, custom_fields, location_id')
    .in('id', opts.jobIds);
  if (!jobs?.length) return { ok: false, error: 'no_jobs' };

  const { data: jobItems } = await supabase
    .from('job_items')
    .select('*')
    .in('job_id', opts.jobIds);
  const allItems = (jobItems ?? []) as JobItemRow[];

  // Group jobs by client, preserving the caller's job order within each group
  // and the order clients first appear.
  const byId = new Map<string, any>((jobs as any[]).map(j => [j.id, j]));
  const groups = new Map<string, any[]>();
  for (const id of opts.jobIds) {
    const j = byId.get(id);
    if (!j) continue;
    const key = j.client_id ?? '\u0000'; // null client → shared "no client" bucket
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(j);
  }

  const lang = invoiceDefaultLanguage(opts.invoiceTemplate);
  const { count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', opts.businessId);
  let seq = count ?? 0;

  const taxRate = opts.taxRate ?? 0;
  const discount = 0;
  const nowIso = new Date().toISOString();
  const created: any[] = [];

  for (const [key, groupJobs] of Array.from(groups.entries())) {
    const clientId = key === '\u0000' ? null : key;
    const lineItems: InvoiceLineItem[] = [];
    for (const j of groupJobs) {
      lineItems.push(...lineItemsForJob(j.id, j.title ?? '', allItems, opts.itemTypeLabels, { hideTypes: opts.hideItemTypes, placeholderQty: placeholderQtyFor(j, opts.qtyField) }));
    }
    const { subtotal, tax, total } = computeTotals(lineItems, taxRate, discount);
    const invoiceNumber = nextInvoiceNumber(lang, opts.startNumber, seq);
    seq += 1;

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
        notes: null,
        location_id: (groupJobs[0] as any)?.location_id ?? null,
      })
      .select()
      .single();

    // Partial failure: keep the invoices already created (visible in the list),
    // surface the error so the caller can tell the user.
    if (error || !invoice) return created.length ? { ok: true, invoices: created } : { ok: false, error: 'insert_failed' };

    await supabase
      .from('jobs')
      .update({ status: 'invoiced', invoice_id: invoice.id, invoiced_at: nowIso })
      .in('id', groupJobs.map(j => j.id));

    created.push(invoice);
  }

  return { ok: true, invoices: created };
}

/** Re-derive a DRAFT invoice's line items from its currently-attached jobs'
 *  job_items, so items added/edited on a job AFTER it was invoiced flow through.
 *  Manual (non job-tagged) line items are preserved; job lines are rebuilt.
 *  No-ops for sent/paid invoices (frozen) and writes only when something
 *  actually changed. */
export async function rebuildInvoiceLineItems(
  supabase: Supa,
  // `force` re-derives EVERY job line fresh (ignoring hand-edits/auto-prices) —
  // used by "Clear prices" to reset the invoice to unpriced ($0) so Autoprice
  // can run clean. Normal calls preserve edited/priced lines.
  opts: { invoiceId: string; itemTypeLabels: Record<string, string>; hideItemTypes?: boolean; qtyField?: string | null; force?: boolean },
): Promise<{ changed: boolean }> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, status, line_items, tax_rate, discount')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv || inv.status !== 'draft') return { changed: false };

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, custom_fields')
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
    jobLines.push(...lineItemsForJob(j.id, j.title ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes, placeholderQty: placeholderQtyFor(j, opts.qtyField) }));
  }
  // A job whose lines were hand-edited on the invoice keeps them verbatim —
  // re-deriving would silently undo the user's price/qty override.
  // force → treat NO job as overridden, so every job line is re-derived fresh
  // at $0 (clears auto-prices, edits, and add-on lines).
  const overriddenJobs = new Set(opts.force ? [] : existing.filter(li => li.job_id && li.edited).map(li => li.job_id as string));
  const keptJobLines = jobLines.filter(l => !overriddenJobs.has(l.job_id as string));
  // A job that bills as a SINGLE line: its name IS the job name, so keep the
  // stored description in sync with the current job title (a rename from the
  // job side then shows on print/send too). Multi-line/itemized jobs and add-on
  // lines keep their own descriptions.
  const jobTitleById = new Map<string, string>((jobs ?? []).map((j: any) => [j.id as string, (j.title ?? '') as string]));
  const rawOverridden = existing.filter(li => li.job_id && overriddenJobs.has(li.job_id));
  const singleLineJobs = new Set(
    Array.from(overriddenJobs).filter(jid => rawOverridden.filter(li => li.job_id === jid && !li.addon).length === 1),
  );
  const overriddenLines = rawOverridden.map(li => {
    if (li.job_id && !li.addon && singleLineJobs.has(li.job_id)) {
      const title = jobTitleById.get(li.job_id);
      if (title && title !== li.description) return { ...li, description: title };
    }
    return li;
  });
  const finalJobLines = [...overriddenLines, ...keptJobLines];
  const lineKey = (l: InvoiceLineItem) => `${l.description}|${l.qty}|${l.rate}`;
  const jobLineKeys = new Set(finalJobLines.map(lineKey));
  const manual = existing.filter(li => !li.job_id && !jobLineKeys.has(lineKey(li)));
  const next: InvoiceLineItem[] = [...manual, ...finalJobLines];
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
      // A hand-set rate no longer matches the auto-priced add-on breakdown, so
      // drop the stale "+add-on" note.
      ? { ...li, description: opts.description, qty: opts.qty, rate: opts.rate, addonNote: null, ...(li.job_id ? { edited: true } : {}) }
      : li,
  );
  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);

  // When a job bills as a SINGLE line, that line's name IS the job's name — keep
  // them in sync by renaming the job too, so the change shows everywhere
  // (dashboard, print, send). Skip add-on lines (their own label) and multi-line
  // / itemized jobs (one item shouldn't rename the whole job).
  const target = items[opts.index];
  const jobLineCount = target?.job_id
    ? items.filter(li => li.job_id === target.job_id && !li.addon).length
    : 0;
  if (target?.job_id && !target.addon && jobLineCount === 1) {
    const newTitle = opts.description.trim();
    if (newTitle && newTitle !== (target.description ?? '').trim()) {
      await supabase.from('jobs').update({ title: newTitle }).eq('id', target.job_id);
    }
  }
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
    /** Job custom-field key to use as the qty for no-items lines (invoice_qty_field). */
    qtyField?: string | null;
  },
): Promise<{ ok: boolean }> {
  if (!opts.jobIds.length) return { ok: true };

  const { data: jobs } = await supabase.from('jobs').select('id, client_id, title, custom_fields').in('id', opts.jobIds);
  if (!jobs?.length) return { ok: false };
  // NOTE: jobs from a DIFFERENT client are allowed — the add-job picker lets you
  // consolidate another client's completed job onto this invoice on purpose (it
  // flags the other client's name). The invoice's own Bill-To is unchanged.
  const titleById = new Map<string, string>(jobs.map((j: any) => [j.id, j.title ?? '']));
  const jobById = new Map<string, any>(jobs.map((j: any) => [j.id, j]));

  const { data: jobItems } = await supabase.from('job_items').select('*').in('job_id', opts.jobIds);
  const added: InvoiceLineItem[] = [];
  for (const jid of opts.jobIds) {
    added.push(...lineItemsForJob(jid, titleById.get(jid) ?? '', (jobItems ?? []) as JobItemRow[], opts.itemTypeLabels, { hideTypes: opts.hideItemTypes, placeholderQty: placeholderQtyFor(jobById.get(jid) ?? {}, opts.qtyField) }));
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

/**
 * Link an existing (imported/manual) invoice line — one with no job_id — to a
 * job, WITHOUT changing its imported description/qty/rate. Sets the line's
 * job_id + edited (so the draft rebuild keeps it verbatim and never re-derives
 * the job into duplicate lines), and marks the job invoiced on this invoice so
 * it's tied together and not re-offered in the add-job picker.
 */
export async function linkLineToJob(
  supabase: Supa,
  opts: { invoiceId: string; index: number; jobId: string },
): Promise<{ ok: boolean }> {
  const { data: inv } = await supabase.from('invoices').select('id, line_items').eq('id', opts.invoiceId).single();
  if (!inv) return { ok: false };
  const items = (inv.line_items ?? []) as InvoiceLineItem[];
  if (opts.index < 0 || opts.index >= items.length) return { ok: false };
  const next = items.map((li, i) => (i === opts.index ? { ...li, job_id: opts.jobId, edited: true } : li));
  await supabase.from('invoices').update({ line_items: next }).eq('id', opts.invoiceId);
  await supabase
    .from('jobs')
    .update({ status: 'invoiced', invoice_id: opts.invoiceId, invoiced_at: new Date().toISOString() })
    .eq('id', opts.jobId);
  return { ok: true };
}

/**
 * Autoprice an invoice's UNPRICED lines from the price sheet. For each line whose
 * rate is 0, match its description to a price item and apply the state/tier-aware
 * rate; lines that ALREADY have a price are left untouched (never overridden).
 * Works regardless of whether Materials & Labor is enabled — it prices whatever
 * line descriptions exist (job titles, imported names, manual items). Returns
 * how many lines were priced. Best-effort — the UI warns the user to verify.
 */
export interface AutopriceAmbiguous {
  /** Index into the invoice's line_items — stable, used to apply the user's pick. */
  index: number;
  description: string;
  /** The tied price items — the user picks one. */
  options: { id: string; name: string }[];
}
export async function autopriceInvoice(
  supabase: Supa,
  opts: {
    invoiceId: string;
    items: PriceSheetItem[];
    tierId?: string | null;
    qtyField?: string | null;
    /** Resolve an ambiguous line (line index → chosen price-item id) — from the
     *  tie picker. Lines with a pick are priced with that item. */
    picks?: Record<number, string>;
  },
): Promise<{ matched: number; alreadyPriced: number; unmatched: string[]; ambiguous: AutopriceAmbiguous[] }> {
  if (!opts.items.length) return { matched: 0, alreadyPriced: 0, unmatched: [], ambiguous: [] };
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, line_items, tax_rate, discount, client_id')
    .eq('id', opts.invoiceId)
    .single();
  if (!inv) return { matched: 0, alreadyPriced: 0, unmatched: [], ambiguous: [] };
  const lines = (inv.line_items ?? []) as InvoiceLineItem[];

  // Client's state is the fallback for per-state pricing when a job has no
  // location state of its own (billed-to client sits in that state).
  let clientState: string | null = null;
  if (inv.client_id) {
    const { data: cl } = await supabase.from('clients').select('state').eq('id', inv.client_id).single();
    clientState = (cl as { state: string | null } | null)?.state ?? null;
  }

  // Per-line state pricing + qty-from-custom-field: resolve each linked job's
  // state and custom fields in one query.
  const jobIds = Array.from(new Set(lines.map(l => l.job_id).filter(Boolean))) as string[];
  const jobById = new Map<string, { job_state: string | null; custom_fields: Record<string, unknown> | null; context: string; cfText: string }>();
  if (jobIds.length) {
    const { data: jobs } = await supabase.from('jobs').select('id, job_state, custom_fields, title, description, worker_notes, internal_notes').in('id', jobIds);
    for (const j of (jobs ?? []) as { id: string; job_state: string | null; custom_fields: Record<string, unknown> | null; title: string | null; description: string | null; worker_notes: string | null; internal_notes: string | null }[]) {
      const cf = Object.values((j.custom_fields ?? {}) as Record<string, unknown>).map(String).join(' ');
      jobById.set(j.id, {
        job_state: j.job_state ?? null,
        custom_fields: j.custom_fields ?? null,
        // Extra text the matcher can use: title + description + BOTH note fields
        // + custom field values — so a note like "Zimmatic" disambiguates two
        // "Corner" items even when the line title is just the job name.
        context: `${j.title ?? ''} ${j.description ?? ''} ${j.worker_notes ?? ''} ${j.internal_notes ?? ''} ${cf}`,
        // Custom-field VALUES (Project Type etc.) — the higher-signal text that
        // wins ties, so "Nuevo" beats an incidental "pivot"/"tower" in the title.
        cfText: cf,
      });
    }
  }

  let matched = 0;
  let alreadyPriced = 0;
  // Text we searched for lines that didn't match — surfaced in the "no match"
  // message so the user can see exactly what to add a match term for.
  const unmatched: string[] = [];
  // Lines that tied between 2+ price items — the caller shows a picker.
  const ambiguous: AutopriceAmbiguous[] = [];
  const picks = opts.picks ?? {};

  // Price one line with a chosen item (shared by auto-match + user pick).
  // Returns the base line PLUS any flat add-on lines split off it (e.g. a $600
  // loading fee), so the base rate stays clean ($3.75/ft) instead of smearing
  // the flat fee into a nonsensical $4.21/ft.
  const priceWith = (
    li: InvoiceLineItem,
    item: PriceSheetItem,
    jctx: { job_state: string | null; custom_fields: Record<string, unknown> | null } | undefined,
    matchText: string,
  ): InvoiceLineItem[] => {
    const addons = matchingAddons(matchText, opts.items);
    const qty = Number(li.qty) || 0;
    // Prefer the mapped qty custom field (e.g. "Total ft"), then the line's own
    // qty, then a number pulled from the description.
    const fromField = placeholderQtyFor({ custom_fields: jctx?.custom_fields ?? null }, opts.qtyField);
    const measured = fromField ?? (qty > 1 ? qty : (extractQuantity(li.description ?? '') ?? 1));
    // Job's own state (normalized), else the client's state.
    const state = normStateCode(jctx?.job_state) ?? normStateCode(clientState);
    const priced = autopriceLine(item, measured, { state, tierId: opts.tierId }, addons, { splitFlatAddons: true });
    const base: InvoiceLineItem = {
      ...li,
      qty: priced.quantity,
      rate: priced.unitPrice,
      addonNote: priced.addonNote ?? null,
      ...(li.job_id ? { edited: true } : {}),
    };
    // Flat add-ons → their own line(s), tagged with the base line's job_id so
    // they move/remove with the job but display their own name (addon: true).
    const flatLines: InvoiceLineItem[] = priced.flatAddons.map(a => ({
      description: a.name,
      qty: 1,
      rate: a.rate,
      addon: true,
      ...(li.job_id ? { job_id: li.job_id, edited: true } : {}),
    }));
    return [base, ...flatLines];
  };

  const next: InvoiceLineItem[] = [];
  lines.forEach((li, index) => {
    // A split-off add-on line (loading fee, etc.) is autoprice's own output —
    // never re-match it (it would match its own add-on and cascade/duplicate).
    if (li.addon) { next.push(li); return; }
    // Don't override a line that already has a price.
    if ((Number(li.rate) || 0) > 0) { alreadyPriced++; next.push(li); return; }
    const jctx = li.job_id ? jobById.get(li.job_id) : undefined;
    const ctx = jctx?.context ?? '';
    const matchText = `${li.description ?? ''} ${ctx}`;
    const sug = suggestPriceItemDetailed(matchText, opts.items, jctx?.cfText);
    // Unique match → price it.
    if (sug.pick) { matched++; next.push(...priceWith(li, sug.pick.item, jctx, matchText)); return; }
    // Ambiguous tie → use the user's pick if we have one, else offer the options.
    if (sug.tied.length > 1) {
      const chosen = picks[index] ? sug.tied.find(t => t.id === picks[index]) : undefined;
      if (chosen) { matched++; next.push(...priceWith(li, chosen, jctx, matchText)); return; }
      ambiguous.push({
        index,
        description: (li.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        options: sug.tied.map(t => ({ id: t.id, name: t.name })),
      });
      next.push(li);
      return;
    }
    // No match at all → diagnostic text so the user can see what to add a term for.
    if (unmatched.length < 3) {
      const cands = diagnosePriceMatches(matchText, opts.items, jctx?.cfText);
      const candStr = cands.length
        ? cands.map(c => `${c.name} [${c.term}${c.prio ? '★' : ''}]`).join(', ')
        : '(no price-item term found in this text)';
      unmatched.push(`${(li.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)} → ${candStr}`);
    }
    next.push(li);
  });
  // Don't persist while any tie is unresolved: emitting flat add-on lines
  // shifts array indices, which would invalidate the picks the caller sends
  // back keyed by line index. Return the ties for the picker — the re-run with
  // picks (no ambiguity left) is what actually writes.
  if (ambiguous.length) return { matched: 0, alreadyPriced, unmatched, ambiguous };
  if (!matched) return { matched: 0, alreadyPriced, unmatched, ambiguous: [] };

  const { subtotal, tax, total } = computeTotals(next, inv.tax_rate ?? 0, inv.discount ?? 0);
  await supabase
    .from('invoices')
    .update({ line_items: next, subtotal_amount: subtotal, tax_amount: tax, total_amount: total })
    .eq('id', opts.invoiceId);
  return { matched, alreadyPriced, unmatched, ambiguous: [] };
}

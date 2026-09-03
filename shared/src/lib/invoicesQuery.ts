import { fullNameOrArms } from './nameSearch';
// Server-side paginated + searched + status-filtered invoices loading.
//
// The scalable alternative to loading every invoice and filtering client-side:
// the list asks the DB for one page at a time and only the rows that match the
// active search / status tabs, so a business with thousands of invoices opens
// instantly and never hits the statement timeout.
//
// Mirrors the jobs equivalent (jobsQuery.ts). Two things make invoices simpler:
//   • "overdue" is a STORED status — the wrapper sweeps sent invoices past their
//     due date to status='overdue' before loading — so the tab filter is a plain
//     status match, no live due-date predicate needed.
//   • Group-by-status needs NO RPC: the group index IS the per-status counts
//     (already computed for the tab badges), and each group loads with a plain
//     status filter. Only company/state grouping falls back to load-all +
//     client-side grouping (same as jobs' lead/company).
//
// Ordering: keyset by (created_at DESC, id DESC). The id tiebreaker matters — a
// bulk import stamps many invoices with the same created_at, so a created_at-only
// cursor would skip a whole batch at a page boundary. The client list normally
// sorts by issue_date; in server mode it trusts this created_at order instead
// (the two nearly always agree, since issue_date defaults to the creation day).

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any; rpc: (fn: string, params?: any) => any };

export interface InvoicesCursor {
  createdAt: string;
  id: string;
}

export interface InvoicesQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Selected status tabs — same keys as InvoicesListScreen. Empty = all statuses. */
  statuses?: string[];
  /** Free-text search across invoice number, amount, client names, linked jobs. */
  search?: string;
  /** Issue-date range (YYYY-MM-DD). */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Keyset cursor from the previous page's last row; null for the first page. */
  cursor?: InvoicesCursor | null;
  pageSize?: number;
  /** Lazy status-group loading: restrict to this one status. */
  groupStatus?: string | null;
}

/** Group dimensions whose per-group rows load with a plain column filter (no
 *  join). Only status is on the invoice row; company/state come from the client
 *  join, so they use the load-all fallback and group client-side. */
export const INVOICE_LAZY_GROUP_DIMS = ['status'];

/** Order the status groups the way the list renders them (actionable first). */
export const INVOICE_STATUS_GROUP_ORDER = ['overdue', 'sent', 'draft', 'paid', 'total_loss'];

/** The status tabs shown as badges — matches STATUS_KEYS in InvoicesListScreen. */
export const INVOICE_STATUS_KEYS = ['draft', 'sent', 'paid', 'overdue', 'total_loss'];

export interface InvoicesPage<T extends { id: string; created_at?: string | null }> {
  invoices: T[];
  /** Cursor for the next page, or null when the list is exhausted. */
  nextCursor: InvoicesCursor | null;
}

/** Escape LIKE wildcards so a user typing % or _ searches literally. */
const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Resolve a search term to the client_ids (matched invoice.client_id) and
 *  invoice_ids it should match through joined tables — client names (via the
 *  direct client_id and the M2M invoice_clients) and linked jobs (jobs.invoice_id
 *  points at the invoice; there is no invoices.job_id). Small id lookups. */
async function resolveSearchIds(
  supabase: AnySupabase,
  businessId: string,
  term: string,
): Promise<{ clientIds: string[]; invoiceIds: string[] }> {
  const ID_CAP = 150;
  const like = `%${escLike(term)}%`;
  const [clientsRes, jobsRes] = await Promise.all([
    supabase.from('clients').select('id').eq('business_id', businessId)
      .or([`first_name.ilike.${like}`, `last_name.ilike.${like}`, `company.ilike.${like}`, ...fullNameOrArms(term)].join(',')).limit(ID_CAP),
    // Jobs matched by ref/title → the invoices they were billed to.
    supabase.from('jobs').select('invoice_id').eq('business_id', businessId)
      .not('invoice_id', 'is', null).or(`external_ref.ilike.${like},title.ilike.${like}`).limit(ID_CAP),
  ]);
  const clientIds = ((clientsRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const invoiceIdSet = new Set<string>(
    ((jobsRes.data ?? []) as { invoice_id: string | null }[]).map((r) => r.invoice_id).filter((x): x is string => !!x),
  );
  // Invoices linked to a matched client through the M2M invoice_clients table.
  if (clientIds.length) {
    const { data } = await supabase.from('invoice_clients').select('invoice_id')
      .in('client_id', clientIds).limit(ID_CAP);
    ((data ?? []) as { invoice_id: string }[]).forEach((r) => invoiceIdSet.add(r.invoice_id));
  }
  return {
    clientIds: clientIds.slice(0, ID_CAP),
    invoiceIds: Array.from(invoiceIdSet).slice(0, ID_CAP),
  };
}

/** The OR clause matching a search term across invoice fields + joined names. */
async function searchOrClause(
  supabase: AnySupabase,
  businessId: string,
  term: string,
): Promise<string | null> {
  if (!term) return null;
  const { clientIds, invoiceIds } = await resolveSearchIds(supabase, businessId, term);
  const like = `%${escLike(term)}%`;
  const ors = [
    `invoice_number.ilike.${like}`,
    // Values of the business's own custom fields (migration 218). Matched via a
    // generated column because a PostgREST .or() cannot express a JSONB
    // traversal — and values only, so "type" doesn't match the KEY on every row.
    `custom_fields_text.ilike.${like}`,
  ];
  // Amount search: a bare number matches the total exactly (the client list also
  // does a substring match on the formatted total, which can't be pushed to SQL —
  // exact match is the server-side approximation).
  const qAmount = term.replace(/[$,\s]/g, '');
  if (qAmount !== '' && /^\d+(\.\d+)?$/.test(qAmount)) ors.push(`total_amount.eq.${qAmount}`);
  if (clientIds.length) ors.push(`client_id.in.(${clientIds.join(',')})`);
  if (invoiceIds.length) ors.push(`id.in.(${invoiceIds.join(',')})`);
  return ors.join(',');
}

/** Apply the shared base filters (location, date range, status, group) to a query. */
function applyBaseFilters(q: any, params: InvoicesQueryParams): any {
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (params.dateFrom) q = q.gte('issue_date', params.dateFrom);
  if (params.dateTo) q = q.lte('issue_date', params.dateTo);
  // Lazy status-group loading pins a single status; otherwise the selected tabs.
  if (params.groupStatus) q = q.eq('status', params.groupStatus);
  else if (params.statuses?.length) q = q.in('status', params.statuses);
  return q;
}

/**
 * Fetch one page of invoices for the given filters. `select` is the caller's
 * column list — it MUST include `id, created_at, status` for pagination and
 * filtering. Returns the rows plus the cursor for the next page.
 */
export async function fetchInvoicesPage<T extends { id: string; created_at?: string | null }>(
  supabase: AnySupabase,
  select: string,
  params: InvoicesQueryParams,
): Promise<InvoicesPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('invoices').select(select).eq('business_id', params.businessId);
  q = applyBaseFilters(q, params);

  const searchOr = await searchOrClause(supabase, params.businessId, term);
  if (searchOr) q = q.or(searchOr);

  if (params.cursor) {
    const c = params.cursor;
    q = q.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
  }

  q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const invoices = (data ?? []) as T[];
  const last = invoices[invoices.length - 1] as any;
  const nextCursor =
    invoices.length === pageSize && last?.created_at ? { createdAt: last.created_at, id: last.id } : null;
  return { invoices, nextCursor };
}

/** Load ALL invoices matching the filters, newest-first — the load-all fallback
 *  used for company/state grouping and advanced views. When groupStatus is set
 *  it loads just that one status group (the lazy status-group loader). */
export async function fetchAllInvoicesMatching<T extends { id: string; created_at?: string | null }>(
  supabase: AnySupabase,
  select: string,
  params: InvoicesQueryParams,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: InvoicesCursor | null = null;
  for (let i = 0; i < 100; i++) {
    const page = await fetchInvoicesPage<T>(supabase, select, { ...params, cursor, pageSize: 1000 });
    out.push(...page.invoices);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Per-status counts for the tab badges — one count-only query per status, in
 *  parallel. Also returns `all` = every invoice matching search + date (any
 *  status), for the header total. */
export async function fetchInvoiceStatusCounts(
  supabase: AnySupabase,
  params: Pick<InvoicesQueryParams, 'businessId' | 'locationId' | 'search' | 'dateFrom' | 'dateTo'>,
): Promise<Record<string, number>> {
  // ONE grouped scan via the invoice_tab_counts RPC (migration 183) — was six
  // parallel count:'exact' queries, each paying the full RLS cost.
  const term = params.search?.trim() ?? '';
  const ids = term ? await resolveSearchIds(supabase, params.businessId, term) : null;
  const qAmount = term.replace(/[$,\s]/g, '');
  const amount = term && qAmount !== '' && /^\d+(\.\d+)?$/.test(qAmount) ? qAmount : null;
  const { data, error } = await supabase.rpc('invoice_tab_counts', {
    p_business_id: params.businessId,
    p_location_id: params.locationId ?? null,
    p_date_from: params.dateFrom ?? null,
    p_date_to: params.dateTo ?? null,
    p_search_term: term || null,
    p_search_amount: amount,
    p_client_ids: ids?.clientIds?.length ? ids.clientIds : null,
    p_invoice_ids: ids?.invoiceIds?.length ? ids.invoiceIds : null,
  });
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { tab: string; cnt: number | string }[]) {
    out[row.tab] = Number(row.cnt);
  }
  return out;
}

export interface InvoiceGroup {
  key: string;
  label: string;
  count: number;
}

/** Build the status group index straight from the per-status counts — no DB
 *  round-trip. Ordered actionable-first (overdue → sent → draft → paid → loss),
 *  empty groups dropped. `labelOf` maps a status key to its display label. */
export function statusGroupIndex(
  counts: Record<string, number>,
  labelOf: (statusKey: string) => string,
): InvoiceGroup[] {
  return INVOICE_STATUS_GROUP_ORDER
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => ({ key: k, label: labelOf(k), count: counts[k] ?? 0 }));
}

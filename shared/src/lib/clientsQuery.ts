// Server-side paginated + searched clients loading.
//
// The scalable alternative to loading every client (and every contact) and
// filtering client-side: the list asks the DB for one page at a time and only
// the rows matching the active search, so a business with thousands of clients
// opens instantly.
//
// Ordering: keyset by (last_name, first_name, id) ASCENDING — the clients list's
// default view is A–Z, so paginating by name fills the alphabet top-to-bottom as
// the user scrolls (no created_at cursor, unlike jobs/invoices). first_name and
// last_name are NOT NULL, so the cursor never straddles a null boundary.
//
// IMPORTANT — cursor quoting: unlike the timestamp+uuid cursors elsewhere, the
// name columns hold arbitrary text ("Jr.", "O'Brien", "Smith, III"), and '.' ','
// '(' ')' are PostgREST-reserved. Every cursor value is double-quoted + escaped
// so the keyset filter parses. (The DB text collation may differ from the
// screen's locale-aware sort, but that's harmless: the keyset only needs to be a
// COMPLETE total order to page through — the screen re-sorts the accumulated rows
// with localeCompare on every render, so the displayed order is always correct.)

import { fullNameOrArms } from './nameSearch';

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any };

export interface ClientsCursor {
  firstName: string;
  lastName: string;
  id: string;
  /** Any order but A–Z pages by offset instead of the name keyset. */
  offset?: number;
}

// ── Sort + filters (migration 252) ─────────────────────────────────────────
export type ClientSortKey = 'name' | 'recent' | 'invoiced' | 'balance' | 'billed' | 'updated';
export const CLIENT_SORT_KEYS: ClientSortKey[] = ['name', 'recent', 'invoiced', 'balance', 'billed', 'updated'];
/** Default direction per sort: A–Z ascending, everything else biggest /
 *  latest first. Tap again to flip. */
const CLIENT_SORT_DEFAULT_DESC: Record<ClientSortKey, boolean> = {
  name: false, recent: true, invoiced: true, balance: true, billed: true, updated: true,
};
export function clientSortIsDesc(sortBy: ClientSortKey, sortDesc?: boolean | null): boolean {
  return sortDesc ?? CLIENT_SORT_DEFAULT_DESC[sortBy];
}
/** The default A–Z view — keyset paged, letter sections + the A–Z index. */
export function clientSortIsAlpha(sortBy: ClientSortKey | undefined, sortDesc?: boolean | null): boolean {
  return (sortBy ?? 'name') === 'name' && !clientSortIsDesc('name', sortDesc);
}
/** Caption key (t.listTools.dir) for a sort in its current direction. */
export function clientSortCaption(sortBy: ClientSortKey, desc: boolean):
  'az' | 'za' | 'newest' | 'oldest' | 'highest' | 'lowest' {
  if (sortBy === 'name') return desc ? 'za' : 'az';
  if (sortBy === 'balance' || sortBy === 'billed') return desc ? 'highest' : 'lowest';
  return desc ? 'newest' : 'oldest';
}
const CLIENT_SORT_COLUMN: Record<Exclude<ClientSortKey, 'name'>, string> = {
  recent: 'created_at', invoiced: 'last_invoice_date', balance: 'balance_due', billed: 'lifetime_billed', updated: 'updated_at',
};

export type ClientDateField = 'added' | 'invoiced';
export type ClientQuickFilter =
  | 'recent_added' | 'recent_invoiced' | 'owes' | 'overdue' | 'active_jobs' | 'inactive' | 'no_email';
export const CLIENT_QUICK_KEYS: ClientQuickFilter[] =
  ['recent_added', 'recent_invoiced', 'owes', 'overdue', 'active_jobs', 'inactive', 'no_email'];

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Date range + quick filters — shared by the page, count and load-all
 *  queries so the header count always matches the rows. */
function applyClientFilters(q: any, params: ClientsQueryParams): any {
  if (params.dateField === 'invoiced') {
    if (params.dateFrom) q = q.gte('last_invoice_date', params.dateFrom);
    if (params.dateTo) q = q.lte('last_invoice_date', params.dateTo);
  } else {
    if (params.dateFrom) q = q.gte('created_at', `${params.dateFrom}T00:00:00`);
    if (params.dateTo) q = q.lte('created_at', `${params.dateTo}T23:59:59.999`);
  }
  for (const f of params.quick ?? []) {
    if (f === 'recent_added') q = q.gte('created_at', daysAgo(30).toISOString());
    else if (f === 'recent_invoiced') q = q.gte('last_invoice_date', ymdLocal(daysAgo(30)));
    else if (f === 'owes') q = q.gt('balance_due', 0);
    else if (f === 'overdue') q = q.gt('overdue_count', 0);
    else if (f === 'active_jobs') q = q.gt('open_jobs', 0);
    else if (f === 'inactive') {
      const cut = daysAgo(180);
      q = q.lt('created_at', cut.toISOString()).eq('open_jobs', 0)
        .or(`last_invoice_date.is.null,last_invoice_date.lt.${ymdLocal(cut)}`)
        .or(`last_job_at.is.null,last_job_at.lt.${cut.toISOString()}`);
    } else if (f === 'no_email') {
      q = q.or('email_office.is.null,email_office.eq.')
        .or('email_home.is.null,email_home.eq.')
        .or('email.is.null,email.eq.');
    }
  }
  return q;
}

export interface ClientsQueryParams {
  businessId: string;
  /** Free-text search across client fields + contact people. */
  search?: string;
  /** Client ids to hide — branch scoping passes clients restricted to OTHER
   *  branches here (see clientBranchExcludeIds). */
  excludeIds?: string[];
  /** The search's OR clause, already resolved by resolveClientSearch(). Pass it
   *  to the page AND count queries so the contact lookup runs once, not twice —
   *  each lookup is a network round trip that sits BEFORE the real query.
   *  Omitted = resolved here. */
  searchOr?: string | null;
  /** Cancels the request(s) — a superseded search shouldn't keep using a weak
   *  connection the new one needs. */
  signal?: AbortSignal;
  /** Keyset cursor from the previous page's last row; null for the first page. */
  cursor?: ClientsCursor | null;
  /** Start the page at this section letter — 'A'–'Z', or '#' for names that do
   *  not begin with a letter. Powers the A–Z index, which otherwise can only
   *  reach letters that happen to be in the loaded pages. Ignored when a
   *  cursor is supplied (paging within an already-jumped-to letter). */
  startAtLetter?: string | null;
  pageSize?: number;
  /** Order; default A–Z (keyset). Others page by offset (migration 252). */
  sortBy?: ClientSortKey;
  /** null/undefined = the sort's default direction. */
  sortDesc?: boolean | null;
  /** Quick filters, ANDed. */
  quick?: ClientQuickFilter[];
  /** Date range (YYYY-MM-DD) on `dateField` (default: date added). */
  dateField?: ClientDateField;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface ClientsPage<T extends { id: string; first_name: string; last_name: string }> {
  clients: T[];
  /** Cursor for the next page, or null when the list is exhausted. */
  nextCursor: ClientsCursor | null;
}

/** Escape LIKE wildcards so a user typing % or _ searches literally. */
const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Double-quote a PostgREST filter value so reserved chars (, . ( ) etc.) in
 *  stored names don't break the keyset filter string. */
const quoteVal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Resolve a search term to the client_ids whose CONTACT people match (name or
 *  role) — the one joined-table lookup clients search needs. */
async function resolveContactClientIds(
  supabase: AnySupabase,
  businessId: string,
  term: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const like = `%${escLike(term)}%`;
  let q = supabase.from('client_contacts').select('client_id')
    .eq('business_id', businessId).or(`name.ilike.${like},role.ilike.${like}`).limit(300);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  // A cancelled/failed lookup must not silently drop contact matches into a
  // "complete" result — surface it so the caller can retry.
  if (error) throw new Error(error.message);
  return Array.from(new Set(((data ?? []) as { client_id: string }[]).map((r) => r.client_id))).slice(0, 200);
}

/** The OR clause matching a search term across client fields + contact names.
 *  Own-field matches use the canonical + shown columns; contact matches resolve
 *  to a client_id list. (Phone/state searches are raw-column substring matches —
 *  the client list also folds formatting + state-name↔abbr, which can't be
 *  pushed to SQL; those are the server-side approximation.) */
async function searchOrClause(
  supabase: AnySupabase,
  businessId: string,
  term: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!term) return null;
  const contactIds = await resolveContactClientIds(supabase, businessId, term, signal);
  const like = `%${escLike(term)}%`;
  const ors = [
    `first_name.ilike.${like}`, `last_name.ilike.${like}`, `company.ilike.${like}`,
    `phone_cell.ilike.${like}`, `phone_office.ilike.${like}`,
    `email_office.ilike.${like}`, `email_home.ilike.${like}`, `email.ilike.${like}`,
    `city.ilike.${like}`, `state.ilike.${like}`,
    // Values of the business's own custom fields (migration 218). Matched via a
    // generated column because a PostgREST .or() cannot express a JSONB
    // traversal — and values only, so "type" doesn't match the KEY on every row.
    `custom_fields_text.ilike.${like}`,
    // Multi-word terms: match as first+last split across the words.
    ...fullNameOrArms(term),
  ];
  if (contactIds.length) ors.push(`id.in.(${contactIds.join(',')})`);
  return ors.join(',');
}

/** Resolve a search term to the OR clause once, to share between the page and
 *  count queries (params.searchOr). null when there's no term. */
export function resolveClientSearch(
  supabase: AnySupabase,
  businessId: string,
  search: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  return searchOrClause(supabase, businessId, search?.trim() ?? '', signal);
}

/**
 * Fetch one page of clients for the given filters. `select` is the caller's
 * column list — it MUST include `id, first_name, last_name` for the keyset.
 * Returns the rows plus the cursor for the next page.
 */
export async function fetchClientsPage<T extends { id: string; first_name: string; last_name: string }>(
  supabase: AnySupabase,
  select: string,
  params: ClientsQueryParams,
): Promise<ClientsPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('clients').select(select).eq('business_id', params.businessId);
  if (params.excludeIds?.length) q = q.not('id', 'in', `(${params.excludeIds.join(',')})`);

  const searchOr = params.searchOr !== undefined
    ? params.searchOr
    : await searchOrClause(supabase, params.businessId, term, params.signal);
  if (searchOr) q = q.or(searchOr);
  q = applyClientFilters(q, params);

  // Any order but A–Z pages by OFFSET (the keyset only covers name order).
  // Missing values (never invoiced) sort last; name breaks ties.
  if (!clientSortIsAlpha(params.sortBy, params.sortDesc)) {
    const sortBy = params.sortBy ?? 'name';
    const desc = clientSortIsDesc(sortBy, params.sortDesc);
    const offset = params.cursor?.offset ?? 0;
    q = sortBy === 'name'
      ? q.order('first_name', { ascending: false }).order('last_name', { ascending: false })
      : q.order(CLIENT_SORT_COLUMN[sortBy], { ascending: !desc, nullsFirst: false })
        .order('first_name', { ascending: true }).order('last_name', { ascending: true });
    q = q.order('id', { ascending: !desc }).range(offset, offset + pageSize - 1);
    if (params.signal) q = q.abortSignal(params.signal);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const clients = (data ?? []) as T[];
    return {
      clients,
      nextCursor: clients.length === pageSize ? { firstName: '', lastName: '', id: '', offset: offset + clients.length } : null,
    };
  }

  if (params.cursor) {
    const c = params.cursor;
    const fn = quoteVal(c.firstName);
    const ln = quoteVal(c.lastName);
    q = q.or(
      `first_name.gt.${fn},` +
      `and(first_name.eq.${fn},last_name.gt.${ln}),` +
      `and(first_name.eq.${fn},last_name.eq.${ln},id.gt.${c.id})`,
    );
  } else if (params.startAtLetter) {
    // '#' is everything that does not start with a letter. Those sort before
    // 'A', so the bucket is exactly `< 'A'` — and because it is a closed range
    // rather than an open one, tapping '#' shows that group alone instead of
    // the whole list.
    q = params.startAtLetter === '#'
      ? q.lt('first_name', 'A')
      : q.gte('first_name', params.startAtLetter);
  }

  // Ordered by first_name to match how the list actually groups rows —
  // clientSectionLetter() reads the first character of "first last", so paging
  // by last_name handed back pages that had to be re-sorted on arrival and
  // could never line up with the A–Z index.
  q = q.order('first_name', { ascending: true }).order('last_name', { ascending: true })
    .order('id', { ascending: true }).limit(pageSize);
  if (params.signal) q = q.abortSignal(params.signal);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const clients = (data ?? []) as T[];
  const last = clients[clients.length - 1] as any;
  const nextCursor =
    clients.length === pageSize && last
      ? { firstName: last.first_name, lastName: last.last_name, id: last.id }
      : null;
  return { clients, nextCursor };
}

/** Load ALL clients matching the filters (in name order) — the load-all path for
 *  group-by (company/state/city/custom), which needs the full set to bucket. */
export async function fetchAllClientsMatching<T extends { id: string; first_name: string; last_name: string }>(
  supabase: AnySupabase,
  select: string,
  params: ClientsQueryParams,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: ClientsCursor | null = null;
  const searchOr = params.searchOr !== undefined
    ? params.searchOr
    : await searchOrClause(supabase, params.businessId, params.search?.trim() ?? '', params.signal);
  for (let i = 0; i < 100; i++) {
    const page = await fetchClientsPage<T>(supabase, select, { ...params, searchOr, cursor, pageSize: 1000 });
    out.push(...page.clients);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Total clients matching the filters (for the header count) — a count-only query. */
export async function fetchClientCount(
  supabase: AnySupabase,
  params: Pick<ClientsQueryParams, 'businessId' | 'search' | 'excludeIds' | 'searchOr' | 'signal' | 'quick' | 'dateField' | 'dateFrom' | 'dateTo'>,
): Promise<number> {
  const term = params.search?.trim() ?? '';
  const searchOr = params.searchOr !== undefined
    ? params.searchOr
    : await searchOrClause(supabase, params.businessId, term, params.signal);
  let q = supabase.from('clients').select('id', { count: 'exact', head: true })
    .eq('business_id', params.businessId);
  if (params.excludeIds?.length) q = q.not('id', 'in', `(${params.excludeIds.join(',')})`);
  if (searchOr) q = q.or(searchOr);
  q = applyClientFilters(q, params);
  if (params.signal) q = q.abortSignal(params.signal);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Group dimensions that need the FULL matching set (load-all + client-side
 *  grouping). Everything except the default 'name' view — name is keyset
 *  paginated in alphabetical order, so it fills incrementally on its own. */
export const CLIENT_LOADALL_GROUP_DIMS = ['company', 'state', 'city'];
export function clientGroupNeedsAll(groupBy: string): boolean {
  return groupBy !== 'name';
}

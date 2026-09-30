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
}

export interface ClientsQueryParams {
  businessId: string;
  /** Free-text search across client fields + contact people. */
  search?: string;
  /** Client ids to hide — branch scoping passes clients restricted to OTHER
   *  branches here (see clientBranchExcludeIds). */
  excludeIds?: string[];
  /** Keyset cursor from the previous page's last row; null for the first page. */
  cursor?: ClientsCursor | null;
  /** Start the page at this section letter — 'A'–'Z', or '#' for names that do
   *  not begin with a letter. Powers the A–Z index, which otherwise can only
   *  reach letters that happen to be in the loaded pages. Ignored when a
   *  cursor is supplied (paging within an already-jumped-to letter). */
  startAtLetter?: string | null;
  pageSize?: number;
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
): Promise<string[]> {
  const like = `%${escLike(term)}%`;
  const { data } = await supabase.from('client_contacts').select('client_id')
    .eq('business_id', businessId).or(`name.ilike.${like},role.ilike.${like}`).limit(300);
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
): Promise<string | null> {
  if (!term) return null;
  const contactIds = await resolveContactClientIds(supabase, businessId, term);
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

  const searchOr = await searchOrClause(supabase, params.businessId, term);
  if (searchOr) q = q.or(searchOr);

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
  for (let i = 0; i < 100; i++) {
    const page = await fetchClientsPage<T>(supabase, select, { ...params, cursor, pageSize: 1000 });
    out.push(...page.clients);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Total clients matching the filters (for the header count) — a count-only query. */
export async function fetchClientCount(
  supabase: AnySupabase,
  params: Pick<ClientsQueryParams, 'businessId' | 'search' | 'excludeIds'>,
): Promise<number> {
  const term = params.search?.trim() ?? '';
  const searchOr = await searchOrClause(supabase, params.businessId, term);
  let q = supabase.from('clients').select('id', { count: 'exact', head: true })
    .eq('business_id', params.businessId);
  if (params.excludeIds?.length) q = q.not('id', 'in', `(${params.excludeIds.join(',')})`);
  if (searchOr) q = q.or(searchOr);
  const { count } = await q;
  return count ?? 0;
}

/** Group dimensions that need the FULL matching set (load-all + client-side
 *  grouping). Everything except the default 'name' view — name is keyset
 *  paginated in alphabetical order, so it fills incrementally on its own. */
export const CLIENT_LOADALL_GROUP_DIMS = ['company', 'state', 'city'];
export function clientGroupNeedsAll(groupBy: string): boolean {
  return groupBy !== 'name';
}

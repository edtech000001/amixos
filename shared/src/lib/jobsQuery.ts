// Server-side paginated + searched + tab-filtered jobs loading.
//
// The scalable alternative to loading every job and filtering client-side: the
// list asks the DB for one page at a time and only the rows that match the
// active search / tab, so a business with thousands of jobs opens instantly and
// never hits the statement timeout.
//
// Ordering: keyset by (created_at DESC, id DESC). The id tiebreaker matters — a
// bulk import stamps hundreds of jobs with the SAME created_at, so a
// created_at-only cursor would skip a whole batch at a page boundary.
//
// The tab / default-view filter here MIRRORS jobInTab()/matchesTab() in
// JobsListScreen — keep them in sync or the server list will diverge from what
// the tabs claim.
//
// Full-text-ish search WITHOUT a denormalized column or triggers: client name
// and crew/lead names live on other tables, so we resolve those to id lists in
// tiny lookups, then OR them with the job's own ilike fields in one query.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any; rpc: (fn: string, params?: any) => any };

export interface JobsCursor {
  createdAt: string;
  id: string;
}

export interface JobsQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Selected status tabs — same keys as JobsListScreen. Empty = default view. */
  tabs?: string[];
  /** Free-text search across job fields + client + crew/lead names. */
  search?: string;
  /** Scheduled-date range (YYYY-MM-DD). Approximate — filters by scheduled_date,
   *  not the client's full [scheduled, end] overlap. */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Keyset cursor from the previous page's last row; null for the first page. */
  cursor?: JobsCursor | null;
  pageSize?: number;
}

export interface JobsPage<T extends { id: string; created_at?: string | null }> {
  jobs: T[];
  /** Cursor for the next page, or null when the list is exhausted. */
  nextCursor: JobsCursor | null;
}

// Mirror JobsListScreen's constants so the server filter matches the client.
const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];
const CLOSED_DEFAULT_HIDDEN = ['invoiced', 'cancelled'];

/** Escape LIKE wildcards so a user typing % or _ searches literally. */
const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** PostgREST condition that a job belongs to ONE tab — mirrors jobInTab().
 *  Non-archived tabs exclude archived jobs. */
function tabCondition(tab: string): string {
  if (tab === 'archived') return 'archived_at.not.is.null';
  if (tab === 'propuestas') return `and(archived_at.is.null,status.in.(${PROPOSAL_STATUSES.join(',')}))`;
  if (tab === 'delegated') return 'and(archived_at.is.null,delegated_to_business_id.not.is.null)';
  return `and(archived_at.is.null,status.eq.${tab})`;
}

/** Apply the tab / default-view filter to a jobs query — mirrors matchesTab(). */
function applyTabFilter(q: any, tabs: string[], searching: boolean): any {
  if (!tabs.length) {
    // Default view hides closed + archived work — UNLESS searching, which spans
    // every status so a targeted match always surfaces.
    if (searching) return q;
    return q.not('status', 'in', `(${CLOSED_DEFAULT_HIDDEN.join(',')})`).is('archived_at', null);
  }
  // A job matches if it satisfies ANY selected tab.
  return q.or(tabs.map(tabCondition).join(','));
}

/** Resolve a search term to the client_ids and job_ids it should match through
 *  joined tables (client names, crew/lead names). Small id-only lookups. */
async function resolveSearchIds(
  supabase: AnySupabase,
  businessId: string,
  term: string,
): Promise<{ clientIds: string[]; crewJobIds: string[] }> {
  // Cap the id lists: they go into the query-string OR filter, which has a URL
  // length limit. A term rarely matches more than a handful of clients / crew,
  // so these caps only bite on extremely broad terms (trimming joined-name
  // matches, never job-field matches). A denormalized search column would remove
  // the cap — the next step if it's ever needed.
  const ID_CAP = 150;
  const like = `%${escLike(term)}%`;
  const [clientsRes, empRes, crewByNameRes] = await Promise.all([
    supabase.from('clients').select('id').eq('business_id', businessId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`).limit(ID_CAP),
    supabase.from('employees').select('id').eq('business_id', businessId)
      .or(`first_name.ilike.${like},last_name.ilike.${like}`).limit(200),
    supabase.from('job_assignments').select('job_id').eq('business_id', businessId)
      .ilike('worker_name', like).limit(ID_CAP),
  ]);
  const clientIds = ((clientsRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const empIds = ((empRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const crewJobIds = new Set<string>(
    ((crewByNameRes.data ?? []) as { job_id: string }[]).map((r) => r.job_id),
  );
  if (empIds.length) {
    const { data } = await supabase.from('job_assignments').select('job_id')
      .eq('business_id', businessId).in('employee_id', empIds).limit(ID_CAP);
    ((data ?? []) as { job_id: string }[]).forEach((r) => crewJobIds.add(r.job_id));
  }
  return { clientIds: clientIds.slice(0, ID_CAP), crewJobIds: Array.from(crewJobIds).slice(0, ID_CAP) };
}

/** The OR clause matching a search term across job fields + joined names. */
async function searchOrClause(
  supabase: AnySupabase,
  businessId: string,
  term: string,
): Promise<string | null> {
  if (!term) return null;
  const { clientIds, crewJobIds } = await resolveSearchIds(supabase, businessId, term);
  const like = `%${escLike(term)}%`;
  const ors = [
    `title.ilike.${like}`, `external_ref.ilike.${like}`, `estimate_number.ilike.${like}`,
    `job_city.ilike.${like}`, `job_state.ilike.${like}`,
  ];
  if (clientIds.length) ors.push(`client_id.in.(${clientIds.join(',')})`);
  if (crewJobIds.length) ors.push(`id.in.(${crewJobIds.join(',')})`);
  return ors.join(',');
}

/**
 * Fetch one page of jobs for the given filters. `select` is the caller's column
 * list — it MUST include `id, created_at, status, archived_at` for pagination
 * and filtering. Returns the rows plus the cursor for the next page.
 */
export async function fetchJobsPage<T extends { id: string; created_at?: string | null }>(
  supabase: AnySupabase,
  select: string,
  params: JobsQueryParams,
): Promise<JobsPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';
  const tabs = params.tabs ?? [];

  let q = supabase.from('jobs').select(select).eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (params.dateFrom) q = q.gte('scheduled_date', params.dateFrom);
  if (params.dateTo) q = q.lte('scheduled_date', params.dateTo);

  const searchOr = await searchOrClause(supabase, params.businessId, term);
  if (searchOr) q = q.or(searchOr);
  q = applyTabFilter(q, tabs, !!term);

  if (params.cursor) {
    const c = params.cursor;
    q = q.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
  }

  q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as T[];
  const last = jobs[jobs.length - 1] as any;
  const nextCursor =
    jobs.length === pageSize && last?.created_at ? { createdAt: last.created_at, id: last.id } : null;
  return { jobs, nextCursor };
}

export interface JobGroup {
  key: string;
  label: string;
  count: number;
}

/** Turn the UI tabs into the job_group_index RPC's flat filter args. Returns
 *  null when the selection can't be expressed as a single status set (multiple
 *  tabs, or the delegated tab) — the caller should fall back to loading all
 *  matching jobs and grouping client-side. */
export function jobTabFilterParams(
  tabs: string[],
  searching: boolean,
): { statusInclude: string[] | null; excludeClosed: boolean; archived: 'exclude' | 'only' | 'any' } | null {
  if (!tabs.length) {
    if (searching) return { statusInclude: null, excludeClosed: false, archived: 'any' };
    return { statusInclude: null, excludeClosed: true, archived: 'exclude' };
  }
  if (tabs.length === 1) {
    const tk = tabs[0];
    if (tk === 'archived') return { statusInclude: null, excludeClosed: false, archived: 'only' };
    if (tk === 'propuestas') return { statusInclude: PROPOSAL_STATUSES, excludeClosed: false, archived: 'exclude' };
    if (tk === 'delegated') return null; // needs a delegated filter the RPC lacks
    return { statusInclude: [tk], excludeClosed: false, archived: 'exclude' };
  }
  return null; // multi-tab — group client-side
}

/** The lazy group-by index: groups + counts for the active filters, with NO job
 *  rows loaded. Returns null when the tab selection can't be pushed to the RPC
 *  (caller then loads all matching + groups client-side). */
export async function fetchJobGroupIndex(
  supabase: AnySupabase,
  params: {
    businessId: string; groupBy: string; tabs?: string[]; search?: string;
    locationId?: string | null; dateFrom?: string | null; dateTo?: string | null;
  },
): Promise<JobGroup[] | null> {
  const term = params.search?.trim() ?? '';
  const fp = jobTabFilterParams(params.tabs ?? [], !!term);
  if (!fp) return null;
  let clientIds: string[] | null = null;
  let crewJobIds: string[] | null = null;
  if (term) {
    const ids = await resolveSearchIds(supabase, params.businessId, term);
    clientIds = ids.clientIds;
    crewJobIds = ids.crewJobIds;
  }
  const { data, error } = await supabase.rpc('job_group_index', {
    p_business_id: params.businessId,
    p_group_by: params.groupBy,
    p_status_include: fp.statusInclude,
    p_exclude_closed: fp.excludeClosed,
    p_archived: fp.archived,
    p_search_term: term || null,
    p_client_ids: clientIds,
    p_crew_job_ids: crewJobIds,
    p_location_id: params.locationId ?? null,
    p_date_from: params.dateFrom ?? null,
    p_date_to: params.dateTo ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { group_key: string; group_label: string; cnt: number | string }) => ({
    key: r.group_key,
    label: r.group_label,
    count: Number(r.cnt),
  }));
}

/** Per-tab counts for the badges — one count-only query per tab, in parallel.
 *  'all' counts every search-matched job (no tab filter), matching the client. */
export async function fetchJobTabCounts(
  supabase: AnySupabase,
  params: Pick<JobsQueryParams, 'businessId' | 'locationId' | 'search'>,
  tabKeys: string[],
): Promise<Record<string, number>> {
  const term = params.search?.trim() ?? '';
  const searchOr = await searchOrClause(supabase, params.businessId, term);
  const entries = await Promise.all(
    tabKeys.map(async (key) => {
      let q = supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('business_id', params.businessId);
      if (params.locationId) q = q.eq('location_id', params.locationId);
      if (searchOr) q = q.or(searchOr);
      if (key !== 'all') q = q.or(tabCondition(key));
      const { count } = await q;
      return [key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

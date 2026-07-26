// Server-side paginated + searched jobs loading.
//
// The scalable alternative to loading every job and filtering client-side: the
// list asks the DB for one page at a time and only the rows that match the
// active search / status filter, so a business with thousands of jobs opens
// instantly and never hits the statement timeout.
//
// Ordering: keyset by (created_at DESC, id DESC). The id tiebreaker matters —
// a bulk import stamps hundreds of jobs with the SAME created_at, so a
// created_at-only cursor would skip a whole batch at a page boundary.
//
// Full-text-ish search WITHOUT a denormalized column or triggers: client name
// and crew/lead names live on other tables, so we resolve those to id lists in
// two tiny lookups, then OR them with the job's own ilike fields in one query.

// Minimal supabase-like shape so this stays platform-agnostic (web + mobile).
type AnySupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface JobsCursor {
  createdAt: string;
  id: string;
}

export interface JobsQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Status values to include (already expanded from the UI tabs). Empty = all. */
  statuses?: string[];
  /** Free-text search across job fields + client + crew/lead names. */
  search?: string;
  /** Keyset cursor from the previous page's last row; null for the first page. */
  cursor?: JobsCursor | null;
  pageSize?: number;
}

export interface JobsPage<T extends { id: string; created_at?: string | null }> {
  jobs: T[];
  /** Cursor to pass as `cursor` for the next page, or null when the list is exhausted. */
  nextCursor: JobsCursor | null;
}

/** Escape LIKE wildcards so a user typing % or _ searches literally. */
const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Resolve a search term to the client_ids and job_ids it should match through
 *  joined tables (client names, crew/lead names). Small id-only lookups. */
async function resolveSearchIds(
  supabase: AnySupabase,
  businessId: string,
  term: string,
): Promise<{ clientIds: string[]; crewJobIds: string[] }> {
  // Cap the id lists: they go into the query-string OR filter, which has a URL
  // length limit. A search term rarely matches more than a handful of clients /
  // crew, so these caps only bite on extremely broad terms (where they'd trim
  // the joined-name matches, never the job-field matches). A denormalized
  // search column would remove the cap entirely — the next step if it's needed.
  const ID_CAP = 150;
  const like = `%${escLike(term)}%`;
  const [clientsRes, empRes, crewByNameRes] = await Promise.all([
    supabase.from('clients').select('id').eq('business_id', businessId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`).limit(ID_CAP),
    supabase.from('employees').select('id').eq('business_id', businessId)
      .or(`first_name.ilike.${like},last_name.ilike.${like}`).limit(200),
    // Manually-typed crew names (no employee link) match here.
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

/**
 * Fetch one page of jobs for the given filters. `select` is the caller's column
 * list (must include `id, created_at, status, location_id` for pagination and
 * filtering to work). Returns the rows plus the cursor for the next page.
 */
export async function fetchJobsPage<T extends { id: string; created_at?: string | null }>(
  supabase: AnySupabase,
  select: string,
  params: JobsQueryParams,
): Promise<JobsPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('jobs').select(select).eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (params.statuses && params.statuses.length) q = q.in('status', params.statuses);

  if (term) {
    const { clientIds, crewJobIds } = await resolveSearchIds(supabase, params.businessId, term);
    const like = `%${escLike(term)}%`;
    const ors = [
      `title.ilike.${like}`,
      `external_ref.ilike.${like}`,
      `estimate_number.ilike.${like}`,
      `job_city.ilike.${like}`,
      `job_state.ilike.${like}`,
    ];
    if (clientIds.length) ors.push(`client_id.in.(${clientIds.join(',')})`);
    if (crewJobIds.length) ors.push(`id.in.(${crewJobIds.join(',')})`);
    q = q.or(ors.join(','));
  }

  // Keyset: (created_at, id) strictly less than the cursor, in DESC order.
  if (params.cursor) {
    const c = params.cursor;
    q = q.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
  }

  q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const jobs = (data ?? []) as T[];
  const last = jobs[jobs.length - 1];
  const nextCursor =
    jobs.length === pageSize && last?.created_at ? { createdAt: last.created_at, id: last.id } : null;
  return { jobs, nextCursor };
}

/** Per-tab counts for the badges — one count-only query per status set, run in
 *  parallel. Each key maps to the status values that tab includes. */
export async function fetchJobStatusCounts(
  supabase: AnySupabase,
  params: Omit<JobsQueryParams, 'cursor' | 'pageSize' | 'statuses'>,
  tabStatusSets: Record<string, string[]>,
): Promise<Record<string, number>> {
  const term = params.search?.trim() ?? '';
  let searchOr: string | null = null;
  if (term) {
    const { clientIds, crewJobIds } = await resolveSearchIds(supabase, params.businessId, term);
    const like = `%${escLike(term)}%`;
    const ors = [
      `title.ilike.${like}`, `external_ref.ilike.${like}`, `estimate_number.ilike.${like}`,
      `job_city.ilike.${like}`, `job_state.ilike.${like}`,
    ];
    if (clientIds.length) ors.push(`client_id.in.(${clientIds.join(',')})`);
    if (crewJobIds.length) ors.push(`id.in.(${crewJobIds.join(',')})`);
    searchOr = ors.join(',');
  }
  const entries = await Promise.all(
    Object.entries(tabStatusSets).map(async ([key, statuses]) => {
      let q = supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('business_id', params.businessId);
      if (params.locationId) q = q.eq('location_id', params.locationId);
      if (statuses.length) q = q.in('status', statuses);
      if (searchOr) q = q.or(searchOr);
      const { count } = await q;
      return [key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

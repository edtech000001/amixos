// Pagination helper for Supabase / PostgREST `.select()` queries.
//
// PostgREST silently caps a single `.select()` at ~1000 rows. Without
// looping, a list query against a table that has grown past that point
// will quietly truncate — no error, no warning, missing data in the UI.
//
// `fetchAll` runs the same query repeatedly with `.range(from, to)`,
// accumulating rows until a page returns fewer than `pageSize` rows.
//
// Usage:
//
//   const clients = await fetchAll<Client>((from, to) =>
//     supabase
//       .from('clients')
//       .select('*')
//       .eq('business_id', businessId)
//       .order('created_at', { ascending: false })
//       .range(from, to)
//   );
//
// Rules of thumb (see CLAUDE.md → "Supabase Query Pagination"):
//   - Use `fetchAll` for any read that is meant to return *all* rows of
//     a table (lists, exports, sync jobs, dashboards).
//   - Don't use it for single-row fetches (`.single()`, `.eq('id', x)`)
//     or for intentionally bounded queries (`.limit(5)` recent items).
//   - Aggregations across a whole table should ideally move into a DB
//     view / RPC instead of fetching every row client-side.

export type SupabasePageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export type SupabasePageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<SupabasePageResult<T>>;

export interface FetchAllOptions {
  pageSize?: number;
  // Safety valve to prevent runaway loops if a caller misuses the helper.
  // Default 100 pages × 1000 rows = 100k rows per business, which is
  // already well past any realistic workload.
  maxPages?: number;
}

export async function fetchAll<T>(
  buildPage: SupabasePageQuery<T>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 100;
  const all: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }

  return all;
}

export type SupabaseKeysetQuery<T> = (
  afterId: string | null,
  pageSize: number,
) => PromiseLike<SupabasePageResult<T>>;

// KEYSET pagination by the row `id` (uuid PK) — the scalable alternative to
// `fetchAll`'s OFFSET (`.range()`) paging. OFFSET makes each later page
// re-scan every row before it, so on a large table (thousands of rows) with
// per-row RLS the query gets slower page by page and eventually hits the
// statement timeout. Keyset instead asks for "the next `pageSize` rows whose
// id > the last one I saw", so every page is a bounded index range-scan that
// stays fast no matter how big the table grows.
//
// Order is by `id` (not created_at), so use this ONLY for callers that re-sort
// the result themselves (all the dashboard lists do). Requires a composite
// index on (business_id, id) for the range scan to be cheap.
//
// Usage:
//   const jobs = await fetchAllById<RawJob>((afterId, pageSize) => {
//     let q = supabase.from('jobs').select(SEL).eq('business_id', bid)
//       .order('id', { ascending: true }).limit(pageSize);
//     if (afterId) q = q.gt('id', afterId);
//     return q;
//   });
export async function fetchAllById<T extends { id: string }>(
  buildPage: SupabaseKeysetQuery<T>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 100;
  const all: T[] = [];
  let afterId: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await buildPage(afterId, pageSize);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    afterId = data[data.length - 1].id;
  }

  return all;
}

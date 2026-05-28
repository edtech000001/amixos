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

// Server-side mirror of shared/src/lib/supabaseFetch.ts.
//
// The api workspace doesn't depend on @amixos/shared (rootDir is scoped
// to api/src), so the helper is duplicated here. The two copies must
// stay in sync — they implement the same behavior.
//
// See CLAUDE.md → "Supabase Query Pagination" for the full rationale.

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

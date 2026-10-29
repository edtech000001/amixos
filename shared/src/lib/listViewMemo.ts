// In-memory snapshot of the last result for each FILTERED list view (the
// default view already rides the persisted SWR cache). Opening a job and
// coming back remounts the list on web — without this a filtered view went
// back to skeletons and re-ran its whole query before showing anything. Now
// the last rows + tab counts paint instantly and the fetch refreshes them.
//
// Memory only (module scope): it lives for the session, never hits storage,
// and is keyed by the full query so a different filter never shows another
// view's rows. Small: first page only, a handful of views.

const MAX_VIEWS = 12;
const memo = new Map<string, { rows: unknown[]; counts: Record<string, number> }>();

/** Stable key for a view: the params object (+ sort mode), key-sorted. */
export function listViewKey(...parts: unknown[]): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.keys(v as object).sort().reduce<Record<string, unknown>>((o, k) => {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined && typeof x !== 'function') o[k] = norm(x);
        return o;
      }, {});
    }
    return v;
  };
  return JSON.stringify(parts.map(norm));
}

export function readListView<T>(key: string): { rows: T[]; counts: Record<string, number> } | null {
  const hit = memo.get(key);
  return hit ? { rows: hit.rows as T[], counts: hit.counts } : null;
}

export function writeListView(key: string, rows: unknown[], counts: Record<string, number>): void {
  memo.delete(key); // re-insert → most recent last
  memo.set(key, { rows, counts });
  while (memo.size > MAX_VIEWS) memo.delete(memo.keys().next().value as string);
}

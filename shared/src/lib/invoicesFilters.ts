// Persisted invoices-list view state (status filters + issue-date range). Saved
// per device+business so the list survives navigating into an invoice + back
// AND a full refresh — it only resets when the user clears it. Search and
// group-by persist through their own mechanisms (usePersistedSearch and the
// invoicesGroupBy key); this module covers the remaining filters. Mirrors
// jobsFilters.ts.

export interface InvoicesFilters {
  /** Selected status filters (multi-select). Empty = "all" (no status filter). */
  statuses: string[];
  /** Issue-date range filter (yyyy-mm-dd). null = open-ended on that side. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const INVOICES_FILTERS_KEY = 'amixos.invoicesFilters.v1';

/** Parse a stored blob into a partial filter set, tolerating bad/old data. */
export function parseInvoicesFilters(raw: string | null | undefined): Partial<InvoicesFilters> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    const out: Partial<InvoicesFilters> = {};
    if (Array.isArray(o.statuses)) {
      out.statuses = o.statuses.filter((s: unknown): s is string => typeof s === 'string');
    }
    if (typeof o.dateFrom === 'string') out.dateFrom = o.dateFrom;
    if (typeof o.dateTo === 'string') out.dateTo = o.dateTo;
    return out;
  } catch {
    return null;
  }
}

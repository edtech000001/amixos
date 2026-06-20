// Persisted jobs-list view state (status tabs, search, sort, group). Saved per
// device so the list survives navigating into a job + back AND a full app
// refresh — it only resets when the user clears it. Each platform supplies its
// own storage (web: localStorage; mobile: AsyncStorage) and reads/writes this
// shape; this module owns the key, defaults, and "is anything active?" check.

import type { JobSortKey, JobGroupKey } from './jobSort';

export interface JobsFilters {
  /** Selected status tabs (multi-select). Empty = "all" (no status filter). */
  tabs: string[];
  search: string;
  sortBy: JobSortKey;
  groupBy: JobGroupKey;
  /** Scheduled-date range filter (yyyy-mm-dd). null = open-ended on that side. */
  dateFrom: string | null;
  dateTo: string | null;
}

export const JOBS_FILTERS_KEY = 'amixos.jobsFilters.v1';

export const DEFAULT_JOBS_FILTERS: JobsFilters = {
  tabs: [],
  search: '',
  sortBy: 'recent',
  groupBy: 'none',
  dateFrom: null,
  dateTo: null,
};

/** True when the list is showing anything other than the default view. */
export function jobsFiltersActive(f: JobsFilters): boolean {
  return (
    f.tabs.length > 0 ||
    f.search.trim() !== '' ||
    f.sortBy !== 'recent' ||
    f.groupBy !== 'none' ||
    !!f.dateFrom ||
    !!f.dateTo
  );
}

/** Does a job's scheduled span [start, end] overlap the filter range
 *  [from, to]? ISO yyyy-mm-dd strings compare lexicographically, so no Date
 *  parsing needed. An open side (null) is unbounded. Jobs with no scheduled
 *  date never match an active range (they have no date to place on the axis). */
export function jobInDateRange(
  scheduledDate: string | null | undefined,
  endDate: string | null | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (!scheduledDate) return false;
  const start = scheduledDate;
  const end = endDate || scheduledDate;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

/** Parse a stored blob into a partial filter set, tolerating bad/old data.
 *  Migrates the legacy single `tab` string into the `tabs` array. */
export function parseJobsFilters(raw: string | null | undefined): Partial<JobsFilters> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    const out: Partial<JobsFilters> = {};
    if (Array.isArray(o.tabs)) {
      out.tabs = o.tabs.filter((t: unknown): t is string => typeof t === 'string' && t !== 'all');
    } else if (typeof o.tab === 'string' && o.tab !== 'all') {
      out.tabs = [o.tab]; // legacy single-tab value
    }
    if (typeof o.search === 'string') out.search = o.search;
    if (o.sortBy) out.sortBy = o.sortBy;
    if (o.groupBy) out.groupBy = o.groupBy;
    if (typeof o.dateFrom === 'string') out.dateFrom = o.dateFrom;
    if (typeof o.dateTo === 'string') out.dateTo = o.dateTo;
    return out;
  } catch {
    return null;
  }
}

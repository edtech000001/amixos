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
}

export const JOBS_FILTERS_KEY = 'amixos.jobsFilters.v1';

export const DEFAULT_JOBS_FILTERS: JobsFilters = {
  tabs: [],
  search: '',
  sortBy: 'recent',
  groupBy: 'none',
};

/** True when the list is showing anything other than the default view. */
export function jobsFiltersActive(f: JobsFilters): boolean {
  return (
    f.tabs.length > 0 ||
    f.search.trim() !== '' ||
    f.sortBy !== 'recent' ||
    f.groupBy !== 'none'
  );
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
    return out;
  } catch {
    return null;
  }
}

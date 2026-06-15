// Persisted jobs-list view state (status tab, search, sort, group). Saved per
// device so the list survives navigating into a job + back AND a full app
// refresh — it only resets when the user clears it. Each platform supplies its
// own storage (web: localStorage; mobile: AsyncStorage) and reads/writes this
// shape; this module owns the key, defaults, and "is anything active?" check.

import type { JobSortKey, JobGroupKey } from './jobSort';

export interface JobsFilters {
  tab: string;
  search: string;
  sortBy: JobSortKey;
  groupBy: JobGroupKey;
}

export const JOBS_FILTERS_KEY = 'amixos.jobsFilters.v1';

export const DEFAULT_JOBS_FILTERS: JobsFilters = {
  tab: 'all',
  search: '',
  sortBy: 'recent',
  groupBy: 'none',
};

/** True when the list is showing anything other than the default view. */
export function jobsFiltersActive(f: JobsFilters): boolean {
  return (
    f.tab !== 'all' ||
    f.search.trim() !== '' ||
    f.sortBy !== 'recent' ||
    f.groupBy !== 'none'
  );
}

/** Parse a stored blob into a partial filter set, tolerating bad/old data. */
export function parseJobsFilters(raw: string | null | undefined): Partial<JobsFilters> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o as Partial<JobsFilters>;
  } catch {
    return null;
  }
}

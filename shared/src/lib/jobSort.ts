// Sort + group logic for the jobs list — shared by the native and web
// variants of JobsListScreen so both platforms order identically.
//
// "recent" keeps the incoming order (pages fetch created_at desc), so it
// doubles as the default. Sorting is stable, so a group's internal order
// still follows the selected sort.

// 'client' and 'lead' remain valid sort VALUES (old saved preferences, server
// RPC arms) but are no longer offered in the menu — grouping by them gives the
// same order plus section headers, so the sort menu stays purely about order.
export type JobSortKey =
  | 'recent' | 'status' | 'startDate' | 'priority' | 'updated' | 'title' | 'endDate'
  | 'client' | 'lead';
export type JobGroupKey = 'none' | 'client' | 'lead' | 'company' | 'state';

export const JOB_SORT_KEYS: JobSortKey[] =
  ['recent', 'status', 'startDate', 'endDate', 'priority', 'updated', 'title'];
export const JOB_GROUP_KEYS: JobGroupKey[] = ['none', 'client', 'lead', 'company', 'state'];

export interface SortableJob {
  status: string;
  scheduledDate: string | null;
  leadName?: string | null;
  clientName?: string | null;
  clientCompany: string | null;
  jobState: string | null;
  priority?: string | null;
  updatedAt?: string | null;
  title?: string | null;
  endDate?: string | null;
}

// Pipeline order — matches the tab order on the list screens.
const STATUS_SORT_ORDER = [
  'proposal',
  'sent',
  'accepted',
  'posible',
  'scheduled',
  'in_progress',
  'paused',
  'completed',
  'invoiced',
  'declined',
  'cancelled',
];

function statusIdx(status: string): number {
  const i = STATUS_SORT_ORDER.indexOf(status);
  return i === -1 ? STATUS_SORT_ORDER.length : i;
}

// Hottest first. Missing counts as 'normal'; unknown values sink last —
// mirrors jobs_page_ids' array_position (null → NULLS LAST) server-side.
const PRIORITY_SORT_ORDER = ['urgent', 'high', 'normal', 'low'];

function priorityIdx(priority: string | null | undefined): number {
  const i = PRIORITY_SORT_ORDER.indexOf(priority ?? 'normal');
  return i === -1 ? PRIORITY_SORT_ORDER.length : i;
}

/** Sorts that read newest/latest FIRST unless the user flips them. Dates and
 *  activity: a 5,000-job list sorted oldest-first opened on work from years
 *  ago. Status, priority and title keep their natural ascending order. */
const DEFAULT_DESC = new Set<JobSortKey>(['recent', 'updated', 'startDate', 'endDate']);

/** The effective direction: the user's explicit choice, else the sort's
 *  default. `sortDesc` null/undefined = "default for this sort". Mirrors
 *  jobs_page_ids (migration 249) so local and server sorting agree. */
export function sortIsDesc(sortBy: JobSortKey, sortDesc?: boolean | null): boolean {
  return sortDesc ?? DEFAULT_DESC.has(sortBy);
}

/** The value a job sorts by, or null (null always sinks to the bottom, in
 *  either direction). End date of a single-day job = its start date. */
function sortValue(j: SortableJob, sortBy: JobSortKey): string | number | null {
  switch (sortBy) {
    case 'status': return statusIdx(j.status);
    case 'priority': return priorityIdx(j.priority);
    case 'startDate': return j.scheduledDate || null;
    case 'endDate': return j.endDate || j.scheduledDate || null;
    case 'updated': return j.updatedAt || null;
    case 'title': return j.title?.trim().toLowerCase() || null;
    case 'client': return j.clientName || null;
    case 'lead': return j.leadName || null;
    default: return null;
  }
}

/** Which direction caption a sort shows (keys of t.sort.dir). */
export function sortDirCaption(sortBy: JobSortKey, desc: boolean):
  'newest' | 'oldest' | 'az' | 'za' | 'pipeline' | 'pipelineReverse' | 'urgentFirst' | 'lowFirst' {
  if (sortBy === 'title' || sortBy === 'client' || sortBy === 'lead') return desc ? 'za' : 'az';
  if (sortBy === 'status') return desc ? 'pipelineReverse' : 'pipeline';
  if (sortBy === 'priority') return desc ? 'lowFirst' : 'urgentFirst';
  return desc ? 'newest' : 'oldest';
}

export function sortJobs<T extends SortableJob>(jobs: T[], sortBy: JobSortKey, sortDesc?: boolean | null): T[] {
  const desc = sortIsDesc(sortBy, sortDesc);
  // 'recent' = the incoming order (pages arrive created_at desc).
  if (sortBy === 'recent') return desc ? jobs : [...jobs].reverse();
  const out = [...jobs];
  out.sort((a, b) => {
    const av = sortValue(a, sortBy);
    const bv = sortValue(b, sortBy);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });
  return out;
}

export interface JobGroupSection<T> {
  /** null for the single ungrouped section. */
  title: string | null;
  jobs: T[];
}

export function groupJobs<T extends SortableJob>(
  jobs: T[],
  groupBy: JobGroupKey,
  // Localized labels for jobs missing the group field ("Sin líder", …).
  emptyLabels: { client: string; lead: string; company: string; state: string },
  // Display transform for state section titles ("CO" → "Colorado"). Rows
  // store abbreviations, but headers should spell the state out.
  formatState?: (value: string) => string,
): JobGroupSection<T>[] {
  if (groupBy === 'none') return [{ title: null, jobs }];

  const keyOf = (j: T): { label: string; empty: boolean } => {
    const raw =
      groupBy === 'client' ? j.clientName :
      groupBy === 'lead' ? j.leadName :
      groupBy === 'company' ? j.clientCompany :
      j.jobState;
    const value = raw?.trim();
    if (!value) return { label: emptyLabels[groupBy], empty: true };
    if (groupBy === 'state' && formatState) {
      return { label: formatState(value), empty: false };
    }
    return { label: value, empty: false };
  };

  const sections = new Map<string, { title: string; empty: boolean; jobs: T[] }>();
  for (const j of jobs) {
    const { label, empty } = keyOf(j);
    const existing = sections.get(label);
    if (existing) existing.jobs.push(j);
    else sections.set(label, { title: label, empty, jobs: [j] });
  }

  // Alphabetical, with the "missing value" bucket pinned last.
  return Array.from(sections.values())
    .sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      return a.title.localeCompare(b.title);
    })
    .map(({ title, jobs: sectionJobs }) => ({ title, jobs: sectionJobs }));
}

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

export function sortJobs<T extends SortableJob>(jobs: T[], sortBy: JobSortKey): T[] {
  if (sortBy === 'recent') return jobs;
  const out = [...jobs];
  if (sortBy === 'status') {
    out.sort((a, b) => statusIdx(a.status) - statusIdx(b.status));
  } else if (sortBy === 'startDate') {
    // Soonest first; jobs without a date sink to the bottom.
    out.sort((a, b) => {
      if (!a.scheduledDate && !b.scheduledDate) return 0;
      if (!a.scheduledDate) return 1;
      if (!b.scheduledDate) return -1;
      return a.scheduledDate.localeCompare(b.scheduledDate);
    });
  } else if (sortBy === 'lead') {
    out.sort((a, b) => {
      const al = a.leadName ?? null;
      const bl = b.leadName ?? null;
      if (!al && !bl) return 0;
      if (!al) return 1;
      if (!bl) return -1;
      return al.localeCompare(bl);
    });
  } else if (sortBy === 'client') {
    out.sort((a, b) => {
      const ac = a.clientName ?? null;
      const bc = b.clientName ?? null;
      if (!ac && !bc) return 0;
      if (!ac) return 1;
      if (!bc) return -1;
      return ac.localeCompare(bc);
    });
  } else if (sortBy === 'priority') {
    out.sort((a, b) => priorityIdx(a.priority) - priorityIdx(b.priority));
  } else if (sortBy === 'updated') {
    // Latest activity first; rows without the column (stale cache) sink.
    out.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return 0;
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  } else if (sortBy === 'title') {
    out.sort((a, b) => {
      const at = a.title?.trim().toLowerCase() || null;
      const bt = b.title?.trim().toLowerCase() || null;
      if (!at && !bt) return 0;
      if (!at) return 1;
      if (!bt) return -1;
      return at.localeCompare(bt);
    });
  } else if (sortBy === 'endDate') {
    // Soonest deadline first; jobs without an end date sink to the bottom.
    out.sort((a, b) => {
      if (!a.endDate && !b.endDate) return 0;
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate.localeCompare(b.endDate);
    });
  }
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

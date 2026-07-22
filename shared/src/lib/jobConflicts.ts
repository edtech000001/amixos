// Detects scheduling conflicts when a job is assigned to people who already
// have overlapping work. Used by the job form (web + mobile) to warn — never
// block — the user before saving a double-booked crew member or lead.
//
// Severity model (decided with the user):
//   • all-day job on a shared day        → HARD conflict (blocks the whole day)
//   • both timed + time windows overlap  → HARD conflict
//   • both timed + windows DON'T overlap → no conflict (person can do both)
//   • either side is a "no-time" job     → SOFT note ("also has a job that day")
// Jobs that don't share a calendar day never conflict.

import { formatTime12h } from './format';
import { fetchAll } from './supabaseFetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/** The scheduling shape shared by the new job and every existing job. */
export interface SchedulableJob {
  /** yyyy-mm-dd (local). Null = unscheduled → never conflicts. */
  scheduledDate: string | null;
  /** yyyy-mm-dd finish for multi-day jobs; null = single day. */
  endDate: string | null;
  allDay: boolean;
  /** "HH:MM" 24h, or null. */
  timeStart: string | null;
  timeEnd: string | null;
}

/** An existing job pulled from the DB, with everyone assigned to it. */
export interface ExistingAssignedJob extends SchedulableJob {
  id: string;
  title: string | null;
  /** Employee ids on this job — crew (job_assignments) + drivers. */
  assigneeIds: string[];
}

export interface AssignedPerson {
  id: string;
  name: string;
}

export type ConflictSeverity = 'hard' | 'soft';

export interface JobConflict {
  employeeId: string;
  employeeName: string;
  jobId: string;
  jobTitle: string;
  /** yyyy-mm-dd of the conflicting job's start. */
  jobDate: string;
  severity: ConflictSeverity;
  /** True when the conflicting job is all-day (UI shows a localized "all day"). */
  allDay: boolean;
  /** Time label for timed jobs: "2:00 PM" or "9:00 AM – 5:00 PM". '' otherwise. */
  timeLabel: string;
}

type JobKind = 'allday' | 'notime' | 'timed';

function kindOf(j: SchedulableJob): JobKind {
  if (j.allDay) return 'allday';
  if (!j.timeStart) return 'notime';
  return 'timed';
}

/** [start, end] day span as yyyy-mm-dd strings; null when unscheduled. Strings
 *  compare lexicographically, which is correct for ISO dates. */
function daySpan(j: SchedulableJob): [string, string] | null {
  if (!j.scheduledDate) return null;
  return [j.scheduledDate, j.endDate || j.scheduledDate];
}

function spansShareADay(a: [string, string], b: [string, string]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minute window within a day. A timed job with no end runs to end of day. */
function timeWindow(j: SchedulableJob): [number, number] {
  const s = j.timeStart ? minutesOf(j.timeStart) : 0;
  const e = j.timeEnd ? minutesOf(j.timeEnd) : 24 * 60;
  return [s, Math.max(e, s)];
}

/** Conflict severity between two jobs already known to share a calendar day. */
function severityBetween(a: SchedulableJob, b: SchedulableJob): ConflictSeverity | null {
  const ka = kindOf(a);
  const kb = kindOf(b);
  if (ka === 'allday' || kb === 'allday') return 'hard';
  if (ka === 'notime' || kb === 'notime') return 'soft';
  // Both timed — only a real conflict if the windows actually overlap.
  const [as, ae] = timeWindow(a);
  const [bs, be] = timeWindow(b);
  return as < be && bs < ae ? 'hard' : null;
}

/** A short label describing WHEN the existing job runs, for the warning text. */
export function jobTimeLabel(j: SchedulableJob): string {
  if (j.allDay) return '';
  if (!j.timeStart) return '';
  const start = formatTime12h(j.timeStart);
  const end = j.timeEnd ? formatTime12h(j.timeEnd) : '';
  return end ? `${start} – ${end}` : start;
}

/**
 * Find every conflict between the job being edited and the existing jobs its
 * assigned people are already on. Returns one entry per (person × conflicting
 * job). `newJobId` is excluded so editing a job never conflicts with itself.
 */
export function detectJobConflicts(opts: {
  newJob: SchedulableJob;
  newJobId?: string | null;
  assigned: AssignedPerson[];
  existingJobs: ExistingAssignedJob[];
}): JobConflict[] {
  const span = daySpan(opts.newJob);
  if (!span || opts.assigned.length === 0) return [];
  const out: JobConflict[] = [];
  for (const ej of opts.existingJobs) {
    if (opts.newJobId && ej.id === opts.newJobId) continue;
    const es = daySpan(ej);
    if (!es || !spansShareADay(span, es)) continue;
    const sev = severityBetween(opts.newJob, ej);
    if (!sev) continue;
    for (const p of opts.assigned) {
      if (!ej.assigneeIds.includes(p.id)) continue;
      out.push({
        employeeId: p.id,
        employeeName: p.name,
        jobId: ej.id,
        jobTitle: ej.title?.trim() || '',
        jobDate: ej.scheduledDate as string,
        severity: sev,
        allDay: ej.allDay,
        timeLabel: jobTimeLabel(ej),
      });
    }
  }
  // Hard conflicts first, then by person name for a stable, readable list.
  return out.sort((a, b) =>
    a.severity === b.severity ? a.employeeName.localeCompare(b.employeeName) : a.severity === 'hard' ? -1 : 1);
}

export function hasHardConflict(conflicts: JobConflict[]): boolean {
  return conflicts.some(c => c.severity === 'hard');
}

/**
 * Fetch every non-cancelled job (with its crew + drivers) that overlaps the
 * date span [startStr, endStr], so the form can check the new job's assignees
 * against them. Mirrors the calendar/crew-finder overlap query.
 */
export async function fetchJobsForConflictCheck(
  supabase: SupabaseLike,
  businessId: string,
  startStr: string,
  endStr: string,
): Promise<ExistingAssignedJob[]> {
  const jobs = await fetchAll<{
    id: string; title: string | null; scheduled_date: string | null; end_date: string | null;
    all_day: boolean | null; time_start: string | null; time_end: string | null;
    driver_employee_ids: string[] | null;
  }>((from, to) =>
    supabase
      .from('jobs')
      .select('id, title, scheduled_date, end_date, all_day, time_start, time_end, driver_employee_ids')
      .eq('business_id', businessId)
      .not('status', 'in', '("cancelled","declined")')
      .lte('scheduled_date', endStr)
      .or(`end_date.gte.${startStr},and(end_date.is.null,scheduled_date.gte.${startStr})`)
      .range(from, to),
  );
  const jobIds = jobs.map(j => j.id);
  const assignments = jobIds.length
    ? await fetchAll<{ job_id: string; employee_id: string | null }>((from, to) =>
        supabase.from('job_assignments').select('job_id, employee_id').in('job_id', jobIds).range(from, to))
    : [];
  const crewByJob = new Map<string, string[]>();
  for (const a of assignments) {
    if (!a.employee_id) continue;
    if (!crewByJob.has(a.job_id)) crewByJob.set(a.job_id, []);
    crewByJob.get(a.job_id)!.push(a.employee_id);
  }
  return jobs.map(j => ({
    id: j.id,
    title: j.title,
    scheduledDate: j.scheduled_date,
    endDate: j.end_date,
    allDay: j.all_day === true,
    timeStart: j.time_start,
    timeEnd: j.time_end,
    assigneeIds: [...(crewByJob.get(j.id) ?? []), ...((j.driver_employee_ids ?? []) as string[])],
  }));
}

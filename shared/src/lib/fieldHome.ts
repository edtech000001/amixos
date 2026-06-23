// Data layer for the field-worker home (the purpose-built dashboard a "field"
// role sees instead of the owner's widget grid). Shared by web and mobile so
// both platforms fetch + clock in/out identically; each renders its own UI.
//
// A field worker can:
//   - see the jobs they're assigned to (RLS scopes `jobs` to assigned-only for
//     the field role — migration 022), focused on today / upcoming
//   - clock in / out (timesheets: migration 001 "Workers can manage own
//     timesheet" + 022 field-write policies let a member write their own row;
//     no extra migration needed)
//   - advance the status of a job they're on (changeJobStatusIfAssigned)
//
// The supabase client is passed in untyped — web and mobile use different
// @supabase versions and we don't want this module coupled to either.

import { fetchAll } from './supabaseFetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface FieldHomeJob {
  id: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  timeStart: string | null;
  clientName: string | null;
  jobAddress: string | null;
  jobCity: string | null;
  jobState: string | null;
  isLead: boolean;
}

export interface OpenTimesheet {
  id: string;
  clockIn: string;
}

export interface FieldHomeStats {
  /** Active assigned jobs (scheduled / in_progress / accepted). */
  assignedActive: number;
  /** Jobs the worker completed this calendar month. */
  completedMonth: number;
  /** Logged hours so far this week (completed timesheet sessions). */
  hoursWeek: number;
  /** Logged hours so far this calendar month. */
  hoursMonth: number;
}

export interface FieldHomeData {
  jobs: FieldHomeJob[];
  openTimesheet: OpenTimesheet | null;
  stats: FieldHomeStats;
  /** The caller's employees row id in this business, if one exists. */
  employeeId: string | null;
}

/** Format decimal hours as "Xh Ym" (omits the minutes when zero). */
export function formatHours(h: number): string {
  const total = Math.max(0, Math.round(h * 60)); // minutes
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0 && mins === 0) return '0h';
  if (mins === 0) return `${hours}h`;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

interface RawAssignment {
  is_lead: boolean | null;
  employees: { user_id: string | null } | null;
}
interface RawFieldJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  time_start: string | null;
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  clients: { first_name: string; last_name: string } | null;
  job_assignments: RawAssignment[];
}

// Active statuses a field worker actually acts on. proposal/sent/etc. are
// office-side; once a job is scheduled it's the crew's to run.
const FIELD_JOB_STATUSES = ['scheduled', 'in_progress', 'accepted'];

export async function fetchFieldHome(
  supabase: SupabaseLike,
  businessId: string,
  userId: string,
): Promise<FieldHomeData> {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Week starts Sunday (US). Midnight local so today's hours count.
  const startWeek = new Date(now);
  startWeek.setHours(0, 0, 0, 0);
  startWeek.setDate(startWeek.getDate() - startWeek.getDay());
  const startMonthDate = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}-01`;

  const [jobsRes, employeeRes, timesheetRes, completedRes, monthSheetsRes] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        'id, title, status, scheduled_date, time_start, job_address, job_city, job_state, clients(first_name, last_name), job_assignments(is_lead, employees(user_id))',
      )
      .eq('business_id', businessId)
      .in('status', FIELD_JOB_STATUSES)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('employees')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('timesheets')
      .select('id, clock_in')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Completed-this-month count (RLS scopes to the worker's assigned jobs).
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('completed_date', startMonthDate),
    // This month's own timesheets — bounded to a month, summed for hours.
    supabase
      .from('timesheets')
      .select('clock_in, clock_out, hours_total')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .gte('clock_in', startMonth.toISOString()),
  ]);

  const rows = (jobsRes.data ?? []) as RawFieldJob[];
  // The `jobs` RLS already returns ONLY the field worker's assigned jobs (via
  // is_assigned_to_job, migration 022), so we don't filter here — that also
  // keeps jobs visible even if the self-read employees policy (migration 069)
  // isn't applied yet. `isLead` is best-effort: it needs to read the caller's
  // own employees row (069), and degrades to false without it.
  const jobs: FieldHomeJob[] = rows.map((j) => {
    const mine = j.job_assignments.filter((a) => a.employees?.user_id === userId);
    return {
      id: j.id,
      title: j.title,
      status: j.status,
      scheduledDate: j.scheduled_date,
      timeStart: j.time_start,
      clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
      jobAddress: j.job_address,
      jobCity: j.job_city,
      jobState: j.job_state,
      isLead: mine.some((a) => a.is_lead === true),
    };
  });

  // Sum completed sessions (clock_out set). hours_total is the source of
  // truth; fall back to clock_out − clock_in for rows saved without it.
  const sheets = (monthSheetsRes.data ?? []) as Array<{
    clock_in: string;
    clock_out: string | null;
    hours_total: number | null;
  }>;
  const startWeekMs = startWeek.getTime();
  let hoursWeek = 0;
  let hoursMonth = 0;
  for (const r of sheets) {
    if (!r.clock_out) continue;
    const h = r.hours_total != null
      ? Number(r.hours_total)
      : Math.max(0, (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000);
    hoursMonth += h;
    if (new Date(r.clock_in).getTime() >= startWeekMs) hoursWeek += h;
  }

  return {
    jobs,
    employeeId: (employeeRes.data as { id: string } | null)?.id ?? null,
    openTimesheet: timesheetRes.data
      ? { id: timesheetRes.data.id, clockIn: timesheetRes.data.clock_in }
      : null,
    stats: {
      assignedActive: jobs.length,
      completedMonth: completedRes.count ?? 0,
      hoursWeek,
      hoursMonth,
    },
  };
}

/** Start a shift. Returns the new open timesheet, or null on RLS/error. */
export async function clockIn(
  supabase: SupabaseLike,
  businessId: string,
  userId: string,
  employeeId: string | null,
): Promise<OpenTimesheet | null> {
  const { data, error } = await supabase
    .from('timesheets')
    .insert({
      business_id: businessId,
      user_id: userId,
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
    })
    .select('id, clock_in')
    .single();
  if (error || !data) return null;
  return { id: data.id, clockIn: data.clock_in };
}

/** End a shift, stamping clock_out + computed hours_total. */
export async function clockOut(
  supabase: SupabaseLike,
  timesheet: OpenTimesheet,
): Promise<boolean> {
  const out = new Date();
  const hours = Math.max(0, (out.getTime() - new Date(timesheet.clockIn).getTime()) / 3_600_000);
  const { error } = await supabase
    .from('timesheets')
    .update({ clock_out: out.toISOString(), hours_total: Math.round(hours * 100) / 100 })
    .eq('id', timesheet.id);
  return !error;
}

export interface FieldClient {
  id: string;
  name: string;
}

/** Client list for the quick-log picker (needs migration 070's field read). */
export async function fetchFieldClients(
  supabase: SupabaseLike,
  businessId: string,
): Promise<FieldClient[]> {
  const rows = await fetchAll<{ id: string; first_name: string | null; last_name: string | null; company: string | null }>(
    (from, to) =>
      supabase
        .from('clients')
        .select('id, first_name, last_name, company')
        .eq('business_id', businessId)
        .order('first_name', { ascending: true })
        .range(from, to),
  );
  return rows.map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company || '—',
  }));
}

export interface FieldJobLocation {
  lat: number;
  lng: number;
  /** Reverse-geocoded address parts (best-effort; may be null). */
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface LogFieldJobInput {
  businessId: string;
  /** The logger's employees row id (migration 069). Null = can't self-assign. */
  employeeId: string | null;
  title: string;
  clientId: string | null;
  /** YYYY-MM-DD. */
  completedDate: string;
  description?: string | null;
  /** Field tech's current location, captured at log time. */
  location?: FieldJobLocation | null;
}

/**
 * Log a completed job as a field worker. Inserts the job (status=completed,
 * enforced by migration 070's INSERT policy) and self-assigns the logger as
 * lead so it surfaces in their field home + completed-this-month stat (both
 * scoped by is_assigned_to_job). Returns false if the job insert fails.
 */
export async function logFieldJob(
  supabase: SupabaseLike,
  input: LogFieldJobInput,
): Promise<boolean> {
  const loc = input.location;
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      business_id: input.businessId,
      title: input.title,
      status: 'completed',
      completed_date: input.completedDate,
      client_id: input.clientId,
      description: input.description ?? null,
      // Geostamp where the tech logged the job (jobs.job_lat/lng, migration 023).
      job_lat: loc?.lat ?? null,
      job_lng: loc?.lng ?? null,
      job_address: loc?.address ?? null,
      job_city: loc?.city ?? null,
      job_state: loc?.state ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return false;
  if (input.employeeId) {
    // Best-effort — the job is logged even if the self-assignment fails.
    await supabase
      .from('job_assignments')
      .insert({ job_id: data.id, employee_id: input.employeeId, is_lead: true });
  }
  return true;
}

/** Advance a job's status, stamping the matching timestamp column. */
export async function updateFieldJobStatus(
  supabase: SupabaseLike,
  jobId: string,
  status: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };
  if (status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('jobs').update(update).eq('id', jobId);
  return !error;
}

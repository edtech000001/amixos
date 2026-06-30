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
import {
  getPayrollPeriod,
  normalizeFrequency,
  employeeHoursInRange,
  type PayrollFrequency,
  type PayrollTimesheet,
  type PayrollJob,
} from './payroll';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// How many pay periods back (including the current one) "active hours" looks
// for unpaid work. Bounds the lookback so an ancient never-marked-paid period
// can't balloon the figure; covers the realistic span of owed hours.
const ACTIVE_HOURS_LOOKBACK_PERIODS = 6;

export interface FieldHomeJob {
  id: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  /** Set on completed jobs — drives the date badge in "recent completed". */
  completedDate?: string | null;
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
  /**
   * Unpaid hours owed: the worker's payroll-style hours (timesheets + crewed
   * job hours + driver hours) summed across recent pay periods that haven't
   * been marked paid in Nómina. Drops off as the owner records payouts.
   */
  hoursActive: number;
  /** Payroll-style hours in the current calendar week (Sun–Sat). */
  hoursWeek: number;
  /** Payroll-style hours in the current calendar month. */
  hoursMonth: number;
}

export interface FieldHomeData {
  jobs: FieldHomeJob[];
  /** Jobs the worker completed in the last 7 days (most recent first). */
  recentCompleted: FieldHomeJob[];
  openTimesheet: OpenTimesheet | null;
  stats: FieldHomeStats;
  /** The caller's employees row id in this business, if one exists. */
  employeeId: string | null;
}

/** Per-business payroll settings the field home needs to bound "active hours". */
export interface FieldHomePayrollOpts {
  frequency: PayrollFrequency;
  anchor: Date | null;
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
  completed_date?: string | null;
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

/** Local YYYY-MM-DD (matches scheduled_date / completed_date / work_date). */
function ymdLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function fetchFieldHome(
  supabase: SupabaseLike,
  businessId: string,
  userId: string,
  payroll?: FieldHomePayrollOpts,
): Promise<FieldHomeData> {
  const now = new Date();
  const freq = normalizeFrequency(payroll?.frequency);
  const anchor = payroll?.anchor ?? null;

  // Calendar week (Sun–Sat) + month windows for the toggle views.
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartStr = ymdLocal(weekStart);
  const weekEndStr = ymdLocal(weekEnd);
  const monthStartStr = ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEndStr = ymdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  // Oldest pay period in the active-hours lookback; the fetch window must also
  // reach back far enough to cover the week/month toggle views.
  const oldestPeriod = getPayrollPeriod(freq, now, -(ACTIVE_HOURS_LOOKBACK_PERIODS - 1), anchor);
  const windowStartStr = [oldestPeriod.startStr, weekStartStr, monthStartStr].sort()[0];

  // Last 7 days for "recent projects completed".
  const recentSince = new Date(now); recentSince.setHours(0, 0, 0, 0);
  recentSince.setDate(recentSince.getDate() - 6);
  const recentSinceStr = ymdLocal(recentSince);

  const [jobsRes, employeeRes, timesheetRes, completedRes, recentRes] = await Promise.all([
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
      .gte('completed_date', monthStartStr),
    // Recent completed (last 7 days), most recent first.
    supabase
      .from('jobs')
      .select(
        'id, title, status, scheduled_date, completed_date, time_start, job_address, job_city, job_state, clients(first_name, last_name), job_assignments(is_lead, employees(user_id))',
      )
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('completed_date', recentSinceStr)
      .order('completed_date', { ascending: false }),
  ]);

  const employeeId = (employeeRes.data as { id: string } | null)?.id ?? null;

  // The `jobs` RLS already returns ONLY the field worker's assigned jobs (via
  // is_assigned_to_job, migration 022), so we don't filter here. `isLead` is
  // best-effort: it needs the caller's own employees row (069), degrading to
  // false without it.
  const mapJob = (j: RawFieldJob): FieldHomeJob => {
    const mine = (j.job_assignments ?? []).filter((a) => a.employees?.user_id === userId);
    return {
      id: j.id,
      title: j.title,
      status: j.status,
      scheduledDate: j.scheduled_date,
      completedDate: j.completed_date ?? null,
      timeStart: j.time_start,
      clientName: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
      jobAddress: j.job_address,
      jobCity: j.job_city,
      jobState: j.job_state,
      isLead: mine.some((a) => a.is_lead === true),
    };
  };

  const jobs = ((jobsRes.data ?? []) as RawFieldJob[]).map(mapJob);
  const recentCompleted = ((recentRes.data ?? []) as RawFieldJob[]).map(mapJob);

  // ── Payroll-style hours (active / week / month) ──
  // Only a worker with a linked employees row accrues payroll hours; without
  // one we can't match timesheets/assignments, so the figures read 0.
  let hoursActive = 0;
  let hoursWeek = 0;
  let hoursMonth = 0;
  if (employeeId) {
    const [tsRes, jobsWindowRes, paymentsRes] = await Promise.all([
      // Own timesheets in the window (RLS scopes to the caller's rows).
      supabase
        .from('timesheets')
        .select('employee_id, hours_worked, work_date')
        .eq('business_id', businessId)
        .gte('work_date', windowStartStr),
      // Crewed jobs in the window (RLS scopes to assigned). Same hours sources
      // the Payroll page uses so the figure reconciles with Nómina.
      supabase
        .from('jobs')
        .select('scheduled_date, total_hours, driver_employee_ids, driver_hours, job_assignments(employee_id)')
        .eq('business_id', businessId)
        .gte('scheduled_date', windowStartStr),
      // Which recent periods this worker has already been paid for.
      supabase
        .from('payroll_payments')
        .select('period_start')
        .eq('business_id', businessId)
        .eq('employee_id', employeeId),
    ]);

    const timesheets = (tsRes.data ?? []) as PayrollTimesheet[];
    const windowJobs: PayrollJob[] = (
      (jobsWindowRes.data ?? []) as Array<{
        scheduled_date: string | null;
        total_hours: number | null;
        driver_employee_ids: string[] | null;
        driver_hours: number | null;
        job_assignments: { employee_id: string | null }[];
      }>
    ).map((j) => ({
      scheduled_date: j.scheduled_date,
      total_hours: j.total_hours,
      driver_employee_ids: j.driver_employee_ids,
      driver_hours: j.driver_hours,
      assignmentEmployeeIds: (j.job_assignments ?? [])
        .map((a) => a.employee_id)
        .filter((x): x is string => !!x),
    }));
    const paid = new Set(
      ((paymentsRes.data ?? []) as Array<{ period_start: string }>).map((p) => p.period_start),
    );

    for (let off = -(ACTIVE_HOURS_LOOKBACK_PERIODS - 1); off <= 0; off++) {
      const p = getPayrollPeriod(freq, now, off, anchor);
      if (paid.has(p.startStr)) continue; // already paid out → no longer active
      hoursActive += employeeHoursInRange({ employeeId, timesheets, jobs: windowJobs, startStr: p.startStr, endStr: p.endStr });
    }
    hoursActive = Math.round(hoursActive * 100) / 100;
    hoursWeek = employeeHoursInRange({ employeeId, timesheets, jobs: windowJobs, startStr: weekStartStr, endStr: weekEndStr });
    hoursMonth = employeeHoursInRange({ employeeId, timesheets, jobs: windowJobs, startStr: monthStartStr, endStr: monthEndStr });
  }

  return {
    jobs,
    recentCompleted,
    employeeId,
    openTimesheet: timesheetRes.data
      ? { id: timesheetRes.data.id, clockIn: timesheetRes.data.clock_in }
      : null,
    stats: {
      assignedActive: jobs.length,
      completedMonth: completedRes.count ?? 0,
      hoursActive,
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

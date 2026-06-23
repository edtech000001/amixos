// Payroll period math + per-worker hours/pay computation.
//
// Pay frequency is a per-business setting (weekly | biweekly | monthly). The
// Payroll page derives each period from it and lets the owner step through
// periods. A worker's hours for a period = logged timesheets + the total_hours
// of jobs they're crewed on + any driver_hours; hours × pay_rate = gross pay.

export type PayrollFrequency = 'weekly' | 'biweekly' | 'monthly';

export const PAYROLL_FREQUENCIES: PayrollFrequency[] = ['weekly', 'biweekly', 'monthly'];

export function normalizeFrequency(raw: unknown): PayrollFrequency {
  return raw === 'weekly' || raw === 'biweekly' ? raw : 'monthly';
}

export interface PayrollPeriod {
  /** Inclusive bounds, local midnight. */
  start: Date;
  end: Date;
  /** yyyy-mm-dd of `start`/`end` — stable keys + query bounds. */
  startStr: string;
  endStr: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Fixed Sunday reference so biweekly periods are stable across the app/devices.
// (Jan 7 2024 is a Sunday.)
const BIWEEKLY_ANCHOR = new Date(2024, 0, 7);

/**
 * The pay period of the given frequency containing `ref`, shifted by `offset`
 * periods (negative = earlier). Weeks run Sunday→Saturday; monthly is the
 * calendar month; biweekly is anchored to a fixed Sunday so the 14-day windows
 * line up everywhere.
 */
export function getPayrollPeriod(
  frequency: PayrollFrequency,
  ref: Date,
  offset = 0,
): PayrollPeriod {
  if (frequency === 'monthly') {
    const start = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day
    return { start, end, startStr: ymd(start), endStr: ymd(end) };
  }
  if (frequency === 'weekly') {
    const base = startOfDay(ref);
    const sunday = addDays(base, -base.getDay());
    const start = addDays(sunday, offset * 7);
    const end = addDays(start, 6);
    return { start, end, startStr: ymd(start), endStr: ymd(end) };
  }
  // biweekly
  const base = startOfDay(ref);
  const diffDays = Math.floor((base.getTime() - BIWEEKLY_ANCHOR.getTime()) / 86_400_000);
  const periodIndex = Math.floor(diffDays / 14) + offset;
  const start = addDays(BIWEEKLY_ANCHOR, periodIndex * 14);
  const end = addDays(start, 13);
  return { start, end, startStr: ymd(start), endStr: ymd(end) };
}

// ── Per-worker hours/pay ─────────────────────────────────────────────────────

export interface PayrollEmployee {
  id: string;
  first_name: string;
  last_name: string;
  pay_rate: number;
  pay_type: string;
}
export interface PayrollTimesheet {
  employee_id: string | null;
  hours_worked: number | null;
  work_date: string | null;
}
export interface PayrollJob {
  /** Work date the hours fall on (drives which period the job counts in). */
  scheduled_date: string | null;
  total_hours: number | null;
  driver_employee_ids: string[] | null;
  driver_hours: number | null;
  /** Employee ids of the crew assigned to the job (lead included). */
  assignmentEmployeeIds: string[];
}

export interface PayrollRow {
  employeeId: string;
  name: string;
  payRate: number;
  payType: string;
  hours: number;
  pay: number;
}

/** Gross pay for a worker's hours, matching the reports estimate: hourly →
 *  hours×rate, daily → ceil(hours/8)×rate, salary → the flat rate. */
export function payForHours(hours: number, payRate: number, payType: string): number {
  if (payType === 'hourly') return hours * payRate;
  if (payType === 'daily') return Math.ceil(hours / 8) * payRate;
  return payRate; // salary — fixed per period
}

function inRange(dateStr: string | null, startStr: string, endStr: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= startStr && d <= endStr;
}

/**
 * One row per employee with their hours + gross pay for the period. Hours =
 * timesheets (employee-linked) + total_hours of each job they're crewed on +
 * driver_hours of each job they drove. Employees with zero hours are included
 * (so the owner can still see/skip them) unless `includeZero` is false.
 */
export function computePayrollRows(opts: {
  employees: PayrollEmployee[];
  timesheets: PayrollTimesheet[];
  jobs: PayrollJob[];
  period: Pick<PayrollPeriod, 'startStr' | 'endStr'>;
  includeZero?: boolean;
}): PayrollRow[] {
  const { employees, timesheets, jobs, period, includeZero = true } = opts;
  const hoursById: Record<string, number> = {};
  const add = (id: string | null | undefined, h: number) => {
    if (!id || !h) return;
    hoursById[id] = (hoursById[id] ?? 0) + h;
  };

  for (const ts of timesheets) {
    if (inRange(ts.work_date, period.startStr, period.endStr)) add(ts.employee_id, ts.hours_worked ?? 0);
  }
  for (const job of jobs) {
    if (!inRange(job.scheduled_date, period.startStr, period.endStr)) continue;
    const total = job.total_hours ?? 0;
    if (total) job.assignmentEmployeeIds.forEach(id => add(id, total));
    const dh = job.driver_hours ?? 0;
    if (dh) (job.driver_employee_ids ?? []).forEach(id => add(id, dh));
  }

  const rows: PayrollRow[] = employees.map(e => {
    const hours = Math.round((hoursById[e.id] ?? 0) * 100) / 100;
    return {
      employeeId: e.id,
      name: `${e.first_name} ${e.last_name}`,
      payRate: e.pay_rate,
      payType: e.pay_type,
      hours,
      pay: Math.round(payForHours(hours, e.pay_rate, e.pay_type) * 100) / 100,
    };
  });

  const filtered = includeZero
    ? rows
    : rows.filter(r => r.hours > 0 || r.payType === 'salary');
  return filtered.sort((a, b) => b.pay - a.pay);
}

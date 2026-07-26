// Payroll period math + per-worker hours/pay computation.
//
// Pay frequency is a per-business setting (weekly | biweekly | monthly). The
// Payroll page derives each period from it and lets the owner step through
// periods. A worker's hours for a period = logged timesheets + the total_hours
// of jobs they're crewed on + any driver_hours; hours × pay_rate = gross pay.

import {
  type FormulaToken,
  evaluateFormula,
  fieldRefId,
  formulaJobFieldRefs,
  matchFieldValue,
  normalizeFormula,
  numericFieldValue,
} from './payrollFormula';

export type PayrollFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

// ── Pay components config (businesses.payroll_config, migration 123) ────────
// Defaults reproduce the legacy behavior EXACTLY: all hours (incl. driven)
// × the employee's rate, no overtime.

export type DriverPayMode = 'same' | 'rate' | 'flat';

export interface PayrollConfig {
  overtime: {
    enabled: boolean;
    /** Regular hours per WEEK before overtime kicks in (scaled to the period). */
    weeklyThreshold: number;
    /** Overtime pay = rate × multiplier (e.g. 1.5). */
    multiplier: number;
  };
  driver: {
    /** same = driven hours pay at the employee rate (legacy);
     *  rate = driven hours × a custom rate; flat = fixed $ per job driven. */
    mode: DriverPayMode;
    rate: number;
    flat: number;
  };
  /** Custom pay formula (chips). When set, REPLACES the gross-pay calc for
   *  hourly workers — salary/daily keep the standard calc. Null = standard. */
  formula?: FormulaToken[] | null;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  overtime: { enabled: false, weeklyThreshold: 40, multiplier: 1.5 },
  driver: { mode: 'same', rate: 0, flat: 0 },
  formula: null,
};

export function normalizePayrollConfig(raw: unknown): PayrollConfig {
  const r = (raw ?? {}) as Partial<PayrollConfig> & { overtime?: Partial<PayrollConfig['overtime']>; driver?: Partial<PayrollConfig['driver']> };
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    overtime: {
      enabled: r.overtime?.enabled === true,
      weeklyThreshold: num(r.overtime?.weeklyThreshold, 40),
      multiplier: Math.max(1, num(r.overtime?.multiplier, 1.5)),
    },
    driver: {
      mode: r.driver?.mode === 'rate' || r.driver?.mode === 'flat' ? r.driver.mode : 'same',
      rate: num(r.driver?.rate, 0),
      flat: num(r.driver?.flat, 0),
    },
    formula: normalizeFormula(r.formula),
  };
}

export const PAYROLL_FREQUENCIES: PayrollFrequency[] = ['weekly', 'biweekly', 'monthly', 'custom'];

export function normalizeFrequency(raw: unknown): PayrollFrequency {
  return raw === 'weekly' || raw === 'biweekly' || raw === 'custom' ? raw : 'monthly';
}

/** Days per period for frequency='custom' — clamp to something sane. */
export function normalizeCustomDays(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.round(n) : 7;
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
// Whole-day distance b−a, both read as local calendar dates. Computed via UTC
// so a DST shift between the two days can't drift the count by ±1.
function daysBetween(a: Date, b: Date): number {
  const au = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bu = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bu - au) / 86_400_000);
}
// A date on `day` of the given year/month, clamped to that month's real length
// so day 31 lands on Feb 28 (or 29 in a leap year), Apr 30, etc. `month` may be
// out of 0–11; the Date engine normalizes it (and handles leap years).
function clampMonthDay(year: number, month: number, day: number): Date {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, daysInMonth));
}

// Fixed Sunday reference so biweekly periods are stable across the app/devices
// when no per-business anchor is set. (Jan 7 2024 is a Sunday.)
const BIWEEKLY_ANCHOR = new Date(2024, 0, 7);

/** Parse a YYYY-MM-DD pay-anchor string to a local-midnight Date (null if absent/invalid). */
export function parsePayrollAnchor(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * The pay period of the given frequency containing `ref`, shifted by `offset`
 * periods (negative = earlier).
 *
 * When `anchor` (the business's pay-period start date) is set, every period is
 * a fixed-length window stepping from that date — weekly = 7-day, biweekly =
 * 14-day windows aligned to the anchor's weekday; monthly = the anchor's
 * day-of-month each month (clamped for short months / leap years).
 *
 * Without an anchor it falls back to the legacy defaults: weeks run
 * Sunday→Saturday, monthly is the calendar month, biweekly aligns to a fixed
 * Sunday so 14-day windows line up everywhere.
 */
export function getPayrollPeriod(
  frequency: PayrollFrequency,
  ref: Date,
  offset = 0,
  anchor?: Date | null,
  /** Days per period when frequency='custom' (e.g. pay every 3 days). */
  customDays?: number | null,
): PayrollPeriod {
  const base = startOfDay(ref);

  if (frequency === 'monthly') {
    if (anchor) {
      const day = anchor.getDate();
      const year = base.getFullYear();
      let month = base.getMonth();
      // Before this month's payday → the current period started last month.
      if (base.getTime() < clampMonthDay(year, month, day).getTime()) month -= 1;
      const start = clampMonthDay(year, month + offset, day);
      const next = clampMonthDay(start.getFullYear(), start.getMonth() + 1, day);
      const end = addDays(next, -1);
      return { start, end, startStr: ymd(start), endStr: ymd(end) };
    }
    const start = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day
    return { start, end, startStr: ymd(start), endStr: ymd(end) };
  }

  if (frequency === 'weekly') {
    const a = anchor ? startOfDay(anchor) : addDays(base, -base.getDay()); // anchor or this Sunday
    const idx = Math.floor(daysBetween(a, base) / 7) + offset;
    const start = addDays(a, idx * 7);
    const end = addDays(start, 6);
    return { start, end, startStr: ymd(start), endStr: ymd(end) };
  }

  // biweekly (14-day) or custom (N-day) — same fixed-window stepping.
  const len = frequency === 'custom' ? normalizeCustomDays(customDays) : 14;
  const a = anchor ? startOfDay(anchor) : BIWEEKLY_ANCHOR;
  const idx = Math.floor(daysBetween(a, base) / len) + offset;
  const start = addDays(a, idx * len);
  const end = addDays(start, len - 1);
  return { start, end, startStr: ymd(start), endStr: ymd(end) };
}

// ── Per-worker hours/pay ─────────────────────────────────────────────────────

export interface PayrollEmployee {
  id: string;
  first_name: string;
  last_name: string;
  pay_rate: number;
  pay_type: string;
  /** Per-worker overtime opt-out (default eligible). */
  overtime_eligible?: boolean | null;
  /** Per-worker overrides; null = business default. */
  overtime_threshold?: number | null;
  overtime_multiplier?: number | null;
  /** Custom-field values — read by custom pay formulas. */
  custom_fields?: Record<string, unknown> | null;
}
export interface PayrollTimesheet {
  employee_id: string | null;
  hours_worked: number | null;
  work_date: string | null;
}
export interface PayrollJob {
  /** Job id + title — optional so callers that only need pay totals can skip
   *  them; required for the per-worker breakdown (which projects the hours
   *  came from). */
  id?: string | null;
  title?: string | null;
  /** Work date the hours fall on (drives which period the job counts in). */
  scheduled_date: string | null;
  total_hours: number | null;
  driver_employee_ids: string[] | null;
  driver_hours: number | null;
  /** Employee ids of the crew assigned to the job (lead included). */
  assignmentEmployeeIds: string[];
  /** Custom-field values — summed per worker when a pay formula uses them. */
  custom_fields?: Record<string, unknown> | null;
}

export interface PayrollRow {
  employeeId: string;
  name: string;
  payRate: number;
  payType: string;
  hours: number;
  pay: number;
  // Component detail (all 0 under the legacy default config).
  workedHours: number;
  drivenHours: number;
  overtimeHours: number;
  overtimePay: number;
  driverPay: number;
  /** Formula job-field sums for this worker's period (display label →
   *  number), e.g. { "Regresaron: No": 2 }. Only set when a formula reads
   *  job custom fields — feeds per-payment component snapshots. */
  formulaJobFields?: Record<string, number>;
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
 * Hours for ONE worker within a date window, using the exact same sources as
 * the Payroll page (computePayrollRows): employee-linked timesheets +
 * total_hours of jobs they're crewed on + driver_hours of jobs they drove.
 * Shared so the field-worker home's "active hours" reconciles with Nómina.
 */
export function employeeHoursInRange(opts: {
  employeeId: string;
  timesheets: PayrollTimesheet[];
  jobs: PayrollJob[];
  startStr: string;
  endStr: string;
}): number {
  const { employeeId, timesheets, jobs, startStr, endStr } = opts;
  let hours = 0;
  for (const ts of timesheets) {
    if (ts.employee_id === employeeId && inRange(ts.work_date, startStr, endStr)) {
      hours += ts.hours_worked ?? 0;
    }
  }
  for (const job of jobs) {
    if (!inRange(job.scheduled_date, startStr, endStr)) continue;
    if ((job.total_hours ?? 0) && job.assignmentEmployeeIds.includes(employeeId)) {
      hours += job.total_hours ?? 0;
    }
    if ((job.driver_hours ?? 0) && (job.driver_employee_ids ?? []).includes(employeeId)) {
      hours += job.driver_hours ?? 0;
    }
  }
  return Math.round(hours * 100) / 100;
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
  /** Pay components (overtime / driver mode). Omitted = legacy behavior. */
  config?: PayrollConfig;
}): PayrollRow[] {
  const { employees, timesheets, jobs, period, includeZero = true } = opts;
  const cfg = opts.config ?? DEFAULT_PAYROLL_CONFIG;
  // Worked hours (timesheets + crew) and driven hours tracked separately so
  // the driver component can pay them differently.
  const workedById: Record<string, number> = {};
  const drivenById: Record<string, number> = {};
  const jobsDrivenById: Record<string, number> = {};
  const add = (map: Record<string, number>, id: string | null | undefined, h: number) => {
    if (!id || !h) return;
    map[id] = (map[id] ?? 0) + h;
  };

  for (const ts of timesheets) {
    if (inRange(ts.work_date, period.startStr, period.endStr)) add(workedById, ts.employee_id, ts.hours_worked ?? 0);
  }
  // Job custom fields a formula reads: summed (or, for option-match reads,
  // counted) per worker over the jobs they were crewed on OR drove within
  // the period — each job counted once.
  const jcfRefs = cfg.formula ? formulaJobFieldRefs(cfg.formula) : [];
  const jcfById: Record<string, Record<string, number>> = {};

  for (const job of jobs) {
    if (!inRange(job.scheduled_date, period.startStr, period.endStr)) continue;
    const total = job.total_hours ?? 0;
    // Dedupe per job: a worker listed twice on the same job (e.g. a duplicate
    // job_assignments row from an import) must be credited the hours ONCE —
    // matching employeeBreakdownInRange, which uses .includes(). Without the
    // Set, the payroll card double-counts hours and OVERPAYS vs. the breakdown.
    if (total) new Set(job.assignmentEmployeeIds).forEach(id => add(workedById, id, total));
    const dh = job.driver_hours ?? 0;
    if (dh) {
      new Set(job.driver_employee_ids ?? []).forEach(id => {
        add(drivenById, id, dh);
        add(jobsDrivenById, id, 1);
      });
    }
    if (jcfRefs.length) {
      const people = new Set([...job.assignmentEmployeeIds, ...(job.driver_employee_ids ?? [])]);
      for (const ref of jcfRefs) {
        const raw = job.custom_fields?.[ref.k];
        const v = ref.eq === undefined ? numericFieldValue(raw) : matchFieldValue(raw, ref.eq);
        if (!v) continue;
        const id = fieldRefId(ref);
        people.forEach(pid => {
          if (!jcfById[pid]) jcfById[pid] = {};
          jcfById[pid][id] = (jcfById[pid][id] ?? 0) + v;
        });
      }
    }
  }

  // Overtime threshold is per WEEK — scale it to the period length so
  // biweekly/monthly periods behave sensibly (approximation: days ÷ 7).
  const periodDays =
    (new Date(period.endStr).getTime() - new Date(period.startStr).getTime()) / 86_400_000 + 1;
  const weeks = Math.max(1, periodDays / 7);

  const rows: PayrollRow[] = employees.map(e => {
    const worked = workedById[e.id] ?? 0;
    const driven = drivenById[e.id] ?? 0;
    const jobsDriven = jobsDrivenById[e.id] ?? 0;

    // Driver component: 'same' folds driven hours into base hours (legacy);
    // the other modes pay them separately and keep them out of base/overtime.
    const driverPay =
      cfg.driver.mode === 'rate' ? driven * cfg.driver.rate
      : cfg.driver.mode === 'flat' ? jobsDriven * cfg.driver.flat
      : 0;
    const baseHours = cfg.driver.mode === 'same' ? worked + driven : worked;

    // Overtime applies to hourly workers only.
    // Per-worker overrides (null/undefined = business defaults).
    const otThreshold = (e.overtime_threshold ?? cfg.overtime.weeklyThreshold) * weeks;
    const otMultiplier = e.overtime_multiplier ?? cfg.overtime.multiplier;
    let basePay: number;
    let overtimeHours = 0;
    let overtimePay = 0;
    // Overtime is opt-in PER WORKER; the business config only supplies defaults.
    if ((e.overtime_eligible ?? false) && e.pay_type === 'hourly' && baseHours > otThreshold) {
      overtimeHours = baseHours - otThreshold;
      basePay = otThreshold * e.pay_rate;
      overtimePay = overtimeHours * e.pay_rate * otMultiplier;
    } else {
      basePay = payForHours(baseHours, e.pay_rate, e.pay_type);
    }

    // Custom formula (hourly only): replaces the gross calc. The standard
    // components above still feed it as variables (normal_pay, driver_pay…).
    let pay = basePay + overtimePay + driverPay;
    if (cfg.formula && e.pay_type === 'hourly') {
      const normalHours = baseHours - overtimeHours;
      const result = evaluateFormula(cfg.formula, {
        vars: {
          pay_rate: e.pay_rate,
          worked_hours: worked,
          driven_hours: driven,
          total_hours: worked + driven,
          normal_hours: normalHours,
          overtime_hours: overtimeHours,
          normal_pay: basePay,
          overtime_pay: overtimePay,
          driver_pay: driverPay,
          standard_pay: basePay + overtimePay + driverPay,
        },
        ecf: e.custom_fields ?? {},
        jcf: jcfById[e.id] ?? {},
      });
      if (result !== null) pay = result;
    }

    // Per-label sums of the formula's job-field reads — snapshot material
    // for payment records ("this check paid 2 overnights").
    let formulaJobFields: Record<string, number> | undefined;
    if (cfg.formula && jcfRefs.length) {
      formulaJobFields = {};
      for (const tok of cfg.formula) {
        if (tok.t !== 'jcf') continue;
        formulaJobFields[tok.label] = jcfById[e.id]?.[fieldRefId(tok)] ?? 0;
      }
    }

    const hours = Math.round((worked + driven) * 100) / 100;
    return {
      employeeId: e.id,
      name: `${e.first_name} ${e.last_name}`,
      payRate: e.pay_rate,
      payType: e.pay_type,
      hours,
      pay: Math.round(pay * 100) / 100,
      workedHours: Math.round(worked * 100) / 100,
      drivenHours: Math.round(driven * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      driverPay: Math.round(driverPay * 100) / 100,
      ...(formulaJobFields ? { formulaJobFields } : {}),
    };
  });

  const filtered = includeZero
    ? rows
    : rows.filter(r => r.hours > 0 || r.payType === 'salary');
  return filtered.sort((a, b) => b.pay - a.pay);
}

// ── Per-worker breakdown (which projects the hours came from) ────────────────

/** One job contributing hours to a worker in the period, split by kind. */
export interface PayrollBreakdownJob {
  jobId: string | null;
  title: string | null;
  date: string | null;
  /** Crew hours (job total_hours) credited because they were on the crew. */
  workedHours: number;
  /** Driving hours (job driver_hours) credited because they drove. */
  drivenHours: number;
}

export interface PayrollBreakdown {
  /** Jobs that contributed hours, oldest first. */
  jobs: PayrollBreakdownJob[];
  /** Standalone timesheet hours not tied to a job in this data set. */
  loggedHours: number;
  workedHours: number;
  drivenHours: number;
  totalHours: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Explain ONE worker's period hours: which jobs they came from (split into crew
 * "worked" hours vs "driven" hours) plus any standalone logged timesheet hours.
 * Uses the exact same attribution rules as computePayrollRows so the totals here
 * reconcile with the pay shown on the row.
 */
export function employeeBreakdownInRange(opts: {
  employeeId: string;
  timesheets: PayrollTimesheet[];
  jobs: PayrollJob[];
  startStr: string;
  endStr: string;
}): PayrollBreakdown {
  const { employeeId, timesheets, jobs, startStr, endStr } = opts;
  const jobEntries: PayrollBreakdownJob[] = [];
  let workedHours = 0;
  let drivenHours = 0;
  let loggedHours = 0;

  for (const job of jobs) {
    if (!inRange(job.scheduled_date, startStr, endStr)) continue;
    const worked =
      (job.total_hours ?? 0) && job.assignmentEmployeeIds.includes(employeeId)
        ? job.total_hours ?? 0
        : 0;
    const driven =
      (job.driver_hours ?? 0) && (job.driver_employee_ids ?? []).includes(employeeId)
        ? job.driver_hours ?? 0
        : 0;
    if (!worked && !driven) continue;
    workedHours += worked;
    drivenHours += driven;
    jobEntries.push({
      jobId: job.id ?? null,
      title: job.title ?? null,
      date: job.scheduled_date,
      workedHours: round2(worked),
      drivenHours: round2(driven),
    });
  }

  for (const ts of timesheets) {
    if (ts.employee_id === employeeId && inRange(ts.work_date, startStr, endStr)) {
      loggedHours += ts.hours_worked ?? 0;
    }
  }

  jobEntries.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return {
    jobs: jobEntries,
    loggedHours: round2(loggedHours),
    workedHours: round2(workedHours),
    drivenHours: round2(drivenHours),
    totalHours: round2(workedHours + drivenHours + loggedHours),
  };
}

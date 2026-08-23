// Reports data layer — shared by web and mobile so both platforms fetch the
// same rows and compute the same metrics. Rendering differs per platform
// (web: recharts; mobile: native bars), but the math lives here.
//
// All fetches paginate via fetchAllById (KEYSET, not offset) — reports must stay
// accurate past PostgREST's 1000-row default cap, and offset .range() re-scans
// under RLS, which statement-timeouts once a table has thousands of rows (this
// hung the mobile Reports screen for a business with 4000+ jobs).

import { fetchAllById } from './supabaseFetch';
import { computePayrollRows, computePayrollRowsFromAggregates, normalizePayrollConfig, type PayrollAggregate, type PayrollConfig } from './payroll';
import { formulaJobFieldRefs } from './payrollFormula';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface ReportInvoice {
  id: string; status: string; total_amount: number;
  paid_at: string | null; created_at: string; issue_date: string;
  /** Invoice lines — each tagged with the job it bills (nullable). */
  line_items?: { job_id?: string | null; qty?: number; rate?: number }[] | null;
}
export interface ReportJob {
  id: string; status: string; total_amount: number; created_at: string; client_id: string | null;
  location_id: string | null;
  // Payroll-estimate inputs — hours are logged on the job (not always in the
  // timesheets table), so the estimate reads them from here too.
  scheduled_date?: string | null; total_hours?: number | null;
  driver_employee_ids?: string[] | null; driver_hours?: number | null;
  custom_fields?: Record<string, unknown> | null;
  job_assignments?: { employee_id: string | null; crew?: boolean | null }[];
}
export interface ReportLocation { id: string; name: string; }
export interface ReportClient { id: string; created_at: string; }
export interface ReportTimesheet { id: string; hours_worked: number; work_date: string; employee_id: string | null; worker_name: string | null; }
export interface ReportEmployee {
  id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string;
  overtime_eligible?: boolean | null; overtime_threshold?: number | null;
  overtime_multiplier?: number | null; custom_fields?: Record<string, unknown> | null;
}
export interface ReportInventoryItem { id: string; quantity: number; unit_cost: number; }

export interface ReportsData {
  invoices: ReportInvoice[];
  jobs: ReportJob[];
  clients: ReportClient[];
  timesheets: ReportTimesheet[];
  employees: ReportEmployee[];
  inventory: ReportInventoryItem[];
  // Branches for the per-location breakdown. Empty in single-location mode.
  locations: ReportLocation[];
}

export type ReportRange = 'month' | 'last_month' | 'quarter' | 'half' | 'year' | 'last_year' | 'all';
export const REPORT_RANGE_KEYS: ReportRange[] = ['month', 'last_month', 'quarter', 'half', 'year', 'last_year', 'all'];

// Status keys + colors used by the job-status breakdown (label mapping is done
// in the UI via the jobs.tabs i18n).
export const JOB_STATUS_REPORT: { status: string; color: string }[] = [
  { status: 'scheduled',   color: '#6366F1' },
  { status: 'in_progress', color: '#F59E0B' },
  { status: 'completed',   color: '#10B981' },
  { status: 'invoiced',    color: '#8B5CF6' },
  { status: 'cancelled',   color: '#D1D5DB' },
];

export const INVOICE_PIE_COLORS: Record<string, string> = {
  paid: '#10B981', sent: '#6366F1', draft: '#9CA3AF',
  overdue: '#EF4444', cancelled: '#D1D5DB', invoiced: '#8B5CF6',
};

export function getReportRangeStart(range: ReportRange): Date | null {
  const now = new Date();
  switch (range) {
    case 'month':      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'last_month': return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'quarter':    return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'half':       return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case 'year':       return new Date(now.getFullYear(), 0, 1);
    case 'last_year':  return new Date(now.getFullYear() - 1, 0, 1);
    case 'all':        return null;
  }
}
export function getReportRangeEnd(range: ReportRange): Date {
  const now = new Date();
  if (range === 'last_month') return new Date(now.getFullYear(), now.getMonth(), 0);
  if (range === 'last_year') return new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  return now;
}

export async function fetchReportsData(
  supabase: SupabaseLike,
  businessId: string,
  inventoryEnabled: boolean,
): Promise<ReportsData> {
  // Keyset by id: order by id asc, cursor via .gt('id', afterId). Matches the
  // web reports page. Aggregations don't care about row order, so ordering by id
  // is fine.
  const [invoices, jobs, clients, timesheets, employees, inventory, locations] = await Promise.all([
    fetchAllById<ReportInvoice>((afterId, pageSize) => {
      let q = supabase.from('invoices').select('id, status, total_amount, paid_at, created_at, issue_date, line_items').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
    fetchAllById<ReportJob>((afterId, pageSize) => {
      let q = supabase.from('jobs').select('id, status, total_amount, created_at, client_id, location_id, scheduled_date, total_hours, driver_employee_ids, driver_hours, custom_fields, job_assignments(employee_id, crew)').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
    fetchAllById<ReportClient>((afterId, pageSize) => {
      let q = supabase.from('clients').select('id, created_at').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
    fetchAllById<ReportTimesheet>((afterId, pageSize) => {
      let q = supabase.from('timesheets').select('id, hours_worked, work_date, employee_id, worker_name').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
    fetchAllById<ReportEmployee>((afterId, pageSize) => {
      let q = supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type, overtime_eligible, overtime_threshold, overtime_multiplier, custom_fields').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
    inventoryEnabled
      ? fetchAllById<ReportInventoryItem>((afterId, pageSize) => {
          let q = supabase.from('inventory_items').select('id, quantity, unit_cost').eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
          if (afterId) q = q.gt('id', afterId);
          return q;
        })
      : Promise.resolve([] as ReportInventoryItem[]),
    fetchAllById<ReportLocation>((afterId, pageSize) => {
      let q = supabase.from('locations').select('id, name').eq('business_id', businessId).eq('archived', false).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    }),
  ]);
  return { invoices, jobs, clients, timesheets, employees, inventory, locations };
}

export interface ReportsMetrics {
  totalRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  avgJobValue: number;
  completedJobsCount: number;
  paidInvoicesCount: number;
  totalHours: number;
  totalPayroll: number;
  /** Number of workers with any pay this range (for the payroll KPI sub). */
  payrollWorkers: number;
  inventoryValue: number;
  /** Monthly series; `name` is a locale-aware short month label. */
  monthlyRevenue: { name: string; revenue: number; jobs: number }[];
  /** Invoice counts by status key (map to labels/colors in UI). */
  invoiceStatus: { status: string; count: number }[];
  invoicesTotal: number;
  /** Job counts by status key, in fixed order, zeros dropped. */
  jobStatus: { status: string; value: number; color: string }[];
  jobsTotal: number;
  completionRate: number;
  /** Top 8 by hours; name already resolved (employee name or worker_name). */
  employeeHours: { name: string; hours: number; pay: number }[];
  newClientsCount: number;
  totalClientsCount: number;
  inventoryItemsCount: number;
  lowStock: number;
  outOfStock: number;
  /** Per-branch breakdown of jobs + revenue. Empty in single-location mode.
   *  Reports stay business-wide totals; this lets the user compare branches. */
  byLocation: { locationId: string | null; name: string; jobCount: number; revenue: number }[];
}

/** Compute all report metrics for a range. `manualWorkerLabel` names a
 *  timesheet row with no linked employee. `dateLocale` formats month labels. */
export function computeReports(
  data: ReportsData,
  range: ReportRange,
  dateLocale: string,
  manualWorkerLabel: string,
  // Custom date range (YYYY-MM-DD). When either side is set it OVERRIDES the
  // preset `range`: missing `from` = no lower bound, missing `to` = up to now.
  custom?: { from: string | null; to: string | null },
  // Label for jobs with no branch in the per-location breakdown.
  unassignedLocationLabel = 'Sin ubicación',
  // Pay components (overtime / driver / formula) so the estimate matches the
  // Payroll page. Omitted = legacy hours×rate.
  payrollConfig?: unknown,
): ReportsMetrics {
  const customActive = !!(custom && (custom.from || custom.to));
  const parseLocal = (s: string) => {
    const [y, mo, d] = s.split('-').map(Number);
    return new Date(y, mo - 1, d);
  };
  const rangeStart = customActive
    ? (custom!.from ? parseLocal(custom!.from) : null)
    : getReportRangeStart(range);
  const rangeEnd = customActive
    ? (() => {
        if (!custom!.to) return new Date();
        const d = parseLocal(custom!.to);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : getReportRangeEnd(range);
  const inRange = (dateStr: string) => {
    const d = new Date(dateStr);
    if (rangeStart && d < rangeStart) return false;
    if (d > rangeEnd) return false;
    return true;
  };

  // Invoices bucket by ISSUE date (accrual billing view): an invoice created
  // in Jan but issued in March belongs to March. created_at is only a
  // fallback for rows with no issue date (and equals import time on imports).
  const filteredInvoices = data.invoices.filter(i => inRange(i.issue_date || i.created_at));
  const filteredJobs = data.jobs.filter(j => inRange(j.created_at));
  const filteredClients = data.clients.filter(c => inRange(c.created_at));

  const paidInvoices = filteredInvoices.filter(i => i.status === 'paid');
  // Raw sums; rounding to cents happens once at display (see the fmt helpers).
  const totalRevenue = paidInvoices.reduce((s, i) => s + i.total_amount, 0);
  const pendingRevenue = filteredInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total_amount, 0);
  const overdueRevenue = filteredInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0);

  const completedJobs = filteredJobs.filter(j => j.status === 'completed' || j.status === 'invoiced');
  // Average job value, best-available source:
  //   1. jobs with their own amount (user-entered totals),
  //   2. invoice LINE ITEMS summed per job_id — the true per-job revenue for
  //      migrated data where pricing lives on invoices,
  //   3. average invoice total as the last resort.
  const pricedJobs = completedJobs.filter(j => (j.total_amount ?? 0) > 0);
  const perJobRevenue = new Map<string, number>();
  filteredInvoices.forEach(inv => (inv.line_items ?? []).forEach(li => {
    if (!li?.job_id) return;
    const amt = (Number(li.qty ?? 1) || 0) * (Number(li.rate ?? 0) || 0);
    perJobRevenue.set(li.job_id, (perJobRevenue.get(li.job_id) ?? 0) + amt);
  }));
  const perJobValues = Array.from(perJobRevenue.values());
  const avgJobValue = pricedJobs.length
    ? pricedJobs.reduce((s, j) => s + j.total_amount, 0) / pricedJobs.length
    : perJobValues.length
      ? perJobValues.reduce((s, v) => s + v, 0) / perJobValues.length
      : filteredInvoices.length
        ? filteredInvoices.reduce((s, i) => s + i.total_amount, 0) / filteredInvoices.length
        : 0;

  const inventoryValue = data.inventory.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  // Monthly revenue + job-count series.
  const now = new Date();
  let months: number;
  let start: Date;
  if (customActive && rangeStart) {
    // Custom range: buckets span the range itself (capped at 24 months).
    start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    months = Math.max(1, Math.min(24,
      (rangeEnd.getFullYear() - start.getFullYear()) * 12 + (rangeEnd.getMonth() - start.getMonth()) + 1));
  } else {
    months = range === 'month' || range === 'last_month' ? 1
      : range === 'quarter' ? 3
      : range === 'half' ? 6
      : range === 'year' ? now.getMonth() + 1   // Jan → current month
      : 12;                                     // last_year (Jan–Dec) / all (rolling 12)
    // First bucket month: calendar-year ranges anchor at January.
    start = range === 'last_month' ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
      : range === 'year' ? new Date(now.getFullYear(), 0, 1)
      : range === 'last_year' ? new Date(now.getFullYear() - 1, 0, 1)
      : new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  }
  const monthlyRevenue = Array.from({ length: months }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const revenue = +paidInvoices.filter(inv => {
      const pd = new Date(inv.issue_date || inv.paid_at || inv.created_at);
      return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
    }).reduce((s, x) => s + x.total_amount, 0).toFixed(0);
    const jobsCount = filteredJobs.filter(j => {
      const jd = new Date(j.created_at);
      return jd.getFullYear() === d.getFullYear() && jd.getMonth() === d.getMonth();
    }).length;
    return { name: d.toLocaleDateString(dateLocale, { month: 'short' }), revenue, jobs: jobsCount };
  });

  // Invoice status counts.
  const invCounts: Record<string, number> = {};
  filteredInvoices.forEach(i => { invCounts[i.status] = (invCounts[i.status] ?? 0) + 1; });
  const invoiceStatus = Object.entries(invCounts).map(([status, count]) => ({ status, count }));

  // Job status counts (fixed order, zeros dropped).
  const jobCounts: Record<string, number> = { scheduled: 0, in_progress: 0, completed: 0, invoiced: 0, cancelled: 0 };
  filteredJobs.forEach(j => { if (j.status in jobCounts) jobCounts[j.status]++; });
  const jobStatus = JOB_STATUS_REPORT
    .map(s => ({ status: s.status, value: jobCounts[s.status], color: s.color }))
    .filter(d => d.value > 0);

  // Employee hours + estimated pay — same engine as the Payroll page so hours
  // logged on JOBS (total_hours + driver hours via crew assignments) count too,
  // not just the timesheets table. Filtered to the range by work date.
  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const payrollRows = computePayrollRows({
    employees: data.employees,
    timesheets: data.timesheets.map(ts => ({ employee_id: ts.employee_id, hours_worked: ts.hours_worked, work_date: ts.work_date })),
    jobs: data.jobs.map(j => ({
      id: j.id,
      scheduled_date: j.scheduled_date ?? null,
      total_hours: j.total_hours ?? null,
      driver_employee_ids: j.driver_employee_ids ?? null,
      driver_hours: j.driver_hours ?? null,
      custom_fields: j.custom_fields ?? null,
      // crew=false rows are lead-only (migration 189) — no hour credit.
      assignmentEmployeeIds: (j.job_assignments ?? []).filter(a => a.crew !== false).map(a => a.employee_id).filter((x): x is string => !!x),
    })),
    period: { startStr: rangeStart ? toYMD(rangeStart) : '1900-01-01', endStr: toYMD(rangeEnd) },
    includeZero: false,
    config: normalizePayrollConfig(payrollConfig) as PayrollConfig,
  });
  const totalHours = payrollRows.reduce((s, r) => s + r.hours, 0);
  const employeeHours = [...payrollRows]
    .map(r => ({ name: r.name, hours: r.hours, pay: r.pay }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);
  const totalPayroll = payrollRows.reduce((s, r) => s + r.pay, 0);

  // Per-branch breakdown — only when the business runs multiple locations.
  // jobCount = jobs created in range; revenue = the completed / invoiced jobs
  // in range (invoices carry no location, so jobs are the proxy), valued with
  // the same best-available amount avgJobValue uses: the job's own
  // total_amount, else its invoice line items (perJobRevenue). Businesses that
  // price on the invoice leave every job at 0, which reported $0.00 per branch.
  let byLocation: ReportsMetrics['byLocation'] = [];
  if (data.locations.length > 0) {
    const agg = new Map<string, { jobCount: number; revenue: number }>();
    const bump = (key: string, revenue: number) => {
      const cur = agg.get(key) ?? { jobCount: 0, revenue: 0 };
      cur.jobCount += 1;
      cur.revenue += revenue;
      agg.set(key, cur);
    };
    filteredJobs.forEach(j => {
      const value = (j.total_amount ?? 0) > 0 ? j.total_amount : (perJobRevenue.get(j.id) ?? 0);
      const earned = j.status === 'completed' || j.status === 'invoiced' ? value : 0;
      bump(j.location_id ?? '__none__', earned);
    });
    byLocation = data.locations.map(l => ({
      locationId: l.id,
      name: l.name,
      jobCount: agg.get(l.id)?.jobCount ?? 0,
      revenue: agg.get(l.id)?.revenue ?? 0,
    }));
    const none = agg.get('__none__');
    if (none) byLocation.push({ locationId: null, name: unassignedLocationLabel, jobCount: none.jobCount, revenue: none.revenue });
  }

  return {
    totalRevenue, pendingRevenue, overdueRevenue,
    avgJobValue, completedJobsCount: completedJobs.length,
    paidInvoicesCount: paidInvoices.length,
    totalHours, totalPayroll, payrollWorkers: payrollRows.length, inventoryValue,
    monthlyRevenue,
    invoiceStatus, invoicesTotal: filteredInvoices.length,
    jobStatus, jobsTotal: filteredJobs.length,
    completionRate: filteredJobs.length > 0 ? Math.round((completedJobs.length / filteredJobs.length) * 100) : 0,
    employeeHours,
    newClientsCount: filteredClients.length, totalClientsCount: data.clients.length,
    inventoryItemsCount: data.inventory.length,
    lowStock: data.inventory.filter(i => i.quantity <= 5).length,
    outOfStock: data.inventory.filter(i => i.quantity === 0).length,
    byLocation,
  };
}

// ─── Server-side reports (reports_overview + payroll_period_inputs RPCs) ─────
// Replaces fetchReportsData's seven full-table downloads with two aggregate
// calls; range/bucket math stays client-side (device-local `now`), and the
// payroll estimate runs the SAME client pay engine over per-employee
// aggregated inputs. totalHours = payroll-engine hours (job + driver credits
// included) on BOTH platforms — the canonical semantics.

function resolveReportRange(range: ReportRange, custom?: { from: string | null; to: string | null }) {
  const customActive = !!(custom && (custom.from || custom.to));
  const parseLocal = (s2: string) => {
    const [y, mo, d] = s2.split('-').map(Number);
    return new Date(y, mo - 1, d);
  };
  const rangeStart = customActive
    ? (custom!.from ? parseLocal(custom!.from) : null)
    : getReportRangeStart(range);
  const rangeEnd = customActive
    ? (() => {
        if (!custom!.to) return new Date();
        const d = parseLocal(custom!.to);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : getReportRangeEnd(range);
  // Month buckets — identical to computeReports.
  const now = new Date();
  let months: number;
  let start: Date;
  if (customActive && rangeStart) {
    start = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    months = Math.max(1, Math.min(24,
      (rangeEnd.getFullYear() - start.getFullYear()) * 12 + (rangeEnd.getMonth() - start.getMonth()) + 1));
  } else {
    months = range === 'month' || range === 'last_month' ? 1
      : range === 'quarter' ? 3
      : range === 'half' ? 6
      : range === 'year' ? now.getMonth() + 1
      : 12;
    start = range === 'last_month' ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
      : range === 'year' ? new Date(now.getFullYear(), 0, 1)
      : range === 'last_year' ? new Date(now.getFullYear() - 1, 0, 1)
      : new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  }
  return { rangeStart, rangeEnd, bucketStart: start, months };
}

const toYMDLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function fetchReportsMetricsServer(opts: {
  supabase: SupabaseLike;
  businessId: string;
  range: ReportRange;
  dateLocale: string;
  custom?: { from: string | null; to: string | null };
  unassignedLocationLabel?: string;
  payrollConfig?: unknown;
  inventoryEnabled: boolean;
}): Promise<ReportsMetrics> {
  const { supabase, businessId, range, dateLocale, custom, payrollConfig } = opts;
  const unassignedLocationLabel = opts.unassignedLocationLabel ?? 'Sin ubicación';
  const { rangeStart, rangeEnd, bucketStart, months } = resolveReportRange(range, custom);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const cfg = normalizePayrollConfig(payrollConfig) as PayrollConfig;
  const jcfKeys = Array.from(new Set((cfg.formula ? formulaJobFieldRefs(cfg.formula) : []).map(r => r.k))).sort();

  const [overviewRes, inputsRes, locRes] = await Promise.all([
    supabase.rpc('reports_overview', {
      p_business_id: businessId,
      p_from: rangeStart ? rangeStart.toISOString() : null,
      p_to: rangeEnd.toISOString(),
      p_bucket_start: toYMDLocal(bucketStart),
      p_bucket_months: months,
      p_tz: tz,
      p_include_inventory: opts.inventoryEnabled,
    }),
    supabase.rpc('payroll_period_inputs', {
      p_business_id: businessId,
      p_start: rangeStart ? toYMDLocal(rangeStart) : '1900-01-01',
      p_end: toYMDLocal(rangeEnd),
      p_jcf_keys: jcfKeys.length ? jcfKeys : null,
    }),
    supabase.from('locations').select('id, name').eq('business_id', businessId).eq('archived', false),
  ]);
  if (overviewRes.error) throw new Error(overviewRes.error.message);
  if (inputsRes.error) throw new Error(inputsRes.error.message);
  const ov = (overviewRes.data ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(ov[k] ?? 0) || 0;

  // Payroll estimate — client pay engine over server aggregates (preserves the
  // all-time weeks scaling quirk exactly: 1900-01-01 → huge OT threshold).
  const aggregates: PayrollAggregate[] = ((inputsRes.data ?? []) as {
    employee_id: string; first_name: string; last_name: string; pay_rate: number | string;
    pay_type: string; overtime_eligible: boolean | null; overtime_threshold: number | string | null;
    overtime_multiplier: number | string | null; custom_fields: Record<string, unknown> | null;
    worked_hours: number | string; driven_hours: number | string; jobs_driven: number | string;
    jcf_raw: Record<string, unknown[]> | null;
  }[]).map(r => ({
    employee: {
      id: r.employee_id, first_name: r.first_name, last_name: r.last_name,
      pay_rate: Number(r.pay_rate) || 0, pay_type: r.pay_type,
      overtime_eligible: r.overtime_eligible,
      overtime_threshold: r.overtime_threshold == null ? null : Number(r.overtime_threshold),
      overtime_multiplier: r.overtime_multiplier == null ? null : Number(r.overtime_multiplier),
      custom_fields: r.custom_fields,
    },
    worked: Number(r.worked_hours) || 0,
    driven: Number(r.driven_hours) || 0,
    jobsDriven: Number(r.jobs_driven) || 0,
    jcfRaw: r.jcf_raw,
  }));
  const payrollRows = computePayrollRowsFromAggregates({
    aggregates,
    period: { startStr: rangeStart ? toYMDLocal(rangeStart) : '1900-01-01', endStr: toYMDLocal(rangeEnd) },
    includeZero: false,
    config: cfg,
  });
  const totalHours = payrollRows.reduce((s2, r) => s2 + r.hours, 0);
  const totalPayroll = payrollRows.reduce((s2, r) => s2 + r.pay, 0);
  const employeeHours = [...payrollRows]
    .map(r => ({ name: r.name, hours: r.hours, pay: r.pay }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  // avgJobValue — same 3-tier fallback as computeReports.
  const pricedCount = n('pricedJobsCount');
  const perJobCount = n('perJobCount');
  const invoicesTotal = n('invoicesTotal');
  const avgJobValue = pricedCount
    ? n('pricedJobsSum') / pricedCount
    : perJobCount
      ? n('perJobSum') / perJobCount
      : invoicesTotal
        ? n('invoicesSum') / invoicesTotal
        : 0;

  // Monthly series — 'ym' keys localized here; revenue keeps the historical
  // integer truncation (+x.toFixed(0)).
  const monthlyRevenue = ((ov.monthlyRevenue ?? []) as { ym: string; revenue: number | string; jobs: number | string }[])
    .map(m => ({
      name: new Date(`${m.ym}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'short' }),
      revenue: +Number(m.revenue ?? 0).toFixed(0),
      jobs: Number(m.jobs ?? 0) || 0,
    }));

  // Job status — fixed order + colors, zeros dropped.
  const jobCounts: Record<string, number> = {};
  for (const row of (ov.jobStatus ?? []) as { status: string; value: number | string }[]) {
    jobCounts[row.status] = Number(row.value) || 0;
  }
  const jobStatus = JOB_STATUS_REPORT
    .map(s2 => ({ status: s2.status, value: jobCounts[s2.status] ?? 0, color: s2.color }))
    .filter(d => d.value > 0);

  const invoiceStatus = ((ov.invoiceStatus ?? []) as { status: string; count: number | string }[])
    .map(r => ({ status: r.status, count: Number(r.count) || 0 }));

  // Per-branch breakdown — only when the business runs multiple locations.
  const locations = ((locRes.data ?? []) as { id: string; name: string }[]);
  let byLocation: ReportsMetrics['byLocation'] = [];
  if (locations.length > 0) {
    const rows = ((ov.byLocation ?? []) as { locationId: string | null; jobCount: number | string; revenue: number | string }[]);
    const byId = new Map(rows.map(r => [r.locationId ?? '__none__', r]));
    byLocation = locations.map(l => ({
      locationId: l.id,
      name: l.name,
      jobCount: Number(byId.get(l.id)?.jobCount ?? 0) || 0,
      revenue: Number(byId.get(l.id)?.revenue ?? 0) || 0,
    }));
    const none = byId.get('__none__');
    if (none) byLocation.push({ locationId: null, name: unassignedLocationLabel, jobCount: Number(none.jobCount) || 0, revenue: Number(none.revenue) || 0 });
  }

  const completedJobsCount = n('completedJobsCount');
  const jobsTotal = n('jobsTotal');
  return {
    totalRevenue: n('totalRevenue'),
    pendingRevenue: n('pendingRevenue'),
    overdueRevenue: n('overdueRevenue'),
    avgJobValue,
    completedJobsCount,
    paidInvoicesCount: n('paidInvoicesCount'),
    totalHours,
    totalPayroll,
    payrollWorkers: payrollRows.length,
    inventoryValue: n('inventoryValue'),
    monthlyRevenue,
    invoiceStatus,
    invoicesTotal,
    jobStatus,
    jobsTotal,
    completionRate: jobsTotal > 0 ? Math.round((completedJobsCount / jobsTotal) * 100) : 0,
    employeeHours,
    newClientsCount: n('newClientsCount'),
    totalClientsCount: n('totalClientsCount'),
    inventoryItemsCount: n('inventoryItemsCount'),
    lowStock: n('lowStock'),
    outOfStock: n('outOfStock'),
    byLocation,
  };
}

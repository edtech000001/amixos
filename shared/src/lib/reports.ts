// Reports data layer — shared by web and mobile so both platforms fetch the
// same rows and compute the same metrics. Rendering differs per platform
// (web: recharts; mobile: native bars), but the math lives here.
//
// All fetches paginate via fetchAll — reports must stay accurate past
// PostgREST's 1000-row default cap.

import { fetchAll } from './supabaseFetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface ReportInvoice {
  id: string; status: string; total_amount: number;
  paid_at: string | null; created_at: string; issue_date: string;
}
export interface ReportJob {
  id: string; status: string; total_amount: number; created_at: string; client_id: string | null;
}
export interface ReportClient { id: string; created_at: string; }
export interface ReportTimesheet { id: string; hours_worked: number; work_date: string; employee_id: string | null; worker_name: string | null; }
export interface ReportEmployee { id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string; }
export interface ReportInventoryItem { id: string; quantity: number; unit_cost: number; }

export interface ReportsData {
  invoices: ReportInvoice[];
  jobs: ReportJob[];
  clients: ReportClient[];
  timesheets: ReportTimesheet[];
  employees: ReportEmployee[];
  inventory: ReportInventoryItem[];
}

export type ReportRange = 'month' | 'last_month' | 'quarter' | 'half' | 'year' | 'all';
export const REPORT_RANGE_KEYS: ReportRange[] = ['month', 'last_month', 'quarter', 'half', 'year', 'all'];

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
    case 'all':        return null;
  }
}
export function getReportRangeEnd(range: ReportRange): Date {
  const now = new Date();
  if (range === 'last_month') return new Date(now.getFullYear(), now.getMonth(), 0);
  return now;
}

export async function fetchReportsData(
  supabase: SupabaseLike,
  businessId: string,
  inventoryEnabled: boolean,
): Promise<ReportsData> {
  const [invoices, jobs, clients, timesheets, employees, inventory] = await Promise.all([
    fetchAll<ReportInvoice>((from, to) =>
      supabase.from('invoices').select('id, status, total_amount, paid_at, created_at, issue_date').eq('business_id', businessId).range(from, to)),
    fetchAll<ReportJob>((from, to) =>
      supabase.from('jobs').select('id, status, total_amount, created_at, client_id').eq('business_id', businessId).range(from, to)),
    fetchAll<ReportClient>((from, to) =>
      supabase.from('clients').select('id, created_at').eq('business_id', businessId).range(from, to)),
    fetchAll<ReportTimesheet>((from, to) =>
      supabase.from('timesheets').select('id, hours_worked, work_date, employee_id, worker_name').eq('business_id', businessId).range(from, to)),
    fetchAll<ReportEmployee>((from, to) =>
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type').eq('business_id', businessId).range(from, to)),
    inventoryEnabled
      ? fetchAll<ReportInventoryItem>((from, to) =>
          supabase.from('inventory_items').select('id, quantity, unit_cost').eq('business_id', businessId).range(from, to))
      : Promise.resolve([] as ReportInventoryItem[]),
  ]);
  return { invoices, jobs, clients, timesheets, employees, inventory };
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

  const filteredInvoices = data.invoices.filter(i => inRange(i.created_at));
  const filteredJobs = data.jobs.filter(j => inRange(j.created_at));
  const filteredClients = data.clients.filter(c => inRange(c.created_at));
  const filteredSheets = data.timesheets.filter(ts => inRange(ts.work_date));

  const paidInvoices = filteredInvoices.filter(i => i.status === 'paid');
  const totalRevenue = paidInvoices.reduce((s, i) => s + i.total_amount, 0);
  const pendingRevenue = filteredInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total_amount, 0);
  const overdueRevenue = filteredInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0);

  const completedJobs = filteredJobs.filter(j => j.status === 'completed' || j.status === 'invoiced');
  const avgJobValue = completedJobs.length ? completedJobs.reduce((s, j) => s + j.total_amount, 0) / completedJobs.length : 0;

  const totalHours = filteredSheets.reduce((s, ts) => s + (ts.hours_worked ?? 0), 0);
  const inventoryValue = data.inventory.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  // Monthly revenue + job-count series.
  const now = new Date();
  const months = range === 'month' || range === 'last_month' ? 1
    : range === 'quarter' ? 3
    : range === 'half' ? 6
    : 12;
  const monthlyRevenue = Array.from({ length: months }, (_, i) => {
    const d = range === 'last_month'
      ? new Date(now.getFullYear(), now.getMonth() - 1 + i, 1)
      : new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const revenue = +paidInvoices.filter(inv => {
      const pd = new Date(inv.paid_at ?? inv.created_at);
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

  // Employee hours + estimated pay (top 8).
  const empMap: Record<string, { name: string; hours: number; payRate: number; payType: string }> = {};
  filteredSheets.forEach(ts => {
    const key = ts.employee_id ?? ts.worker_name ?? manualWorkerLabel;
    const emp = data.employees.find(e => e.id === ts.employee_id);
    const name = emp ? `${emp.first_name} ${emp.last_name}` : ts.worker_name ?? manualWorkerLabel;
    if (!empMap[key]) empMap[key] = { name, hours: 0, payRate: emp?.pay_rate ?? 0, payType: emp?.pay_type ?? 'hourly' };
    empMap[key].hours += ts.hours_worked ?? 0;
  });
  const employeeHours = Object.values(empMap)
    .map(e => ({
      name: e.name,
      hours: e.hours,
      pay: e.payType === 'hourly' ? e.hours * e.payRate
        : e.payType === 'daily' ? Math.ceil(e.hours / 8) * e.payRate
        : e.payRate,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);
  const totalPayroll = employeeHours.reduce((s, e) => s + e.pay, 0);

  return {
    totalRevenue, pendingRevenue, overdueRevenue,
    avgJobValue, completedJobsCount: completedJobs.length,
    paidInvoicesCount: paidInvoices.length,
    totalHours, totalPayroll, inventoryValue,
    monthlyRevenue,
    invoiceStatus, invoicesTotal: filteredInvoices.length,
    jobStatus, jobsTotal: filteredJobs.length,
    completionRate: filteredJobs.length > 0 ? Math.round((completedJobs.length / filteredJobs.length) * 100) : 0,
    employeeHours,
    newClientsCount: filteredClients.length, totalClientsCount: data.clients.length,
    inventoryItemsCount: data.inventory.length,
    lowStock: data.inventory.filter(i => i.quantity <= 5).length,
    outOfStock: data.inventory.filter(i => i.quantity === 0).length,
  };
}

// Jobs-list summary — turns the jobs_summary RPC payload (migration 210) into
// the numbers the summary sheet renders. Shared so web and mobile can never
// show different totals for the same filter.
//
// The money and count figures come straight from the server. Payroll does NOT:
// the RPC returns hours only, and the pay engine in payroll.ts converts them.
// That is deliberate — rates, overtime, driver mode and custom pay formulas
// live in exactly one place, so this can't drift from Reports or the Payroll
// page.

import { computePayrollRowsFromAggregates, normalizePayrollConfig } from './payroll';
import { formulaJobFieldRefs } from './payrollFormula';
import { jobsSummaryAggregates, type JobsSummary } from './jobsQuery';

export interface JobsSummaryTotals {
  jobCount: number;
  /** Σ jobs.total_amount. Reads 0 for businesses that price on the invoice. */
  totalAmount: number;
  /** Crew hours (jobs.total_hours), excluding driver hours. */
  totalHours: number;
  totalDriverHours: number;
  /** Estimated labor cost. null when the caller can't see pay data. */
  estimatedPayroll: number | null;
  /** People credited hours in this set. null when pay data is hidden. */
  workerCount: number | null;
  /** Salaried crew whose cost can't be attributed to a job set — surfaced so
   *  the UI can say the estimate excludes them rather than silently under-
   *  reporting. null when pay data is hidden. */
  salariedCount: number | null;
  /** status → job count, ordered by the pipeline, only non-zero entries. */
  byStatus: Array<{ status: string; count: number }>;
  /** Mean value per job, or null when nothing is priced (avoids 0/0 → NaN). */
  avgAmount: number | null;
}

// Pipeline order, mirroring STATUS_SORT_ORDER in jobSort.ts so the breakdown
// reads in the same order as the tabs.
const STATUS_ORDER = [
  'proposal', 'sent', 'accepted', 'posible', 'scheduled',
  'in_progress', 'completed', 'invoiced', 'declined', 'cancelled',
];

/** The job custom-field keys a business's pay formula reads — pass to
 *  fetchJobsSummary so formula-based pay resolves. Empty when no formula. */
export function payrollJcfKeys(payrollConfig: unknown): string[] {
  const cfg = normalizePayrollConfig(payrollConfig ?? null);
  if (!cfg.formula) return [];
  return Array.from(new Set(formulaJobFieldRefs(cfg.formula).map((r) => r.k))).sort();
}

/**
 * @param includePay false for roles without the Employees permission — pay
 *   fields come back null rather than 0, so the UI omits the section instead of
 *   showing a wrong "$0".
 */
export function computeJobsSummaryTotals(
  summary: JobsSummary,
  payrollConfig: unknown,
  includePay: boolean,
): JobsSummaryTotals {
  const byStatus = STATUS_ORDER
    .map((status) => ({ status, count: Number(summary.byStatus[status] ?? 0) || 0 }))
    .filter((r) => r.count > 0);
  // Any status the server returned that isn't in the pipeline list (legacy or
  // future values) still gets shown — dropping rows would make the breakdown
  // fail to add up to jobCount.
  for (const [status, count] of Object.entries(summary.byStatus)) {
    if (!STATUS_ORDER.includes(status) && Number(count) > 0) {
      byStatus.push({ status, count: Number(count) });
    }
  }

  const base: JobsSummaryTotals = {
    jobCount: summary.jobCount,
    totalAmount: summary.totalAmount,
    totalHours: summary.totalHours,
    totalDriverHours: summary.totalDriverHours,
    estimatedPayroll: null,
    workerCount: null,
    salariedCount: null,
    byStatus,
    avgAmount: summary.jobCount > 0 && summary.totalAmount > 0
      ? summary.totalAmount / summary.jobCount
      : null,
  };
  if (!includePay) return base;

  const cfg = normalizePayrollConfig(payrollConfig ?? null);
  const rows = computePayrollRowsFromAggregates({
    aggregates: jobsSummaryAggregates(summary),
    // A filtered job set is not a pay period, so there is no window to apply
    // overtime against. '1900-01-01' is the same all-time sentinel the reports
    // path uses: it makes the OT threshold effectively unreachable, so hours
    // are paid straight. Overtime is a period-level concept and belongs to the
    // Payroll page, not to an arbitrary filter.
    period: { startStr: '1900-01-01', endStr: '9999-12-31' },
    includeZero: false,
    config: cfg,
  });
  return {
    ...base,
    estimatedPayroll: rows.reduce((s, r) => s + r.pay, 0),
    workerCount: rows.length,
    salariedCount: summary.employees.filter(
      (e) => e.pay_type === 'salary' && (Number(e.worked_hours) || 0) > 0,
    ).length,
  };
}

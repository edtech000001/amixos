// Current pay period's payroll total, for the dashboard tile.
//
// Deliberately reuses the payroll screen's exact pipeline — the
// payroll_period_inputs RPC (migration 186) for hours, then
// computePayrollRowsFromAggregates for the money. Pay rules are genuinely
// intricate (overtime thresholds and multipliers, daily vs hourly vs salary,
// driver pay modes, custom formulas reading job custom fields), and a tile
// that "roughly" totalled them would disagree with the Payroll screen it links
// to. A number on the dashboard that doesn't match the page one tap away is
// worse than no number.
//
// One RPC, no ledger: the ledger call fetches payments and loans, which the
// tile doesn't show.

import {
  computePayrollRowsFromAggregates,
  getPayrollPeriod,
  normalizeFrequency,
  normalizePayrollConfig,
  parsePayrollAnchor,
  type PayrollBreakdown,
  type PayrollPeriod,
} from './payroll';
import { formulaJobFieldRefs } from './payrollFormula';

// PromiseLike, not Promise: supabase-js returns a thenable query builder from
// rpc(), which awaits identically but is not a Promise instance.
type Supa = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** The business fields this needs — a subset, so callers can pass their
 *  existing business object without widening any types. */
export interface PayrollSummaryBusiness {
  id: string;
  payroll_frequency?: string | null;
  payroll_anchor_date?: string | null;
  payroll_custom_days?: number | null;
  payroll_config?: unknown;
}

export interface PayrollPeriodSummary {
  /** Gross pay for everyone in the period. */
  total: number;
  /** Hours behind that total (worked + driven, per the same rules). */
  hours: number;
  /** How many workers have any hours — 0 means nothing has been logged yet. */
  workers: number;
  /** Per-worker rows, highest pay first — what the tile shows at md/lg so the
   *  extra space buys content rather than whitespace. */
  top: { id: string; name: string; pay: number; hours: number }[];
  /** Same figure for the PREVIOUS period, so the tile can say which way payroll
   *  is moving. Null when it couldn't be read — the tile then omits the
   *  comparison rather than implying a drop to zero. */
  previousTotal: number | null;
  period: PayrollPeriod;
}

export function currentPayrollPeriod(
  business: PayrollSummaryBusiness,
  /** 0 = the open period, -1 = the one before it. */
  offset = 0,
): PayrollPeriod {
  return getPayrollPeriod(
    normalizeFrequency(business.payroll_frequency),
    new Date(),
    offset,
    parsePayrollAnchor(business.payroll_anchor_date ?? null),
    business.payroll_custom_days ?? null,
  );
}

interface RawInput {
  employee_id: string; first_name: string; last_name: string;
  pay_rate: number | string; pay_type: string; active: boolean | null;
  overtime_eligible: boolean | null; overtime_threshold: number | string | null;
  overtime_multiplier: number | string | null; custom_fields: Record<string, unknown> | null;
  worked_hours: number | string; driven_hours: number | string; jobs_driven: number | string;
  jcf_raw: Record<string, unknown[]> | null; breakdown: PayrollBreakdown;
}

function toAggregates(rows: RawInput[]) {
  return rows.map(r => ({
    employee: {
      id: r.employee_id,
      first_name: r.first_name,
      last_name: r.last_name,
      pay_rate: Number(r.pay_rate) || 0,
      pay_type: r.pay_type,
      overtime_eligible: r.overtime_eligible,
      overtime_threshold: r.overtime_threshold == null ? null : Number(r.overtime_threshold),
      overtime_multiplier: r.overtime_multiplier == null ? null : Number(r.overtime_multiplier),
      custom_fields: r.custom_fields,
    },
    active: r.active !== false,
    worked: Number(r.worked_hours) || 0,
    driven: Number(r.driven_hours) || 0,
    jobsDriven: Number(r.jobs_driven) || 0,
    jcfRaw: r.jcf_raw,
    breakdown: r.breakdown,
  }));
}

/**
 * Throws nothing: a dashboard tile must not be able to break the dashboard.
 * On any failure it returns zeros, and the caller renders an empty state
 * rather than an error.
 */
export async function fetchPayrollPeriodSummary(
  supabase: Supa,
  business: PayrollSummaryBusiness,
): Promise<PayrollPeriodSummary> {
  const period = currentPayrollPeriod(business);
  const empty: PayrollPeriodSummary = { total: 0, hours: 0, workers: 0, top: [], previousTotal: null, period };

  const config = normalizePayrollConfig(business.payroll_config);
  // Only the job custom fields the active formula actually reads — the RPC
  // collects raw values per key, so asking for everything would be wasteful.
  const jcfKeys = Array.from(
    new Set((config.formula ? formulaJobFieldRefs(config.formula) : []).map(r => r.k)),
  ).sort();

  // Both periods go through the SAME pipeline. The comparison is only
  // meaningful if the two numbers are computed identically — a "previous
  // total" from a cheaper approximation would show phantom swings whenever the
  // pay rules (overtime, driver pay, formulas) did any real work.
  const rowsFor = async (per: PayrollPeriod) => {
    const { data, error } = await supabase.rpc('payroll_period_inputs', {
      p_business_id: business.id,
      p_start: per.startStr,
      p_end: per.endStr,
      p_jcf_keys: jcfKeys.length ? jcfKeys : null,
    });
    if (error || !data) return null;
    return computePayrollRowsFromAggregates({
      aggregates: toAggregates(data as RawInput[]),
      period: per,
      includeZero: false,
      config,
    });
  };

  const { data, error } = await supabase.rpc('payroll_period_inputs', {
    p_business_id: business.id,
    p_start: period.startStr,
    p_end: period.endStr,
    p_jcf_keys: jcfKeys.length ? jcfKeys : null,
  });
  if (error || !data) return empty;

  const aggregates = toAggregates(data as RawInput[]);

  // includeZero: false — a worker with no hours contributes nothing to the
  // total, and counting them would make "3 workers" mean "3 on the roster"
  // rather than "3 worked this period".
  const rows = computePayrollRowsFromAggregates({
    aggregates,
    period,
    includeZero: false,
    config,
  });

  // Previous period, for the trend line at lg. Runs after the current one
  // rather than in parallel: it is secondary information, and a dashboard tile
  // should not fire two heavy RPCs at once on a phone connection.
  const prevRows = await rowsFor(currentPayrollPeriod(business, -1));

  return {
    previousTotal: prevRows ? prevRows.reduce((sum, r) => sum + (r.pay || 0), 0) : null,
    total: rows.reduce((sum, r) => sum + (r.pay || 0), 0),
    hours: rows.reduce((sum, r) => sum + (r.hours || 0), 0),
    workers: rows.length,
    // Highest pay first: on a tile that shows only the first few, the ones
    // worth surfacing are the ones moving the total.
    top: [...rows]
      .sort((a, b) => (b.pay || 0) - (a.pay || 0))
      .map(r => ({ id: r.employeeId, name: r.name, pay: r.pay || 0, hours: r.hours || 0 })),
    period,
  };
}

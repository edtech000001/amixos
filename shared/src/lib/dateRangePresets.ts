import { getPayrollPeriod, normalizeFrequency, parsePayrollAnchor } from './payroll';

// Quick presets for date-range filters (map weather filter, jobs list, …).
// Shared by web and mobile so both platforms offer the identical chip row:
// Hoy · Ayer · Últimos 2 días · Últimos 5 días.

/** Local YYYY-MM-DD, `days` ago (not toISOString — that's UTC and drifts). */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DateRangePreset {
  label: string;
  from: string;
  to: string;
}

/**
 * Build the labeled preset list. Ranges are inclusive and end today except
 * "yesterday" (a single day). Compute at open/render time so a screen left
 * mounted past midnight doesn't serve stale ranges.
 */
export function buildDateRangePresets(labels: {
  today: string;
  yesterday: string;
  last2Days: string;
  last5Days: string;
}): DateRangePreset[] {
  const today = isoDaysAgo(0);
  return [
    { label: labels.today, from: today, to: today },
    { label: labels.yesterday, from: isoDaysAgo(1), to: isoDaysAgo(1) },
    { label: labels.last2Days, from: isoDaysAgo(1), to: today },
    { label: labels.last5Days, from: isoDaysAgo(4), to: today },
  ];
}

/**
 * Wider presets for payroll/history filters: weeks (Sunday-start, matching
 * the app's payroll default), months and years. "Last 2 weeks" = last week's
 * start through this week's end — the span a biweekly period lives in.
 */
export function buildHistoryRangePresets(
  labels: {
    thisPeriod: string;
    lastPeriod: string;
    thisWeek: string;
    lastWeek: string;
    last2Weeks: string;
    thisMonth: string;
    lastMonth: string;
    thisYear: string;
    lastYear: string;
  },
  /** Business payroll settings — adds "this/last pay period" presets that
   *  match the Payroll screen's periods exactly. */
  payPeriod?: { frequency: unknown; anchorDate: unknown },
): DateRangePreset[] {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const periodPresets: DateRangePreset[] = [];
  if (payPeriod) {
    const freq = normalizeFrequency(payPeriod.frequency);
    const anchor = parsePayrollAnchor(payPeriod.anchorDate);
    const cur = getPayrollPeriod(freq, now, 0, anchor);
    const prev = getPayrollPeriod(freq, now, -1, anchor);
    periodPresets.push(
      { label: labels.thisPeriod, from: cur.startStr, to: cur.endStr },
      { label: labels.lastPeriod, from: prev.startStr, to: prev.endStr },
    );
  }
  const shift = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return [
    ...periodPresets,
    { label: labels.thisWeek, from: ymd(weekStart), to: ymd(shift(weekStart, 6)) },
    { label: labels.lastWeek, from: ymd(shift(weekStart, -7)), to: ymd(shift(weekStart, -1)) },
    { label: labels.last2Weeks, from: ymd(shift(weekStart, -7)), to: ymd(shift(weekStart, 6)) },
    { label: labels.thisMonth, from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
    { label: labels.lastMonth, from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { label: labels.thisYear, from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` },
    { label: labels.lastYear, from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` },
  ];
}

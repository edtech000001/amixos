import { getPayrollPeriod, normalizeCustomDays, normalizeFrequency, parsePayrollAnchor } from './payroll';

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
  /** Stable id ('thisPeriod', 'lastWeek', …) — persisted so a saved filter
   *  re-resolves to the CURRENT range instead of pinning old dates. */
  key: string;
  label: string;
  from: string;
  to: string;
}

/** A preset the user tapped, plus the exact range it produced at the time. */
export interface AppliedDatePreset {
  key: string;
  from: string;
  to: string;
}

export function toAppliedDatePreset(p: DateRangePreset | null | undefined): AppliedDatePreset | null {
  return p ? { key: p.key, from: p.from, to: p.to } : null;
}

/** Tolerant parse of a stored AppliedDatePreset (bad/old data → null). */
export function parseAppliedDatePreset(o: unknown): AppliedDatePreset | null {
  if (!o || typeof o !== 'object') return null;
  const { key, from, to } = o as Record<string, unknown>;
  return typeof key === 'string' && typeof from === 'string' && typeof to === 'string' ? { key, from, to } : null;
}

/**
 * Relative presets roll forward: when the filter still holds exactly the range
 * a preset produced (the user hasn't edited or cleared it since) and that
 * preset now resolves to different dates — e.g. "This pay period" after the
 * period turned over — return the fresh range. Otherwise null (no change).
 * Pay-period presets only exist once payroll settings load, so a missing
 * preset keeps the saved range untouched until it appears.
 */
export function rollDatePreset(
  presets: DateRangePreset[],
  applied: AppliedDatePreset | null,
  from: string | null,
  to: string | null,
): AppliedDatePreset | null {
  if (!applied || from !== applied.from || to !== applied.to) return null;
  const live = presets.find(p => p.key === applied.key);
  if (!live || (live.from === from && live.to === to)) return null;
  return toAppliedDatePreset(live);
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
    { key: 'today', label: labels.today, from: today, to: today },
    { key: 'yesterday', label: labels.yesterday, from: isoDaysAgo(1), to: isoDaysAgo(1) },
    { key: 'last2Days', label: labels.last2Days, from: isoDaysAgo(1), to: today },
    { key: 'last5Days', label: labels.last5Days, from: isoDaysAgo(4), to: today },
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
  payPeriod?: { frequency: unknown; anchorDate: unknown; customDays?: unknown },
): DateRangePreset[] {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const periodPresets: DateRangePreset[] = [];
  if (payPeriod) {
    const freq = normalizeFrequency(payPeriod.frequency);
    const anchor = parsePayrollAnchor(payPeriod.anchorDate);
    const cd = payPeriod.customDays != null ? normalizeCustomDays(payPeriod.customDays) : null;
    const cur = getPayrollPeriod(freq, now, 0, anchor, cd);
    const prev = getPayrollPeriod(freq, now, -1, anchor, cd);
    periodPresets.push(
      { key: 'thisPeriod', label: labels.thisPeriod, from: cur.startStr, to: cur.endStr },
      { key: 'lastPeriod', label: labels.lastPeriod, from: prev.startStr, to: prev.endStr },
    );
  }
  const shift = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return [
    ...periodPresets,
    { key: 'thisWeek', label: labels.thisWeek, from: ymd(weekStart), to: ymd(shift(weekStart, 6)) },
    { key: 'lastWeek', label: labels.lastWeek, from: ymd(shift(weekStart, -7)), to: ymd(shift(weekStart, -1)) },
    { key: 'last2Weeks', label: labels.last2Weeks, from: ymd(shift(weekStart, -7)), to: ymd(shift(weekStart, 6)) },
    { key: 'thisMonth', label: labels.thisMonth, from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) },
    { key: 'lastMonth', label: labels.lastMonth, from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) },
    { key: 'thisYear', label: labels.thisYear, from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` },
    { key: 'lastYear', label: labels.lastYear, from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` },
  ];
}

// Payroll history comparison (Reports → Payroll → History → Compare): totals
// per month / year for one worker or everyone, from the saved payroll checks.
// A check counts in the month its pay period ENDS (imports have no real pay date).

export type PayTotals = { gross: number; hours: number; count: number };
type Entry = { employeeId: string | null; periodEnd: string; grossPay: number; hours: number; driverHours: number };

const ZERO: PayTotals = { gross: 0, hours: 0, count: 0 };

/** 'YYYY-MM' → totals. `employeeId` null = everyone. */
export function payrollByMonth(entries: Entry[], employeeId: string | null): Map<string, PayTotals> {
  const out = new Map<string, PayTotals>();
  for (const e of entries) {
    if (employeeId && e.employeeId !== employeeId) continue;
    const k = e.periodEnd.slice(0, 7);
    const t = out.get(k) ?? { ...ZERO };
    t.gross += Number(e.grossPay) || 0;
    t.hours += (Number(e.hours) || 0) + (Number(e.driverHours) || 0);
    t.count += 1;
    out.set(k, t);
  }
  return out;
}

export type CompareRow = { key: string; cur: PayTotals; prev: PayTotals; prevYear: PayTotals };

/** 12 rows for `year`: each month vs the month before and the same month last year. */
export function monthRows(byMonth: Map<string, PayTotals>, year: number): CompareRow[] {
  const get = (y: number, m: number) => byMonth.get(`${y}-${String(m).padStart(2, '0')}`) ?? ZERO;
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      key: `${year}-${String(m).padStart(2, '0')}`,
      cur: get(year, m),
      prev: m === 1 ? get(year - 1, 12) : get(year, m - 1),
      prevYear: get(year - 1, m),
    };
  });
}

/** One row per year with data, newest first; `prev` = the year before. */
export function yearRows(byMonth: Map<string, PayTotals>): CompareRow[] {
  const years = new Map<number, PayTotals>();
  byMonth.forEach((t, k) => {
    const y = Number(k.slice(0, 4));
    const s = years.get(y) ?? { ...ZERO };
    s.gross += t.gross; s.hours += t.hours; s.count += t.count;
    years.set(y, s);
  });
  return Array.from(years.keys()).sort((a, b) => b - a).map(y => {
    const prev = years.get(y - 1) ?? ZERO;
    return { key: String(y), cur: years.get(y)!, prev, prevYear: prev };
  });
}

/** % change, null when there's nothing to compare against. */
export function pctChange(cur: number, prev: number): number | null {
  return prev ? ((cur - prev) / prev) * 100 : null;
}

/** Distinct workers in the history, by name. */
export function payrollWorkers(entries: { employeeId: string | null; name: string }[]): { id: string; name: string }[] {
  const m = new Map<string, string>();
  for (const e of entries) if (e.employeeId && !m.has(e.employeeId)) m.set(e.employeeId, e.name);
  return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

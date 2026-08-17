// Rentals analytics — every number the Overview renders, as pure functions so
// web and mobile show identical figures and the math is testable in isolation.
//
// Two deliberate accounting conventions, because mixing them silently is how
// landlord dashboards start lying:
//   · MONTH VIEW (rent roll, KPIs) is ACCRUAL against the selected month's
//     charges: "of what I billed for June, how much came in" — no matter when
//     the tenant actually paid.
//   · TREND / YTD / STATEMENT is CASH by date: payments counted in the month
//     they were received (paid_on), expenses in the month they were spent
//     (expense_date). That is what an owner statement means by income.
// `billed` is carried alongside so a caller can show both without recomputing.
//
// All dates are date-only strings; comparisons use string prefixes (ISO sorts
// lexicographically) instead of Date math, which sidesteps timezones entirely.

import {
  PAY_TOLERANCE,
  chargeDaysLate,
  occupancy,
  type RentalCharge,
  type RentalExpense,
  type RentalLease,
  type RentalPayment,
  type RentalProperty,
} from './rentals';

const pad = (n: number) => String(n).padStart(2, '0');

/** Canonical first-of-month key for a date-only string ('2026-08-14' → '2026-08-01'). */
export function periodOf(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/** The current month's period key, in LOCAL time. */
export function currentPeriod(today: Date = new Date()): string {
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
}

/** Move a period key by whole months ('2026-01-01', -1 → '2025-12-01'). */
export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** First and last calendar day of a period, as date-only strings. */
export function monthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(y, m ?? 1, 0); // day 0 of next month = last of this one
  return { from: period, to: `${y}-${pad(m ?? 1)}-${pad(last.getDate())}` };
}

/** `count` period keys ending at (and including) `period`, oldest first. */
export function monthsBack(period: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftMonth(period, -i));
  return out;
}

/** Jan 1 of the period's year — the start of the YTD window. */
export function yearStart(period: string): string {
  return `${period.slice(0, 4)}-01-01`;
}

/** Total paid per charge id. */
export function paidByCharge(payments: Pick<RentalPayment, 'charge_id' | 'amount'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.charge_id, (m.get(p.charge_id) ?? 0) + p.amount);
  return m;
}

// ─── Selected-month summary (accrual against that month's charges) ───────────

export interface MonthSummary {
  billed: number;
  collected: number;
  outstanding: number;
  overdueAmount: number;
  overdueCount: number;
}

export function monthSummary(
  charges: Pick<RentalCharge, 'id' | 'amount' | 'due_date'>[],
  payments: Pick<RentalPayment, 'charge_id' | 'amount'>[],
  today: Date = new Date(),
): MonthSummary {
  const paid = paidByCharge(payments);
  let billed = 0, collected = 0, outstanding = 0, overdueAmount = 0, overdueCount = 0;
  for (const c of charges) {
    const p = paid.get(c.id) ?? 0;
    const remaining = Math.max(0, c.amount - p);
    billed += c.amount;
    collected += Math.min(p, c.amount);
    outstanding += remaining;
    if (remaining > PAY_TOLERANCE && chargeDaysLate(c, today) > 0) {
      overdueAmount += remaining;
      overdueCount += 1;
    }
  }
  return { billed, collected, outstanding, overdueAmount, overdueCount };
}

// ─── 12-month trend (cash basis) ─────────────────────────────────────────────

export interface MonthPoint {
  period: string;
  billed: number;
  income: number;
  expenses: number;
  net: number;
}

export function buildMonthlySeries(
  periods: string[],
  charges: Pick<RentalCharge, 'period_start' | 'amount'>[],
  payments: Pick<RentalPayment, 'paid_on' | 'amount'>[],
  expenses: Pick<RentalExpense, 'expense_date' | 'amount'>[],
): MonthPoint[] {
  const billedBy = new Map<string, number>();
  for (const c of charges) {
    const k = periodOf(c.period_start);
    billedBy.set(k, (billedBy.get(k) ?? 0) + c.amount);
  }
  const incomeBy = new Map<string, number>();
  for (const p of payments) {
    const k = periodOf(p.paid_on);
    incomeBy.set(k, (incomeBy.get(k) ?? 0) + p.amount);
  }
  const expenseBy = new Map<string, number>();
  for (const e of expenses) {
    const k = periodOf(e.expense_date);
    expenseBy.set(k, (expenseBy.get(k) ?? 0) + e.amount);
  }
  return periods.map(period => {
    const income = incomeBy.get(period) ?? 0;
    const exp = expenseBy.get(period) ?? 0;
    return { period, billed: billedBy.get(period) ?? 0, income, expenses: exp, net: income - exp };
  });
}

/** Cash totals between two date-only bounds (inclusive) — YTD and statements. */
export function cashTotals(
  from: string,
  to: string,
  payments: Pick<RentalPayment, 'paid_on' | 'amount'>[],
  expenses: Pick<RentalExpense, 'expense_date' | 'amount'>[],
): { income: number; expenses: number; net: number } {
  const income = payments
    .filter(p => p.paid_on >= from && p.paid_on <= to)
    .reduce((s, p) => s + p.amount, 0);
  const spent = expenses
    .filter(e => e.expense_date >= from && e.expense_date <= to)
    .reduce((s, e) => s + e.amount, 0);
  return { income, expenses: spent, net: income - spent };
}

// ─── Delinquency aging ───────────────────────────────────────────────────────

export interface AgingRow {
  leaseId: string;
  current: number;   // owed but not yet past due
  d1_30: number;
  d31_60: number;
  d60plus: number;
  total: number;
  oldestDays: number;
}

/**
 * Unpaid balance per lease bucketed by how long it has been past due. Buckets
 * are inclusive-left: a charge 30 days late lands in 1-30, one 31 days late in
 * 31-60, 61+ in 60+. Leases with nothing owed are omitted.
 */
export function agingBuckets(
  charges: Pick<RentalCharge, 'id' | 'lease_id' | 'amount' | 'due_date'>[],
  payments: Pick<RentalPayment, 'charge_id' | 'amount'>[],
  today: Date = new Date(),
): AgingRow[] {
  const paid = paidByCharge(payments);
  const rows = new Map<string, AgingRow>();
  for (const c of charges) {
    const remaining = c.amount - (paid.get(c.id) ?? 0);
    if (remaining <= PAY_TOLERANCE) continue;
    const days = chargeDaysLate(c, today);
    const row = rows.get(c.lease_id) ?? {
      leaseId: c.lease_id, current: 0, d1_30: 0, d31_60: 0, d60plus: 0, total: 0, oldestDays: 0,
    };
    if (days <= 0) row.current += remaining;
    else if (days <= 30) row.d1_30 += remaining;
    else if (days <= 60) row.d31_60 += remaining;
    else row.d60plus += remaining;
    row.total += remaining;
    row.oldestDays = Math.max(row.oldestDays, days);
    rows.set(c.lease_id, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

// ─── Portfolio health ────────────────────────────────────────────────────────

/** Σ deposits still in the landlord's hands (collected, not yet returned). */
export function depositsHeld(leases: Pick<RentalLease, 'deposit_amount' | 'deposit_returned_on'>[]): number {
  return leases
    .filter(l => l.deposit_amount != null && !l.deposit_returned_on)
    .reduce((s, l) => s + (l.deposit_amount ?? 0), 0);
}

/** Active leases ending within `days` (month-to-month excluded — never ends). */
export function upcomingExpirations<T extends Pick<RentalLease, 'end_date' | 'status'>>(
  leases: T[],
  days: number,
  today: Date = new Date(),
): T[] {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const limit = new Date(t.getFullYear(), t.getMonth(), t.getDate() + days);
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = toKey(t);
  const limitKey = toKey(limit);
  return leases
    .filter(l => l.status === 'active' && l.end_date && l.end_date >= todayKey && l.end_date <= limitKey)
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''));
}

/** Units with no active lease (capacity − occupied, via the shared occupancy). */
export function vacantUnits(
  properties: Pick<RentalProperty, 'id' | 'unit_count' | 'status'>[],
  activeLeases: Pick<RentalLease, 'property_id' | 'unit_label'>[],
): number {
  const { occupied, capacity } = occupancy(properties, activeLeases);
  return Math.max(0, capacity - occupied);
}

/** Active leases with no end date — renting month to month. */
export function monthToMonthCount(leases: Pick<RentalLease, 'end_date' | 'status'>[]): number {
  return leases.filter(l => l.status === 'active' && !l.end_date).length;
}

// ─── Per-property performance ────────────────────────────────────────────────

export interface PropertyPerf {
  propertyId: string;
  units: number;
  occupied: number;
  monthlyRentRoll: number;   // Σ rent of active leases
  billed: number;            // selected month
  collected: number;         // selected month (accrual)
  outstanding: number;       // all-time unpaid
  ytdIncome: number;         // cash
  ytdExpenses: number;
  ytdNet: number;
}

export function propertyPerformance(
  properties: Pick<RentalProperty, 'id' | 'unit_count' | 'status'>[],
  leases: Pick<RentalLease, 'id' | 'property_id' | 'unit_label' | 'monthly_rent' | 'status'>[],
  charges: Pick<RentalCharge, 'id' | 'property_id' | 'period_start' | 'amount' | 'due_date'>[],
  payments: Pick<RentalPayment, 'charge_id' | 'lease_id' | 'paid_on' | 'amount'>[],
  expenses: Pick<RentalExpense, 'property_id' | 'expense_date' | 'amount'>[],
  period: string,
  ytdFrom: string,
  ytdTo: string,
): PropertyPerf[] {
  const paid = paidByCharge(payments);
  const leaseProp = new Map(leases.map(l => [l.id, l.property_id]));

  return properties.map(prop => {
    const active = leases.filter(l => l.property_id === prop.id && l.status === 'active');
    const units = Math.max(1, prop.unit_count ?? 1);
    const occupiedUnits = new Set(active.map(l => l.unit_label ?? '__single__')).size;
    const propCharges = charges.filter(c => c.property_id === prop.id);

    let billed = 0, collected = 0, outstanding = 0;
    for (const c of propCharges) {
      const p = paid.get(c.id) ?? 0;
      outstanding += Math.max(0, c.amount - p);
      if (periodOf(c.period_start) === period) {
        billed += c.amount;
        collected += Math.min(p, c.amount);
      }
    }
    const ytdIncome = payments
      .filter(p => leaseProp.get(p.lease_id) === prop.id && p.paid_on >= ytdFrom && p.paid_on <= ytdTo)
      .reduce((s, p) => s + p.amount, 0);
    const ytdExpenses = expenses
      .filter(e => e.property_id === prop.id && e.expense_date >= ytdFrom && e.expense_date <= ytdTo)
      .reduce((s, e) => s + e.amount, 0);

    return {
      propertyId: prop.id,
      units,
      occupied: Math.min(occupiedUnits, units),
      monthlyRentRoll: active.reduce((s, l) => s + l.monthly_rent, 0),
      billed,
      collected,
      outstanding,
      ytdIncome,
      ytdExpenses,
      ytdNet: ytdIncome - ytdExpenses,
    };
  });
}

/** Expense totals grouped by category for the owner statement. */
export function expensesByCategory(
  expenses: Pick<RentalExpense, 'category' | 'expense_date' | 'amount'>[],
  from: string,
  to: string,
): { category: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const e of expenses) {
    if (e.expense_date < from || e.expense_date > to) continue;
    m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  }
  return Array.from(m.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

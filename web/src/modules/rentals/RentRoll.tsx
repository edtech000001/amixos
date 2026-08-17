'use client';

// Overview — the portfolio dashboard. Month-navigable rent roll plus the
// analytics a landlord actually runs the business on: collected vs billed,
// overdue money (not just a count), occupancy, deposits held, YTD cash, a
// 12-month income/expense trend, delinquency aging, per-property performance,
// and CSV / owner-statement exports.
//
// Every figure comes from shared/lib/rentalsAnalytics so mobile shows the same
// numbers. Two accounting conventions live here on purpose — see that file's
// header: the month KPIs are accrual against the month's charges, the trend
// and YTD are cash by payment/expense date.

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, Home,
} from 'lucide-react';
import {
  PAY_TOLERANCE,
  chargeDaysLate,
  chargeStatus,
  occupancy,
  tenantName,
  type RentalCharge,
  type RentalExpense,
  type RentalLease,
  type RentalPayment,
  type RentalProperty,
  type RentalTenant,
} from '@amixos/shared/lib/rentals';
import {
  agingBuckets,
  buildMonthlySeries,
  cashTotals,
  currentPeriod,
  depositsHeld,
  expensesByCategory,
  monthRange,
  monthSummary,
  monthToMonthCount,
  monthsBack,
  paidByCharge as paidByChargeMap,
  periodOf,
  propertyPerformance,
  shiftMonth,
  upcomingExpirations,
  vacantUnits,
  yearStart,
} from '@amixos/shared/lib/rentalsAnalytics';
import { buildRentalStatementHtml } from '@amixos/shared/lib/rentalsReportHtml';
import { fetchAllCharges, fetchAllPayments, fetchExpensesInRange } from '@amixos/shared/lib/rentalsQuery';
import { csvCell } from '@amixos/shared/lib/clientShare';
import { formatDateLong } from '@amixos/shared/lib/format';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { fmtMoney } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  supabase: any;
  businessId: string | null;
  properties: RentalProperty[];
  tenants: RentalTenant[];
  leases: RentalLease[];
  loading: boolean;
  onOpenProperty: (propertyId: string) => void;
}

export function RentRoll({ supabase, businessId, properties, tenants, leases, loading, onOpenProperty }: Props) {
  const { t: full, locale } = useLang();
  const { business } = useApp();
  const t = full.dashboard.modules.rentals;
  const ov = t.overview;

  // Selected month drives every accrual figure; the trend/YTD windows hang off it.
  const [period, setPeriod] = useState(() => currentPeriod());
  const [charges, setCharges] = useState<RentalCharge[]>([]);
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [expenses, setExpenses] = useState<RentalExpense[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const trendPeriods = useMemo(() => monthsBack(period, 12), [period]);
  const { from: monthFrom, to: monthTo } = useMemo(() => monthRange(period), [period]);
  const ytdFrom = useMemo(() => yearStart(period), [period]);

  // Charges + payments are fetched WHOLE (paginated): aging and all-time
  // balances need every row regardless of age, and having them in memory means
  // the trend and YTD need no extra round trips.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      try {
        const expFrom = trendPeriods[0] < ytdFrom ? trendPeriods[0] : ytdFrom;
        const [ch, pay, exp] = await Promise.all([
          fetchAllCharges(supabase, businessId),
          fetchAllPayments(supabase, businessId),
          fetchExpensesInRange(supabase, businessId, expFrom, monthTo),
        ]);
        if (cancelled) return;
        setCharges(ch);
        setPayments(pay);
        setExpenses(exp);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-pull when the lease set changes (a new lease materializes new charges).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, period, leases]);

  const monthName = useMemo(() => {
    const [y, m] = period.split('-').map(Number);
    const s = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'long', year: 'numeric' })
      .format(new Date(y, (m ?? 1) - 1, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [period, locale]);

  const shortMonth = (p: string) => {
    const [y, m] = p.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'short' })
      .format(new Date(y, (m ?? 1) - 1, 1));
  };

  const monthCharges = useMemo(
    () => charges.filter(c => periodOf(c.period_start) === period),
    [charges, period],
  );
  const paidMap = useMemo(() => paidByChargeMap(payments), [payments]);
  const summary = useMemo(() => monthSummary(monthCharges, payments), [monthCharges, payments]);
  const activeLeases = useMemo(() => leases.filter(l => l.status === 'active'), [leases]);
  const occ = useMemo(() => occupancy(properties, activeLeases), [properties, activeLeases]);
  const held = useMemo(() => depositsHeld(leases), [leases]);
  const ytd = useMemo(
    () => cashTotals(ytdFrom, monthTo, payments, expenses),
    [ytdFrom, monthTo, payments, expenses],
  );
  const series = useMemo(
    () => buildMonthlySeries(trendPeriods, charges, payments, expenses),
    [trendPeriods, charges, payments, expenses],
  );
  const aging = useMemo(() => agingBuckets(charges, payments), [charges, payments]);
  const perf = useMemo(
    () => propertyPerformance(properties, leases, charges, payments, expenses, period, ytdFrom, monthTo),
    [properties, leases, charges, payments, expenses, period, ytdFrom, monthTo],
  );
  const expiring = useMemo(() => upcomingExpirations(leases, 60), [leases]);
  const vacant = useMemo(() => vacantUnits(properties, activeLeases), [properties, activeLeases]);
  const mtm = useMemo(() => monthToMonthCount(leases), [leases]);

  const propOf = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);
  const tenantOf = useMemo(() => new Map(tenants.map(tn => [tn.id, tn])), [tenants]);
  const leaseOf = useMemo(() => new Map(leases.map(l => [l.id, l])), [leases]);

  const rows = useMemo(() => monthCharges
    .map(c => {
      const lease = leaseOf.get(c.lease_id);
      const prop = propOf.get(c.property_id);
      const tn = lease ? tenantOf.get(lease.tenant_id) : undefined;
      const paid = paidMap.get(c.id) ?? 0;
      return { charge: c, lease, property: prop, tenant: tn, paid, status: chargeStatus(c, paid), daysLate: chargeDaysLate(c) };
    })
    .sort((a, b) => {
      const rank = (s: string) => (s === 'late' ? 0 : s === 'partial' ? 1 : s === 'unpaid' ? 2 : 3);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return (a.property?.name ?? '').localeCompare(b.property?.name ?? '', 'es', { sensitivity: 'base' });
    }), [monthCharges, leaseOf, propOf, tenantOf, paidMap]);

  const chartData = useMemo(() => series.map(s => ({
    name: shortMonth(s.period),
    [ov.incomeLabel]: Math.round(s.income * 100) / 100,
    [ov.expensesLabel]: Math.round(s.expenses * 100) / 100,
  })), [series, ov, locale]);

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const head = [ov.propertyColumn, ov.tenantColumn, ov.rentColumn, ov.collectedColumn, ov.outstandingColumn, ov.statusColumn];
    const body = rows.map(r => [
      `${r.property?.name ?? ''}${r.lease?.unit_label ? ` · ${r.lease.unit_label}` : ''}`,
      r.tenant ? tenantName(r.tenant) : '',
      String(r.charge.amount),
      String(Math.min(r.paid, r.charge.amount)),
      String(Math.max(0, r.charge.amount - r.paid)),
      r.status,
    ]);
    const csv = [head, ...body].map(cols => cols.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rent-roll-${period.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const statementHtml = useMemo(() => {
    const income = perf
      .map(p => ({ label: propOf.get(p.propertyId)?.name ?? '—', amount: p.collected }))
      .filter(r => r.amount > PAY_TOLERANCE)
      .sort((a, b) => b.amount - a.amount);
    const catLabels = t.expenses.categories as unknown as Record<string, string>;
    const exp = expensesByCategory(expenses, monthFrom, monthTo)
      .map(r => ({ label: catLabels[r.category] ?? r.category, amount: r.amount }));
    return buildRentalStatementHtml({
      businessName: business?.name ?? '',
      logoUrl: business?.logo_url ?? null,
      businessLines: [
        [business?.address, business?.city, business?.state].filter(Boolean).join(', '),
        [business?.phone, business?.email].filter(Boolean).join(' · '),
      ].filter(Boolean),
      income,
      expenses: exp,
      labels: {
        title: ov.statementTitle.replace('{{month}}', monthName),
        incomeHeading: ov.statementIncomeHeading,
        expensesHeading: ov.statementExpensesHeading,
        categoryColumn: ov.statementCategoryColumn,
        amountColumn: ov.statementAmountColumn,
        totalIncome: ov.statementTotalIncome,
        totalExpenses: ov.statementTotalExpenses,
        net: ov.statementNet,
        generatedOn: ov.statementGeneratedOn.replace('{{date}}', formatDateLong(new Date(), full.dashboard.dateLocale)),
      },
    });
  }, [perf, propOf, expenses, monthFrom, monthTo, business, ov, monthName, t, full]);

  // The statement is a self-contained light-on-white document, so it prints
  // from its own window — no dashboard CSS to fight and no dark-mode leak.
  const printStatement = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(statementHtml);
    w.document.close();
    w.focus();
    // Give the logo a beat to load before the print dialog snapshots the page.
    setTimeout(() => w.print(), 250);
  };

  const chip = (status: string, daysLate: number) => {
    const cls =
      status === 'paid' ? 'bg-emerald-500/10 text-emerald-700'
      : status === 'partial' ? 'bg-amber-500/10 text-amber-700'
      : status === 'late' ? 'bg-red-500/10 text-red-700'
      : 'bg-border-soft text-muted';
    const label =
      status === 'paid' ? t.ledger.statusPaid
      : status === 'partial' ? t.ledger.statusPartial
      : status === 'late' ? t.ledger.statusLate
      : t.ledger.statusUnpaid;
    return (
      <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
        {label}{status === 'late' && daysLate > 0 ? ` · ${t.ledger.daysLate.replace('{{days}}', String(daysLate))}` : ''}
      </span>
    );
  };

  const tile = (label: string, value: string, tone?: string, sub?: string) => (
    <div className="rounded-2xl border border-border-soft bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tone ?? 'text-ink'}`}>{value}</p>
      {sub ? <p className="text-[11px] text-faint">{sub}</p> : null}
    </div>
  );

  if (loading || dataLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Month stepper + exports */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setPeriod(p => shiftMonth(p, -1))}
            className="p-2 rounded-lg hover:bg-surface text-muted" aria-label="◀">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-bold text-ink min-w-[9rem] text-center">{monthName}</span>
          <button onClick={() => setPeriod(p => shiftMonth(p, 1))}
            className="p-2 rounded-lg hover:bg-surface text-muted" aria-label="▶">
            <ChevronRight size={18} />
          </button>
          {period !== currentPeriod() ? (
            <button onClick={() => setPeriod(currentPeriod())}
              className="ml-1 text-xs font-semibold text-primary hover:underline">
              {ov.todayBtn}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-soft text-xs font-semibold text-muted hover:bg-surface">
            <Download size={14} /> {ov.exportCsvBtn}
          </button>
          <button onClick={printStatement}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-soft text-xs font-semibold text-muted hover:bg-surface">
            <FileText size={14} /> {ov.statementBtn}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {tile(ov.collectedLabel, fmtMoney(summary.collected), 'text-emerald-600')}
        {tile(ov.billedLabel, fmtMoney(summary.billed))}
        {tile(ov.outstandingLabel, fmtMoney(summary.outstanding), summary.outstanding > PAY_TOLERANCE ? 'text-red-600' : undefined)}
        {tile(ov.overdueAmountLabel, fmtMoney(summary.overdueAmount), summary.overdueAmount > PAY_TOLERANCE ? 'text-red-600' : undefined,
          `${summary.overdueCount} ${ov.overdueLabel.toLowerCase()}`)}
        {tile(ov.occupancyLabel, occ.capacity > 0 ? `${Math.round((occ.occupied / occ.capacity) * 100)}%` : '—', undefined,
          ov.occupiedOf.replace('{{occupied}}', String(occ.occupied)).replace('{{capacity}}', String(occ.capacity)))}
        {tile(ov.depositsHeldLabel, fmtMoney(held))}
      </div>

      {/* YTD */}
      <div className="rounded-2xl border border-border-soft bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{ov.ytdHeading}</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted">{ov.ytdIncomeLabel}</p>
            <p className="text-lg font-bold text-emerald-600">{fmtMoney(ytd.income)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{ov.ytdExpensesLabel}</p>
            <p className="text-lg font-bold text-red-600">{fmtMoney(ytd.expenses)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{ov.ytdNetLabel}</p>
            <p className={`text-lg font-bold ${ytd.net >= 0 ? 'text-ink' : 'text-red-600'}`}>{fmtMoney(ytd.net)}</p>
          </div>
        </div>
      </div>

      {/* 12-month trend */}
      <div className="rounded-2xl border border-border-soft bg-card p-4">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-sm font-bold text-ink">{ov.trendHeading}</p>
          <p className="text-[11px] text-faint">{ov.trendHint}</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
              tickFormatter={v => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={ov.incomeLabel} fill="#0D9488" radius={[4, 4, 0, 0]} />
            <Bar dataKey={ov.expensesLabel} fill="#F97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Needs attention */}
      <div className="rounded-2xl border border-border-soft bg-card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-2">{ov.attentionHeading}</p>
        {expiring.length === 0 && vacant === 0 && mtm === 0 ? (
          <p className="text-sm text-muted">{ov.allGood}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {expiring.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700">
                <AlertTriangle size={12} /> {ov.expiringSoon.replace('{{count}}', String(expiring.length))}
              </span>
            ) : null}
            {vacant > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-700">
                <Home size={12} /> {ov.vacantUnits.replace('{{count}}', String(vacant))}
              </span>
            ) : null}
            {mtm > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-border-soft text-muted">
                {ov.monthToMonth.replace('{{count}}', String(mtm))}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Delinquency aging */}
      <div>
        <h2 className="text-sm font-bold text-ink mb-2.5">{ov.agingHeading}</h2>
        {aging.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border-soft p-6 text-center">
            <p className="text-sm text-muted">{ov.agingEmpty}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border-soft bg-card overflow-x-auto">
            <table className="w-full min-w-[38rem]">
              <thead>
                <tr className="border-b border-border-soft bg-surface">
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-faint px-4 py-2">{ov.tenantColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.agingCurrent}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.aging1_30}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.aging31_60}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.aging60plus}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-4 py-2">{ov.agingTotal}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {aging.map(a => {
                  const lease = leaseOf.get(a.leaseId);
                  const tn = lease ? tenantOf.get(lease.tenant_id) : undefined;
                  const prop = lease ? propOf.get(lease.property_id) : undefined;
                  return (
                    <tr key={a.leaseId} className="hover:bg-surface cursor-pointer"
                      onClick={() => prop && onOpenProperty(prop.id)}>
                      <td className="px-4 py-2.5">
                        <p className="text-sm text-ink">{tn ? tenantName(tn) : '—'}</p>
                        <p className="text-[11px] text-faint">{prop?.name ?? '—'}{lease?.unit_label ? ` · ${lease.unit_label}` : ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-muted">{a.current > 0 ? fmtMoney(a.current) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-amber-700">{a.d1_30 > 0 ? fmtMoney(a.d1_30) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-orange-700">{a.d31_60 > 0 ? fmtMoney(a.d31_60) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-sm text-red-700">{a.d60plus > 0 ? fmtMoney(a.d60plus) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-ink">{fmtMoney(a.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-property performance */}
      {properties.length > 0 ? (
        <div>
          <h2 className="text-sm font-bold text-ink mb-2.5">{ov.propertiesHeading}</h2>
          <div className="rounded-2xl border border-border-soft bg-card overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead>
                <tr className="border-b border-border-soft bg-surface">
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-faint px-4 py-2">{ov.propertyColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.unitsColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.rentRollColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.collectedColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-3 py-2">{ov.outstandingColumn}</th>
                  <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-faint px-4 py-2">{ov.ytdNetColumn}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {perf.map(p => (
                  <tr key={p.propertyId} className="hover:bg-surface cursor-pointer" onClick={() => onOpenProperty(p.propertyId)}>
                    <td className="px-4 py-2.5 text-sm text-ink">{propOf.get(p.propertyId)?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-muted">{p.occupied}/{p.units}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-ink">{fmtMoney(p.monthlyRentRoll)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-emerald-600">{fmtMoney(p.collected)}</td>
                    <td className={`px-3 py-2.5 text-right text-sm ${p.outstanding > PAY_TOLERANCE ? 'text-red-600' : 'text-muted'}`}>{fmtMoney(p.outstanding)}</td>
                    <td className={`px-4 py-2.5 text-right text-sm font-semibold ${p.ytdNet >= 0 ? 'text-ink' : 'text-red-600'}`}>{fmtMoney(p.ytdNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Selected month's rent roll */}
      <div>
        <h2 className="text-sm font-bold text-ink mb-2.5">{ov.monthTitle.replace('{{month}}', monthName)}</h2>
        {rows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
            <Home size={28} className="text-faint mx-auto mb-2" />
            <p className="text-sm text-muted">{ov.noLeases}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border-soft bg-card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-4 py-2 border-b border-border-soft bg-surface">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{ov.propertyColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{ov.tenantColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint text-right w-24">{ov.rentColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint w-32 text-right">{ov.statusColumn}</p>
            </div>
            <div className="divide-y divide-border-soft">
              {rows.map(r => (
                <button
                  key={r.charge.id}
                  onClick={() => r.property && onOpenProperty(r.property.id)}
                  className="w-full grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-1 sm:gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
                >
                  <p className="text-sm font-medium text-ink truncate">
                    {r.property?.name ?? '—'}{r.lease?.unit_label ? ` · ${r.lease.unit_label}` : ''}
                    {r.charge.kind !== 'rent' ? (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-700">
                        {r.charge.kind === 'late_fee' ? t.ledger.kindLateFee : t.ledger.kindOther}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted truncate">{r.tenant ? tenantName(r.tenant) : '—'}</p>
                  <p className="text-sm text-ink sm:text-right sm:w-24">
                    {r.status === 'partial'
                      ? t.ledger.paidOfAmount.replace('{{paid}}', fmtMoney(r.paid)).replace('{{total}}', fmtMoney(r.charge.amount))
                      : fmtMoney(r.charge.amount)}
                  </p>
                  <p className="sm:w-32 sm:text-right">{chip(r.status, r.daysLate)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

// Rent roll (Resumen tab): this month's charge per active lease with its
// payment status, plus stat tiles (collected / outstanding / overdue /
// occupancy) and a this-month income vs expenses strip.

import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Home } from 'lucide-react';
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
import { fetchChargesForMonth, fetchExpensesInRange, fetchPaymentsForCharges } from '@amixos/shared/lib/rentalsQuery';
import { useLang } from '@/i18n/LangProvider';
import { currentPeriodStart, fmtMoney } from './util';

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
  const t = full.dashboard.modules.rentals;

  const period = currentPeriodStart();
  const [charges, setCharges] = useState<RentalCharge[]>([]);
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [expenses, setExpenses] = useState<RentalExpense[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      try {
        const ch = await fetchChargesForMonth(supabase, businessId, period);
        const [pays, exp] = await Promise.all([
          fetchPaymentsForCharges(supabase, businessId, ch.map(c => c.id)),
          fetchExpensesInRange(
            supabase, businessId, period,
            // last day of the period month
            (() => {
              const [y, m] = period.split('-').map(Number);
              const last = new Date(y, m, 0);
              return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
            })(),
          ),
        ]);
        if (cancelled) return;
        setCharges(ch);
        setPayments(pays);
        setExpenses(exp);
      } finally {
        if (!cancelled) setMonthLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-pull when the lease set changes (new lease → new charge appears).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, period, leases]);

  const monthName = useMemo(() => {
    const [y, m] = period.split('-').map(Number);
    const s = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-MX', { month: 'long', year: 'numeric' })
      .format(new Date(y, (m ?? 1) - 1, 1));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [period, locale]);

  const paidByCharge = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.charge_id, (m.get(p.charge_id) ?? 0) + p.amount);
    return m;
  }, [payments]);

  const rows = useMemo(() => {
    const propOf = new Map(properties.map(p => [p.id, p]));
    const tenantOf = new Map(tenants.map(tn => [tn.id, tn]));
    const leaseOf = new Map(leases.map(l => [l.id, l]));
    return charges
      .map(c => {
        const lease = leaseOf.get(c.lease_id);
        const prop = propOf.get(c.property_id);
        const tn = lease ? tenantOf.get(lease.tenant_id) : undefined;
        const paid = paidByCharge.get(c.id) ?? 0;
        return {
          charge: c,
          lease,
          property: prop,
          tenant: tn,
          paid,
          status: chargeStatus(c, paid),
          daysLate: chargeDaysLate(c),
        };
      })
      .sort((a, b) => {
        const rank = (s: string) => (s === 'late' ? 0 : s === 'partial' ? 1 : s === 'unpaid' ? 2 : 3);
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        return (a.property?.name ?? '').localeCompare(b.property?.name ?? '', 'es', { sensitivity: 'base' });
      });
  }, [charges, properties, tenants, leases, paidByCharge]);

  const collected = rows.reduce((s, r) => s + Math.min(r.paid, r.charge.amount), 0);
  const outstanding = rows.reduce((s, r) => s + Math.max(0, r.charge.amount - r.paid), 0);
  const overdueCount = rows.filter(r => r.status === 'late').length;
  const occ = occupancy(properties, leases.filter(l => l.status === 'active'));
  const monthExpenses = expenses.reduce((s, e) => s + e.amount, 0);

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

  if (loading || monthLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-xs text-muted">{t.overview.collectedLabel}</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(collected)}</p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-xs text-muted">{t.overview.outstandingLabel}</p>
          <p className={`text-xl font-bold mt-1 ${outstanding > PAY_TOLERANCE ? 'text-red-600' : 'text-ink'}`}>{fmtMoney(outstanding)}</p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-xs text-muted">{t.overview.overdueLabel}</p>
          <p className="text-xl font-bold text-ink mt-1">{overdueCount}</p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-card p-4">
          <p className="text-xs text-muted">{t.overview.occupancyLabel}</p>
          <p className="text-xl font-bold text-ink mt-1">
            {occ.capacity > 0 ? `${Math.round((occ.occupied / occ.capacity) * 100)}%` : '—'}
          </p>
          <p className="text-[11px] text-faint">
            {t.overview.occupiedOf.replace('{{occupied}}', String(occ.occupied)).replace('{{capacity}}', String(occ.capacity))}
          </p>
        </div>
      </div>

      {/* Income vs expenses this month */}
      <div className="rounded-2xl border border-border-soft bg-card p-4 flex items-center gap-6">
        <CircleDollarSign size={20} className="text-teal-600 shrink-0" />
        <div>
          <p className="text-xs text-muted">{t.overview.incomeLabel}</p>
          <p className="text-sm font-bold text-emerald-600">{fmtMoney(collected)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t.overview.expensesLabel}</p>
          <p className="text-sm font-bold text-red-600">{fmtMoney(monthExpenses)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t.overview.netLabel}</p>
          <p className={`text-sm font-bold ${collected - monthExpenses >= 0 ? 'text-ink' : 'text-red-600'}`}>
            {fmtMoney(collected - monthExpenses)}
          </p>
        </div>
      </div>

      {/* This month's rent roll */}
      <div>
        <h2 className="text-sm font-bold text-ink mb-2.5">{t.overview.monthTitle.replace('{{month}}', monthName)}</h2>
        {rows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border-soft p-8 text-center">
            <Home size={28} className="text-faint mx-auto mb-2" />
            <p className="text-sm text-muted">{t.overview.noLeases}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border-soft bg-card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-4 py-2 border-b border-border-soft bg-surface">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t.overview.propertyColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{t.overview.tenantColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint text-right w-24">{t.overview.rentColumn}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint w-32 text-right">{t.overview.statusColumn}</p>
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

'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Banknote, FileText, Landmark, X, ChevronRight as Chevron, Wrench, Truck, Clock } from 'lucide-react';
import { useLang } from '../../i18n';
// Import DatePicker from its file, NOT the '../../ui' barrel: the barrel also
// re-exports DateRangeSheet (react-native-safe-area-context), which isn't a web
// dependency and breaks the Next.js build. This is the only web-reachable
// screen that pulled the barrel.
import { DatePicker } from '../../ui/DatePicker';
import type { PayrollFrequency, PayrollBreakdown } from '../../lib/payroll';

export type PayMethod = 'cash' | 'check' | 'wire';

export interface PayrollScreenRow {
  employeeId: string;
  name: string;
  hours: number;
  payRate: number;
  payType: string;
  pay: number;
  payment: { method: PayMethod; checkNumber: string | null } | null;
  /** Where the worker's hours came from (jobs + worked/driven split). */
  breakdown?: PayrollBreakdown;
}

export interface PayrollScreenProps {
  loading: boolean;
  frequency: PayrollFrequency;
  onFrequencyChange: (f: PayrollFrequency) => void;
  /** Pay-period start date (YYYY-MM-DD) anchoring every period, or null for legacy defaults. */
  anchorDate: string | null;
  onAnchorChange: (date: string) => void;
  periodLabel: string;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  rows: PayrollScreenRow[];
  onMarkPaid: (employeeId: string, method: PayMethod, checkNumber: string) => void;
  onUnmark: (employeeId: string) => void;
  onBack: () => void;
  canManage: boolean;
  busy?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const FREQS: PayrollFrequency[] = ['weekly', 'biweekly', 'monthly'];

export function PayrollScreen({
  loading,
  frequency,
  onFrequencyChange,
  anchorDate,
  onAnchorChange,
  periodLabel,
  onPrevPeriod,
  onNextPeriod,
  rows,
  onMarkPaid,
  onUnmark,
  onBack,
  canManage,
  busy,
}: PayrollScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;

  const [payRow, setPayRow] = useState<PayrollScreenRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  // Worker whose hours breakdown is open (which projects the hours came from).
  const [detailRow, setDetailRow] = useState<PayrollScreenRow | null>(null);

  const freqLabel: Record<PayrollFrequency, string> = {
    weekly: t.freqWeekly,
    biweekly: t.freqBiweekly,
    monthly: t.freqMonthly,
  };

  const methodLabel: Record<PayMethod, string> = {
    cash: t.methodCash,
    check: t.methodCheck,
    wire: t.methodWire,
  };

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalPay = rows.reduce((s, r) => s + r.pay, 0);
  const paidCount = rows.filter(r => r.payment).length;
  // Unpaid first, paid sink to the bottom. Stable sort preserves the pay-desc
  // order the rows already arrive in within each group.
  const sortedRows = [...rows].sort((a, b) => (a.payment ? 1 : 0) - (b.payment ? 1 : 0));

  const openPay = (row: PayrollScreenRow) => {
    setPayRow(row);
    setEditing(false);
    setMethod('cash');
    setCheckNumber('');
  };
  const openEdit = (row: PayrollScreenRow) => {
    if (!row.payment) return;
    setPayRow(row);
    setEditing(true);
    setMethod(row.payment.method);
    setCheckNumber(row.payment.checkNumber ?? '');
  };
  const confirmPay = () => {
    if (!payRow) return;
    onMarkPaid(payRow.employeeId, method, method === 'check' ? checkNumber.trim() : '');
    setPayRow(null);
  };
  const removePay = () => {
    if (!payRow) return;
    onUnmark(payRow.employeeId);
    setPayRow(null);
  };

  const paymentBadgeLabel = (payment: NonNullable<PayrollScreenRow['payment']>) =>
    payment.method === 'check' && payment.checkNumber
      ? `${t.checkPrefix}${payment.checkNumber}`
      : methodLabel[payment.method];

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-xs text-gray-400">{t.subtitle}</p>
        </div>
      </div>

      <div className="max-w-3xl flex flex-col gap-4">
        {/* Frequency selector */}
        {canManage && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.freqLabel}</p>
            <div className="flex gap-2 max-w-md">
              {FREQS.map(f => {
                const on = f === frequency;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onFrequencyChange(f)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${on ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {freqLabel[f]}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 max-w-md">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.anchorLabel}</p>
              <DatePicker value={anchorDate ?? ''} onChange={onAnchorChange} />
              <p className="text-[11px] text-gray-400 mt-1.5">{t.anchorHint}</p>
            </div>
          </div>
        )}

        {/* Period navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2 max-w-md">
          <button type="button" onClick={onPrevPeriod} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-900">{periodLabel}</span>
          <button type="button" onClick={onNextPeriod} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Summary */}
        <div className="flex gap-3 max-w-md">
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-400">{t.totalHours}</p>
            <p className="text-lg font-bold text-gray-900">{Math.round(totalHours * 100) / 100}</p>
          </div>
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-400">{t.totalPay}</p>
            <p className="text-lg font-bold text-primary">{fmt(totalPay)}</p>
          </div>
        </div>
        {rows.length > 0 && (
          <p className="text-xs text-gray-400 -mt-1">
            {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
          </p>
        )}

        {/* Worker rows */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">{t.empty}</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {sortedRows.map((r, i) => (
              <div key={r.employeeId} className={`px-5 py-3.5 flex items-center gap-4 ${i < sortedRows.length - 1 ? 'border-b border-gray-50' : ''}`}>
                {/* Name/hours area opens the hours breakdown. */}
                <button type="button" onClick={() => setDetailRow(r)} className="flex-1 min-w-0 flex items-center gap-2 text-left group">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary">{r.name}</p>
                    <p className="text-xs text-gray-400">
                      {Math.round(r.hours * 100) / 100} h · {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''}
                    </p>
                  </div>
                  <Chevron size={14} className="text-gray-300 group-hover:text-primary shrink-0" />
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-gray-900">{fmt(r.pay)}</span>
                  {r.payment ? (
                    <button
                      type="button"
                      onClick={() => canManage && openEdit(r)}
                      disabled={!canManage}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:hover:bg-emerald-100"
                      title={t.methodHeading}
                    >
                      <Check size={11} />
                      <span className="text-[11px] font-semibold">{paymentBadgeLabel(r.payment)}</span>
                    </button>
                  ) : canManage ? (
                    <button type="button" onClick={() => openPay(r)} disabled={busy} className="text-xs font-semibold text-primary hover:underline">
                      {t.markPaid}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mark-paid modal */}
      {payRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPayRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-lg font-bold text-gray-900">{payRow.name}</p>
                <p className="text-sm text-gray-500">{fmt(payRow.pay)} · {Math.round(payRow.hours * 100) / 100} h</p>
              </div>
              <button type="button" onClick={() => setPayRow(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.methodHeading}</p>
            <div className="flex gap-2 mb-4">
              {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                const on = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex-1 py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 border transition-colors ${on ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    <Icon size={16} />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>

            {method === 'check' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t.checkNumberLabel}</label>
                <input
                  value={checkNumber}
                  onChange={e => setCheckNumber(e.target.value)}
                  placeholder={t.checkNumberPlaceholder}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <button type="button" onClick={confirmPay} disabled={busy} className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {editing ? t.saveBtn : t.confirmBtn}
            </button>
            {editing && (
              <button type="button" onClick={removePay} disabled={busy} className="w-full py-3 mt-2 rounded-2xl text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50">
                {t.removePayment}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Worker hours breakdown */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDetailRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-gray-900">{detailRow.name}</p>
                <p className="text-sm text-gray-500">
                  {fmt(detailRow.pay)} · {Math.round(detailRow.hours * 100) / 100} h
                </p>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Worked vs driven vs logged stat cards */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([[Wrench, t.hoursWorked, detailRow.breakdown?.workedHours ?? 0], [Truck, t.hoursDriven, detailRow.breakdown?.drivenHours ?? 0], [Clock, t.hoursLogged, detailRow.breakdown?.loggedHours ?? 0]] as const).map(([Icon, label, val], i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
                  <Icon size={15} className="text-gray-400 mx-auto mb-1" />
                  <p className="text-base font-bold text-gray-900">{val}</p>
                  <p className="text-[11px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.projectsHeading}</p>
            {detailRow.breakdown && detailRow.breakdown.jobs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {detailRow.breakdown.jobs.map((j, i) => (
                  <div key={j.jobId ?? i} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{j.title || t.untitledJob}</p>
                      {j.date && <p className="text-[11px] text-gray-400">{j.date}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {j.workedHours > 0 && (
                        <p className="text-xs text-gray-600"><Wrench size={11} className="inline mr-1 text-gray-400" />{j.workedHours} h</p>
                      )}
                      {j.drivenHours > 0 && (
                        <p className="text-xs text-gray-600"><Truck size={11} className="inline mr-1 text-gray-400" />{j.drivenHours} h</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">{t.noBreakdown}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

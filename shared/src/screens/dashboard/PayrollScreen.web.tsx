'use client';

import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, Banknote, FileText, Landmark, X, ChevronRight as Chevron, Wrench, Truck, Clock, Settings, List, LayoutGrid, History, Trash2 } from 'lucide-react';
import { useLang } from '../../i18n';
// Import DatePicker from its file, NOT the '../../ui' barrel: the barrel also
// re-exports DateRangeSheet (react-native-safe-area-context), which isn't a web
// dependency and breaks the Next.js build. This is the only web-reachable
// screen that pulled the barrel.
import { DatePicker } from '../../ui/DatePicker';
import type { PayrollFrequency, PayrollBreakdown, PayrollConfig, DriverPayMode } from '../../lib/payroll';
import { getPayrollPeriod, parsePayrollAnchor } from '../../lib/payroll';
import {
  type FormulaFieldDef,
  type FormulaToken,
  type FormulaVar,
  FORMULA_VARS,
  OP_SYMBOLS,
  validateFormula,
} from '../../lib/payrollFormula';

export type PayMethod = 'cash' | 'check' | 'wire';

export interface PayrollPaymentEntry {
  id: string;
  method: PayMethod;
  checkNumber: string | null;
  bonus: number | null;
  grossPay: number;
  /** Hours this payment covers ("$800 for 25 h"). */
  hours: number | null;
  paidAt: string | null;
  /** Formula job-field counts this check paid for (label → number). */
  components?: Record<string, number> | null;
}


export interface PayrollScreenRow {
  employeeId: string;
  name: string;
  hours: number;
  payRate: number;
  payType: string;
  pay: number;
  // Pay-component detail for the row subtitle (0 = not applicable).
  overtimeHours?: number;
  driverPay?: number;
  drivenHours?: number;
  /** Payments recorded this period — a LEDGER: several partial checks can
   *  cover one period, each with the amount and the hours it covers. */
  payments?: PayrollPaymentEntry[];
  /** Formula job-field sums for the period (from computePayrollRows). */
  formulaJobFields?: Record<string, number>;
  /** Where the worker's hours came from (jobs + worked/driven split). */
  breakdown?: PayrollBreakdown;
}

export interface PayrollScreenProps {
  loading: boolean;
  frequency: PayrollFrequency;
  /** Days per period when frequency='custom'. */
  customDays?: number | null;
  onCustomDaysChange?: (days: number) => void;
  onFrequencyChange: (f: PayrollFrequency) => void;
  /** Pay-period start date (YYYY-MM-DD) anchoring every period, or null for legacy defaults. */
  anchorDate: string | null;
  onAnchorChange: (date: string) => void;
  periodLabel: string;
  /** Start (YYYY-MM-DD) of the period being viewed — the manual-payment
   *  dialog defaults its period selector to it. */
  periodStartStr?: string;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  rows: PayrollScreenRow[];
  /** Pay components (overtime / driver pay). Rendered under the frequency
   *  settings for managers; onConfigChange persists the whole object. */
  config: PayrollConfig;
  onConfigChange: (c: PayrollConfig) => void;
  /** Per-worker overtime (settings modal list). Changes save instantly. */
  onMarkPaid: (employeeId: string, method: PayMethod, checkNumber: string, bonus: number, amount: number, hoursCovered: number, components: Record<string, number> | null, periodStart?: string) => void;
  onDeletePayment: (paymentId: string) => void;
  /** Opens a job from the hours-breakdown list. */
  onJobPress?: (jobId: string, employeeId: string) => void;
  /** Re-opens this worker's hours breakdown on mount (back-from-job nav). */
  initialDetailEmployeeId?: string | null;
  /** Deletes EVERY payment of the period for one worker (confirmed in UI). */
  onClearPayments: (employeeId: string) => void;
  onBack: () => void;
  canManage: boolean;
  busy?: boolean;
  /** Custom fields offered in the formula builder palette (number/boolean/
   *  select only — text and dates are excluded by the callers). */
  formulaFields?: { emp: FormulaFieldDef[]; job: FormulaFieldDef[] };
  /** Opens the Payment history page (its own route now). */
  onHistoryPress?: () => void;
  /** Every employee (active first) — powers the manual "Registrar pago"
   *  dialog for people not on the period's list (owner checks, ex-workers). */
  allWorkers?: { id: string; name: string }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const FREQS: PayrollFrequency[] = ['weekly', 'biweekly', 'monthly', 'custom'];

export function PayrollScreen({
  loading,
  frequency,
  customDays,
  onCustomDaysChange,
  onFrequencyChange,
  anchorDate,
  onAnchorChange,
  periodLabel,
  periodStartStr,
  onPrevPeriod,
  onNextPeriod,
  rows,
  config,
  onConfigChange,
  onMarkPaid,
  onDeletePayment,
  onJobPress,
  initialDetailEmployeeId,
  onClearPayments,
  onBack,
  canManage,
  busy,
  formulaFields,
  onHistoryPress,
  allWorkers,
}: PayrollScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;

  // Settings modal — edits a DRAFT; nothing persists until Save.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftFreq, setDraftFreq] = useState<PayrollFrequency>(frequency);
  const [draftAnchor, setDraftAnchor] = useState<string>(anchorDate ?? '');
  const [draftCustomDays, setDraftCustomDays] = useState<string>(String(customDays ?? 7));
  const [draftConfig, setDraftConfig] = useState<PayrollConfig>(config);
  const openSettings = () => {
    setDraftFreq(frequency);
    setDraftAnchor(anchorDate ?? '');
    setDraftCustomDays(String(customDays ?? 7));
    setDraftConfig(config);
    setSettingsOpen(true);
  };
  const saveSettings = () => {
    const f = draftConfig.formula ?? null;
    if (f && f.length && validateFormula(f) !== null) return; // error shown inline
    const cleaned = { ...draftConfig, formula: f && f.length ? f : null };
    if (draftFreq !== frequency) onFrequencyChange(draftFreq);
    if (draftAnchor !== (anchorDate ?? '')) onAnchorChange(draftAnchor);
    const cd = Math.max(1, Math.min(90, parseInt(draftCustomDays, 10) || 7));
    if (draftFreq === 'custom' && cd !== (customDays ?? 7)) onCustomDaysChange?.(cd);
    if (JSON.stringify(cleaned) !== JSON.stringify(config)) onConfigChange(cleaned);
    setSettingsOpen(false);
  };

  // Formula builder — edits draftConfig.formula. [] = building (empty),
  // null = standard calculation.
  const [numEntry, setNumEntry] = useState('');
  const pushTok = (tok: FormulaToken) =>
    setDraftConfig(c => ({ ...c, formula: [...(c.formula ?? []), tok] }));
  const removeTok = (i: number) =>
    setDraftConfig(c => ({ ...c, formula: (c.formula ?? []).filter((_, j) => j !== i) }));
  const tokLabel = (tok: FormulaToken): string =>
    tok.t === 'var' ? t.formulaVarNames[tok.k]
    : tok.t === 'ecf' || tok.t === 'jcf' ? tok.label
    : tok.t === 'num' ? String(tok.v)
    : tok.t === 'op' ? OP_SYMBOLS[tok.v]
    : tok.t === 'lp' ? '(' : ')';
  const addNumEntry = () => {
    const v = parseFloat(numEntry);
    if (Number.isFinite(v)) { pushTok({ t: 'num', v }); setNumEntry(''); }
  };
  const formulaError =
    draftConfig.formula && draftConfig.formula.length ? validateFormula(draftConfig.formula) : null;

  // Palette chips per field: number → one sum chip; boolean → Yes/No count
  // chips; select → one count chip per option.
  const yesNo = full.dashboard.employees.filter;
  const fieldChips = (defs: FormulaFieldDef[]): { key: string; label: string; eq?: string }[] =>
    defs.flatMap(f =>
      f.type === 'number' ? [{ key: f.key, label: f.label }]
      : f.type === 'boolean' ? [
          { key: f.key, label: `${f.label}: ${yesNo.yes}`, eq: 'true' },
          { key: f.key, label: `${f.label}: ${yesNo.no}`, eq: 'false' },
        ]
      : (f.options ?? []).map(o => ({ key: f.key, label: `${f.label}: ${o}`, eq: o })));

  const dateLocale = full.dashboard.dateLocale;
  const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });

  // Manual payment — record a check for ANYONE (owner's own paycheck, a
  // worker with no hours this period…). Same insert path as Mark paid.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualWorker, setManualWorker] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMethod, setManualMethod] = useState<PayMethod>('check');
  const [manualCheck, setManualCheck] = useState('');
  const [manualPeriod, setManualPeriod] = useState('');
  // Selectable pay periods: the viewed one + the last ~26 (a year biweekly).
  const manualPeriods = useMemo(() => {
    const anchor = parsePayrollAnchor(anchorDate);
    const list: { start: string; label: string }[] = [];
    for (let k = 0; k >= -26; k--) {
      const per = getPayrollPeriod(frequency, new Date(), k, anchor, customDays);
      list.push({ start: per.startStr, label: `${fmtDay(per.startStr)} – ${fmtDay(per.endStr)}` });
    }
    if (periodStartStr && !list.some(x => x.start === periodStartStr)) {
      const per = getPayrollPeriod(frequency, new Date(`${periodStartStr}T00:00:00`), 0, anchor, customDays);
      list.push({ start: per.startStr, label: `${fmtDay(per.startStr)} – ${fmtDay(per.endStr)}` });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency, anchorDate, periodStartStr]);
  const openManual = () => {
    setManualWorker('');
    setManualAmount('');
    setManualHours('');
    setManualMethod('check');
    setManualCheck('');
    setManualPeriod(periodStartStr ?? manualPeriods[0]?.start ?? '');
    setManualOpen(true);
  };
  const confirmManual = () => {
    const amt = parseFloat(manualAmount) || 0;
    if (!manualWorker || amt <= 0) return;
    onMarkPaid(manualWorker, manualMethod, manualMethod === 'check' ? manualCheck.trim() : '', 0, amt, parseFloat(manualHours) || 0, null, manualPeriod || undefined);
    setManualOpen(false);
  };

  // List/grid view for the worker rows — persisted so it sticks.
  const [view, setView] = useState<'list' | 'grid'>('list');
  useEffect(() => {
    try { if (localStorage.getItem('amixos.payrollView.v1') === 'grid') setView('grid'); } catch { /* ignore */ }
  }, []);
  const changeView = (v: 'list' | 'grid') => {
    setView(v);
    try { localStorage.setItem('amixos.payrollView.v1', v); } catch { /* ignore */ }
  };

  const [payRow, setPayRow] = useState<PayrollScreenRow | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [bonus, setBonus] = useState('');

  // Worker whose hours breakdown is open (which projects the hours came from).
  const [detailRow, setDetailRow] = useState<PayrollScreenRow | null>(null);

  const freqLabel: Record<PayrollFrequency, string> = {
    weekly: t.freqWeekly,
    biweekly: t.freqBiweekly,
    monthly: t.freqMonthly,
    custom: t.freqCustom,
  };

  const methodLabel: Record<PayMethod, string> = {
    cash: t.methodCash,
    check: t.methodCheck,
    wire: t.methodWire,
  };

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalPay = rows.reduce((s, r) => s + r.pay, 0);
  const paidTotal = (r: PayrollScreenRow) => (r.payments ?? []).reduce((sum, x) => sum + x.grossPay, 0);
  const paidHours = (r: PayrollScreenRow) => (r.payments ?? []).reduce((sum, x) => sum + (x.hours ?? 0), 0);
  const bonusTotal = (r: PayrollScreenRow) => (r.payments ?? []).reduce((sum, x) => sum + (x.bonus ?? 0), 0);
  const isFullyPaid = (r: PayrollScreenRow) =>
    (r.payments?.length ?? 0) > 0 && paidTotal(r) + 0.005 >= r.pay + bonusTotal(r);
  const isPartial = (r: PayrollScreenRow) => (r.payments?.length ?? 0) > 0 && !isFullyPaid(r);
  const paidCount = rows.filter(isFullyPaid).length;
  // Unpaid first, paid sink to the bottom. Stable sort preserves the pay-desc
  // order the rows already arrive in within each group.
  const sortedRows = [...rows].sort((a, b) => (isFullyPaid(a) ? 1 : 0) - (isFullyPaid(b) ? 1 : 0));

  // The pay dialog is a mini-ledger: it lists this period's payments and
  // adds one check for EVERYTHING currently owed (computed pay − already
  // paid). No custom amount: a check always covers all data entered so far,
  // so formula components (overnights, overtime) are consumed exactly once.
  // "Partial" happens naturally: pay week 1's data, enter week 2, pay the
  // remainder.
  const checkBaseOf = (r: PayrollScreenRow) =>
    Math.max(0, Math.round((r.pay + bonusTotal(r) - paidTotal(r)) * 100) / 100);
  const checkHoursOf = (r: PayrollScreenRow) =>
    Math.max(0, Math.round((r.hours - paidHours(r)) * 100) / 100);
  /** What's still owed across ALL workers — the number that matters most. */
  const totalPending = rows.reduce((sum, r) => sum + checkBaseOf(r), 0);
  /** Formula components still unpaid: period totals − already-recorded. */
  const checkComponentsOf = (r: PayrollScreenRow): Record<string, number> | null => {
    if (!r.formulaJobFields) return null;
    const already: Record<string, number> = {};
    (r.payments ?? []).forEach(pm =>
      Object.entries(pm.components ?? {}).forEach(([l, v]) => { already[l] = (already[l] ?? 0) + v; }));
    const out: Record<string, number> = {};
    Object.entries(r.formulaJobFields).forEach(([l, v]) => {
      out[l] = Math.max(0, Math.round((v - (already[l] ?? 0)) * 100) / 100);
    });
    return out;
  };
  const componentsText = (c: Record<string, number> | null | undefined) =>
    c ? Object.entries(c).filter(([, v]) => v).map(([l, v]) => `${v} × ${l}`).join(' · ') : '';
  const openPay = (row: PayrollScreenRow) => {
    setPayRow(row);
    setMethod('cash');
    setCheckNumber('');
    setBonus('');
  };
  const confirmPay = () => {
    if (!payRow) return;
    onMarkPaid(
      payRow.employeeId,
      method,
      method === 'check' ? checkNumber.trim() : '',
      parseFloat(bonus) || 0,
      checkBaseOf(payRow),
      checkHoursOf(payRow),
      checkComponentsOf(payRow),
    );
    setPayRow(null);
  };
  // Live total shown big at the top of the modal: what's owed + bonus.
  const modalTotal = payRow ? checkBaseOf(payRow) + (parseFloat(bonus) || 0) : 0;

  // Coming back from a job / arriving from Payment history: open that
  // worker's breakdown once their row exists (the prop may arrive after the
  // right period has been applied — only consume on an actual match).
  const [initialDetailDone, setInitialDetailDone] = useState(false);
  useEffect(() => {
    if (initialDetailDone || !initialDetailEmployeeId || !rows.length) return;
    const match = rows.find(x => x.employeeId === initialDetailEmployeeId);
    if (match) {
      setDetailRow(match);
      setInitialDetailDone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, initialDetailEmployeeId]);

  // Keep the open dialog in sync after a delete/reload refreshes the rows.
  useEffect(() => {
    setPayRow(prev => (prev ? rows.find(r => r.employeeId === prev.employeeId) ?? null : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const paymentBadgeLabel = (payment: PayrollPaymentEntry) =>
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
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-xs text-gray-400">{t.subtitle}</p>
        </div>
        {onHistoryPress ? (
          <button
            type="button"
            onClick={onHistoryPress}
            className="flex items-center gap-1.5 bg-white border border-gray-200 px-3.5 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <History size={15} className="text-gray-700" />
            {t.historyTitle}
          </button>
        ) : null}
        {canManage && (
          <button type="button" onClick={openSettings} title={t.settingsTitle} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <Settings size={18} className="text-gray-500" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Period navigator */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2">
          <button type="button" onClick={onPrevPeriod} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-900">{periodLabel}</span>
          <button type="button" onClick={onNextPeriod} className="p-2 rounded-xl hover:bg-gray-100">
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-400">{t.totalHours}</p>
            <p className="text-lg font-bold text-gray-900">{Math.round(totalHours * 100) / 100}</p>
          </div>
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-400">{t.totalPay}</p>
            <p className="text-lg font-bold text-primary">{fmt(totalPay)}</p>
          </div>
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-400">{t.totalPending}</p>
            <p className={`text-lg font-bold ${totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(totalPending)}</p>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between -mt-1">
            <p className="text-xs text-gray-400">
              {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
            </p>
            <div className="flex items-center gap-2">
            {canManage && allWorkers && allWorkers.length > 0 ? (
              <button type="button" onClick={openManual}
                className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Banknote size={13} /> {t.manualPayBtn}
              </button>
            ) : null}
            <div className="inline-flex gap-1 bg-gray-100 p-1 rounded-lg">
              {([['list', List], ['grid', LayoutGrid]] as const).map(([v, Icon]) => (
                <button key={v} type="button" onClick={() => changeView(v)}
                  className={`p-1.5 rounded-md transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Icon size={15} />
                </button>
              ))}
            </div>
            </div>
          </div>
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
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {sortedRows.map(r => (
              <div key={r.employeeId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1.5">
                <button type="button" onClick={() => setDetailRow(r)} className="text-left group">
                  <p className="text-xs text-gray-400">
                    {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''} · {Math.round(r.hours * 100) / 100} h
                    {(r.overtimeHours ?? 0) > 0 ? ` · ${Math.round((r.overtimeHours ?? 0) * 100) / 100} h ${t.otShort}` : ''}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary mt-0.5">{r.name}</p>
                </button>
                {isPartial(r) ? (
                  <p className="text-2xl font-bold text-amber-600">
                    {fmt(checkBaseOf(r))}
                    <span className="text-xs font-semibold text-gray-400 ml-1.5">{t.ofTotal.replace('{{total}}', fmt(r.pay))}</span>
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-primary">{fmt(r.pay)}</p>
                )}
                <div className="mt-auto pt-1">
                  {(r.payments?.length ?? 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => canManage && openPay(r)}
                      disabled={!canManage}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isPartial(r) ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:hover:bg-amber-100' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:hover:bg-emerald-100'}`}
                      title={t.methodHeading}
                    >
                      <Check size={11} />
                      <span className="text-[11px] font-semibold">
                        {isPartial(r)
                          ? `${t.partialLabel} ${fmt(paidTotal(r))}${paidHours(r) > 0 ? ` · ${Math.round(paidHours(r) * 100) / 100} h` : ''}`
                          : r.payments!.length === 1 ? paymentBadgeLabel(r.payments![0]) : fmt(paidTotal(r))}
                      </span>
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
                      {(r.overtimeHours ?? 0) > 0 ? ` · ${Math.round((r.overtimeHours ?? 0) * 100) / 100} h ${t.otShort}` : ''}
                      {(r.driverPay ?? 0) > 0 ? ` · ${fmt(r.driverPay ?? 0)} ${t.driveShort}` : ''}
                    </p>
                  </div>
                  <Chevron size={14} className="text-gray-300 group-hover:text-primary shrink-0" />
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  {isPartial(r) ? (
                    <span className="text-right">
                      <span className="text-sm font-bold text-amber-600">{fmt(checkBaseOf(r))}</span>
                      <span className="block text-[11px] text-gray-400">{t.ofTotal.replace('{{total}}', fmt(r.pay))}</span>
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-gray-900">{fmt(r.pay)}</span>
                  )}
                  {(r.payments?.length ?? 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => canManage && openPay(r)}
                      disabled={!canManage}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isPartial(r) ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:hover:bg-amber-100' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:hover:bg-emerald-100'}`}
                      title={t.methodHeading}
                    >
                      <Check size={11} />
                      <span className="text-[11px] font-semibold">
                        {isPartial(r)
                          ? `${t.partialLabel} ${fmt(paidTotal(r))}${paidHours(r) > 0 ? ` · ${Math.round(paidHours(r) * 100) / 100} h` : ''}`
                          : r.payments!.length === 1 ? paymentBadgeLabel(r.payments![0]) : fmt(paidTotal(r))}
                      </span>
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

      {/* Manual payment dialog */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setManualOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-gray-900">{t.manualPayBtn}</p>
              <button type="button" onClick={() => setManualOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.manualPeriodLabel}</label>
            <select
              value={manualPeriod}
              onChange={e => setManualPeriod(e.target.value)}
              className="w-full mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {manualPeriods.map(pr => <option key={pr.start} value={pr.start}>{pr.label}</option>)}
            </select>

            <label className="block text-sm font-semibold text-gray-700 mb-2">{t.manualWorkerLabel}</label>
            <select
              value={manualWorker}
              onChange={e => setManualWorker(e.target.value)}
              className="w-full mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t.manualSelectWorker}</option>
              {(allWorkers ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.methodHeading}</p>
            <div className="flex gap-2 mb-4">
              {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                const on = manualMethod === m;
                return (
                  <button key={m} type="button" onClick={() => setManualMethod(m)}
                    className={`flex-1 py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 border transition-colors ${on ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <Icon size={16} />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>

            {manualMethod === 'check' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t.checkNumberLabel}</label>
                <input value={manualCheck} onChange={e => setManualCheck(e.target.value)} placeholder={t.checkNumberPlaceholder} inputMode="numeric"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.amountLabel}</label>
              <input value={manualAmount} onChange={e => setManualAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.hoursCoveredLabel}</label>
              <input value={manualHours} onChange={e => setManualHours(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" inputMode="decimal"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <button type="button" onClick={confirmManual} disabled={busy || !manualWorker || !(parseFloat(manualAmount) > 0)}
              className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {t.confirmBtn}
            </button>
          </div>
        </div>
      )}

      {/* Payroll settings modal — frequency / anchor / pay components. */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSettingsOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-gray-900">{t.settingsTitle}</p>
              <button type="button" onClick={() => setSettingsOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.freqLabel}</p>
            <div className="flex gap-2 mb-4">
              {FREQS.map(f => {
                const on = f === draftFreq;
                return (
                  <button key={f} type="button" onClick={() => setDraftFreq(f)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${on ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {freqLabel[f]}
                  </button>
                );
              })}
            </div>

            {draftFreq === 'custom' ? (
              <label className="block text-xs text-gray-500 mb-4">
                {t.customDaysLabel}
                <input
                  type="number" min="1" max="90"
                  value={draftCustomDays}
                  onChange={e => setDraftCustomDays(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            ) : null}

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.anchorLabel}</p>
            <DatePicker value={draftAnchor} onChange={setDraftAnchor} />
            <p className="text-[11px] text-gray-400 mt-1.5 mb-4">{t.anchorHint}</p>

            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.componentsHeading}</p>
            <div className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 mb-5">
              <p className="text-sm font-medium text-gray-700">{t.driverHeading}</p>
              <div className="flex gap-2">
                {([['same', t.driverSame], ['rate', t.driverRate], ['flat', t.driverFlat]] as [DriverPayMode, string][]).map(([m, label]) => (
                  <button key={m} type="button"
                    onClick={() => setDraftConfig({ ...draftConfig, driver: { ...draftConfig.driver, mode: m } })}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      draftConfig.driver.mode === m ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {draftConfig.driver.mode !== 'same' ? (
                <label className="text-xs text-gray-500">
                  {draftConfig.driver.mode === 'rate' ? t.driverRateLabel : t.driverFlatLabel}
                  <input
                    type="number" min="0" step="0.01"
                    value={draftConfig.driver.mode === 'rate' ? draftConfig.driver.rate : draftConfig.driver.flat}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setDraftConfig({
                        ...draftConfig,
                        driver: { ...draftConfig.driver, ...(draftConfig.driver.mode === 'rate' ? { rate: v } : { flat: v }) },
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 mb-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{t.formulaHeading}</p>
                {draftConfig.formula ? (
                  <button
                    type="button"
                    onClick={() => setDraftConfig(c => ({ ...c, formula: null }))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    {t.formulaRemove}
                  </button>
                ) : null}
              </div>
              {!draftConfig.formula ? (
                <>
                  <p className="text-xs text-gray-400">{t.formulaStandardHint}</p>
                  <button
                    type="button"
                    onClick={() => setDraftConfig(c => ({ ...c, formula: [] }))}
                    className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-500 hover:border-primary hover:text-primary transition-colors"
                  >
                    {t.formulaCreate}
                  </button>
                </>
              ) : (
                <>
                  <div className="min-h-[52px] rounded-xl bg-gray-50 border border-gray-100 p-2 flex flex-wrap items-center gap-1.5">
                    {draftConfig.formula.length === 0 ? (
                      <p className="text-xs text-gray-400 px-1">{t.formulaEmpty}</p>
                    ) : (
                      draftConfig.formula.map((tok, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => removeTok(i)}
                          title={t.formulaBuildHint}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-colors hover:border-red-300 hover:text-red-500 ${
                            tok.t === 'op' || tok.t === 'lp' || tok.t === 'rp'
                              ? 'bg-white border-gray-200 text-gray-700'
                              : tok.t === 'num'
                                ? 'bg-white border-gray-200 text-gray-900'
                                : 'bg-primary/10 border-primary/30 text-primary'
                          }`}
                        >
                          {tokLabel(tok)}
                        </button>
                      ))
                    )}
                  </div>
                  {formulaError ? <p className="text-xs text-red-500">{t.formulaInvalid}</p> : (
                    <p className="text-[11px] text-gray-400">{t.formulaBuildHint}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {(['+', '-', '*', '/'] as const).map(op => (
                      <button key={op} type="button" onClick={() => pushTok({ t: 'op', v: op })}
                        className="w-9 h-8 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">
                        {OP_SYMBOLS[op]}
                      </button>
                    ))}
                    <button type="button" onClick={() => pushTok({ t: 'lp' })} className="w-9 h-8 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">(</button>
                    <button type="button" onClick={() => pushTok({ t: 'rp' })} className="w-9 h-8 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">)</button>
                    <input
                      type="number"
                      value={numEntry}
                      onChange={e => setNumEntry(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNumEntry(); } }}
                      placeholder={t.formulaNumberPlaceholder}
                      className="w-24 h-8 rounded-lg border border-gray-200 px-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button type="button" onClick={addNumEntry} disabled={!numEntry}
                      className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                      {t.formulaAddNumber}
                    </button>
                  </div>

                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaVarsHeading}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMULA_VARS.map(k => (
                      <button key={k} type="button" onClick={() => pushTok({ t: 'var', k: k as FormulaVar })}
                        title={t.formulaVarDescs[k]}
                        className="px-2 py-1 rounded-lg bg-primary/5 border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/10">
                        {t.formulaVarNames[k]}
                      </button>
                    ))}
                  </div>
                  {formulaFields && formulaFields.emp.length > 0 ? (
                    <>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaEmpFieldsHeading}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldChips(formulaFields.emp).map(c => (
                          <button key={`${c.key}=${c.eq ?? ''}`} type="button"
                            onClick={() => pushTok({ t: 'ecf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                            title={c.eq !== undefined ? t.formulaEcfMatchDesc : t.formulaEcfDesc}
                            className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {formulaFields && formulaFields.job.length > 0 ? (
                    <>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaJobFieldsHeading}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldChips(formulaFields.job).map(c => (
                          <button key={`${c.key}=${c.eq ?? ''}`} type="button"
                            onClick={() => pushTok({ t: 'jcf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                            title={c.eq !== undefined ? t.formulaJcfCountDesc : t.formulaJcfDesc}
                            className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400">{t.formulaJobFieldHint}</p>
                    </>
                  ) : null}
                  {draftConfig.formula.length > 0 ? (
                    <button type="button" onClick={() => setDraftConfig(c => ({ ...c, formula: [] }))}
                      className="self-start text-xs font-semibold text-gray-400 hover:text-red-500">
                      {t.formulaClear}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <button type="button" onClick={saveSettings} className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90">
              {t.saveBtn}
            </button>
          </div>
        </div>
      )}

      {/* Mark-paid modal */}
      {payRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPayRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="relative mb-4">
              <button type="button" onClick={() => setPayRow(null)} className="absolute right-0 top-0 p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
              <div className="text-center pt-1">
                <p className="text-base font-semibold text-gray-900">{payRow.name}</p>
                <p className="text-3xl font-bold text-primary mt-1">{fmt(modalTotal)}</p>
                <p className="text-sm text-gray-400 mt-0.5">{checkHoursOf(payRow)} h</p>
                {componentsText(checkComponentsOf(payRow)) ? (
                  <p className="text-xs text-gray-400 mt-0.5">{componentsText(checkComponentsOf(payRow))}</p>
                ) : null}
              </div>
            </div>

            {(payRow.payments ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.alreadyPaidLabel}</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {(payRow.payments ?? []).map((pmt, i) => (
                    <div key={pmt.id} className={`px-3 py-2 flex items-center gap-2 ${i < (payRow.payments?.length ?? 0) - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{fmt(pmt.grossPay)}</p>
                        <p className="text-[11px] text-gray-400">
                          {pmt.hours ? `${Math.round(pmt.hours * 100) / 100} h · ` : ''}
                          {paymentBadgeLabel(pmt)}
                          {pmt.paidAt ? ` · ${fmtDay(pmt.paidAt)}` : ''}
                          {componentsText(pmt.components) ? ` · ${componentsText(pmt.components)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeletePayment(pmt.id)}
                        disabled={busy}
                        title={t.removePayment}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t.clearPaymentsConfirm.replace('{{name}}', payRow.name))) onClearPayments(payRow.employeeId);
                  }}
                  disabled={busy}
                  className="mt-2 text-xs font-semibold text-red-500 hover:text-red-700 hover:underline"
                >
                  {t.clearPaymentsLabel}
                </button>
              </div>
            )}

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


            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.bonusLabel}</label>
              <input
                value={bonus}
                onChange={e => setBonus(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button type="button" onClick={confirmPay} disabled={busy || modalTotal <= 0} className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {t.confirmBtn}
            </button>
          </div>
        </div>
      )}

      {/* Worker hours breakdown */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDetailRow(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-gray-900">{detailRow.name}</p>
                <p className="text-sm text-gray-500">
                  {fmt(detailRow.pay)} · {Math.round(detailRow.hours * 100) / 100} h
                </p>
                {paidTotal(detailRow) > 0 ? (
                  <p className={`text-xs font-semibold mt-0.5 ${isFullyPaid(detailRow) ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {t.paidSoFarLabel}: {fmt(paidTotal(detailRow))}{paidHours(detailRow) > 0 ? ` · ${Math.round(paidHours(detailRow) * 100) / 100} h` : ''}
                  </p>
                ) : null}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detailRow.breakdown.jobs.map((j, i) => (
                  <div key={j.jobId ?? i} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                    <button
                      type="button"
                      disabled={!j.jobId || !onJobPress}
                      onClick={() => { if (j.jobId && onJobPress) { setDetailRow(null); onJobPress(j.jobId, detailRow.employeeId); } }}
                      className="flex-1 min-w-0 text-left group disabled:cursor-default"
                    >
                      <p className={`text-sm font-semibold text-gray-900 truncate ${j.jobId && onJobPress ? 'group-hover:text-primary' : ''}`}>{j.title || t.untitledJob}</p>
                      {j.date && <p className="text-[11px] text-gray-400">{fmtDay(j.date)}</p>}
                    </button>
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

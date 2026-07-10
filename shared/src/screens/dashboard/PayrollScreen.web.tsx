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
}

/** One saved payroll payment — the permanent record, immune to job edits. */
export interface PayrollHistoryEntry {
  periodStart: string;
  periodEnd: string;
  name: string;
  hours: number;
  driverHours: number;
  bonus: number | null;
  grossPay: number;
  method: string;
  checkNumber: string | null;
  paidAt: string | null;
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
  /** Pay components (overtime / driver pay). Rendered under the frequency
   *  settings for managers; onConfigChange persists the whole object. */
  config: PayrollConfig;
  onConfigChange: (c: PayrollConfig) => void;
  /** Per-worker overtime (settings modal list). Changes save instantly. */
  onMarkPaid: (employeeId: string, method: PayMethod, checkNumber: string, bonus: number, amount: number, hoursCovered: number) => void;
  onDeletePayment: (paymentId: string) => void;
  /** Deletes EVERY payment of the period for one worker (confirmed in UI). */
  onClearPayments: (employeeId: string) => void;
  onBack: () => void;
  canManage: boolean;
  busy?: boolean;
  /** Custom fields offered in the formula builder palette (number/boolean/
   *  select only — text and dates are excluded by the callers). */
  formulaFields?: { emp: FormulaFieldDef[]; job: FormulaFieldDef[] };
  /** Loads ALL saved payments (newest period first) for the history modal. */
  onLoadHistory?: () => Promise<PayrollHistoryEntry[]>;
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
  config,
  onConfigChange,
  onMarkPaid,
  onDeletePayment,
  onClearPayments,
  onBack,
  canManage,
  busy,
  formulaFields,
  onLoadHistory,
}: PayrollScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;

  // Settings modal — edits a DRAFT; nothing persists until Save.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftFreq, setDraftFreq] = useState<PayrollFrequency>(frequency);
  const [draftAnchor, setDraftAnchor] = useState<string>(anchorDate ?? '');
  const [draftConfig, setDraftConfig] = useState<PayrollConfig>(config);
  const openSettings = () => {
    setDraftFreq(frequency);
    setDraftAnchor(anchorDate ?? '');
    setDraftConfig(config);
    setSettingsOpen(true);
  };
  const saveSettings = () => {
    const f = draftConfig.formula ?? null;
    if (f && f.length && validateFormula(f) !== null) return; // error shown inline
    const cleaned = { ...draftConfig, formula: f && f.length ? f : null };
    if (draftFreq !== frequency) onFrequencyChange(draftFreq);
    if (draftAnchor !== (anchorDate ?? '')) onAnchorChange(draftAnchor);
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

  // Payment history modal — the saved payroll_payments records.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PayrollHistoryEntry[] | null>(null);
  const openHistory = () => {
    setHistoryOpen(true);
    // Always refetch — payments are added/deleted on the live view, so a
    // cached list would show stale records.
    setHistory(null);
    if (onLoadHistory) onLoadHistory().then(setHistory).catch(() => setHistory([]));
  };
  const dateLocale = full.dashboard.dateLocale;
  const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
  const historyGroups = useMemo(() => {
    const by = new Map<string, PayrollHistoryEntry[]>();
    (history ?? []).forEach(h => {
      const list = by.get(h.periodStart) ?? [];
      list.push(h);
      by.set(h.periodStart, list);
    });
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

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
  // Base amount being paid — defaults to what's still owed; lower = partial.
  const [amount, setAmount] = useState('');
  // Hours this payment covers ("$800 for 25 h") — defaults to unpaid hours.
  const [hoursCovered, setHoursCovered] = useState('');
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

  // The pay dialog is a mini-ledger: it lists this period's payments and the
  // form below ADDS one. Defaults pre-fill whatever is still owed.
  const openPay = (row: PayrollScreenRow) => {
    setPayRow(row);
    setMethod('cash');
    setCheckNumber('');
    setBonus('');
    const remaining = Math.max(0, row.pay + bonusTotal(row) - paidTotal(row));
    setAmount(String(Math.round(remaining * 100) / 100));
    setHoursCovered(String(Math.max(0, Math.round((row.hours - paidHours(row)) * 100) / 100)));
  };
  const confirmPay = () => {
    if (!payRow) return;
    const amt = amount.trim() === '' ? payRow.pay : parseFloat(amount) || 0;
    onMarkPaid(
      payRow.employeeId,
      method,
      method === 'check' ? checkNumber.trim() : '',
      parseFloat(bonus) || 0,
      amt,
      parseFloat(hoursCovered) || 0,
    );
    setPayRow(null);
  };
  // Live total shown big at the top of the modal: amount + bonus.
  const modalTotal = (parseFloat(amount) || 0) + (parseFloat(bonus) || 0);

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
        {onLoadHistory ? (
          <button type="button" onClick={openHistory} title={t.historyTitle} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <History size={18} className="text-gray-500" />
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
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between -mt-1">
            <p className="text-xs text-gray-400">
              {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
            </p>
            <div className="inline-flex gap-1 bg-gray-100 p-1 rounded-lg">
              {([['list', List], ['grid', LayoutGrid]] as const).map(([v, Icon]) => (
                <button key={v} type="button" onClick={() => changeView(v)}
                  className={`p-1.5 rounded-md transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Icon size={15} />
                </button>
              ))}
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
                <p className="text-2xl font-bold text-primary">{fmt(r.pay)}</p>
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
                  <span className="text-sm font-bold text-gray-900">{fmt(r.pay)}</span>
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

      {/* Payment history — the saved records, independent of live job data. */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setHistoryOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <p className="text-lg font-bold text-gray-900">{t.historyTitle}</p>
              <button type="button" onClick={() => setHistoryOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            {history === null ? (
              <div className="flex justify-center py-10">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : historyGroups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">{t.historyEmpty}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {historyGroups.map(([periodStart, entries]) => (
                  <div key={periodStart}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-gray-500">
                        {fmtDay(periodStart)} – {fmtDay(entries[0].periodEnd)}
                      </p>
                      <p className="text-xs font-bold text-gray-700">
                        {fmt(entries.reduce((sum, e) => sum + e.grossPay, 0))}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      {entries.map((h, i) => (
                        <div key={`${h.name}-${i}`} className={`px-4 py-2.5 flex items-center gap-3 ${i < entries.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{h.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {Math.round(h.hours * 100) / 100} h
                              {h.driverHours > 0 ? ` · ${Math.round(h.driverHours * 100) / 100} h ${t.driveShort}` : ''}
                              {h.bonus ? ` · ${t.historyBonus} ${fmt(h.bonus)}` : ''}
                              {' · '}
                              {h.method === 'check' && h.checkNumber ? `${t.checkPrefix}${h.checkNumber}` : (methodLabel[h.method as PayMethod] ?? h.method)}
                              {h.paidAt ? ` · ${fmtDay(h.paidAt)}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-gray-900 shrink-0">{fmt(h.grossPay)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                <p className="text-sm text-gray-400 mt-0.5">{Math.round(payRow.hours * 100) / 100} h</p>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.amountLabel}</label>
              <input
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">{t.hoursCoveredLabel}</label>
              <input
                value={hoursCovered}
                onChange={e => setHoursCovered(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                inputMode="decimal"
                className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

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

            <button type="button" onClick={confirmPay} disabled={busy || !(parseFloat(amount) > 0 || parseFloat(bonus) > 0)} className="w-full py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {t.confirmBtn}
            </button>
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

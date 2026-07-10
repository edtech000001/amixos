import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal as RNModal, Alert } from 'react-native';
import { ChevronLeft, ChevronRight, Check, Banknote, FileText, Landmark, X, Wrench, Truck, Clock, Settings, List, LayoutGrid, History, Trash2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLang } from '../../i18n';
import { DatePicker } from '../../ui';
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
  /** Present when the worker has been marked paid for this period. */
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
  /** Pay components (overtime / driver pay); onConfigChange persists it. */
  config: PayrollConfig;
  onConfigChange: (c: PayrollConfig) => void;
  /** Per-worker overtime (settings sheet list). Changes save instantly. */
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
  /** Loads ALL saved payments (newest period first) for the history sheet. */
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

  // Mark-paid sheet state.
  // Settings sheet — edits a DRAFT; nothing persists until Save.
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

  // Payment history sheet — the saved payroll_payments records.
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
    AsyncStorage.getItem('amixos.payrollView.v1')
      .then(v => { if (v === 'grid') setView('grid'); })
      .catch(() => {});
  }, []);
  const changeView = (v: 'list' | 'grid') => {
    setView(v);
    void AsyncStorage.setItem('amixos.payrollView.v1', v).catch(() => {});
  };

  const [payRow, setPayRow] = useState<PayrollScreenRow | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [bonus, setBonus] = useState('');
  // Base amount being paid — defaults to what's still owed; lower = partial.
  const [amount, setAmount] = useState('');
  // Hours this payment covers ("$800 for 25 h") — defaults to unpaid hours.
  const [hoursCovered, setHoursCovered] = useState('');
  // Worker whose hours breakdown sheet is open.
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
  // Unpaid first, paid sink to the bottom (stable — keeps pay-desc within group).
  const sortedRows = [...rows].sort((a, b) => (isFullyPaid(a) ? 1 : 0) - (isFullyPaid(b) ? 1 : 0));

  // The pay sheet is a mini-ledger: it lists this period's payments and the
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
  // Live total shown big at the top of the sheet: amount + bonus.
  const modalTotal = (parseFloat(amount) || 0) + (parseFloat(bonus) || 0);

  // Keep the open sheet in sync after a delete/reload refreshes the rows.
  useEffect(() => {
    setPayRow(prev => (prev ? rows.find(r => r.employeeId === prev.employeeId) ?? null : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const paymentBadgeLabel = (payment: PayrollPaymentEntry) =>
    payment.method === 'check' && payment.checkNumber
      ? `${t.checkPrefix}${payment.checkNumber}`
      : methodLabel[payment.method];

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.title}</Text>
          <Text className="text-xs text-gray-400">{t.subtitle}</Text>
        </View>
        {onLoadHistory ? (
          <Pressable onPress={openHistory} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
            <History size={20} color="#6B7280" />
          </Pressable>
        ) : null}
        {canManage ? (
          <Pressable onPress={openSettings} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
            <Settings size={20} color="#6B7280" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-32 gap-4">
        {/* Period navigator */}
        <View className="flex-row items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-2">
          <Pressable onPress={onPrevPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronLeft size={20} color="#6B7280" />
          </Pressable>
          <Text className="text-sm font-semibold text-gray-900">{periodLabel}</Text>
          <Pressable onPress={onNextPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-gray-100">
            <ChevronRight size={20} color="#6B7280" />
          </Pressable>
        </View>

        {/* Summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <Text className="text-[11px] text-gray-400">{t.totalHours}</Text>
            <Text className="text-lg font-bold text-gray-900">{Math.round(totalHours * 100) / 100}</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <Text className="text-[11px] text-gray-400">{t.totalPay}</Text>
            <Text className="text-lg font-bold text-primary">{fmt(totalPay)}</Text>
          </View>
        </View>
        {rows.length > 0 ? (
          <View className="flex-row items-center justify-between -mt-1">
            <Text className="text-xs text-gray-400">
              {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
            </Text>
            <View className="flex-row gap-1 bg-gray-100 p-1 rounded-lg">
              {([['list', List], ['grid', LayoutGrid]] as const).map(([v, Icon]) => (
                <Pressable key={v} onPress={() => changeView(v)}
                  className={`p-1.5 rounded-md ${view === v ? 'bg-white shadow-sm' : ''}`}>
                  <Icon size={15} color={view === v ? '#111827' : '#9CA3AF'} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Worker rows */}
        {loading ? (
          <View className="items-center py-10">
            <View className="flex-row gap-1">
              {[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
            </View>
          </View>
        ) : rows.length === 0 ? (
          <Text className="text-sm text-gray-400 text-center py-10">{t.empty}</Text>
        ) : view === 'grid' ? (
          <View className="flex-row flex-wrap justify-between">
            {sortedRows.map(r => (
              <View key={r.employeeId} className="w-[48.5%] bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 mb-3">
                <Pressable onPress={() => setDetailRow(r)} className="active:opacity-60">
                  <Text className="text-[11px] text-gray-400">
                    {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''} · {Math.round(r.hours * 100) / 100} h
                  </Text>
                  <Text className="text-sm font-semibold text-gray-900 mt-0.5" numberOfLines={1}>{r.name}</Text>
                </Pressable>
                <Text className="text-xl font-bold text-primary mt-1">{fmt(r.pay)}</Text>
                <View className="mt-2">
                  {(r.payments?.length ?? 0) > 0 ? (
                    <Pressable onPress={() => canManage && openPay(r)} disabled={!canManage} className="self-start">
                      <View className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${isPartial(r) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                        <Check size={11} color={isPartial(r) ? '#B45309' : '#047857'} />
                        <Text className={`text-[11px] font-semibold ${isPartial(r) ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {isPartial(r)
                            ? `${t.partialLabel} ${fmt(paidTotal(r))}${paidHours(r) > 0 ? ` · ${Math.round(paidHours(r) * 100) / 100} h` : ''}`
                            : r.payments!.length === 1 ? paymentBadgeLabel(r.payments![0]) : fmt(paidTotal(r))}
                        </Text>
                      </View>
                    </Pressable>
                  ) : canManage ? (
                    <Pressable onPress={() => openPay(r)} disabled={busy} className="self-start">
                      <Text className="text-xs font-semibold text-primary">{t.markPaid}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {sortedRows.map((r, i) => (
              <View
                key={r.employeeId}
                className={`px-4 py-3.5 flex-row items-center gap-3 ${i < sortedRows.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                {/* Name/hours area opens the hours breakdown. */}
                <Pressable onPress={() => setDetailRow(r)} className="flex-1 min-w-0 flex-row items-center gap-1.5 active:opacity-60">
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{r.name}</Text>
                    <Text className="text-xs text-gray-400">
                      {Math.round(r.hours * 100) / 100} h · {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''}
                      {(r.overtimeHours ?? 0) > 0 ? ` · ${Math.round((r.overtimeHours ?? 0) * 100) / 100} h ${t.otShort}` : ''}
                      {(r.driverPay ?? 0) > 0 ? ` · ${fmt(r.driverPay ?? 0)} ${t.driveShort}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={14} color="#D1D5DB" />
                </Pressable>
                <View className="items-end">
                  <Text className="text-sm font-bold text-gray-900">{fmt(r.pay)}</Text>
                  {(r.payments?.length ?? 0) > 0 ? (
                    <Pressable onPress={() => canManage && openPay(r)} disabled={!canManage}>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <View className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${isPartial(r) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                          <Check size={11} color={isPartial(r) ? '#B45309' : '#047857'} />
                          <Text className={`text-[11px] font-semibold ${isPartial(r) ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {isPartial(r)
                              ? `${t.partialLabel} ${fmt(paidTotal(r))}${paidHours(r) > 0 ? ` · ${Math.round(paidHours(r) * 100) / 100} h` : ''}`
                              : r.payments!.length === 1 ? paymentBadgeLabel(r.payments![0]) : fmt(paidTotal(r))}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ) : canManage ? (
                    <Pressable onPress={() => openPay(r)} disabled={busy} className="mt-0.5">
                      <Text className="text-xs font-semibold text-primary">{t.markPaid}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Payment history — the saved records, independent of live job data. */}
      <RNModal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable onPress={() => setHistoryOpen(false)} className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]" onStartShouldSetResponder={() => true}>
            <Text className="text-lg font-bold text-gray-900 mb-4">{t.historyTitle}</Text>
            {history === null ? (
              <View className="items-center py-10">
                <View className="flex-row gap-1">
                  {[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
                </View>
              </View>
            ) : historyGroups.length === 0 ? (
              <Text className="text-sm text-gray-400 text-center py-10">{t.historyEmpty}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {historyGroups.map(([periodStart, entries]) => (
                  <View key={periodStart} className="mb-4">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-xs font-semibold text-gray-500">
                        {fmtDay(periodStart)} – {fmtDay(entries[0].periodEnd)}
                      </Text>
                      <Text className="text-xs font-bold text-gray-700">
                        {fmt(entries.reduce((sum, e) => sum + e.grossPay, 0))}
                      </Text>
                    </View>
                    <View className="rounded-xl border border-gray-100 overflow-hidden">
                      {entries.map((h, i) => (
                        <View key={`${h.name}-${i}`} className={`px-4 py-2.5 flex-row items-center gap-3 ${i < entries.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <View className="flex-1 min-w-0">
                            <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{h.name}</Text>
                            <Text className="text-[11px] text-gray-400">
                              {Math.round(h.hours * 100) / 100} h
                              {h.driverHours > 0 ? ` · ${Math.round(h.driverHours * 100) / 100} h ${t.driveShort}` : ''}
                              {h.bonus ? ` · ${t.historyBonus} ${fmt(h.bonus)}` : ''}
                              {' · '}
                              {h.method === 'check' && h.checkNumber ? `${t.checkPrefix}${h.checkNumber}` : (methodLabel[h.method as PayMethod] ?? h.method)}
                              {h.paidAt ? ` · ${fmtDay(h.paidAt)}` : ''}
                            </Text>
                          </View>
                          <Text className="text-sm font-bold text-gray-900">{fmt(h.grossPay)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </RNModal>

      {/* Payroll settings sheet — frequency / anchor / pay components. */}
      <RNModal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable onPress={() => setSettingsOpen(false)} className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]" onStartShouldSetResponder={() => true}>
            <Text className="text-lg font-bold text-gray-900 mb-4">{t.settingsTitle}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.freqLabel}</Text>
              <View className="flex-row gap-2 mb-4">
                {FREQS.map(f => {
                  const on = f === draftFreq;
                  return (
                    <Pressable key={f} onPress={() => setDraftFreq(f)}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${on ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}>
                      <Text className={`text-sm font-semibold ${on ? 'text-primary' : 'text-gray-500'}`}>{freqLabel[f]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.anchorLabel}</Text>
              <DatePicker value={draftAnchor} onChange={setDraftAnchor} />
              <Text className="text-[11px] text-gray-400 mt-1.5 mb-4">{t.anchorHint}</Text>

              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.componentsHeading}</Text>
              <View className="rounded-2xl border border-gray-100 p-4 gap-3 mb-5">
                <Text className="text-sm font-medium text-gray-700">{t.driverHeading}</Text>
                <View className="flex-row gap-2">
                  {([['same', t.driverSame], ['rate', t.driverRate], ['flat', t.driverFlat]] as [DriverPayMode, string][]).map(([m, label]) => (
                    <Pressable key={m}
                      onPress={() => setDraftConfig({ ...draftConfig, driver: { ...draftConfig.driver, mode: m } })}
                      className={`flex-1 py-2 rounded-xl items-center border ${
                        draftConfig.driver.mode === m ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
                      }`}>
                      <Text className={`text-xs font-semibold ${draftConfig.driver.mode === m ? 'text-primary' : 'text-gray-500'}`}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {draftConfig.driver.mode !== 'same' ? (
                  <View>
                    <Text className="text-xs text-gray-500 mb-1">
                      {draftConfig.driver.mode === 'rate' ? t.driverRateLabel : t.driverFlatLabel}
                    </Text>
                    <TextInput
                      defaultValue={String(draftConfig.driver.mode === 'rate' ? draftConfig.driver.rate : draftConfig.driver.flat)}
                      onEndEditing={e => {
                        const v = parseFloat(e.nativeEvent.text) || 0;
                        setDraftConfig({
                          ...draftConfig,
                          driver: { ...draftConfig.driver, ...(draftConfig.driver.mode === 'rate' ? { rate: v } : { flat: v }) },
                        });
                      }}
                      keyboardType="decimal-pad"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                    />
                  </View>
                ) : null}
              </View>

              <View className="rounded-2xl border border-gray-100 p-4 gap-3 mb-5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-gray-700">{t.formulaHeading}</Text>
                  {draftConfig.formula ? (
                    <Pressable
                      onPress={() => setDraftConfig(c => ({ ...c, formula: null }))}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white active:bg-gray-50"
                    >
                      <Text className="text-xs font-semibold text-gray-600">{t.formulaRemove}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {!draftConfig.formula ? (
                  <>
                    <Text className="text-xs text-gray-400">{t.formulaStandardHint}</Text>
                    <Pressable
                      onPress={() => setDraftConfig(c => ({ ...c, formula: [] }))}
                      className="py-2 rounded-xl border border-dashed border-gray-300 items-center active:opacity-80"
                    >
                      <Text className="text-sm font-semibold text-gray-500">{t.formulaCreate}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View className="min-h-[52px] rounded-xl bg-gray-50 border border-gray-100 p-2 flex-row flex-wrap items-center gap-1.5">
                      {draftConfig.formula.length === 0 ? (
                        <Text className="text-xs text-gray-400 px-1">{t.formulaEmpty}</Text>
                      ) : (
                        draftConfig.formula.map((tok, i) => (
                          <Pressable
                            key={i}
                            onPress={() => removeTok(i)}
                            className={`px-2 py-1 rounded-lg border ${
                              tok.t === 'op' || tok.t === 'lp' || tok.t === 'rp' || tok.t === 'num'
                                ? 'bg-white border-gray-200'
                                : 'bg-primary/10 border-primary/30'
                            }`}
                          >
                            <Text className={`text-xs font-semibold ${
                              tok.t === 'op' || tok.t === 'lp' || tok.t === 'rp' ? 'text-gray-700'
                              : tok.t === 'num' ? 'text-gray-900' : 'text-primary'
                            }`}>{tokLabel(tok)}</Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                    {formulaError ? (
                      <Text className="text-xs text-red-500">{t.formulaInvalid}</Text>
                    ) : (
                      <Text className="text-[11px] text-gray-400">{t.formulaBuildHint}</Text>
                    )}

                    <View className="flex-row flex-wrap gap-1.5 items-center">
                      {(['+', '-', '*', '/'] as const).map(op => (
                        <Pressable key={op} onPress={() => pushTok({ t: 'op', v: op })}
                          className="w-9 h-8 rounded-lg border border-gray-200 items-center justify-center active:bg-gray-50">
                          <Text className="text-sm font-bold text-gray-700">{OP_SYMBOLS[op]}</Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => pushTok({ t: 'lp' })} className="w-9 h-8 rounded-lg border border-gray-200 items-center justify-center active:bg-gray-50">
                        <Text className="text-sm font-bold text-gray-700">(</Text>
                      </Pressable>
                      <Pressable onPress={() => pushTok({ t: 'rp' })} className="w-9 h-8 rounded-lg border border-gray-200 items-center justify-center active:bg-gray-50">
                        <Text className="text-sm font-bold text-gray-700">)</Text>
                      </Pressable>
                      <TextInput
                        value={numEntry}
                        onChangeText={setNumEntry}
                        placeholder={t.formulaNumberPlaceholder}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        className="w-24 h-8 rounded-lg border border-gray-200 px-2 text-xs text-gray-900"
                      />
                      <Pressable onPress={addNumEntry} disabled={!numEntry}
                        className={`h-8 px-3 rounded-lg border border-gray-200 items-center justify-center ${numEntry ? 'active:bg-gray-50' : 'opacity-40'}`}>
                        <Text className="text-xs font-semibold text-gray-700">{t.formulaAddNumber}</Text>
                      </Pressable>
                    </View>

                    <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaVarsHeading}</Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {FORMULA_VARS.map(k => (
                        <Pressable key={k} onPress={() => pushTok({ t: 'var', k: k as FormulaVar })}
                          onLongPress={() => Alert.alert(t.formulaVarNames[k], t.formulaVarDescs[k])}
                          className="px-2 py-1 rounded-lg bg-primary/5 border border-primary/20 active:bg-primary/10">
                          <Text className="text-xs font-semibold text-primary">{t.formulaVarNames[k]}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {formulaFields && formulaFields.emp.length > 0 ? (
                      <>
                        <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaEmpFieldsHeading}</Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          {fieldChips(formulaFields.emp).map(c => (
                            <Pressable key={`${c.key}=${c.eq ?? ''}`}
                              onPress={() => pushTok({ t: 'ecf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                              onLongPress={() => Alert.alert(c.label, c.eq !== undefined ? t.formulaEcfMatchDesc : t.formulaEcfDesc)}
                              className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 active:bg-amber-100">
                              <Text className="text-xs font-semibold text-amber-700">{c.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}
                    {formulaFields && formulaFields.job.length > 0 ? (
                      <>
                        <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.formulaJobFieldsHeading}</Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          {fieldChips(formulaFields.job).map(c => (
                            <Pressable key={`${c.key}=${c.eq ?? ''}`}
                              onPress={() => pushTok({ t: 'jcf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                              onLongPress={() => Alert.alert(c.label, c.eq !== undefined ? t.formulaJcfCountDesc : t.formulaJcfDesc)}
                              className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 active:bg-emerald-100">
                              <Text className="text-xs font-semibold text-emerald-700">{c.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text className="text-[11px] text-gray-400">{t.formulaJobFieldHint}</Text>
                      </>
                    ) : null}
                    {draftConfig.formula.length > 0 ? (
                      <Pressable onPress={() => setDraftConfig(c => ({ ...c, formula: [] }))} className="self-start">
                        <Text className="text-xs font-semibold text-gray-400">{t.formulaClear}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>

              <Pressable onPress={saveSettings} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90">
                <Text className="text-sm font-semibold text-white">{t.saveBtn}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </RNModal>

      {/* Mark-paid sheet */}
      <RNModal visible={!!payRow} transparent animationType="fade" onRequestClose={() => setPayRow(null)}>
        <Pressable onPress={() => setPayRow(null)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="items-center mb-4">
              <Text className="text-base font-semibold text-gray-900">{payRow?.name}</Text>
              <Text className="text-3xl font-bold text-primary mt-1">{fmt(modalTotal)}</Text>
              <Text className="text-sm text-gray-400 mt-0.5">{Math.round((payRow?.hours ?? 0) * 100) / 100} h</Text>
            </View>

            {(payRow?.payments ?? []).length > 0 ? (
              <View className="mb-4">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.alreadyPaidLabel}</Text>
                <View className="rounded-xl border border-gray-100 overflow-hidden">
                  {(payRow?.payments ?? []).map((pmt, i) => (
                    <View key={pmt.id} className={`px-3 py-2 flex-row items-center gap-2 ${i < (payRow?.payments?.length ?? 0) - 1 ? 'border-b border-gray-50' : ''}`}>
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-gray-900">{fmt(pmt.grossPay)}</Text>
                        <Text className="text-[11px] text-gray-400">
                          {pmt.hours ? `${Math.round(pmt.hours * 100) / 100} h · ` : ''}
                          {paymentBadgeLabel(pmt)}
                          {pmt.paidAt ? ` · ${fmtDay(pmt.paidAt)}` : ''}
                        </Text>
                      </View>
                      <Pressable onPress={() => onDeletePayment(pmt.id)} disabled={busy} hitSlop={8} className="p-1.5 rounded-lg active:bg-red-50">
                        <Trash2 size={15} color="#F87171" />
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={() => {
                    if (!payRow) return;
                    Alert.alert(
                      t.clearPaymentsLabel,
                      t.clearPaymentsConfirm.replace('{{name}}', payRow.name),
                      [
                        { text: full.common.buttons.cancel, style: 'cancel' },
                        { text: t.clearPaymentsLabel, style: 'destructive', onPress: () => onClearPayments(payRow.employeeId) },
                      ],
                    );
                  }}
                  disabled={busy}
                  className="mt-2 self-start"
                >
                  <Text className="text-xs font-semibold text-red-500">{t.clearPaymentsLabel}</Text>
                </Pressable>
              </View>
            ) : null}

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.methodHeading}</Text>
            <View className="flex-row gap-2 mb-4">
              {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                const on = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    className={`flex-1 py-3 rounded-2xl items-center gap-1 border ${on ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}
                  >
                    <Icon size={16} color={on ? '#4F46E5' : '#9CA3AF'} />
                    <Text className={`text-xs font-semibold ${on ? 'text-primary' : 'text-gray-500'}`}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {method === 'check' ? (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-gray-700 mb-2">{t.checkNumberLabel}</Text>
                <TextInput
                  value={checkNumber}
                  onChangeText={setCheckNumber}
                  placeholder={t.checkNumberPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                />
              </View>
            ) : null}

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">{t.amountLabel}</Text>
              <TextInput
                value={amount}
                onChangeText={v => setAmount(v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">{t.hoursCoveredLabel}</Text>
              <TextInput
                value={hoursCovered}
                onChangeText={v => setHoursCovered(v.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">{t.bonusLabel}</Text>
              <TextInput
                value={bonus}
                onChangeText={v => setBonus(v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
              />
            </View>

            <Pressable onPress={confirmPay} disabled={busy || !(parseFloat(amount) > 0 || parseFloat(bonus) > 0)} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">{t.confirmBtn}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* Worker hours breakdown sheet */}
      <RNModal visible={!!detailRow} transparent animationType="fade" onRequestClose={() => setDetailRow(null)}>
        <Pressable onPress={() => setDetailRow(null)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-gray-900">{detailRow?.name}</Text>
                <Text className="text-sm text-gray-500">
                  {fmt(detailRow?.pay ?? 0)} · {Math.round((detailRow?.hours ?? 0) * 100) / 100} h
                </Text>
              </View>
              <Pressable onPress={() => setDetailRow(null)} hitSlop={10} className="p-1">
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            {/* Worked vs driven vs logged */}
            <View className="flex-row gap-2 mb-4">
              {([[Wrench, t.hoursWorked, detailRow?.breakdown?.workedHours ?? 0], [Truck, t.hoursDriven, detailRow?.breakdown?.drivenHours ?? 0], [Clock, t.hoursLogged, detailRow?.breakdown?.loggedHours ?? 0]] as const).map(([Icon, label, val], i) => (
                <View key={i} className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-3 items-center">
                  <Icon size={15} color="#9CA3AF" />
                  <Text className="text-base font-bold text-gray-900 mt-1">{val}</Text>
                  <Text className="text-[11px] text-gray-400">{label}</Text>
                </View>
              ))}
            </View>

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.projectsHeading}</Text>
            {detailRow?.breakdown && detailRow.breakdown.jobs.length > 0 ? (
              <ScrollView className="max-h-72">
                <View className="gap-2">
                  {detailRow.breakdown.jobs.map((j, i) => (
                    <View key={j.jobId ?? i} className="flex-row items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{j.title || t.untitledJob}</Text>
                        {j.date ? <Text className="text-[11px] text-gray-400">{j.date}</Text> : null}
                      </View>
                      <View className="items-end">
                        {j.workedHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Wrench size={11} color="#9CA3AF" />
                            <Text className="text-xs text-gray-600">{j.workedHours} h</Text>
                          </View>
                        ) : null}
                        {j.drivenHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Truck size={11} color="#9CA3AF" />
                            <Text className="text-xs text-gray-600">{j.drivenHours} h</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-sm text-gray-400 py-4 text-center">{t.noBreakdown}</Text>
            )}
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}

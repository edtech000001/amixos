import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal as RNModal, Alert, Keyboard, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { ChevronLeft, ChevronRight, Check, Banknote, FileText, Landmark, X, Wrench, Truck, Clock, Settings, List, LayoutGrid, History, Trash2, Pencil, Search, ChevronDown } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { DatePicker } from '../../ui';
import type { PayrollFrequency, PayrollBreakdown, PayrollConfig, DriverPayMode } from '../../lib/payroll';
import { getPayrollPeriod, parsePayrollAnchor } from '../../lib/payroll';
import { formatMoneyInput } from '../../lib/format';
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
  /** Present when the worker has been marked paid for this period. */
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

/** One loan-ledger entry. amount > 0 = loan given, < 0 = repayment/deduction. */
export interface LoanLedgerEntry {
  id: string;
  amount: number;
  note: string | null;
  entryDate: string; // YYYY-MM-DD
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
  /** Pay components (overtime / driver pay); onConfigChange persists it. */
  config: PayrollConfig;
  onConfigChange: (c: PayrollConfig) => void;
  /** Per-worker overtime (settings sheet list). Changes save instantly. */
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
   *  sheet for people not on the period's list (owner checks, ex-workers). */
  allWorkers?: { id: string; name: string }[];
  /** Outstanding loan balance per employee (employeeId → amount owed). */
  loanBalances?: Record<string, number>;
  /** Full loan ledger per employee (employeeId → entries), newest first. */
  loanEntries?: Record<string, LoanLedgerEntry[]>;
  /** Every employee incl. inactive — powers the loans directory so ex-workers'
   *  balances stay reachable after they leave. */
  loanWorkers?: { id: string; name: string }[];
  /** Give a worker a new loan/advance (increases what they owe). */
  onAddLoan?: (employeeId: string, amount: number, note: string, entryDate: string) => void;
  /** Record a repayment/deduction against a worker's loan (decreases it).
   *  Check-deduction passes amount only; manual cash paydown adds note + date. */
  onLoanRepayment?: (employeeId: string, amount: number, note?: string, entryDate?: string) => void;
  /** Delete a single loan-ledger entry (mistaken loan/payment). */
  onDeleteLoan?: (id: string) => void;
  /** Edit a loan-ledger entry. `amount` is SIGNED (sign preserved by the caller
   *  from the original entry: + loan, − repayment). */
  onEditLoan?: (id: string, amount: number, note: string, entryDate: string) => void;
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
  loanBalances,
  loanEntries,
  loanWorkers,
  onAddLoan,
  onLoanRepayment,
  onDeleteLoan,
  onEditLoan,
}: PayrollScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;
  const c = useThemeColors();

  // Mark-paid sheet state.
  // Settings sheet — edits a DRAFT; nothing persists until Save.
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
  // Have the settings drafts diverged from the saved values? Guards the close
  // gestures so a half-built pay formula isn't lost by an accidental tap-out.
  const settingsDirty = () => {
    const f = draftConfig.formula ?? null;
    const cleaned = { ...draftConfig, formula: f && f.length ? f : null };
    return (
      draftFreq !== frequency ||
      draftAnchor !== (anchorDate ?? '') ||
      draftCustomDays !== String(customDays ?? 7) ||
      JSON.stringify(cleaned) !== JSON.stringify(config)
    );
  };
  const closeSettings = () => {
    if (settingsDirty()) {
      const u = full.common.unsavedChanges;
      Alert.alert(u.title, u.body, [
        { text: u.stay, style: 'cancel' },
        { text: u.discard, style: 'destructive', onPress: () => setSettingsOpen(false) },
      ]);
      return;
    }
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
  const [workerSearch, setWorkerSearch] = useState('');
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const [manualPeriodPickerOpen, setManualPeriodPickerOpen] = useState(false);
  const openManual = () => {
    setManualWorker('');
    setManualAmount('');
    setManualHours('');
    setManualMethod('check');
    setManualCheck('');
    setManualPeriod(periodStartStr ?? manualPeriods[0]?.start ?? '');
    setWorkerSearch('');
    setManualOpen(true);
  };
  const confirmManual = () => {
    const amt = parseFloat(manualAmount) || 0;
    if (!manualWorker || amt <= 0) return;
    onMarkPaid(manualWorker, manualMethod, manualMethod === 'check' ? manualCheck.trim() : '', 0, amt, parseFloat(manualHours) || 0, null, manualPeriod || undefined);
    setManualOpen(false);
  };

  // Grid layout: 1 card per row on phones (2-up feels cramped), 2-up only once
  // the screen is wide enough (tablets / large phones in landscape).
  const { width: screenWidth } = useWindowDimensions();
  const gridTwoCol = screenWidth >= 700;

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

  const insets = useSafeAreaInsets();
  const [payRow, setPayRow] = useState<PayrollScreenRow | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [bonus, setBonus] = useState('');

  // Worker whose hours breakdown sheet is open.
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
  // Recorded payment exceeds the period's computed pay (e.g. a manual check for
  // a $0-rate worker) — show what was actually PAID, not the computed number.
  const overpaid = (r: PayrollScreenRow) =>
    (r.payments?.length ?? 0) > 0 && paidTotal(r) > r.pay + bonusTotal(r) + 0.005;
  const paidCount = rows.filter(isFullyPaid).length;
  // Unpaid first, paid sink to the bottom (stable — keeps pay-desc within group).
  const sortedRows = [...rows].sort((a, b) => (isFullyPaid(a) ? 1 : 0) - (isFullyPaid(b) ? 1 : 0));

  // The pay sheet is a mini-ledger: it lists this period's payments and
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
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Loan tracker (pay sheet): deduction toward a loan; the loans overlay adds/
  // deletes ledger entries and shows full history.
  const [loanDeduct, setLoanDeduct] = useState('');
  const [showLoans, setShowLoans] = useState(false);   // loans overlay visible (from pay sheet)
  const [showAddLoan, setShowAddLoan] = useState(false);     // add-loan form
  const [showAddPayment, setShowAddPayment] = useState(false); // record-cash-paydown form
  const [editingEntry, setEditingEntry] = useState<LoanLedgerEntry | null>(null); // edit existing entry
  const [loanAmount, setLoanAmount] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanDate, setLoanDate] = useState('');
  // Header-level loans directory (reaches ex-workers not on this period).
  const [loansOpen, setLoansOpen] = useState(false);
  const [loanSearch, setLoanSearch] = useState('');
  const [loanWorkerId, setLoanWorkerId] = useState<string | null>(null);
  const [loanPickMode, setLoanPickMode] = useState(false); // picking a worker to start a loan
  const loanBalanceOf = (employeeId: string) => loanBalances?.[employeeId] ?? 0;
  const loanEntriesOf = (employeeId: string) => loanEntries?.[employeeId] ?? [];
  const loanNameOf = (employeeId: string) => (loanWorkers ?? []).find(w => w.id === employeeId)?.name ?? '';
  // Default directory: only workers who actually have loan activity, highest
  // balance first.
  const loanDirectory = useMemo(() => {
    const q = loanSearch.trim().toLowerCase();
    return (loanWorkers ?? [])
      .filter(w => (loanBalanceOf(w.id) !== 0 || loanEntriesOf(w.id).length > 0) && w.name.toLowerCase().includes(q))
      .sort((a, b) => (loanBalanceOf(b.id) - loanBalanceOf(a.id)) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanWorkers, loanSearch, loanEntries, loanBalances]);
  // Pick list (from "+ Add loan"): every worker, alphabetical.
  const loanPickList = useMemo(() => {
    const q = loanSearch.trim().toLowerCase();
    return (loanWorkers ?? [])
      .filter(w => w.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [loanWorkers, loanSearch]);

  const openPay = (row: PayrollScreenRow) => {
    setPayRow(row);
    setMethod('cash');
    setCheckNumber('');
    setBonus('');
    setLoanDeduct('');
    setShowLoans(false);
    setShowAddLoan(false);
    setShowAddPayment(false);
    setLoanAmount('');
    setLoanNote('');
    setLoanDate('');
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
    const deduct = parseFloat(loanDeduct) || 0;
    if (deduct > 0 && onLoanRepayment) {
      // Record HOW this loan deduction was taken, so the ledger shows e.g.
      // "Deducted from check #1123" / "from wire" / "from cash".
      const num = checkNumber.trim();
      const note =
        method === 'check'
          ? (num ? t.loanNoteFromCheckNum.replace('{{n}}', num) : t.loanNoteFromCheck)
          : method === 'wire'
            ? t.loanNoteFromWire
            : t.loanNoteFromCash;
      onLoanRepayment(payRow.employeeId, deduct, note);
    }
    setPayRow(null);
  };
  const resetLoanForms = () => { setShowAddLoan(false); setShowAddPayment(false); setEditingEntry(null); setLoanAmount(''); setLoanNote(''); setLoanDate(todayStr()); };
  const openLoans = () => { resetLoanForms(); setShowLoans(true); };
  const openLoansGlobal = () => {
    setLoanSearch('');
    setLoanWorkerId(null);
    setLoanPickMode(false);
    resetLoanForms();
    setLoansOpen(true);
  };
  // Directory tap → view history. Picker tap → open the new-loan form.
  const selectLoanWorker = (id: string, openLoanForm = false) => {
    setLoanWorkerId(id);
    setLoanPickMode(false);
    resetLoanForms();
    setShowAddLoan(openLoanForm);
  };
  const startAddLoanPicker = () => { setLoanSearch(''); setLoanPickMode(true); };
  // The worker a new loan/payment applies to: directory selection wins, else
  // the pay-sheet worker.
  const loanTargetId = loanWorkerId ?? payRow?.employeeId ?? null;
  const submitAddLoan = () => {
    if (!loanTargetId || !onAddLoan) return;
    const amt = parseFloat(loanAmount) || 0;
    if (amt <= 0) return;
    onAddLoan(loanTargetId, amt, loanNote.trim(), loanDate || todayStr());
    resetLoanForms();
  };
  // Manual cash paydown — a repayment NOT tied to a check, with its own date.
  const submitAddPayment = () => {
    if (!loanTargetId || !onLoanRepayment) return;
    const amt = parseFloat(loanAmount) || 0;
    if (amt <= 0) return;
    onLoanRepayment(loanTargetId, amt, loanNote.trim(), loanDate || todayStr());
    resetLoanForms();
  };
  // Edit an existing ledger entry — reuses the amount/note/date form, keeps the
  // original sign (loan vs repayment).
  const startEditEntry = (e: LoanLedgerEntry) => {
    setShowAddLoan(false);
    setShowAddPayment(false);
    setEditingEntry(e);
    setLoanAmount(String(Math.abs(e.amount)));
    setLoanNote(e.note ?? '');
    setLoanDate(e.entryDate || todayStr());
  };
  const submitEditLoan = () => {
    if (!editingEntry || !onEditLoan) return;
    const amt = parseFloat(loanAmount) || 0;
    if (amt <= 0) return;
    const signed = editingEntry.amount < 0 ? -Math.abs(amt) : Math.abs(amt);
    onEditLoan(editingEntry.id, signed, loanNote.trim(), loanDate || todayStr());
    resetLoanForms();
  };
  const loanFormOpen = showAddLoan || showAddPayment || !!editingEntry;
  // Live total shown big at the top of the sheet: what's owed + bonus.
  const modalTotal = payRow ? checkBaseOf(payRow) + (parseFloat(bonus) || 0) : 0;
  const netToPay = modalTotal - (parseFloat(loanDeduct) || 0);

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
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-base font-semibold text-ink">{t.title}</Text>
          <Text className="text-xs text-faint">{t.subtitle}</Text>
        </View>
        {onHistoryPress ? (
          <Pressable
            onPress={onHistoryPress}
            hitSlop={8}
            className="flex-row items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-xl mr-1 active:bg-surface"
          >
            <History size={15} color={c.muted} />
            <Text className="text-xs font-semibold text-ink">{t.historyTitle}</Text>
          </Pressable>
        ) : null}
        {canManage ? (
          <Pressable onPress={openSettings} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
            <Settings size={20} color={c.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-32 gap-4">
        {/* Period navigator */}
        <View className="flex-row items-center justify-between bg-card rounded-2xl border border-border-soft shadow-sm px-2 py-2">
          <Pressable onPress={onPrevPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-border-soft">
            <ChevronLeft size={20} color={c.muted} />
          </Pressable>
          <Text className="text-sm font-semibold text-ink">{periodLabel}</Text>
          <Pressable onPress={onNextPeriod} hitSlop={8} className="p-2 rounded-xl active:bg-border-soft">
            <ChevronRight size={20} color={c.muted} />
          </Pressable>
        </View>

        {/* Summary */}
        <View className="flex-row gap-3">
          <View className="flex-1 bg-card rounded-2xl border border-border-soft shadow-sm p-3">
            <Text className="text-[11px] text-faint" numberOfLines={1}>{t.totalHours}</Text>
            <Text className="text-lg font-bold text-ink" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{Math.round(totalHours * 100) / 100}</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border-soft shadow-sm p-3">
            <Text className="text-[11px] text-faint" numberOfLines={1}>{t.totalPay}</Text>
            <Text className="text-lg font-bold text-primary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmt(totalPay)}</Text>
          </View>
          <View className="flex-1 bg-card rounded-2xl border border-border-soft shadow-sm p-3">
            <Text className="text-[11px] text-faint" numberOfLines={1}>{t.totalPending}</Text>
            <Text className={`text-lg font-bold ${totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmt(totalPending)}</Text>
          </View>
        </View>

        {/* Manual payment + loans — full-width so the list toolbar stays clean;
           always available (even in an empty period, to reach ex-workers). */}
        {canManage && ((allWorkers && allWorkers.length > 0) || onAddLoan) ? (
          <View className="flex-row gap-3">
            {allWorkers && allWorkers.length > 0 ? (
              <Pressable onPress={openManual}
                className="flex-1 flex-row items-center justify-center gap-1.5 bg-card border border-border py-2.5 rounded-xl active:bg-surface">
                <Banknote size={15} color={c.muted} />
                <Text className="text-sm font-semibold text-ink">{t.manualPayBtn}</Text>
              </Pressable>
            ) : null}
            {onAddLoan ? (
              <Pressable onPress={openLoansGlobal}
                className="flex-1 flex-row items-center justify-center gap-1.5 bg-card border border-border py-2.5 rounded-xl active:bg-surface">
                <Landmark size={15} color={c.muted} />
                <Text className="text-sm font-semibold text-ink">{t.loanViewBtn}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {rows.length > 0 ? (
          <View className="flex-row items-center justify-between -mt-1">
            <Text className="text-xs text-faint">
              {t.paidSummary.replace('{{paid}}', String(paidCount)).replace('{{total}}', String(rows.length))}
            </Text>
            <View className="flex-row gap-1 bg-border-soft p-1 rounded-lg">
              {([['list', List], ['grid', LayoutGrid]] as const).map(([v, Icon]) => (
                <Pressable key={v} onPress={() => changeView(v)}
                  className={`p-1.5 rounded-md ${view === v ? 'bg-card shadow-sm' : ''}`}>
                  <Icon size={15} color={view === v ? c.ink : c.faint} />
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
          <Text className="text-sm text-faint text-center py-10">{t.empty}</Text>
        ) : view === 'grid' ? (
          <View className="flex-row flex-wrap justify-between">
            {sortedRows.map(r => {
              // The status badge / "Mark paid" action. On single-column cards it
              // sits on the RIGHT (bigger, more tappable); on 2-up it stacks below.
              const action = (r.payments?.length ?? 0) > 0 ? (
                <Pressable onPress={() => canManage && openPay(r)} disabled={!canManage} className="self-start">
                  <View className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${isPartial(r) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                    <Check size={11} color={isPartial(r) ? c.warning : c.success} />
                    <Text className={`text-[11px] font-semibold ${isPartial(r) ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {isPartial(r)
                        ? `${t.partialLabel} ${fmt(paidTotal(r))}${paidHours(r) > 0 ? ` · ${Math.round(paidHours(r) * 100) / 100} h` : ''}`
                        : r.payments!.length === 1 ? paymentBadgeLabel(r.payments![0]) : fmt(paidTotal(r))}
                    </Text>
                  </View>
                </Pressable>
              ) : canManage ? (
                <Pressable onPress={() => openPay(r)} disabled={busy}
                  className={gridTwoCol ? 'self-start' : 'px-4 py-2.5 rounded-xl bg-primary/10 active:opacity-80'}>
                  <Text className={`font-semibold text-primary ${gridTwoCol ? 'text-xs' : 'text-sm'}`}>{t.markPaid}</Text>
                </Pressable>
              ) : null;
              return (
                <View key={r.employeeId} className={`${gridTwoCol ? 'w-[48.5%]' : 'w-full flex-row items-center'} bg-card rounded-2xl border border-border-soft shadow-sm p-3.5 mb-3`}>
                  <View className={gridTwoCol ? '' : 'flex-1 min-w-0'}>
                    <Pressable onPress={() => setDetailRow(r)} className="active:opacity-60">
                      <Text className="text-[11px] text-faint">
                        {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''} · {Math.round(r.hours * 100) / 100} h
                      </Text>
                      <Text className="text-sm font-semibold text-ink mt-0.5" numberOfLines={1}>{r.name}</Text>
                    </Pressable>
                    {isPartial(r) ? (
                      <Text className="text-xl font-bold text-amber-600 mt-1">
                        {fmt(checkBaseOf(r))}
                        <Text className="text-xs font-semibold text-faint"> {t.ofTotal.replace('{{total}}', fmt(r.pay))}</Text>
                      </Text>
                    ) : overpaid(r) ? (
                      <Text className="text-xl font-bold text-amber-600 mt-1">
                        {fmt(paidTotal(r))}
                        <Text className="text-xs font-semibold text-faint"> {t.paidTag}</Text>
                      </Text>
                    ) : (
                      <Text className="text-xl font-bold text-primary mt-1">{fmt(r.pay)}</Text>
                    )}
                    {gridTwoCol && action ? <View className="mt-2">{action}</View> : null}
                  </View>
                  {!gridTwoCol && action ? <View className="ml-3 shrink-0">{action}</View> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
            {sortedRows.map((r, i) => (
              <View
                key={r.employeeId}
                className={`px-4 py-3.5 flex-row items-center gap-3 ${i < sortedRows.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                {/* Name/hours area opens the hours breakdown. */}
                <Pressable onPress={() => setDetailRow(r)} className="flex-1 min-w-0 flex-row items-center gap-1.5 active:opacity-60">
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{r.name}</Text>
                    <Text className="text-xs text-faint">
                      {Math.round(r.hours * 100) / 100} h · {fmt(r.payRate)}{r.payType === 'hourly' ? '/h' : ''}
                      {(r.overtimeHours ?? 0) > 0 ? ` · ${Math.round((r.overtimeHours ?? 0) * 100) / 100} h ${t.otShort}` : ''}
                      {(r.driverPay ?? 0) > 0 ? ` · ${fmt(r.driverPay ?? 0)} ${t.driveShort}` : ''}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={c.faint} />
                </Pressable>
                <View className="items-end">
                  {isPartial(r) ? (
                    <View className="items-end">
                      <Text className="text-sm font-bold text-amber-600">{fmt(checkBaseOf(r))}</Text>
                      <Text className="text-[11px] text-faint">{t.ofTotal.replace('{{total}}', fmt(r.pay))}</Text>
                    </View>
                  ) : overpaid(r) ? (
                    <View className="items-end">
                      <Text className="text-sm font-bold text-amber-600">{fmt(paidTotal(r))}</Text>
                      <Text className="text-[11px] text-faint">{t.paidTag}</Text>
                    </View>
                  ) : (
                    <Text className="text-sm font-bold text-ink">{fmt(r.pay)}</Text>
                  )}
                  {(r.payments?.length ?? 0) > 0 ? (
                    <Pressable onPress={() => canManage && openPay(r)} disabled={!canManage}>
                      <View className="flex-row items-center gap-1 mt-0.5">
                        <View className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${isPartial(r) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                          <Check size={11} color={isPartial(r) ? c.warning : c.success} />
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

      {/* Manual payment sheet */}
      <RNModal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 justify-end">
                  <Pressable
                    onPress={() => setManualOpen(false)}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-ink">{t.manualPayBtn}</Text>
              <Pressable onPress={() => setManualOpen(false)} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft">
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="text-sm font-semibold text-ink mb-2">{t.manualPeriodLabel}</Text>
              <Pressable
                onPress={() => setManualPeriodPickerOpen(true)}
                className="mb-4 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className="text-base flex-1 text-ink" numberOfLines={1}>
                  {manualPeriods.find(pr => pr.start === manualPeriod)?.label ?? ''}
                </Text>
                <ChevronDown size={16} color={c.faint} />
              </Pressable>

              <Text className="text-sm font-semibold text-ink mb-2">{t.manualWorkerLabel}</Text>
              <Pressable
                onPress={() => { setWorkerSearch(''); setManualPickerOpen(true); }}
                className="mb-4 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <Text className={`text-base flex-1 ${manualWorker ? 'text-ink' : 'text-faint'}`} numberOfLines={1}>
                  {(allWorkers ?? []).find(w => w.id === manualWorker)?.name ?? t.manualSelectWorker}
                </Text>
                <ChevronDown size={16} color={c.faint} />
              </Pressable>

              <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.methodHeading}</Text>
              <View className="flex-row gap-2 mb-4">
                {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                  const on = manualMethod === m;
                  return (
                    <Pressable key={m} onPress={() => setManualMethod(m)}
                      className={`flex-1 py-3 rounded-2xl items-center gap-1 border ${on ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}>
                      <Icon size={16} color={on ? c.primary : c.faint} />
                      <Text className={`text-xs font-semibold ${on ? 'text-primary' : 'text-muted'}`}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {manualMethod === 'check' ? (
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-ink mb-2">{t.checkNumberLabel}</Text>
                  <TextInput value={manualCheck} onChangeText={setManualCheck} placeholder={t.checkNumberPlaceholder}
                    placeholderTextColor={c.faint} keyboardType="number-pad"
                    className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink" />
                </View>
              ) : null}

              <View className="mb-4">
                <Text className="text-sm font-semibold text-ink mb-2">{t.amountLabel}</Text>
                <TextInput value={formatMoneyInput(manualAmount)} onChangeText={v => setManualAmount(v.replace(/,/g, '').replace(/[^0-9.]/g, ''))} placeholder="0.00"
                  placeholderTextColor={c.faint} keyboardType="decimal-pad"
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink" />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-ink mb-2">{t.hoursCoveredLabel}</Text>
                <TextInput value={manualHours} onChangeText={v => setManualHours(v.replace(/[^0-9.]/g, ''))} placeholder="0"
                  placeholderTextColor={c.faint} keyboardType="decimal-pad"
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink" />
              </View>

              <Pressable onPress={confirmManual} disabled={busy || !manualWorker || !(parseFloat(manualAmount) > 0)}
                className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
                <Text className="text-sm font-semibold text-white">{t.confirmBtn}</Text>
              </Pressable>
            </ScrollView>
          </View>

          {/* Period picker — overlay inside this modal (see worker picker). */}
          {manualPeriodPickerOpen ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={() => setManualPeriodPickerOpen(false)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
              />
              <View
                className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
                style={{ height: '70%', marginBottom: insets.bottom + 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 24 }}
              >
                <View className="items-center mb-2">
                  <View className="w-10 h-1 bg-border rounded-full" />
                </View>
                <View className="px-5 mb-3 flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-ink">{t.manualPeriodLabel}</Text>
                  <Pressable onPress={() => setManualPeriodPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                    <X size={22} color={c.faint} />
                  </Pressable>
                </View>
                <ScrollView className="flex-1">
                  {manualPeriods.map(pr => {
                    const isSel = pr.start === manualPeriod;
                    return (
                      <Pressable
                        key={pr.start}
                        onPress={() => { setManualPeriod(pr.start); setManualPeriodPickerOpen(false); }}
                        className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${isSel ? 'bg-primary/5' : ''}`}
                      >
                        <Text className={`text-sm flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`}>{pr.label}</Text>
                        {isSel ? <Check size={16} color={c.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}

          {/* Worker picker — overlay INSIDE this modal (iOS won't present a
             second native Modal on top of an open one). Same look as the job
             form's lead picker. */}
          {manualPickerOpen ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => setManualPickerOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View
            className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{
              height: '80%',
              marginBottom: insets.bottom + 12,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="px-5 mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-ink">{t.manualWorkerLabel}</Text>
              <Pressable onPress={() => setManualPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                <X size={22} color={c.faint} />
              </Pressable>
            </View>
            <View className="px-5 mb-3">
              <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                <Search size={16} color={c.faint} />
                <TextInput
                  value={workerSearch}
                  onChangeText={setWorkerSearch}
                  placeholder={t.manualSelectWorker}
                  placeholderTextColor={c.faint}
                  className="flex-1 py-2.5 pl-2 text-sm text-ink"
                />
              </View>
            </View>
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {(allWorkers ?? [])
                .filter(w => w.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(workerSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
                .map(w => {
                  const isSel = w.id === manualWorker;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => { setManualWorker(w.id); setManualPickerOpen(false); }}
                      className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${isSel ? 'bg-primary/5' : ''}`}
                    >
                      <Text className={`text-sm flex-1 ${isSel ? 'text-primary font-semibold' : 'text-ink'}`} numberOfLines={1}>
                        {w.name}
                      </Text>
                      {isSel ? <Check size={16} color={c.primary} /> : null}
                    </Pressable>
                  );
                })}
            </ScrollView>
          </View>
          </View>
          ) : null}
        </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Payroll settings sheet — frequency / anchor / pay components. */}
      <RNModal visible={settingsOpen} transparent animationType="fade" onRequestClose={closeSettings}>
        <View className="flex-1 justify-end">
                  <Pressable
                    onPress={closeSettings}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-bold text-ink">{t.settingsTitle}</Text>
              <Pressable onPress={closeSettings} hitSlop={10} className="p-1 rounded-lg active:bg-border-soft">
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.freqLabel}</Text>
              <View className="flex-row gap-2 mb-4">
                {FREQS.map(f => {
                  const on = f === draftFreq;
                  return (
                    <Pressable key={f} onPress={() => setDraftFreq(f)}
                      className={`flex-1 py-2.5 rounded-xl items-center border ${on ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}>
                      <Text className={`text-sm font-semibold ${on ? 'text-primary' : 'text-muted'}`}>{freqLabel[f]}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {draftFreq === 'custom' ? (
                <View className="mb-4">
                  <Text className="text-xs text-muted mb-1">{t.customDaysLabel}</Text>
                  <TextInput
                    value={draftCustomDays}
                    onChangeText={setDraftCustomDays}
                    keyboardType="number-pad"
                    className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                  />
                </View>
              ) : null}

              <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.anchorLabel}</Text>
              <DatePicker value={draftAnchor} onChange={setDraftAnchor} />
              <Text className="text-[11px] text-faint mt-1.5 mb-4">{t.anchorHint}</Text>

              <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.componentsHeading}</Text>
              <View className="rounded-2xl border border-border-soft p-4 gap-3 mb-5">
                <Text className="text-sm font-medium text-ink">{t.driverHeading}</Text>
                <View className="flex-row gap-2">
                  {([['same', t.driverSame], ['rate', t.driverRate], ['flat', t.driverFlat]] as [DriverPayMode, string][]).map(([m, label]) => (
                    <Pressable key={m}
                      onPress={() => setDraftConfig({ ...draftConfig, driver: { ...draftConfig.driver, mode: m } })}
                      className={`flex-1 py-2 rounded-xl items-center border ${
                        draftConfig.driver.mode === m ? 'bg-primary/10 border-primary' : 'bg-card border-border'
                      }`}>
                      <Text className={`text-xs font-semibold ${draftConfig.driver.mode === m ? 'text-primary' : 'text-muted'}`}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                {draftConfig.driver.mode !== 'same' ? (
                  <View>
                    <Text className="text-xs text-muted mb-1">
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
                      className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                    />
                  </View>
                ) : null}
              </View>

              <View className="rounded-2xl border border-border-soft p-4 gap-3 mb-5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-ink">{t.formulaHeading}</Text>
                  {draftConfig.formula ? (
                    <Pressable
                      onPress={() => setDraftConfig(c => ({ ...c, formula: null }))}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card active:bg-surface"
                    >
                      <Text className="text-xs font-semibold text-muted">{t.formulaRemove}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {!draftConfig.formula ? (
                  <>
                    <Text className="text-xs text-faint">{t.formulaStandardHint}</Text>
                    <Pressable
                      onPress={() => setDraftConfig(c => ({ ...c, formula: [] }))}
                      className="py-2 rounded-xl border border-dashed border-border items-center active:opacity-80"
                    >
                      <Text className="text-sm font-semibold text-muted">{t.formulaCreate}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View className="min-h-[52px] rounded-xl bg-surface border border-border-soft p-2 flex-row flex-wrap items-center gap-1.5">
                      {draftConfig.formula.length === 0 ? (
                        <Text className="text-xs text-faint px-1">{t.formulaEmpty}</Text>
                      ) : (
                        draftConfig.formula.map((tok, i) => (
                          <Pressable
                            key={i}
                            onPress={() => removeTok(i)}
                            className={`px-2 py-1 rounded-lg border ${
                              tok.t === 'op' || tok.t === 'lp' || tok.t === 'rp' || tok.t === 'num'
                                ? 'bg-card border-border'
                                : 'bg-primary/10 border-primary/30'
                            }`}
                          >
                            <Text className={`text-xs font-semibold ${
                              tok.t === 'op' || tok.t === 'lp' || tok.t === 'rp' ? 'text-ink'
                              : tok.t === 'num' ? 'text-ink' : 'text-primary'
                            }`}>{tokLabel(tok)}</Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                    {formulaError ? (
                      <Text className="text-xs text-red-500">{t.formulaInvalid}</Text>
                    ) : (
                      <Text className="text-[11px] text-faint">{t.formulaBuildHint}</Text>
                    )}

                    <View className="flex-row flex-wrap gap-1.5 items-center">
                      {(['+', '-', '*', '/'] as const).map(op => (
                        <Pressable key={op} onPress={() => pushTok({ t: 'op', v: op })}
                          className="w-9 h-8 rounded-lg border border-border items-center justify-center active:bg-surface">
                          <Text className="text-sm font-bold text-ink">{OP_SYMBOLS[op]}</Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => pushTok({ t: 'lp' })} className="w-9 h-8 rounded-lg border border-border items-center justify-center active:bg-surface">
                        <Text className="text-sm font-bold text-ink">(</Text>
                      </Pressable>
                      <Pressable onPress={() => pushTok({ t: 'rp' })} className="w-9 h-8 rounded-lg border border-border items-center justify-center active:bg-surface">
                        <Text className="text-sm font-bold text-ink">)</Text>
                      </Pressable>
                      <TextInput
                        value={numEntry}
                        onChangeText={setNumEntry}
                        placeholder={t.formulaNumberPlaceholder}
                        placeholderTextColor={c.faint}
                        keyboardType="decimal-pad"
                        className="w-24 h-8 rounded-lg border border-border px-2 text-xs text-ink"
                      />
                      <Pressable onPress={addNumEntry} disabled={!numEntry}
                        className={`h-8 px-3 rounded-lg border border-border items-center justify-center ${numEntry ? 'active:bg-surface' : 'opacity-40'}`}>
                        <Text className="text-xs font-semibold text-ink">{t.formulaAddNumber}</Text>
                      </Pressable>
                    </View>

                    <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">{t.formulaVarsHeading}</Text>
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
                        <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">{t.formulaEmpFieldsHeading}</Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          {fieldChips(formulaFields.emp).map(c => (
                            <Pressable key={`${c.key}=${c.eq ?? ''}`}
                              onPress={() => pushTok({ t: 'ecf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                              onLongPress={() => Alert.alert(c.label, c.eq !== undefined ? t.formulaEcfMatchDesc : t.formulaEcfDesc)}
                              className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-200 active:bg-amber-100">
                              <Text className="text-xs font-semibold text-amber-700">{c.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}
                    {formulaFields && formulaFields.job.length > 0 ? (
                      <>
                        <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">{t.formulaJobFieldsHeading}</Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          {fieldChips(formulaFields.job).map(c => (
                            <Pressable key={`${c.key}=${c.eq ?? ''}`}
                              onPress={() => pushTok({ t: 'jcf', k: c.key, label: c.label, ...(c.eq !== undefined ? { eq: c.eq } : {}) })}
                              onLongPress={() => Alert.alert(c.label, c.eq !== undefined ? t.formulaJcfCountDesc : t.formulaJcfDesc)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-200 active:bg-emerald-100">
                              <Text className="text-xs font-semibold text-emerald-700">{c.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text className="text-[11px] text-faint">{t.formulaJobFieldHint}</Text>
                      </>
                    ) : null}
                    {draftConfig.formula.length > 0 ? (
                      <Pressable onPress={() => setDraftConfig(c => ({ ...c, formula: [] }))} className="self-start">
                        <Text className="text-xs font-semibold text-faint">{t.formulaClear}</Text>
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
        </View>
      </RNModal>

      {/* Mark-paid sheet */}
      <RNModal visible={!!payRow} transparent animationType="fade" onRequestClose={() => setPayRow(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
                  <Pressable
                    onPress={() => setPayRow(null)}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]">
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="items-center mb-4">
              <Pressable onPress={() => setPayRow(null)} hitSlop={10} className="absolute right-0 top-0 p-1 rounded-lg active:bg-border-soft">
                <X size={20} color={c.faint} />
              </Pressable>
              <Text className="text-base font-semibold text-ink">{payRow?.name}</Text>
              <Text className="text-3xl font-bold text-primary mt-1">{fmt(modalTotal)}</Text>
              <Text className="text-sm text-faint mt-0.5">{payRow ? checkHoursOf(payRow) : 0} h</Text>
              {payRow && componentsText(checkComponentsOf(payRow)) ? (
                <Text className="text-xs text-faint mt-0.5">{componentsText(checkComponentsOf(payRow))}</Text>
              ) : null}
            </View>

            {(payRow?.payments ?? []).length > 0 ? (
              <View className="mb-4">
                <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.alreadyPaidLabel}</Text>
                <View className="rounded-xl border border-border-soft overflow-hidden">
                  {(payRow?.payments ?? []).map((pmt, i) => (
                    <View key={pmt.id} className={`px-3 py-2 flex-row items-center gap-2 ${i < (payRow?.payments?.length ?? 0) - 1 ? 'border-b border-border-soft' : ''}`}>
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-ink">{fmt(pmt.grossPay)}</Text>
                        <Text className="text-[11px] text-faint">
                          {pmt.hours ? `${Math.round(pmt.hours * 100) / 100} h · ` : ''}
                          {paymentBadgeLabel(pmt)}
                          {pmt.paidAt ? ` · ${fmtDay(pmt.paidAt)}` : ''}
                          {componentsText(pmt.components) ? ` · ${componentsText(pmt.components)}` : ''}
                        </Text>
                      </View>
                      <Pressable onPress={() => onDeletePayment(pmt.id)} disabled={busy} hitSlop={8} className="p-1.5 rounded-lg active:bg-red-500/10">
                        <Trash2 size={15} color={c.danger} />
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

            <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.methodHeading}</Text>
            <View className="flex-row gap-2 mb-4">
              {([['cash', Banknote, t.methodCash], ['check', FileText, t.methodCheck], ['wire', Landmark, t.methodWire]] as const).map(([m, Icon, label]) => {
                const on = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    className={`flex-1 py-3 rounded-2xl items-center gap-1 border ${on ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}
                  >
                    <Icon size={16} color={on ? c.primary : c.faint} />
                    <Text className={`text-xs font-semibold ${on ? 'text-primary' : 'text-muted'}`}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {method === 'check' ? (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-ink mb-2">{t.checkNumberLabel}</Text>
                <TextInput
                  value={checkNumber}
                  onChangeText={setCheckNumber}
                  placeholder={t.checkNumberPlaceholder}
                  placeholderTextColor={c.faint}
                  keyboardType="number-pad"
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink"
                />
              </View>
            ) : null}


            <View className="mb-4">
              <Text className="text-sm font-semibold text-ink mb-2">{t.bonusLabel}</Text>
              <TextInput
                value={formatMoneyInput(bonus)}
                onChangeText={v => setBonus(v.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={c.faint}
                keyboardType="decimal-pad"
                className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink"
              />
            </View>

            {/* Loan tracker — outstanding balance + deduct from this check.
               Full history / add / delete lives in the loans overlay. */}
            {payRow && onAddLoan ? (
              <View className="mb-4 rounded-2xl border border-border-soft bg-surface p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-ink">{t.loanTitle}</Text>
                  <Text className={`text-sm font-bold ${loanBalanceOf(payRow.employeeId) > 0 ? 'text-amber-600' : 'text-faint'}`}>
                    {fmt(loanBalanceOf(payRow.employeeId))} {t.loanOwed}
                  </Text>
                </View>
                {loanBalanceOf(payRow.employeeId) > 0 ? (
                  <View className="mt-2">
                    <Text className="text-xs text-muted mb-1">{t.loanDeductLabel}</Text>
                    <TextInput value={formatMoneyInput(loanDeduct)} onChangeText={v => setLoanDeduct(v.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                      placeholder="0.00" placeholderTextColor={c.faint} keyboardType="decimal-pad"
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    {(parseFloat(loanDeduct) || 0) > 0 ? (
                      <Text className="text-xs text-muted mt-1.5">{t.loanNetToPay}: <Text className="font-bold text-ink">{fmt(netToPay)}</Text></Text>
                    ) : null}
                  </View>
                ) : null}
                <Pressable onPress={openLoans} className="mt-2 self-start"><Text className="text-xs font-semibold text-primary">{t.loanViewBtn}</Text></Pressable>
              </View>
            ) : null}

            <Pressable onPress={confirmPay} disabled={busy || modalTotal <= 0} className="py-3.5 rounded-2xl bg-primary items-center active:opacity-90 disabled:opacity-50">
              <Text className="text-sm font-semibold text-white">{t.confirmBtn}</Text>
            </Pressable>
            </ScrollView>
          </View>

          {/* Loans overlay — in-modal (iOS refuses a 2nd RNModal). History,
             back-dated add, and per-entry delete for the current worker. */}
          {payRow && showLoans ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} className="justify-end">
              <Pressable onPress={() => setShowLoans(false)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
              <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className="text-lg font-bold text-ink">{t.loanHistoryTitle}</Text>
                    <Text className={`text-sm font-semibold ${loanBalanceOf(payRow.employeeId) > 0 ? 'text-amber-600' : 'text-faint'}`}>
                      {fmt(loanBalanceOf(payRow.employeeId))} {t.loanOwed}
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowLoans(false)} hitSlop={10} className="p-1"><X size={22} color={c.muted} /></Pressable>
                </View>

                {/* Add / edit loan */}
                {showAddLoan || editingEntry ? (
                  <View className="gap-2 mb-3 rounded-2xl border border-border-soft bg-surface p-3">
                    <Text className="text-sm font-semibold text-ink">{editingEntry ? t.loanEditTitle : t.loanNewTitle}</Text>
                    <TextInput value={formatMoneyInput(loanAmount)} onChangeText={v => setLoanAmount(v.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                      placeholder={t.loanAmountPlaceholder} placeholderTextColor={c.faint} keyboardType="decimal-pad"
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    <TextInput value={loanNote} onChangeText={setLoanNote} placeholder={t.loanNotePlaceholder} placeholderTextColor={c.faint}
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    <DatePicker label={t.loanDateLabel} value={loanDate} onChange={setLoanDate} />
                    <View className="flex-row gap-2 mt-1">
                      <Pressable onPress={resetLoanForms} className="flex-1 py-2.5 rounded-xl bg-border-soft items-center"><Text className="text-sm font-semibold text-muted">{full.common.buttons.cancel}</Text></Pressable>
                      <Pressable onPress={editingEntry ? submitEditLoan : submitAddLoan} disabled={(parseFloat(loanAmount) || 0) <= 0} className={`flex-1 py-2.5 rounded-xl items-center ${(parseFloat(loanAmount) || 0) > 0 ? 'bg-primary active:opacity-90' : 'bg-primary/50'}`}><Text className="text-sm font-semibold text-white">{t.loanSaveBtn}</Text></Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => { setLoanAmount(''); setLoanNote(''); setLoanDate(todayStr()); setShowAddLoan(true); }}
                    className="mb-3 py-2.5 rounded-xl bg-primary/10 items-center active:opacity-80">
                    <Text className="text-sm font-semibold text-primary">+ {t.addLoanBtn}</Text>
                  </Pressable>
                )}

                {/* History */}
                <ScrollView className="max-h-80">
                  {loanEntriesOf(payRow.employeeId).length === 0 ? (
                    <Text className="text-sm text-faint text-center py-6">{t.loanEmpty}</Text>
                  ) : loanEntriesOf(payRow.employeeId).map(e => {
                    const isLoan = e.amount >= 0;
                    return (
                      <View key={e.id} className="flex-row items-center gap-3 py-2.5 border-b border-border-soft">
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm font-semibold text-ink">
                            <Text className={isLoan ? 'text-amber-600' : 'text-emerald-600'}>{isLoan ? t.loanGivenLabel : t.loanPaymentLabel}</Text>
                            {'  '}{isLoan ? '+' : '−'}{fmt(Math.abs(e.amount))}
                          </Text>
                          <Text className="text-xs text-faint">
                            {new Date(`${e.entryDate}T00:00:00`).toLocaleDateString(full.dashboard.dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
                            {e.note ? ` · ${e.note}` : ''}
                          </Text>
                        </View>
                        {onEditLoan ? (
                          <Pressable onPress={() => startEditEntry(e)} hitSlop={8} className="p-1.5 active:opacity-60"><Pencil size={15} color={c.muted} /></Pressable>
                        ) : null}
                        {onDeleteLoan ? (
                          <Pressable onPress={() => onDeleteLoan(e.id)} hitSlop={8} className="p-1.5 active:opacity-60"><Trash2 size={16} color={c.danger} /></Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </RNModal>

      {/* Worker hours breakdown sheet */}
      <RNModal visible={!!detailRow} transparent animationType="fade" onRequestClose={() => setDetailRow(null)}>
        <View className="flex-1 justify-end">
                  <Pressable
                    onPress={() => setDetailRow(null)}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-ink">{detailRow?.name}</Text>
                <Text className="text-sm text-muted">
                  {fmt(detailRow?.pay ?? 0)} · {Math.round((detailRow?.hours ?? 0) * 100) / 100} h
                </Text>
                {detailRow && paidTotal(detailRow) > 0 ? (
                  <Text className={`text-xs font-semibold mt-0.5 ${isFullyPaid(detailRow) ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {t.paidSoFarLabel}: {fmt(paidTotal(detailRow))}{paidHours(detailRow) > 0 ? ` · ${Math.round(paidHours(detailRow) * 100) / 100} h` : ''}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setDetailRow(null)} hitSlop={10} className="p-1">
                <X size={20} color={c.faint} />
              </Pressable>
            </View>

            {/* Worked vs driven vs logged */}
            <View className="flex-row gap-2 mb-4">
              {([[Wrench, t.hoursWorked, detailRow?.breakdown?.workedHours ?? 0], [Truck, t.hoursDriven, detailRow?.breakdown?.drivenHours ?? 0], [Clock, t.hoursLogged, detailRow?.breakdown?.loggedHours ?? 0]] as const).map(([Icon, label, val], i) => (
                <View key={i} className="flex-1 rounded-2xl border border-border-soft bg-surface p-3 items-center">
                  <Icon size={15} color={c.faint} />
                  <Text className="text-base font-bold text-ink mt-1">{val}</Text>
                  <Text className="text-[11px] text-faint">{label}</Text>
                </View>
              ))}
            </View>

            <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-2">{t.projectsHeading}</Text>
            {detailRow?.breakdown && detailRow.breakdown.jobs.length > 0 ? (
              <ScrollView className="max-h-72">
                <View className="gap-2">
                  {detailRow.breakdown.jobs.map((j, i) => (
                    <View key={j.jobId ?? i} className="flex-row items-center gap-3 rounded-2xl border border-border-soft px-3 py-2.5">
                      <Pressable
                        disabled={!j.jobId || !onJobPress}
                        onPress={() => { if (j.jobId && onJobPress) { setDetailRow(null); onJobPress(j.jobId, detailRow.employeeId); } }}
                        className="flex-1 min-w-0 active:opacity-60"
                      >
                        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{j.title || t.untitledJob}</Text>
                        {j.date ? <Text className="text-[11px] text-faint">{fmtDay(j.date)}</Text> : null}
                      </Pressable>
                      <View className="items-end">
                        {j.workedHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Wrench size={11} color={c.faint} />
                            <Text className="text-xs text-muted">{j.workedHours} h</Text>
                          </View>
                        ) : null}
                        {j.drivenHours > 0 ? (
                          <View className="flex-row items-center gap-1">
                            <Truck size={11} color={c.faint} />
                            <Text className="text-xs text-muted">{j.drivenHours} h</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-sm text-faint py-4 text-center">{t.noBreakdown}</Text>
            )}
          </View>
        </View>
      </RNModal>

      {/* Loans directory — header entry point; reaches every worker incl.
         ex-workers. Search to find anyone, tap to view/add/delete their loans. */}
      <RNModal visible={loansOpen} transparent animationType="fade" onRequestClose={() => setLoansOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setLoansOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 h-[85%]">
            <View className="items-center mb-3"><View className="w-10 h-1 bg-border rounded-full" /></View>

            {loanWorkerId ? (
              <>
                <View className="flex-row items-center gap-2 mb-3">
                  <Pressable onPress={() => setLoanWorkerId(null)} hitSlop={10} className="p-1"><ChevronLeft size={22} color={c.ink} /></Pressable>
                  <View className="flex-1 min-w-0">
                    <Text className="text-lg font-bold text-ink" numberOfLines={1}>{loanNameOf(loanWorkerId)}</Text>
                    <Text className={`text-sm font-semibold ${loanBalanceOf(loanWorkerId) > 0 ? 'text-amber-600' : 'text-faint'}`}>
                      {fmt(loanBalanceOf(loanWorkerId))} {t.loanOwed}
                    </Text>
                  </View>
                  <Pressable onPress={() => setLoansOpen(false)} hitSlop={10} className="p-1"><X size={22} color={c.muted} /></Pressable>
                </View>

                {loanFormOpen ? (
                  <View className="gap-2 mb-3 rounded-2xl border border-border-soft bg-surface p-3">
                    <Text className="text-sm font-semibold text-ink">{editingEntry ? t.loanEditTitle : showAddPayment ? t.loanPaymentNewTitle : t.loanNewTitle}</Text>
                    <TextInput value={formatMoneyInput(loanAmount)} onChangeText={v => setLoanAmount(v.replace(/,/g, '').replace(/[^0-9.]/g, ''))}
                      placeholder={t.loanAmountPlaceholder} placeholderTextColor={c.faint} keyboardType="decimal-pad"
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    <TextInput value={loanNote} onChangeText={setLoanNote} placeholder={t.loanNotePlaceholder} placeholderTextColor={c.faint}
                      className="rounded-xl border border-border bg-card px-3 py-2.5 text-base text-ink" />
                    <DatePicker label={t.loanDateLabel} value={loanDate} onChange={setLoanDate} />
                    <View className="flex-row gap-2 mt-1">
                      <Pressable onPress={resetLoanForms} className="flex-1 py-2.5 rounded-xl bg-border-soft items-center"><Text className="text-sm font-semibold text-muted">{full.common.buttons.cancel}</Text></Pressable>
                      <Pressable onPress={editingEntry ? submitEditLoan : showAddPayment ? submitAddPayment : submitAddLoan} disabled={(parseFloat(loanAmount) || 0) <= 0}
                        className={`flex-1 py-2.5 rounded-xl items-center ${(parseFloat(loanAmount) || 0) <= 0 ? (showAddPayment ? 'bg-emerald-600/40' : 'bg-primary/40') : showAddPayment ? 'bg-emerald-600 active:opacity-90' : 'bg-primary active:opacity-90'}`}>
                        <Text className="text-sm font-semibold text-white">{t.loanSaveBtn}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-2 mb-3">
                    <Pressable onPress={() => { resetLoanForms(); setShowAddLoan(true); }}
                      className="flex-1 py-2.5 rounded-xl bg-primary/10 items-center active:opacity-80">
                      <Text className="text-sm font-semibold text-primary">+ {t.addLoanBtn}</Text>
                    </Pressable>
                    {onLoanRepayment ? (
                      <Pressable onPress={() => { resetLoanForms(); setShowAddPayment(true); }}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 items-center active:opacity-80">
                        <Text className="text-sm font-semibold text-emerald-700">{t.recordPaymentBtn}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                <ScrollView className="flex-1">
                  {loanEntriesOf(loanWorkerId).length === 0 ? (
                    <Text className="text-sm text-faint text-center py-6">{t.loanEmpty}</Text>
                  ) : loanEntriesOf(loanWorkerId).map(e => {
                    const isLoan = e.amount >= 0;
                    return (
                      <View key={e.id} className="flex-row items-center gap-3 py-2.5 border-b border-border-soft">
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm font-semibold text-ink">
                            <Text className={isLoan ? 'text-amber-600' : 'text-emerald-600'}>{isLoan ? t.loanGivenLabel : t.loanPaymentLabel}</Text>
                            {'  '}{isLoan ? '+' : '−'}{fmt(Math.abs(e.amount))}
                          </Text>
                          <Text className="text-xs text-faint">
                            {new Date(`${e.entryDate}T00:00:00`).toLocaleDateString(full.dashboard.dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })}
                            {e.note ? ` · ${e.note}` : ''}
                          </Text>
                        </View>
                        {onEditLoan ? (
                          <Pressable onPress={() => startEditEntry(e)} hitSlop={8} className="p-1.5 active:opacity-60"><Pencil size={15} color={c.muted} /></Pressable>
                        ) : null}
                        {onDeleteLoan ? (
                          <Pressable onPress={() => onDeleteLoan(e.id)} hitSlop={8} className="p-1.5 active:opacity-60"><Trash2 size={16} color={c.danger} /></Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            ) : loanPickMode ? (
              <>
                <View className="flex-row items-center gap-2 mb-3">
                  <Pressable onPress={() => setLoanPickMode(false)} hitSlop={10} className="p-1"><ChevronLeft size={22} color={c.ink} /></Pressable>
                  <Text className="flex-1 text-lg font-bold text-ink">{t.loanPickTitle}</Text>
                  <Pressable onPress={() => setLoansOpen(false)} hitSlop={10} className="p-1"><X size={22} color={c.muted} /></Pressable>
                </View>
                <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 mb-3">
                  <Search size={16} color={c.faint} />
                  <TextInput value={loanSearch} onChangeText={setLoanSearch} placeholder={t.loanSearchPlaceholder} placeholderTextColor={c.faint}
                    className="flex-1 text-base text-ink p-0" />
                </View>
                <ScrollView className="flex-1">
                  {loanPickList.length === 0 ? (
                    <Text className="text-sm text-faint text-center py-6">{t.loanNoWorkerFound}</Text>
                  ) : loanPickList.map(w => (
                    <Pressable key={w.id} onPress={() => selectLoanWorker(w.id, true)}
                      className="flex-row items-center gap-3 py-3 border-b border-border-soft active:opacity-60">
                      <Text className="flex-1 min-w-0 text-sm font-semibold text-ink" numberOfLines={1}>{w.name}</Text>
                      {loanBalanceOf(w.id) > 0 ? <Text className="text-xs font-semibold text-amber-600">{fmt(loanBalanceOf(w.id))}</Text> : null}
                      <ChevronRight size={16} color={c.faint} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-lg font-bold text-ink">{t.loanHistoryTitle}</Text>
                  <Pressable onPress={() => setLoansOpen(false)} hitSlop={10} className="p-1"><X size={22} color={c.muted} /></Pressable>
                </View>
                <Pressable onPress={startAddLoanPicker} className="mb-3 py-2.5 rounded-xl bg-primary items-center active:opacity-90">
                  <Text className="text-sm font-semibold text-white">+ {t.addLoanBtn}</Text>
                </Pressable>
                {loanDirectory.length > 0 || loanSearch.trim() ? (
                  <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 mb-3">
                    <Search size={16} color={c.faint} />
                    <TextInput value={loanSearch} onChangeText={setLoanSearch} placeholder={t.loanSearchPlaceholder} placeholderTextColor={c.faint}
                      className="flex-1 text-base text-ink p-0" />
                  </View>
                ) : null}
                <ScrollView className="flex-1">
                  {loanDirectory.length === 0 ? (
                    <Text className="text-sm text-faint text-center py-6">{loanSearch.trim() ? t.loanNoWorkerFound : t.loanEmpty}</Text>
                  ) : loanDirectory.map(w => (
                    <Pressable key={w.id} onPress={() => selectLoanWorker(w.id)}
                      className="flex-row items-center gap-3 py-3 border-b border-border-soft active:opacity-60">
                      <Text className="flex-1 min-w-0 text-sm font-semibold text-ink" numberOfLines={1}>{w.name}</Text>
                      <Text className={`text-sm font-bold ${loanBalanceOf(w.id) > 0 ? 'text-amber-600' : 'text-faint'}`}>
                        {fmt(loanBalanceOf(w.id))}
                      </Text>
                      <ChevronRight size={16} color={c.faint} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </RNModal>
    </View>
  );
}

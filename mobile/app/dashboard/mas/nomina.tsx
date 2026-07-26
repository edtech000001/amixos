import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { Alert } from 'react-native';
import {
  PayrollScreen,
  type PayrollScreenRow,
  type LoanLedgerEntry,
} from '@amixos/shared/screens/dashboard/PayrollScreen';
import {
  getPayrollPeriod,
  computePayrollRows,
  normalizePayrollConfig,
  type PayrollConfig,
  employeeBreakdownInRange,
  normalizeFrequency,
  parsePayrollAnchor,
  type PayrollFrequency,
  type PayrollJob,
} from '@amixos/shared/lib/payroll';
import type { FormulaFieldDef } from '@amixos/shared/lib/payrollFormula';
import { logAudit } from '@amixos/shared/lib/audit';
import { fetchEmployeeLocations, employeeIdsAtLocation, type EmployeeLocation } from '@amixos/shared/lib/locations';
import { LocationSwitcher } from '@/components/LocationSwitcher';

interface PaymentRow {
  id: string;
  employee_id: string | null;
  method: string;
  check_number: string | null;
  bonus?: number | null;
  gross_pay?: number | null;
  hours?: number | null;
  created_at?: string | null;
  components?: Record<string, number> | null;
}

export default function NominaRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, activeLocationId } = useApp();
  const { t, locale } = useLang();
  const dateLocale = t.dashboard.dateLocale;
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const [frequency, setFrequency] = useState<PayrollFrequency>(normalizeFrequency(business?.payroll_frequency));
  const [anchorDate, setAnchorDate] = useState<string | null>(business?.payroll_anchor_date ?? null);
  const [customDays, setCustomDays] = useState<number | null>((business as { payroll_custom_days?: number | null } | null)?.payroll_custom_days ?? null);
  const [offset, setOffset] = useState(0);
  // Arriving from Payment history: ?worker= opens that breakdown, ?period=
  // jumps to that pay period first.
  const { worker: workerParam, period: periodParam } = useLocalSearchParams<{ worker?: string; period?: string }>();
  const [periodApplied, setPeriodApplied] = useState(!periodParam);
  useEffect(() => {
    if (!periodParam || periodApplied || !business) return;
    const anchor = parsePayrollAnchor(anchorDate);
    for (let k = 0; k >= -1040; k--) {
      if (getPayrollPeriod(frequency, new Date(), k, anchor, customDays).startStr === periodParam) {
        setOffset(k);
        break;
      }
    }
    setPeriodApplied(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodParam, periodApplied, business?.id, frequency, anchorDate]);
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string }[]>([]);
  const [timesheets, setTimesheets] = useState<{ employee_id: string | null; hours_worked: number | null; work_date: string | null }[]>([]);
  const [jobs, setJobs] = useState<PayrollJob[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loanBalances, setLoanBalances] = useState<Record<string, number>>({});
  const [loanEntries, setLoanEntries] = useState<Record<string, LoanLedgerEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [empLocations, setEmpLocations] = useState<EmployeeLocation[]>([]);

  useEffect(() => { setFrequency(normalizeFrequency(business?.payroll_frequency)); }, [business?.payroll_frequency]);
  useEffect(() => { setAnchorDate(business?.payroll_anchor_date ?? null); }, [business?.payroll_anchor_date]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCustomDays((business as { payroll_custom_days?: number | null } | null)?.payroll_custom_days ?? null); }, [business]);

  const period = useMemo(
    () => getPayrollPeriod(frequency, new Date(), offset, parsePayrollAnchor(anchorDate), customDays),
    [frequency, offset, anchorDate, customDays],
  );

  const periodLabel = useMemo(() => {
    // Calendar-month label only when monthly with no anchor; otherwise show the range.
    if (frequency === 'monthly' && !anchorDate) {
      return period.start.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
    }
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${period.start.toLocaleDateString(dateLocale, opts)} – ${period.end.toLocaleDateString(dateLocale, { ...opts, year: 'numeric' })}`;
  }, [frequency, anchorDate, period, dateLocale]);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const bid = business.id;
    const [empRes, tsRes, jobRes, payRes, loanRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type, active, overtime_eligible, overtime_threshold, overtime_multiplier, custom_fields').eq('business_id', bid),
      supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', bid)
        .gte('work_date', period.startStr).lte('work_date', period.endStr),
      supabase.from('jobs').select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, custom_fields, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', period.startStr).lte('scheduled_date', period.endStr),
      // Match by period OVERLAP, not exact period_start: if the owner changes the
      // pay start date the boundaries shift, and an already-paid worker must still
      // show as paid (the snapshot lives on permanently in Payroll History either way).
      supabase.from('payroll_payments').select('id, employee_id, method, check_number, bonus, gross_pay, hours, created_at, components').eq('business_id', bid).lte('period_start', period.endStr).gte('period_end', period.startStr),
      // Loan ledger — full history; balance per worker = sum(amount) across ALL periods.
      supabase.from('employee_loans').select('id, employee_id, amount, note, entry_date').eq('business_id', bid).order('entry_date', { ascending: false }),
    ]);
    setEmployees((empRes.data ?? []) as never);
    setTimesheets((tsRes.data ?? []) as never);
    setJobs(((jobRes.data ?? []) as Array<{ id: string; title: string | null; scheduled_date: string | null; total_hours: number | null; driver_employee_ids: string[] | null; driver_hours: number | null; job_assignments: { employee_id: string | null }[] }>).map(j => ({
      id: j.id,
      title: j.title,
      scheduled_date: j.scheduled_date,
      total_hours: j.total_hours,
      driver_employee_ids: j.driver_employee_ids,
      driver_hours: j.driver_hours,
      custom_fields: (j as { custom_fields?: Record<string, unknown> | null }).custom_fields ?? null,
      assignmentEmployeeIds: (j.job_assignments ?? []).map(a => a.employee_id).filter((x): x is string => !!x),
    })));
    setPayments((payRes.data ?? []) as PaymentRow[]);
    const balances: Record<string, number> = {};
    const entries: Record<string, LoanLedgerEntry[]> = {};
    ((loanRes.data ?? []) as { id: string; employee_id: string | null; amount: number | null; note: string | null; entry_date: string | null }[]).forEach(l => {
      if (!l.employee_id) return;
      balances[l.employee_id] = (balances[l.employee_id] ?? 0) + (Number(l.amount) || 0);
      (entries[l.employee_id] ??= []).push({
        id: l.id,
        amount: Number(l.amount) || 0,
        note: l.note,
        entryDate: l.entry_date ?? '',
      });
    });
    setLoanBalances(balances);
    setLoanEntries(entries);
    // Branch memberships for the location filter (best-effort).
    void fetchEmployeeLocations(supabase, bid).then(setEmpLocations).catch(() => {});
    setLoading(false);
  }, [business, supabase, period.startStr, period.endStr]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Pay components — hydrated from the business, saved on change.
  // Formula builder palette — numeric/boolean custom fields only, so a text
  // field can never end up multiplied into a paycheck.
  const [formulaFields, setFormulaFields] = useState<{ emp: FormulaFieldDef[]; job: FormulaFieldDef[] }>({ emp: [], job: [] });
  useEffect(() => {
    if (!business) return;
    const bid = business.id;
    (async () => {
      const [empT, jobT] = await Promise.all([
        supabase.from('employee_field_templates').select('field_key, field_label, field_label_es, field_label_en, field_type, field_options').eq('business_id', bid).in('field_type', ['number', 'boolean', 'select']).order('sort_order'),
        supabase.from('job_field_templates').select('field_key, field_label, field_label_es, field_label_en, field_type, field_options').eq('business_id', bid).in('field_type', ['number', 'boolean', 'select']).order('sort_order'),
      ]);
      const map = (rows: { field_key: string; field_label: string; field_type: string; field_options: string[] | null }[] | null): FormulaFieldDef[] =>
        localizeTemplates(rows ?? [], locale).map(r => ({
          key: r.field_key,
          label: r.field_label,
          type: r.field_type as FormulaFieldDef['type'],
          options: r.field_options ?? undefined,
        }));
      setFormulaFields({ emp: map(empT.data), job: map(jobT.data) });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, locale]);

  const [config, setConfig] = useState<PayrollConfig>(() => normalizePayrollConfig(business?.payroll_config));
  useEffect(() => { setConfig(normalizePayrollConfig(business?.payroll_config)); }, [business?.payroll_config]);
  const onConfigChange = async (c: PayrollConfig) => {
    setConfig(c);
    if (business) await supabase.from('businesses').update({ payroll_config: c }).eq('id', business.id);
  };




  // Scope the paid workers to the active branch: only employees assigned to it.
  // "All locations" (null) pays everyone. Workers with no branch assignment are
  // excluded from a branch view (mirrors the Team list's branch filter).
  const scopedEmployees = useMemo(() => {
    if (!activeLocationId) return employees;
    const ids = employeeIdsAtLocation(empLocations, activeLocationId);
    return employees.filter(e => ids.has(e.id));
  }, [employees, empLocations, activeLocationId]);

  const rows: PayrollScreenRow[] = useMemo(() => {
    // includeZero + post-filter: a 0-hour worker WITH a payment this period
    // (manual check — owner pay, ex-worker correction) must stay visible.
    const base = computePayrollRows({ employees: scopedEmployees, timesheets, jobs, period, includeZero: true, config });
    // Several payments can cover one period (partial checks) — group them.
    const payByEmp = new Map<string, PaymentRow[]>();
    payments.forEach(p => {
      if (!p.employee_id) return;
      const list = payByEmp.get(p.employee_id) ?? [];
      list.push(p);
      payByEmp.set(p.employee_id, list);
    });
    return base.map(r => {
      return {
        ...r,
        payments: (payByEmp.get(r.employeeId) ?? []).map(p => ({
          id: p.id,
          method: (p.method === 'check' ? 'check' : p.method === 'wire' ? 'wire' : 'cash') as 'cash' | 'check' | 'wire',
          checkNumber: p.check_number,
          bonus: p.bonus ?? null,
          grossPay: p.gross_pay ?? 0,
          hours: p.hours ?? null,
          paidAt: p.created_at ?? null,
          components: p.components ?? null,
        })),
        breakdown: employeeBreakdownInRange({
          employeeId: r.employeeId,
          timesheets,
          jobs,
          startStr: period.startStr,
          endStr: period.endStr,
        }),
      };
    }).filter(r => r.hours > 0 || r.payType === 'salary' || (r.payments?.length ?? 0) > 0);
  }, [scopedEmployees, timesheets, jobs, payments, period, config]);

  const onFrequencyChange = async (f: PayrollFrequency) => {
    setFrequency(f);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_frequency: f }).eq('id', business.id);
  };

  const onCustomDaysChange = async (days: number) => {
    setCustomDays(days);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_custom_days: days }).eq('id', business.id);
  };

  const onAnchorChange = async (date: string) => {
    const next = date || null;
    setAnchorDate(next);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_anchor_date: next }).eq('id', business.id);
  };

  // Each confirm ADDS a payment record (ledger) — partial checks stack up
  // within the period. Requires migration 126 (drops the one-per-period key).
  const onMarkPaid = async (employeeId: string, method: 'cash' | 'check', checkNumber: string, bonus: number, amount: number, hoursCovered: number, components: Record<string, number> | null, periodStart?: string) => {
    if (!business) return;
    const row = rows.find(r => r.employeeId === employeeId);
    setBusy(true);
    // Manual payments may target a PAST period — resolve its exact bounds.
    const target = periodStart && periodStart !== period.startStr
      ? getPayrollPeriod(frequency, new Date(`${periodStart}T00:00:00`), 0, parsePayrollAnchor(anchorDate), customDays)
      : period;
    await supabase.from('payroll_payments').insert({
      business_id: business.id,
      employee_id: employeeId,
      period_start: target.startStr,
      period_end: target.endStr,
      hours: hoursCovered || 0,
      driver_hours: row?.drivenHours ?? 0,
      bonus: bonus || null,
      gross_pay: amount + (bonus || 0),
      method,
      check_number: method === 'check' && checkNumber ? checkNumber : null,
      components: components && Object.values(components).some(v => v) ? components : null,
      // Pay-time snapshot: how these hours were earned (survives job deletes).
      breakdown: employeeBreakdownInRange({ employeeId, timesheets, jobs, startStr: target.startStr, endStr: target.endStr }),
      created_by: user?.id ?? null,
    });
    const emp = employees.find(e => e.id === employeeId);
    void logAudit(supabase, business.id, 'payroll.paid', 'payroll', employeeId, {
      name: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
      amount: Math.round((amount + (bonus || 0)) * 100) / 100,
      method,
      period_start: target.startStr,
    });
    await load();
    setBusy(false);
  };

  const onDeletePayment = async (paymentId: string) => {
    if (!business) return;
    setBusy(true);
    const pmt = payments.find(x => x.id === paymentId);
    const pmtEmp = pmt?.employee_id ? employees.find(e => e.id === pmt.employee_id) : null;
    await supabase.from('payroll_payments').delete().eq('id', paymentId).eq('business_id', business.id);
    void logAudit(supabase, business.id, 'payroll.payment_deleted', 'payroll', pmt?.employee_id ?? null, {
      name: pmtEmp ? `${pmtEmp.first_name} ${pmtEmp.last_name}` : undefined,
      amount: pmt?.gross_pay ?? undefined,
      period_start: period.startStr,
    });
    await load();
    setBusy(false);
  };

  const onClearPayments = async (employeeId: string) => {
    if (!business) return;
    setBusy(true);
    // Clear whatever payment the current-period view counts as "paid" (overlap
    // match, so it still targets the right snapshot after an anchor change).
    await supabase.from('payroll_payments').delete()
      .eq('business_id', business.id).eq('employee_id', employeeId)
      .lte('period_start', period.endStr).gte('period_end', period.startStr);
    const clearedEmp = employees.find(e => e.id === employeeId);
    void logAudit(supabase, business.id, 'payroll.payments_cleared', 'payroll', employeeId, {
      name: clearedEmp ? `${clearedEmp.first_name} ${clearedEmp.last_name}` : undefined,
      period_start: period.startStr,
    });
    await load();
    setBusy(false);
  };

  // Loan ledger writes: positive = loan given, negative = repayment/deduction.
  const onAddLoan = async (employeeId: string, amount: number, note: string, entryDate: string) => {
    if (!business || !(amount > 0)) return;
    setBusy(true);
    const { error } = await supabase.from('employee_loans').insert({
      business_id: business.id,
      employee_id: employeeId,
      amount,
      note: note || null,
      entry_date: entryDate || undefined,
      created_by: user?.id ?? null,
    });
    if (error) { setBusy(false); Alert.alert('Error', error.message); return; }
    const emp = employees.find(e => e.id === employeeId);
    void logAudit(supabase, business.id, 'loan.given', 'employee', employeeId, {
      name: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
      amount,
    });
    await load();
    setBusy(false);
  };

  const onDeleteLoan = async (id: string) => {
    if (!business) return;
    const p = t.dashboard.reports.payroll;
    Alert.alert(p.loanHistoryTitle, p.loanDeleteConfirm, [
      { text: t.common.buttons.cancel, style: 'cancel' },
      {
        text: t.common.buttons.delete, style: 'destructive', onPress: async () => {
          setBusy(true);
          await supabase.from('employee_loans').delete().eq('id', id).eq('business_id', business.id);
          await load();
          setBusy(false);
        },
      },
    ]);
  };

  // amount is SIGNED (+ loan, − repayment); the screen preserves the sign.
  const onEditLoan = async (id: string, amount: number, note: string, entryDate: string) => {
    if (!business) return;
    setBusy(true);
    const { error } = await supabase.from('employee_loans')
      .update({ amount, note: note?.trim() || null, entry_date: entryDate || undefined })
      .eq('id', id).eq('business_id', business.id);
    if (error) { setBusy(false); Alert.alert('Error', error.message); return; }
    await load();
    setBusy(false);
  };

  const onLoanRepayment = async (employeeId: string, amount: number, note?: string, entryDate?: string) => {
    if (!business || !(amount > 0)) return;
    setBusy(true);
    const { error } = await supabase.from('employee_loans').insert({
      business_id: business.id,
      employee_id: employeeId,
      amount: -Math.abs(amount),
      note: note?.trim() || null,
      entry_date: entryDate || undefined,
      created_by: user?.id ?? null,
    });
    if (error) { setBusy(false); Alert.alert('Error', error.message); return; }
    const emp = employees.find(e => e.id === employeeId);
    void logAudit(supabase, business.id, 'loan.repaid', 'employee', employeeId, {
      name: emp ? `${emp.first_name} ${emp.last_name}` : undefined,
      amount,
    });
    await load();
    setBusy(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <PayrollScreen
        loading={loading}
        frequency={frequency}
        onFrequencyChange={onFrequencyChange}
        anchorDate={anchorDate}
        onAnchorChange={onAnchorChange}
        periodLabel={periodLabel}
        periodStartStr={period.startStr}
        customDays={customDays}
        onCustomDaysChange={onCustomDaysChange}
        onPrevPeriod={() => setOffset(o => o - 1)}
        onNextPeriod={() => setOffset(o => o + 1)}
        rows={rows}
        locationSwitcher={<LocationSwitcher />}
        config={config}
        formulaFields={formulaFields}
        allWorkers={employees.filter(e => (e as { active?: boolean | null }).active !== false).map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
        loanBalances={loanBalances}
        loanEntries={loanEntries}
        loanWorkers={employees.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
        onAddLoan={onAddLoan}
        onLoanRepayment={onLoanRepayment}
        onDeleteLoan={onDeleteLoan}
        onEditLoan={onEditLoan}
        onHistoryPress={() => router.push('/dashboard/mas/nomina-historial')}
        initialDetailEmployeeId={periodApplied ? (workerParam ?? null) : null}
        onConfigChange={onConfigChange}
        onMarkPaid={onMarkPaid}
        onDeletePayment={onDeletePayment}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
        onClearPayments={onClearPayments}
        onBack={() => router.back()}
        canManage={canManage}
        busy={busy}
      />
    </SafeAreaView>
  );
}

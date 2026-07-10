import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  PayrollScreen,
  type PayrollScreenRow,
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
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';

interface PaymentRow {
  id: string;
  employee_id: string | null;
  method: string;
  check_number: string | null;
  bonus?: number | null;
  gross_pay?: number | null;
  hours?: number | null;
  created_at?: string | null;
}

export default function NominaRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  const { t } = useLang();
  const dateLocale = t.dashboard.dateLocale;
  const canManage = currentRole === 'owner' || currentRole === 'admin';

  const [frequency, setFrequency] = useState<PayrollFrequency>(normalizeFrequency(business?.payroll_frequency));
  const [anchorDate, setAnchorDate] = useState<string | null>(business?.payroll_anchor_date ?? null);
  const [offset, setOffset] = useState(0);
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string }[]>([]);
  const [timesheets, setTimesheets] = useState<{ employee_id: string | null; hours_worked: number | null; work_date: string | null }[]>([]);
  const [jobs, setJobs] = useState<PayrollJob[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFrequency(normalizeFrequency(business?.payroll_frequency)); }, [business?.payroll_frequency]);
  useEffect(() => { setAnchorDate(business?.payroll_anchor_date ?? null); }, [business?.payroll_anchor_date]);

  const period = useMemo(
    () => getPayrollPeriod(frequency, new Date(), offset, parsePayrollAnchor(anchorDate)),
    [frequency, offset, anchorDate],
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
    const [empRes, tsRes, jobRes, payRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type, overtime_eligible, overtime_threshold, overtime_multiplier, custom_fields').eq('business_id', bid),
      supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', bid)
        .gte('work_date', period.startStr).lte('work_date', period.endStr),
      supabase.from('jobs').select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, custom_fields, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', period.startStr).lte('scheduled_date', period.endStr),
      supabase.from('payroll_payments').select('id, employee_id, method, check_number, bonus, gross_pay, hours, created_at').eq('business_id', bid).eq('period_start', period.startStr),
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
        supabase.from('employee_field_templates').select('field_key, field_label, field_type, field_options').eq('business_id', bid).in('field_type', ['number', 'boolean', 'select']).order('sort_order'),
        supabase.from('job_field_templates').select('field_key, field_label, field_type, field_options').eq('business_id', bid).in('field_type', ['number', 'boolean', 'select']).order('sort_order'),
      ]);
      const map = (rows: { field_key: string; field_label: string; field_type: string; field_options: string[] | null }[] | null): FormulaFieldDef[] =>
        (rows ?? []).map(r => ({
          key: r.field_key,
          label: r.field_label,
          type: r.field_type as FormulaFieldDef['type'],
          options: r.field_options ?? undefined,
        }));
      setFormulaFields({ emp: map(empT.data), job: map(jobT.data) });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const [config, setConfig] = useState<PayrollConfig>(() => normalizePayrollConfig(business?.payroll_config));
  useEffect(() => { setConfig(normalizePayrollConfig(business?.payroll_config)); }, [business?.payroll_config]);
  const onConfigChange = async (c: PayrollConfig) => {
    setConfig(c);
    if (business) await supabase.from('businesses').update({ payroll_config: c }).eq('id', business.id);
  };



  // Payment history — every saved payroll_payments row, the permanent record.
  const loadHistory = async () => {
    if (!business) return [];
    const rows = await fetchAll<{
      period_start: string; period_end: string | null; hours: number | null; driver_hours: number | null;
      bonus: number | null; gross_pay: number | null; method: string; check_number: string | null;
      created_at: string | null;
      // Typed clients infer to-one joins as arrays — accept both shapes.
      employees: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    }>((from, to) =>
      supabase.from('payroll_payments')
        .select('period_start, period_end, hours, driver_hours, bonus, gross_pay, method, check_number, created_at, employees(first_name, last_name)')
        .eq('business_id', business.id)
        .order('period_start', { ascending: false })
        .range(from, to));
    return rows.map(r => {
      const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      return {
      periodStart: r.period_start,
      periodEnd: r.period_end ?? r.period_start,
      name: emp ? `${emp.first_name} ${emp.last_name}` : '—',
      hours: r.hours ?? 0,
      driverHours: r.driver_hours ?? 0,
      bonus: r.bonus,
      grossPay: r.gross_pay ?? 0,
      method: r.method,
      checkNumber: r.check_number,
      paidAt: r.created_at,
      };
    });
  };

  const rows: PayrollScreenRow[] = useMemo(() => {
    const base = computePayrollRows({ employees, timesheets, jobs, period, includeZero: false, config });
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
        })),
        breakdown: employeeBreakdownInRange({
          employeeId: r.employeeId,
          timesheets,
          jobs,
          startStr: period.startStr,
          endStr: period.endStr,
        }),
      };
    });
  }, [employees, timesheets, jobs, payments, period, config]);

  const onFrequencyChange = async (f: PayrollFrequency) => {
    setFrequency(f);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_frequency: f }).eq('id', business.id);
  };

  const onAnchorChange = async (date: string) => {
    const next = date || null;
    setAnchorDate(next);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_anchor_date: next }).eq('id', business.id);
  };

  // Each confirm ADDS a payment record (ledger) — partial checks stack up
  // within the period. Requires migration 126 (drops the one-per-period key).
  const onMarkPaid = async (employeeId: string, method: 'cash' | 'check', checkNumber: string, bonus: number, amount: number, hoursCovered: number) => {
    if (!business) return;
    const row = rows.find(r => r.employeeId === employeeId);
    setBusy(true);
    await supabase.from('payroll_payments').insert({
      business_id: business.id,
      employee_id: employeeId,
      period_start: period.startStr,
      period_end: period.endStr,
      hours: hoursCovered || 0,
      driver_hours: row?.drivenHours ?? 0,
      bonus: bonus || null,
      gross_pay: amount + (bonus || 0),
      method,
      check_number: method === 'check' && checkNumber ? checkNumber : null,
      created_by: user?.id ?? null,
    });
    await load();
    setBusy(false);
  };

  const onDeletePayment = async (paymentId: string) => {
    if (!business) return;
    setBusy(true);
    await supabase.from('payroll_payments').delete().eq('id', paymentId).eq('business_id', business.id);
    await load();
    setBusy(false);
  };

  const onClearPayments = async (employeeId: string) => {
    if (!business) return;
    setBusy(true);
    await supabase.from('payroll_payments').delete()
      .eq('business_id', business.id).eq('employee_id', employeeId).eq('period_start', period.startStr);
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
        onPrevPeriod={() => setOffset(o => o - 1)}
        onNextPeriod={() => setOffset(o => o + 1)}
        rows={rows}
        config={config}
        formulaFields={formulaFields}
        onLoadHistory={loadHistory}
        onConfigChange={onConfigChange}
        onMarkPaid={onMarkPaid}
        onDeletePayment={onDeletePayment}
        onClearPayments={onClearPayments}
        onBack={() => router.back()}
        canManage={canManage}
        busy={busy}
      />
    </SafeAreaView>
  );
}

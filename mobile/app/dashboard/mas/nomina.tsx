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
  employeeBreakdownInRange,
  normalizeFrequency,
  parsePayrollAnchor,
  type PayrollFrequency,
  type PayrollJob,
} from '@amixos/shared/lib/payroll';

interface PaymentRow {
  employee_id: string | null;
  method: string;
  check_number: string | null;
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
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type').eq('business_id', bid),
      supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', bid)
        .gte('work_date', period.startStr).lte('work_date', period.endStr),
      supabase.from('jobs').select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', period.startStr).lte('scheduled_date', period.endStr),
      supabase.from('payroll_payments').select('employee_id, method, check_number').eq('business_id', bid).eq('period_start', period.startStr),
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
      assignmentEmployeeIds: (j.job_assignments ?? []).map(a => a.employee_id).filter((x): x is string => !!x),
    })));
    setPayments((payRes.data ?? []) as PaymentRow[]);
    setLoading(false);
  }, [business, supabase, period.startStr, period.endStr]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const rows: PayrollScreenRow[] = useMemo(() => {
    const base = computePayrollRows({ employees, timesheets, jobs, period, includeZero: false });
    const payByEmp = new Map(payments.map(p => [p.employee_id, p]));
    return base.map(r => {
      const p = payByEmp.get(r.employeeId);
      const method = p ? (p.method === 'check' ? 'check' as const : p.method === 'wire' ? 'wire' as const : 'cash' as const) : null;
      return {
        ...r,
        payment: p && method ? { method, checkNumber: p.check_number } : null,
        breakdown: employeeBreakdownInRange({
          employeeId: r.employeeId,
          timesheets,
          jobs,
          startStr: period.startStr,
          endStr: period.endStr,
        }),
      };
    });
  }, [employees, timesheets, jobs, payments, period]);

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

  const onMarkPaid = async (employeeId: string, method: 'cash' | 'check', checkNumber: string) => {
    if (!business) return;
    const row = rows.find(r => r.employeeId === employeeId);
    setBusy(true);
    await supabase.from('payroll_payments').upsert({
      business_id: business.id,
      employee_id: employeeId,
      period_start: period.startStr,
      period_end: period.endStr,
      hours: row?.hours ?? 0,
      gross_pay: row?.pay ?? 0,
      method,
      check_number: method === 'check' && checkNumber ? checkNumber : null,
      created_by: user?.id ?? null,
    }, { onConflict: 'business_id,employee_id,period_start' });
    await load();
    setBusy(false);
  };

  const onUnmark = async (employeeId: string) => {
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
        onMarkPaid={onMarkPaid}
        onUnmark={onUnmark}
        onBack={() => router.back()}
        canManage={canManage}
        busy={busy}
      />
    </SafeAreaView>
  );
}

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
  normalizeFrequency,
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
  const [offset, setOffset] = useState(0);
  const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string }[]>([]);
  const [timesheets, setTimesheets] = useState<{ employee_id: string | null; hours_worked: number | null; work_date: string | null }[]>([]);
  const [jobs, setJobs] = useState<PayrollJob[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFrequency(normalizeFrequency(business?.payroll_frequency)); }, [business?.payroll_frequency]);

  const period = useMemo(() => getPayrollPeriod(frequency, new Date(), offset), [frequency, offset]);

  const periodLabel = useMemo(() => {
    if (frequency === 'monthly') {
      return period.start.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
    }
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${period.start.toLocaleDateString(dateLocale, opts)} – ${period.end.toLocaleDateString(dateLocale, { ...opts, year: 'numeric' })}`;
  }, [frequency, period, dateLocale]);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const bid = business.id;
    const [empRes, tsRes, jobRes, payRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type').eq('business_id', bid),
      supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', bid)
        .gte('work_date', period.startStr).lte('work_date', period.endStr),
      supabase.from('jobs').select('scheduled_date, total_hours, driver_employee_ids, driver_hours, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', period.startStr).lte('scheduled_date', period.endStr),
      supabase.from('payroll_payments').select('employee_id, method, check_number').eq('business_id', bid).eq('period_start', period.startStr),
    ]);
    setEmployees((empRes.data ?? []) as never);
    setTimesheets((tsRes.data ?? []) as never);
    setJobs(((jobRes.data ?? []) as Array<{ scheduled_date: string | null; total_hours: number | null; driver_employee_ids: string[] | null; driver_hours: number | null; job_assignments: { employee_id: string | null }[] }>).map(j => ({
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
      return {
        ...r,
        payment: p ? { method: p.method === 'check' ? 'check' : 'cash', checkNumber: p.check_number } : null,
      };
    });
  }, [employees, timesheets, jobs, payments, period]);

  const onFrequencyChange = async (f: PayrollFrequency) => {
    setFrequency(f);
    setOffset(0);
    if (business) await supabase.from('businesses').update({ payroll_frequency: f }).eq('id', business.id);
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

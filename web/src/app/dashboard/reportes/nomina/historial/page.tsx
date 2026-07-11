'use client';

export const dynamic = 'force-dynamic';

// Payment history — every saved payroll check (permanent records).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  PayrollHistoryScreen,
  type PayrollHistoryEntry,
} from '@amixos/shared/screens/dashboard/PayrollHistoryScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { employeeBreakdownInRange } from '@amixos/shared/lib/payroll';
import { logAudit } from '@amixos/shared/lib/audit';

export default function NominaHistorialPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [entries, setEntries] = useState<PayrollHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped after bulk deletes to refetch.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!business) return;
    const bid = business.id;
    (async () => {
      setLoading(true);
      const rows = await fetchAll<{
        id: string; employee_id: string | null; period_start: string; period_end: string | null; hours: number | null; driver_hours: number | null;
        bonus: number | null; gross_pay: number | null; method: string; check_number: string | null;
        created_at: string | null;
        components: Record<string, number> | null;
      breakdown: import('@amixos/shared/lib/payroll').PayrollBreakdown | null;
        // Typed clients infer to-one joins as arrays — accept both shapes.
        employees: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
      }>((from, to) =>
        supabase.from('payroll_payments')
          .select('id, employee_id, period_start, period_end, hours, driver_hours, bonus, gross_pay, method, check_number, created_at, components, breakdown, employees(first_name, last_name)')
          .eq('business_id', bid)
          .order('period_start', { ascending: false })
          .range(from, to));
      setEntries(rows.map(r => {
        const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
        return {
          id: r.id,
          employeeId: r.employee_id,
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
          components: r.components ?? null,
          breakdown: r.breakdown ?? null,
        };
      }));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, reloadTick]);


  // Hours breakdown for one record's period — same attribution as the live
  // Payroll view (crew hours + driver hours + standalone timesheets).
  const loadBreakdown = async (h: PayrollHistoryEntry) => {
    if (!business || !h.employeeId) return null;
    const bid = business.id;
    const from = h.periodStart.slice(0, 10);
    const to = h.periodEnd.slice(0, 10);
    const [tsRes, jobRes] = await Promise.all([
      supabase.from('timesheets').select('employee_id, hours_worked, work_date')
        .eq('business_id', bid).gte('work_date', from).lte('work_date', to),
      supabase.from('jobs').select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', from).lte('scheduled_date', to),
    ]);
    const jobs = ((jobRes.data ?? []) as Array<{ id: string; title: string | null; scheduled_date: string | null; total_hours: number | null; driver_employee_ids: string[] | null; driver_hours: number | null; job_assignments: { employee_id: string | null }[] }>).map(j => ({
      id: j.id,
      title: j.title,
      scheduled_date: j.scheduled_date,
      total_hours: j.total_hours,
      driver_employee_ids: j.driver_employee_ids,
      driver_hours: j.driver_hours,
      assignmentEmployeeIds: (j.job_assignments ?? []).map(a => a.employee_id).filter((x): x is string => !!x),
    }));
    const breakdown = employeeBreakdownInRange({
      employeeId: h.employeeId,
      timesheets: (tsRes.data ?? []) as { employee_id: string | null; hours_worked: number | null; work_date: string | null }[],
      jobs,
      startStr: from,
      endStr: to,
    });
    // Lazy backfill: freeze this record now so future opens survive job
    // deletes (pre-136 records and imports have no pay-time snapshot).
    // Best-effort — read-only roles just keep recomputing.
    void supabase.from('payroll_payments').update({ breakdown }).eq('id', h.id);
    return breakdown;
  };

  const onDeleteEntries = async (ids: string[]) => {
    if (!business) return;
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from('payroll_payments').delete()
        .in('id', ids.slice(i, i + 100)).eq('business_id', business.id);
    }
    void logAudit(supabase, business.id, 'payroll.payments_cleared', 'payroll', null, { count: ids.length });
    setReloadTick(n => n + 1);
  };

  return (
    <PayrollHistoryScreen
      loading={loading}
      entries={entries}
      onBack={() => router.push('/dashboard/reportes/nomina')}
      onDeleteEntries={onDeleteEntries}
      payPeriod={{ frequency: business?.payroll_frequency, anchorDate: business?.payroll_anchor_date }}
      onLoadBreakdown={loadBreakdown}
      onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
    />
  );
}

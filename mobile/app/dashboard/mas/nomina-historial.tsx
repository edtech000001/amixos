// Payment history — every saved payroll check (permanent records).

import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { markSectionVisitor } from '@/lib/sectionEntry';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  PayrollHistoryScreen,
  type PayrollHistoryEntry,
} from '@amixos/shared/screens/dashboard/PayrollHistoryScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import type { PayrollBreakdown } from '@amixos/shared/lib/payroll';
import { logAudit } from '@amixos/shared/lib/audit';

export default function NominaHistorialScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [entries, setEntries] = useState<PayrollHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped after bulk deletes to refetch.
  const [reloadTick, setReloadTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
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
    }, [business?.id, reloadTick]),
  );


  // Hours breakdown for one record's period — same attribution as the live
  // Payroll view, computed server-side (employee_hours_breakdown, migration
  // 186) instead of downloading the period's timesheets + jobs.
  const loadBreakdown = async (h: PayrollHistoryEntry) => {
    if (!business || !h.employeeId) return null;
    const from = h.periodStart.slice(0, 10);
    const to = h.periodEnd.slice(0, 10);
    const { data, error } = await supabase.rpc('employee_hours_breakdown', {
      p_business_id: business.id,
      p_employee_id: h.employeeId,
      p_start: from,
      p_end: to,
    });
    if (error || !data) return null;
    const breakdown = data as PayrollBreakdown;
    // Lazy backfill: freeze this record now so future opens survive job
    // deletes (pre-136 records and imports have no pay-time snapshot).
    // Best-effort — read-only roles just keep recomputing.
    void supabase.from('payroll_payments').update({ breakdown }).eq('id', h.id);
    return breakdown;
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <PayrollHistoryScreen
        loading={loading}
        entries={entries}
        // Explicit target: history is a hidden TAB screen, so router.back()
        // pops out of the tab navigator (→ dashboard) instead of to Payroll.
        onBack={() => router.push('/dashboard/mas/nomina' as never)}
        onDeleteEntries={async (ids) => {
          if (!business) return;
          for (let i = 0; i < ids.length; i += 100) {
            await supabase.from('payroll_payments').delete()
              .in('id', ids.slice(i, i + 100)).eq('business_id', business.id);
          }
          void logAudit(supabase, business.id, 'payroll.payments_cleared', 'payroll', null, { count: ids.length });
          setReloadTick((n) => n + 1);
        }}
        payPeriod={{ frequency: business?.payroll_frequency, anchorDate: business?.payroll_anchor_date, customDays: (business as { payroll_custom_days?: number | null } | null)?.payroll_custom_days }}
        onLoadBreakdown={loadBreakdown}
        onJobPress={(id) => {
          markSectionVisitor('trabajos');
          router.push(`/dashboard/trabajos/${id}` as never);
        }}
      />
    </SafeAreaView>
  );
}

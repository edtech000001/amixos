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
        id: string; period_start: string; period_end: string | null; hours: number | null; driver_hours: number | null;
        bonus: number | null; gross_pay: number | null; method: string; check_number: string | null;
        created_at: string | null;
        components: Record<string, number> | null;
        // Typed clients infer to-one joins as arrays — accept both shapes.
        employees: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
      }>((from, to) =>
        supabase.from('payroll_payments')
          .select('id, period_start, period_end, hours, driver_hours, bonus, gross_pay, method, check_number, created_at, components, employees(first_name, last_name)')
          .eq('business_id', bid)
          .order('period_start', { ascending: false })
          .range(from, to));
      setEntries(rows.map(r => {
        const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
        return {
          id: r.id,
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
        };
      }));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, reloadTick]);

  const onDeleteEntries = async (ids: string[]) => {
    if (!business) return;
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from('payroll_payments').delete()
        .in('id', ids.slice(i, i + 100)).eq('business_id', business.id);
    }
    setReloadTick(n => n + 1);
  };

  return (
    <PayrollHistoryScreen
      loading={loading}
      entries={entries}
      onBack={() => router.push('/dashboard/reportes/nomina')}
      onDeleteEntries={onDeleteEntries}
      payPeriod={{ frequency: business?.payroll_frequency, anchorDate: business?.payroll_anchor_date }}
    />
  );
}

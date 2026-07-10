// Payment history — every saved payroll check (permanent records).

import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  PayrollHistoryScreen,
  type PayrollHistoryEntry,
} from '@amixos/shared/screens/dashboard/PayrollHistoryScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';

export default function NominaHistorialScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [entries, setEntries] = useState<PayrollHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!business) return;
      const bid = business.id;
      (async () => {
        setLoading(true);
        const rows = await fetchAll<{
          period_start: string; period_end: string | null; hours: number | null; driver_hours: number | null;
          bonus: number | null; gross_pay: number | null; method: string; check_number: string | null;
          created_at: string | null;
          components: Record<string, number> | null;
          // Typed clients infer to-one joins as arrays — accept both shapes.
          employees: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
        }>((from, to) =>
          supabase.from('payroll_payments')
            .select('period_start, period_end, hours, driver_hours, bonus, gross_pay, method, check_number, created_at, components, employees(first_name, last_name)')
            .eq('business_id', bid)
            .order('period_start', { ascending: false })
            .range(from, to));
        setEntries(rows.map(r => {
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
            components: r.components ?? null,
          };
        }));
        setLoading(false);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [business?.id]),
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <PayrollHistoryScreen
        loading={loading}
        entries={entries}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}

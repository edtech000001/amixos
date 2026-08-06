import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { ReportsScreen } from '@amixos/shared/screens/dashboard/ReportsScreen';
import {
  fetchReportsMetricsServer,
  type ReportsMetrics,
  type ReportRange,
} from '@amixos/shared/lib/reports';

export default function ReportesRoute() {
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { business } = useApp();
  const { t } = useLang();
  const dateLocale = t.dashboard.dateLocale;
  const manualWorker = t.dashboard.reports.employees.manualWorker;
  const unassignedLocation = t.dashboard.reports.byLocation.unassigned;

  const [range, setRange] = useState<ReportRange>('year');
  // Custom date range overrides the preset when set; picking a preset clears it.
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ReportsMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Inventory metrics only fetch when the module is enabled (mirrors web).
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const inventoryEnabled = enabledModules.some(m => m.id === 'inventory');

  // Server-side aggregates (migration 186): two RPCs replace the old
  // seven full-table downloads; range changes refetch (still tiny payloads).
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    fetchReportsMetricsServer({
      supabase,
      businessId: business.id,
      range,
      dateLocale,
      custom: { from: customFrom, to: customTo },
      unassignedLocationLabel: unassignedLocation,
      payrollConfig: business.payroll_config,
      inventoryEnabled,
    }).then(m => {
      if (!cancelled) { setMetrics(m); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false); // offline / migration missing — keep previous
    });
    return () => { cancelled = true; };
  }, [business?.id, inventoryEnabled, range, customFrom, customTo, dateLocale, unassignedLocation, business?.payroll_config]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ReportsScreen
        loading={loading}
        range={range}
        onRangeChange={(r) => { setRange(r); setCustomFrom(null); setCustomTo(null); }}
        metrics={metrics}
        inventoryEnabled={inventoryEnabled}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); }}
        onOpenPayroll={() => router.push('/dashboard/mas/nomina' as never)}
      />
    </SafeAreaView>
  );
}

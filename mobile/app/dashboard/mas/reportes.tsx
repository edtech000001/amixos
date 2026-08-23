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
import { useSwr } from '@amixos/shared/lib/swrCache';
import { useDataFingerprint } from '@amixos/shared/lib/dataFingerprint';

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

  // Server-side aggregates (migration 186): two RPCs replace the old seven
  // full-table downloads. Now cached behind a freshness probe (migration 208):
  // the report opens instantly from the last payload and the RPCs only re-run
  // when data_fingerprint says one of the domains behind them actually moved —
  // including changes made by a teammate on another device.
  const reportsFingerprint = useDataFingerprint(
    supabase, business?.id,
    inventoryEnabled
      ? ['jobs', 'invoices', 'clients', 'employees', 'timesheets', 'inventory']
      : ['jobs', 'invoices', 'clients', 'employees', 'timesheets'],
  );
  // The range is part of the identity: a cached "this year" payload must never
  // be served under the "this month" chip.
  const rangeKey = customFrom || customTo ? `custom_${customFrom ?? ''}_${customTo ?? ''}` : range;
  const reportsKey = business ? `reports_${business.id}_${rangeKey}_${inventoryEnabled ? 'inv' : 'noinv'}` : null;
  const reportsQuery = useSwr<ReportsMetrics>(
    reportsKey,
    () => fetchReportsMetricsServer({
      supabase,
      businessId: business!.id,
      range,
      dateLocale,
      custom: { from: customFrom, to: customTo },
      unassignedLocationLabel: unassignedLocation,
      payrollConfig: business!.payroll_config,
      inventoryEnabled,
    }),
    {
      cacheKey: reportsKey,
      resetKey: `${business?.id ?? ''}_${dateLocale}`,
      fingerprint: reportsFingerprint,
    },
  );
  useEffect(() => {
    if (reportsQuery.data) setMetrics(reportsQuery.data);
    // Keep the previous report on screen while a new range loads, matching the
    // old behaviour (the catch there deliberately did not clear metrics).
    setLoading(reportsQuery.loading);
  }, [reportsQuery.data, reportsQuery.loading]);

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

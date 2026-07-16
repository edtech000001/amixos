import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';
import { ReportsScreen } from '@amixos/shared/screens/dashboard/ReportsScreen';
import {
  fetchReportsData,
  computeReports,
  type ReportsData,
  type ReportRange,
} from '@amixos/shared/lib/reports';

const EMPTY: ReportsData = { invoices: [], jobs: [], clients: [], timesheets: [], employees: [], inventory: [], locations: [] };

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
  const [data, setData] = useState<ReportsData>(EMPTY);
  const [loading, setLoading] = useState(true);

  // Inventory metrics only fetch when the module is enabled (mirrors web).
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const inventoryEnabled = enabledModules.some(m => m.id === 'inventory');

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    fetchReportsData(supabase, business.id, inventoryEnabled).then(d => {
      if (!cancelled) { setData(d); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [business?.id, inventoryEnabled]);

  const metrics = useMemo(
    () => (loading ? null : computeReports(data, range, dateLocale, manualWorker, { from: customFrom, to: customTo }, unassignedLocation, business?.payroll_config)),
    [data, range, dateLocale, manualWorker, loading, customFrom, customTo, unassignedLocation, business?.payroll_config],
  );

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

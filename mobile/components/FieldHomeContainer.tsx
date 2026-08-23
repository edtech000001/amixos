import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { FieldHomeScreen } from '@amixos/shared/screens/dashboard/FieldHomeScreen';
import { firstName } from '@amixos/shared/lib/userName';
import {
  fetchFieldHome,
  clockIn as doClockIn,
  clockOut as doClockOut,
  updateFieldJobStatus,
  type FieldHomeJob,
  type FieldHomeStats,
  type OpenTimesheet,
} from '@amixos/shared/lib/fieldHome';
import { normalizeFrequency, parsePayrollAnchor } from '@amixos/shared/lib/payroll';
import { useSwr } from '@amixos/shared/lib/swrCache';
import { can } from '@amixos/shared/lib/permissions';

// Field-role home for mobile. Owns data + writes via the shared fieldHome
// module (same as web/src/components/dashboard/FieldHome.tsx) and renders the
// shared presentational FieldHomeScreen. Lives outside app/ so expo-router
// doesn't treat it as a route.
export function FieldHomeContainer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, loading: appLoading, readOnly } = useApp();
  // Clock in/out is on by default for crew; off only if an owner disables it.
  const showClock = can.clockInOut(currentRole);

  const [jobs, setJobs] = useState<FieldHomeJob[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<FieldHomeJob[]>([]);
  const [open, setOpen] = useState<OpenTimesheet | null>(null);
  const [stats, setStats] = useState<FieldHomeStats | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Cache-first: the last snapshot renders instantly; a background refresh
  // revalidates. The old mount+focus double-fetch collapses via SWR dedupe.
  const fhKey = business && user ? `field_home_${business.id}_${user.id}` : null;
  const fh = useSwr(
    fhKey,
    () => fetchFieldHome(supabase, business!.id, user!.id, {
      frequency: normalizeFrequency(business!.payroll_frequency),
      anchor: parsePayrollAnchor(business!.payroll_anchor_date),
      customDays: (business as { payroll_custom_days?: number | null } | null)?.payroll_custom_days ?? null,
    }),
    { cacheKey: fhKey, resetKey: `${business?.id ?? ''}_${user?.id ?? ''}`, focusThrottleMs: 3_000 },
  );
  useEffect(() => {
    if (!fh.data) return;
    setJobs(fh.data.jobs);
    setRecentCompleted(fh.data.recentCompleted);
    setOpen(fh.data.openTimesheet);
    setStats(fh.data.stats);
    setEmployeeId(fh.data.employeeId);
    setLoading(false);
  }, [fh.data]);
  useEffect(() => { if (fh.error) setLoading(false); }, [fh.error]);
  useFocusEffect(useCallback(() => { fh.refresh(); }, [fh.refresh]));
  const load = useCallback(async () => { fh.refresh({ force: true }); }, [fh.refresh]);

  const onToggleClock = async () => {
    if (!business || !user || busy) return;
    setBusy(true);
    setError(false);
    if (open) {
      const ok = await doClockOut(supabase, open);
      if (ok) { setOpen(null); void load(); } else setError(true);
    } else {
      const ts = await doClockIn(supabase, business.id, user.id, employeeId);
      if (ts) setOpen(ts); else setError(true);
    }
    setBusy(false);
  };

  const onAdvanceStatus = async (jobId: string, next: string) => {
    setError(false);
    const ok = await updateFieldJobStatus(supabase, jobId, next);
    // Optimistic, then refetch so lists + summary counts reconcile.
    if (ok) { setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, status: next } : j))); void load(); }
    else setError(true);
  };


  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      {/* Crew don't get a business logo/switcher — greet them by name. */}
      <FieldHomeScreen
        loading={appLoading || loading}
        businessName={firstName(user?.name)}
        jobs={jobs}
        recentCompleted={recentCompleted}
        openTimesheet={open}
        stats={stats}
        clockBusy={busy}
        error={error}
        readOnly={readOnly}
        showClock={showClock}
        onToggleClock={onToggleClock}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}?from=home` as never)}
        onAdvanceStatus={onAdvanceStatus}
      />
    </View>
  );
}

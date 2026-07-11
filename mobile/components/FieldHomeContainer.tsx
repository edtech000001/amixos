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

  const load = useCallback(async () => {
    if (!business || !user) return;
    const data = await fetchFieldHome(supabase, business.id, user.id, {
      frequency: normalizeFrequency(business.payroll_frequency),
      anchor: parsePayrollAnchor(business.payroll_anchor_date),
    });
    setJobs(data.jobs);
    setRecentCompleted(data.recentCompleted);
    setOpen(data.openTimesheet);
    setStats(data.stats);
    setEmployeeId(data.employeeId);
    setLoading(false);
  }, [business?.id, user?.id]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [business?.id, user?.id]));

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
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top }}>
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
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
        onAdvanceStatus={onAdvanceStatus}
      />
    </View>
  );
}

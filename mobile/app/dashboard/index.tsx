import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  DashboardHomeScreen,
  type DashboardStats,
  type DashboardRecentInvoice,
  type DashboardUpcomingJob,
} from '@amixos/shared/screens/dashboard/DashboardHomeScreen';
import { type DashboardLayout } from '@amixos/shared/lib/dashboardWidgets';
import { useSwr } from '@amixos/shared/lib/swrCache';
import { kvGet, kvSet } from '@amixos/shared/lib/kvStore';
import { isFieldOnly } from '@amixos/shared/lib/permissions';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';
import { FieldHomeContainer } from '@/components/FieldHomeContainer';
import { TrialBanner } from '@/components/TrialBanner';

// Field crew get a purpose-built home (assigned jobs + clock in/out) instead
// of the owner's widget grid. Branch once the role is known.
export default function DashboardHome() {
  const { currentRole, loading } = useApp();
  if (!loading && isFieldOnly(currentRole)) return <FieldHomeContainer />;
  return <OwnerDashboardHome />;
}

interface RawRecentInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  clients: { first_name: string; last_name: string } | null;
}

interface RawUpcomingJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  clients: { first_name: string; last_name: string } | null;
}

function OwnerDashboardHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, loading: appLoading } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<DashboardRecentInvoice[]>([]);
  const [upcoming, setUpcoming] = useState<DashboardUpcomingJob[]>([]);
  const [loading, setLoading] = useState(true);
  // Dashboard layout is scoped PER-USER-PER-BUSINESS
  // (user_dashboard_layouts) — not a business setting — so one member's
  // customization never changes another's, and each person can arrange each
  // of their businesses differently. undefined = not yet loaded.
  const [profileLayout, setProfileLayout] = useState<DashboardLayout | null | undefined>(undefined);
  useEffect(() => {
    if (!user || !business) return;
    let active = true;
    setProfileLayout(undefined);
    void supabase.from('user_dashboard_layouts').select('layout')
      .eq('user_id', user.id).eq('business_id', business.id).maybeSingle()
      .then(({ data }) => { if (active) setProfileLayout((data?.layout as DashboardLayout | null) ?? null); });
    return () => { active = false; };
  }, [user?.id, business?.id]);

  // Mark overdue invoices at most once per day (was: a write on EVERY open).
  useEffect(() => {
    if (!business) return;
    const flagKey = `overdue_checked_${business.id}`;
    const today = new Date().toISOString().split('T')[0];
    void kvGet(flagKey).then(async (last) => {
      if (last === today) return;
      await supabase.from('invoices')
        .update({ status: 'overdue' })
        .eq('business_id', business.id)
        .eq('status', 'sent')
        .lt('due_date', today);
      void kvSet(flagKey, today);
    });
  }, [business?.id]);

  // Cache-first dashboard: cached numbers render instantly, one dashboard_stats
  // RPC (migration 181) + two small embed queries revalidate in the background.
  // Replaces 7 stat queries incl. an unbounded paid-invoice download.
  type DashPayload = { stats: DashboardStats; recent: DashboardRecentInvoice[]; upcoming: DashboardUpcomingJob[] };
  const dashKey = business ? `dashboard_home_${business.id}` : null;
  const dash = useSwr<DashPayload>(
    dashKey,
    async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();
      const today = now.toISOString().split('T')[0];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      const [statsRes, recentInv, upcomingJobs] = await Promise.all([
        supabase.rpc('dashboard_stats', {
          p_business_id: business!.id, p_start_month: startMonth, p_start_year: startYear, p_tz: tz,
        }),
        supabase.from('invoices')
          .select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)')
          .eq('business_id', business!.id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('jobs')
          .select('id, title, status, scheduled_date, clients(first_name, last_name)')
          .eq('business_id', business!.id)
          .in('status', ['scheduled', 'in_progress'])
          .gte('scheduled_date', today)
          .order('scheduled_date', { ascending: true })
          .limit(8),
      ]);
      if (statsRes.error) throw new Error(statsRes.error.message);
      if (recentInv.error) throw new Error(recentInv.error.message);
      if (upcomingJobs.error) throw new Error(upcomingJobs.error.message);
      const d = (statsRes.data ?? {}) as Record<string, unknown>;
      const stats: DashboardStats = {
        earningsMonth: Number(d.earnings_month ?? 0),
        earningsYear: Number(d.earnings_year ?? 0),
        invoicesPending: Number(d.invoices_pending ?? 0),
        invoicesOverdue: Number(d.invoices_overdue ?? 0),
        clientsTotal: Number(d.clients_total ?? 0),
        clockedInNow: Number(d.clocked_in_now ?? 0),
        jobsActive: Number(d.jobs_active ?? 0),
        monthly: Array.isArray(d.monthly) ? (d.monthly as number[]).map(Number) : Array(12).fill(0),
      };
      const rawInv = (recentInv.data ?? []) as unknown as RawRecentInvoice[];
      const rawJobs = (upcomingJobs.data ?? []) as unknown as RawUpcomingJob[];
      return {
        stats,
        recent: rawInv.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          totalAmount: inv.total_amount,
          status: inv.status,
          clientName: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : null,
        })),
        upcoming: rawJobs.map(job => ({
          id: job.id,
          title: job.title,
          status: job.status,
          scheduledDate: job.scheduled_date,
          clientName: job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null,
        })),
      };
    },
    { cacheKey: dashKey, resetKey: business?.id ?? '' },
  );
  useEffect(() => {
    if (!dash.data) return;
    setStats(dash.data.stats);
    setRecent(dash.data.recent);
    setUpcoming(dash.data.upcoming);
    setLoading(false);
  }, [dash.data]);
  useEffect(() => { if (dash.error) setLoading(false); }, [dash.error]);

  const saveLayout = async (layout: DashboardLayout): Promise<boolean> => {
    if (!user || !business) return false;
    const { error } = await supabase
      .from('user_dashboard_layouts')
      .upsert({ user_id: user.id, business_id: business.id, layout, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,business_id' });
    if (!error) setProfileLayout(layout);
    return !error;
  };

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top }}>
      <TrialBanner />
      <DashboardHomeScreen
        loading={appLoading || loading}
        role={currentRole}
        businessName={business?.name ?? ''}
        businessSlot={<BusinessSwitcher />}
        stats={stats}
        recent={recent}
        upcomingJobs={upcoming}
        layout={profileLayout ?? null}
        onSaveLayout={saveLayout}
        onEditingDone={() => {}}
        onNewInvoicePress={() => router.push('/dashboard/facturas/nueva')}
        onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
        onViewAllInvoicesPress={() => router.push('/dashboard/facturas')}
        onCreateFirstInvoicePress={() => router.push('/dashboard/facturas/nueva')}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
        onViewAllJobsPress={() => router.push('/dashboard/trabajos')}
        onNewClientPress={() => router.push('/dashboard/clientes/nuevo')}
        onNewJobPress={() => router.push('/dashboard/trabajos/nuevo')}
        onCalendarPress={() => router.push('/dashboard/mas/calendario')}
      />
    </View>
  );
}

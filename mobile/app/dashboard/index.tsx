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
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { type DashboardLayout } from '@amixos/shared/lib/dashboardWidgets';
import { BusinessSwitcher } from '@/components/BusinessSwitcher';

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

export default function DashboardHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, loading: appLoading, refetchBusiness } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<DashboardRecentInvoice[]>([]);
  const [upcoming, setUpcoming] = useState<DashboardUpcomingJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    const markOverdue = async () => {
      await supabase.from('invoices')
        .update({ status: 'overdue' })
        .eq('business_id', business.id)
        .eq('status', 'sent')
        .lt('due_date', new Date().toISOString().split('T')[0]);
    };
    markOverdue();
  }, [business?.id]);

  useEffect(() => {
    if (!business) return;
    const load = async () => {
      const now = new Date();
      try {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();
      const today = now.toISOString().split('T')[0];

      const [paidMonth, paidYearRows, pending, overdue, clients, clocked, jobsActive, recentInv, upcomingJobs] =
        await Promise.all([
          supabase.from('invoices').select('total_amount')
            .eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startMonth),
          // All paid invoices this year (also feeds the monthly chart) — can
          // exceed 1000 rows for a busy business, so paginate.
          fetchAll<{ total_amount: number | null; paid_at: string | null }>((from, to) =>
            supabase.from('invoices').select('total_amount, paid_at')
              .eq('business_id', business.id).eq('status', 'paid')
              .gte('paid_at', startYear).range(from, to),
          ),
          supabase.from('invoices').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).eq('status', 'sent'),
          supabase.from('invoices').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).eq('status', 'overdue'),
          supabase.from('clients').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id),
          supabase.from('timesheets').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).is('clock_out', null),
          supabase.from('jobs').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).in('status', ['scheduled', 'in_progress']),
          // Fetch enough rows for the largest widget size (lg shows 8).
          supabase.from('invoices')
            .select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
            .limit(8),
          supabase.from('jobs')
            .select('id, title, status, scheduled_date, clients(first_name, last_name)')
            .eq('business_id', business.id)
            .in('status', ['scheduled', 'in_progress'])
            .gte('scheduled_date', today)
            .order('scheduled_date', { ascending: true })
            .limit(8),
        ]);

      const sum = (rows: { total_amount?: number | null }[]) =>
        rows?.reduce((acc, r) => acc + (r.total_amount ?? 0), 0) ?? 0;

      const monthly = Array(12).fill(0) as number[];
      for (const row of paidYearRows) {
        if (!row.paid_at) continue;
        monthly[new Date(row.paid_at).getMonth()] += row.total_amount ?? 0;
      }

      setStats({
        earningsMonth: sum(paidMonth.data ?? []),
        earningsYear: sum(paidYearRows),
        invoicesPending: pending.count ?? 0,
        invoicesOverdue: overdue.count ?? 0,
        clientsTotal: clients.count ?? 0,
        clockedInNow: clocked.count ?? 0,
        jobsActive: jobsActive.count ?? 0,
        monthly,
      });

      const rawInv = (recentInv.data ?? []) as unknown as RawRecentInvoice[];
      setRecent(rawInv.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        totalAmount: inv.total_amount,
        status: inv.status,
        clientName: inv.clients
          ? `${inv.clients.first_name} ${inv.clients.last_name}`
          : null,
      })));

      const rawJobs = (upcomingJobs.data ?? []) as unknown as RawUpcomingJob[];
      setUpcoming(rawJobs.map(job => ({
        id: job.id,
        title: job.title,
        status: job.status,
        scheduledDate: job.scheduled_date,
        clientName: job.clients
          ? `${job.clients.first_name} ${job.clients.last_name}`
          : null,
      })));
      } catch (err) {
        console.error('dashboard load failed', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [business?.id]);

  const saveLayout = async (layout: DashboardLayout): Promise<boolean> => {
    if (!business) return false;
    const { error } = await supabase
      .from('businesses')
      .update({ dashboard_layout: layout })
      .eq('id', business.id);
    return !error;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB', paddingTop: insets.top }}>
      <DashboardHomeScreen
        loading={appLoading || loading}
        businessName={business?.name ?? ''}
        businessSlot={<BusinessSwitcher />}
        stats={stats}
        recent={recent}
        upcomingJobs={upcoming}
        layout={business?.dashboard_layout ?? null}
        onSaveLayout={saveLayout}
        onEditingDone={() => { void refetchBusiness(); }}
        onNewInvoicePress={() => router.push('/dashboard/facturas/nueva')}
        onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
        onViewAllInvoicesPress={() => router.push('/dashboard/facturas')}
        onCreateFirstInvoicePress={() => router.push('/dashboard/facturas/nueva')}
        onJobPress={(id) => router.push(`/dashboard/trabajos/${id}`)}
        onViewAllJobsPress={() => router.push('/dashboard/trabajos')}
        onNewClientPress={() => router.push('/dashboard/clientes')}
        onNewJobPress={() => router.push('/dashboard/trabajos/nuevo')}
        onCalendarPress={() => router.push('/dashboard/mas/calendario')}
      />
    </View>
  );
}

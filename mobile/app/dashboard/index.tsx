import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  DashboardHomeScreen,
  type DashboardStats,
  type DashboardRecentInvoice,
} from '@amixos/shared/screens/dashboard/DashboardHomeScreen';

interface RawRecentInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  clients: { first_name: string; last_name: string } | null;
}

export default function DashboardHome() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, loading: appLoading } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<DashboardRecentInvoice[]>([]);
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
  }, [business]);

  useEffect(() => {
    if (!business) return;
    const load = async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();

      const [paidMonth, paidYear, pending, overdue, clients, clocked, recentInv] =
        await Promise.all([
          supabase.from('invoices').select('total_amount')
            .eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startMonth),
          supabase.from('invoices').select('total_amount')
            .eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startYear),
          supabase.from('invoices').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).eq('status', 'sent'),
          supabase.from('invoices').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).eq('status', 'overdue'),
          supabase.from('clients').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id),
          supabase.from('timesheets').select('id', { count: 'exact', head: true })
            .eq('business_id', business.id).eq('status', 'active'),
          supabase.from('invoices')
            .select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

      const sum = (rows: any[]) =>
        rows?.reduce((acc, r) => acc + (r.total_amount ?? 0), 0) ?? 0;

      setStats({
        earningsMonth: sum(paidMonth.data ?? []),
        earningsYear: sum(paidYear.data ?? []),
        invoicesPending: pending.count ?? 0,
        invoicesOverdue: overdue.count ?? 0,
        clientsTotal: clients.count ?? 0,
        clockedInNow: clocked.count ?? 0,
      });

      const raw = (recentInv.data ?? []) as unknown as RawRecentInvoice[];
      setRecent(raw.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        totalAmount: inv.total_amount,
        status: inv.status,
        clientName: inv.clients
          ? `${inv.clients.first_name} ${inv.clients.last_name}`
          : null,
      })));
      setLoading(false);
    };
    load();
  }, [business]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <DashboardHomeScreen
        loading={appLoading || loading}
        businessName={business?.name ?? ''}
        stats={stats}
        recent={recent}
        onNewInvoicePress={() => router.push('/dashboard/facturas')}
        onInvoicePress={(id) => router.push(`/dashboard/facturas/${id}`)}
        onViewAllInvoicesPress={() => router.push('/dashboard/facturas')}
        onCreateFirstInvoicePress={() => router.push('/dashboard/facturas')}
      />
    </SafeAreaView>
  );
}

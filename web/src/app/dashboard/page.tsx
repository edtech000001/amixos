'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Users, FileText, AlertCircle, Clock, TrendingUp, Plus,
  type LucideIcon,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface DashboardStats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
}
interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: string;
  clientName: string | null;
}
interface RawRecentInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  clients: { first_name: string; last_name: string } | null;
}

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-600',
  paid: 'bg-emerald-100 text-emerald-600',
  overdue: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, loading: appLoading } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    void supabase.from('invoices')
      .update({ status: 'overdue' })
      .eq('business_id', business.id)
      .eq('status', 'sent')
      .lt('due_date', new Date().toISOString().split('T')[0]);
  }, [business]);

  useEffect(() => {
    if (!business) return;
    const load = async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();

      const [paidMonth, paidYear, pending, overdue, clients, clocked, recentInv] = await Promise.all([
        supabase.from('invoices').select('total_amount').eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startMonth),
        supabase.from('invoices').select('total_amount').eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startYear),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'sent'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'overdue'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('timesheets').select('id', { count: 'exact', head: true }).eq('business_id', business.id).is('clock_out', null),
        supabase.from('invoices').select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(5),
      ]);

      const sum = (rows: { total_amount?: number }[] | null) => rows?.reduce((acc, r) => acc + (r.total_amount ?? 0), 0) ?? 0;

      setStats({
        earningsMonth: sum(paidMonth.data),
        earningsYear: sum(paidYear.data),
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
        clientName: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : null,
      })));
      setLoading(false);
    };
    void load();
  }, [business]);

  const yearStr = String(new Date().getFullYear());
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);

  const widgets: { label: string; value: string | number; icon: LucideIcon; color: string; bg: string; sub: string }[] = [
    { label: t.home.widgets.earningsMonthLabel, value: formatCurrency(stats?.earningsMonth ?? 0), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount) },
    { label: t.home.widgets.invoicesPendingLabel, value: stats?.invoicesPending ?? 0, icon: FileText, color: 'text-primary', bg: 'bg-primary/10', sub: t.home.widgets.invoicesPendingSub },
    { label: t.home.widgets.clientsLabel, value: stats?.clientsTotal ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', sub: t.home.widgets.clientsSub },
    { label: t.home.widgets.invoicesOverdueLabel, value: stats?.invoicesOverdue ?? 0, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', sub: t.home.widgets.invoicesOverdueSub },
    { label: t.home.widgets.clockedInLabel, value: stats?.clockedInNow ?? 0, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50', sub: t.home.widgets.clockedInSub },
    { label: t.home.widgets.earningsYearLabel, value: yearAmount, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50', sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr) },
  ];

  if (appLoading || loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.home.welcome}</h1>
          {business?.name ? <p className="text-sm text-gray-500 mt-0.5">{business.name}</p> : null}
        </div>
        <button
          onClick={() => router.push('/dashboard/facturas/nueva')}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus size={15} /> {t.home.newInvoice}
        </button>
      </div>

      {/* Stat widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {widgets.map(({ label, value, icon: Icon, color, bg, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={18} className={color} />
              </div>
              <span className="text-sm text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-3">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Recent invoices */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">{t.home.recent.title}</h2>
          <button onClick={() => router.push('/dashboard/facturas')} className="text-xs text-primary font-medium hover:underline">
            {t.home.recent.viewAll}
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <FileText size={40} className="text-gray-300" />
            <p className="text-gray-400 text-sm mt-3">{t.home.recent.empty}</p>
            <button onClick={() => router.push('/dashboard/facturas/nueva')} className="text-primary text-sm font-medium mt-1 hover:underline">
              {t.home.recent.createFirst}
            </button>
          </div>
        ) : (
          <div>
            {recent.map((inv) => {
              const statusKey = inv.status as keyof typeof t.invoiceStatus;
              const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
              const pill = STATUS_PILL[inv.status] ?? STATUS_PILL.draft;
              return (
                <button
                  key={inv.id}
                  onClick={() => router.push(`/dashboard/facturas/${inv.id}`)}
                  className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{inv.invoiceNumber}</p>
                    <p className="text-xs text-gray-500 truncate">{inv.clientName ?? t.home.recent.noClient}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(inv.totalAmount)}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill}`}>{statusLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

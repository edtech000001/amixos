'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Users, FileText, AlertCircle, Clock, TrendingUp, Plus } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';

interface Stats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  clients: { first_name: string; last_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-600',
  paid:     'bg-emerald-100 text-emerald-600',
  overdue:  'bg-red-100 text-red-600',
  cancelled:'bg-gray-100 text-gray-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function DashboardPage() {
  const { t: full } = useLang();
  const t = full.dashboard;
  const supabase = createSupabaseClient();
  const { business, loading: appLoading } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    // Auto-mark overdue: sent invoices past their due date
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
      const startYear  = new Date(now.getFullYear(), 0, 1).toISOString();

      const [paidMonth, paidYear, pending, overdue, clients, clocked, recentInv] = await Promise.all([
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

      const sum = (rows: any[]) => rows?.reduce((acc, r) => acc + (r.total_amount ?? 0), 0) ?? 0;

      setStats({
        earningsMonth:    sum(paidMonth.data ?? []),
        earningsYear:     sum(paidYear.data ?? []),
        invoicesPending:  pending.count ?? 0,
        invoicesOverdue:  overdue.count ?? 0,
        clientsTotal:     clients.count ?? 0,
        clockedInNow:     clocked.count ?? 0,
      });
      setRecent((recentInv.data ?? []) as unknown as RecentInvoice[]);
      setLoading(false);
    };
    load();
  }, [business]);

  if (appLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  const yearStr = String(new Date().getFullYear());
  const yearAmount = fmt(stats?.earningsYear ?? 0);

  const WIDGETS = [
    {
      label: t.home.widgets.earningsMonthLabel,
      value: fmt(stats?.earningsMonth ?? 0),
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      sub: t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount),
    },
    {
      label: t.home.widgets.invoicesPendingLabel,
      value: stats?.invoicesPending ?? 0,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: t.home.widgets.invoicesPendingSub,
    },
    {
      label: t.home.widgets.clientsLabel,
      value: stats?.clientsTotal ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      sub: t.home.widgets.clientsSub,
    },
    {
      label: t.home.widgets.invoicesOverdueLabel,
      value: stats?.invoicesOverdue ?? 0,
      icon: AlertCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
      sub: t.home.widgets.invoicesOverdueSub,
    },
    {
      label: t.home.widgets.clockedInLabel,
      value: stats?.clockedInNow ?? 0,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      sub: t.home.widgets.clockedInSub,
    },
    {
      label: t.home.widgets.earningsYearLabel,
      value: yearAmount,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr),
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.home.welcome}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{business?.name}</p>
        </div>
        <Link
          href="/dashboard/facturas/nueva"
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary-dark transition-all shadow-sm"
        >
          <Plus size={16} />
          {t.home.newInvoice}
        </Link>
      </div>

      {/* Stat widgets */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {WIDGETS.map(({ label, value, icon: Icon, color, bg, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs font-medium text-gray-700 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Recent invoices */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{t.home.recent.title}</h2>
          <Link href="/dashboard/facturas" className="text-xs text-primary font-medium hover:underline">
            {t.home.recent.viewAll}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            <FileText size={32} className="mx-auto mb-3 opacity-30" />
            <p>{t.home.recent.empty}</p>
            <Link href="/dashboard/facturas/nueva" className="text-primary font-medium hover:underline mt-1 inline-block">
              {t.home.recent.createFirst}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map(inv => {
              const statusKey = inv.status as keyof typeof t.invoiceStatus;
              const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
              const statusColor = STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-500';
              const clientName = inv.clients
                ? `${inv.clients.first_name} ${inv.clients.last_name}`
                : t.home.recent.noClient;
              return (
                <Link
                  key={inv.id}
                  href={`/dashboard/facturas/${inv.id}`}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                    <p className="text-xs text-gray-400">{clientName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>
                      {statusLabel}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{fmt(inv.total_amount)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

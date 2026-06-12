'use client';

export const dynamic = 'force-dynamic';

// Customizable widget dashboard. Widgets come from the shared registry
// (shared/src/lib/dashboardWidgets.ts) and the per-business layout is synced
// via businesses.dashboard_layout (migration 049) — same layout drives the
// mobile home screen. "Personalizar" toggles an edit mode with drag-and-drop
// reordering (@dnd-kit) + show/hide; every change auto-saves.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DollarSign, Users, FileText, AlertCircle, Clock, TrendingUp, Plus,
  Briefcase, CalendarDays, UserPlus, SlidersHorizontal, Check, X, GripVertical,
  BarChart3, type LucideIcon,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  DASHBOARD_WIDGETS,
  buildDashboardLayout,
  resolveDashboardLayout,
  type DashboardWidgetId,
} from '@amixos/shared/lib/dashboardWidgets';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface DashboardStats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
  jobsActive: number;
  /** Paid revenue per calendar month of the current year (index 0 = Jan). */
  monthly: number[];
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
interface UpcomingJob {
  id: string;
  title: string;
  status: string;
  scheduledDate: string;
  clientName: string | null;
}
interface RawUpcomingJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  clients: { first_name: string; last_name: string } | null;
}

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-600',
  paid: 'bg-emerald-100 text-emerald-600',
  overdue: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-600',
};

const JOB_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-600',
  in_progress: 'bg-orange-100 text-orange-600',
};

const WIDGET_ICONS: Record<DashboardWidgetId, LucideIcon> = {
  quickActions: Plus,
  earningsMonth: DollarSign,
  invoicesPending: FileText,
  clientsTotal: Users,
  invoicesOverdue: AlertCircle,
  clockedIn: Clock,
  earningsYear: TrendingUp,
  jobsActive: Briefcase,
  monthlyChart: BarChart3,
  upcomingJobs: CalendarDays,
  recentInvoices: FileText,
};

const WIDGET_SIZE = new Map(DASHBOARD_WIDGETS.map(w => [w.id, w.size]));

// Sortable wrapper — in edit mode the whole card drags and gets a dashed
// outline + a hide button; outside edit mode it renders children untouched.
function SortableWidget({
  id,
  editing,
  hideLabel,
  onHide,
  children,
}: {
  id: DashboardWidgetId;
  editing: boolean;
  hideLabel: string;
  onHide: (id: DashboardWidgetId) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });

  const span = WIDGET_SIZE.get(id) === 'full' ? 'sm:col-span-2 lg:col-span-3' : '';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }}
      className={`relative ${span}`}
      {...(editing ? { ...attributes, ...listeners } : {})}
    >
      {editing && (
        <>
          <div className="absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.02] cursor-grab active:cursor-grabbing" />
          <button
            onClick={(e) => { e.stopPropagation(); onHide(id); }}
            onPointerDown={(e) => e.stopPropagation()}
            title={hideLabel}
            className="absolute -top-2 -right-2 z-20 w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-md hover:bg-red-500 transition-colors"
          >
            <X size={14} />
          </button>
          <div className="absolute top-3 right-3 z-10 text-gray-300">
            <GripVertical size={16} />
          </div>
        </>
      )}
      <div className={editing ? 'pointer-events-none select-none h-full' : 'h-full'}>{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, loading: appLoading, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingJob[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [visibleIds, setVisibleIds] = useState<DashboardWidgetId[]>([]);
  const [hiddenIds, setHiddenIds] = useState<DashboardWidgetId[]>([]);
  const [saveError, setSaveError] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!business) return;
    void supabase.from('invoices')
      .update({ status: 'overdue' })
      .eq('business_id', business.id)
      .eq('status', 'sent')
      .lt('due_date', new Date().toISOString().split('T')[0]);
  }, [business?.id]);

  // Layout state follows the business (keyed on id so a background refetch
  // doesn't clobber in-progress edits).
  useEffect(() => {
    if (!business) return;
    const resolved = resolveDashboardLayout(business.dashboard_layout);
    setVisibleIds(resolved.visible.map(w => w.id));
    setHiddenIds(resolved.hidden.map(w => w.id));
  }, [business?.id]);

  useEffect(() => {
    if (!business) return;
    const load = async () => {
      const now = new Date();
      try {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();
      const today = now.toISOString().split('T')[0];

      const [paidMonth, paidYearRows, pending, overdue, clients, clocked, jobsActive, recentInv, upcomingJobs] = await Promise.all([
        supabase.from('invoices').select('total_amount').eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startMonth),
        // All paid invoices this year (also feeds the monthly chart) — can
        // exceed 1000 rows for a busy business, so paginate.
        fetchAll<{ total_amount: number | null; paid_at: string | null }>((from, to) =>
          supabase.from('invoices').select('total_amount, paid_at').eq('business_id', business.id).eq('status', 'paid').gte('paid_at', startYear).range(from, to),
        ),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'sent'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'overdue'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('timesheets').select('id', { count: 'exact', head: true }).eq('business_id', business.id).is('clock_out', null),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('business_id', business.id).in('status', ['scheduled', 'in_progress']),
        supabase.from('invoices').select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('jobs').select('id, title, status, scheduled_date, clients(first_name, last_name)').eq('business_id', business.id).in('status', ['scheduled', 'in_progress']).gte('scheduled_date', today).order('scheduled_date', { ascending: true }).limit(5),
      ]);

      const sum = (rows: { total_amount?: number | null }[] | null) => rows?.reduce((acc, r) => acc + (r.total_amount ?? 0), 0) ?? 0;

      const monthly = Array(12).fill(0) as number[];
      for (const row of paidYearRows) {
        if (!row.paid_at) continue;
        monthly[new Date(row.paid_at).getMonth()] += row.total_amount ?? 0;
      }

      setStats({
        earningsMonth: sum(paidMonth.data),
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
        clientName: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : null,
      })));

      const rawJobs = (upcomingJobs.data ?? []) as unknown as RawUpcomingJob[];
      setUpcoming(rawJobs.map(job => ({
        id: job.id,
        title: job.title,
        status: job.status,
        scheduledDate: job.scheduled_date,
        clientName: job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null,
      })));
      } catch (err) {
        console.error('dashboard load failed', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [business?.id]);

  const persistLayout = async (visible: DashboardWidgetId[], hidden: DashboardWidgetId[]) => {
    if (!business) return;
    setSaveError(false);
    const { error } = await supabase
      .from('businesses')
      .update({ dashboard_layout: buildDashboardLayout(visible, hidden) })
      .eq('id', business.id);
    if (error) setSaveError(true);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(active.id as DashboardWidgetId);
    const newIndex = visibleIds.indexOf(over.id as DashboardWidgetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(visibleIds, oldIndex, newIndex);
    setVisibleIds(next);
    void persistLayout(next, hiddenIds);
  };

  const hideWidget = (id: DashboardWidgetId) => {
    const nextVisible = visibleIds.filter(w => w !== id);
    const nextHidden = [...hiddenIds, id];
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    void persistLayout(nextVisible, nextHidden);
  };

  const addWidget = (id: DashboardWidgetId) => {
    const nextVisible = [...visibleIds, id];
    const nextHidden = hiddenIds.filter(w => w !== id);
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    void persistLayout(nextVisible, nextHidden);
  };

  const finishEditing = () => {
    setEditing(false);
    void refetchBusiness();
  };

  const yearStr = String(new Date().getFullYear());
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);

  const statWidgets = useMemo<Partial<Record<DashboardWidgetId, { label: string; value: string | number; icon: LucideIcon; color: string; bg: string; sub: string }>>>(() => ({
    invoicesPending: { label: t.home.widgets.invoicesPendingLabel, value: stats?.invoicesPending ?? 0, icon: FileText, color: 'text-primary', bg: 'bg-primary/10', sub: t.home.widgets.invoicesPendingSub },
    clientsTotal: { label: t.home.widgets.clientsLabel, value: stats?.clientsTotal ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', sub: t.home.widgets.clientsSub },
    invoicesOverdue: { label: t.home.widgets.invoicesOverdueLabel, value: stats?.invoicesOverdue ?? 0, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', sub: t.home.widgets.invoicesOverdueSub },
    clockedIn: { label: t.home.widgets.clockedInLabel, value: stats?.clockedInNow ?? 0, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50', sub: t.home.widgets.clockedInSub },
    earningsYear: { label: t.home.widgets.earningsYearLabel, value: yearAmount, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50', sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr) },
    jobsActive: { label: t.home.widgets.jobsActiveLabel, value: stats?.jobsActive ?? 0, icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: t.home.widgets.jobsActiveSub },
  }), [stats, t, yearAmount, yearStr]);

  const formatJobDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return t.home.upcomingJobs.today;
    if (diffDays === 1) return t.home.upcomingJobs.tomorrow;
    return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' }).format(date);
  };

  const quickActions = [
    { label: t.home.quickActions.newInvoice, icon: FileText, onClick: () => router.push('/dashboard/facturas/nueva'), classes: 'bg-primary/10 text-primary hover:bg-primary/15' },
    { label: t.home.quickActions.newClient, icon: UserPlus, onClick: () => router.push('/dashboard/clientes'), classes: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
    { label: t.home.quickActions.newJob, icon: Briefcase, onClick: () => router.push('/dashboard/trabajos/nuevo'), classes: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' },
    { label: t.home.quickActions.calendar, icon: CalendarDays, onClick: () => router.push('/dashboard/calendario'), classes: 'bg-orange-50 text-orange-600 hover:bg-orange-100' },
  ];

  const renderWidget = (id: DashboardWidgetId) => {
    const stat = statWidgets[id];
    if (stat) {
      const { label, value, icon: Icon, color, bg, sub } = stat;
      return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={18} className={color} />
            </div>
            <span className="text-sm text-gray-500">{label}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-3">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      );
    }

    switch (id) {
      case 'earningsMonth':
        // Hero card — gradient brand background so the headline number pops.
        return (
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark shadow-sm p-5 h-full text-white relative overflow-hidden transition-shadow hover:shadow-md">
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            <div className="absolute -right-12 top-10 w-28 h-28 rounded-full bg-white/5" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <DollarSign size={18} className="text-white" />
              </div>
              <span className="text-sm text-white/80">{t.home.widgets.earningsMonthLabel}</span>
            </div>
            <p className="text-2xl font-bold mt-3">{formatCurrency(stats?.earningsMonth ?? 0)}</p>
            <p className="text-xs text-white/70 mt-0.5">{t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}</p>
          </div>
        );

      case 'quickActions':
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map(({ label, icon: Icon, onClick, classes }) => (
                <button key={label} onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${classes}`}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </div>
        );

      case 'monthlyChart': {
        const monthly = stats?.monthly ?? Array(12).fill(0);
        const max = Math.max(...monthly);
        const currentMonth = new Date().getMonth();
        const monthLabel = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'short' }).format(new Date(2026, i, 1)).replace('.', '');
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-full">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">{t.home.monthlyChart.title}</h2>
            {max === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">{t.home.monthlyChart.empty}</p>
            ) : (
              <div className="flex items-end gap-2 h-32">
                {monthly.map((amount, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                    <span className="absolute -top-6 text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {formatCurrency(amount)}
                    </span>
                    <div className="w-full flex items-end h-24">
                      <div
                        className={`w-full rounded-t-md transition-colors ${i === currentMonth ? 'bg-primary' : amount > 0 ? 'bg-primary/30 group-hover:bg-primary/50' : 'bg-gray-100'}`}
                        style={{ height: `${Math.max(amount > 0 ? 8 : 3, Math.round((amount / max) * 100))}%` }}
                      />
                    </div>
                    <span className={`text-[10px] ${i === currentMonth ? 'text-primary font-semibold' : 'text-gray-400'}`}>{monthLabel(i)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'upcomingJobs':
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{t.home.upcomingJobs.title}</h2>
              <button onClick={() => router.push('/dashboard/trabajos')} className="text-xs text-primary font-medium hover:underline">
                {t.home.upcomingJobs.viewAll}
              </button>
            </div>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center py-10">
                <CalendarDays size={36} className="text-gray-300" />
                <p className="text-gray-400 text-sm mt-3">{t.home.upcomingJobs.empty}</p>
              </div>
            ) : (
              <div>
                {upcoming.map((job) => {
                  const statusKey = job.status as keyof typeof t.jobs.statuses;
                  return (
                    <button
                      key={job.id}
                      onClick={() => router.push(`/dashboard/trabajos/${job.id}`)}
                      className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg shrink-0">
                          {formatJobDate(job.scheduledDate)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{job.title}</p>
                          <p className="text-xs text-gray-500 truncate">{job.clientName ?? t.home.upcomingJobs.noClient}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_PILL[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.jobs.statuses[statusKey] ?? job.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'recentInvoices':
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full">
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
        );

      default:
        return null;
    }
  };

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
          {editing ? (
            <p className="text-sm text-primary mt-0.5">{t.home.customize.dragHint}</p>
          ) : business?.name ? (
            <p className="text-sm text-gray-500 mt-0.5">{business.name}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <button
              onClick={finishEditing}
              className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Check size={15} /> {t.home.customize.doneBtn}
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <SlidersHorizontal size={15} /> {t.home.customize.editBtn}
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
          {t.home.customize.saveError}
        </div>
      )}

      {/* Widget grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleIds.map((id) => (
              <SortableWidget key={id} id={id} editing={editing} hideLabel={t.home.customize.hideLabel} onHide={hideWidget}>
                {renderWidget(id)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add-widget panel (edit mode only) */}
      {editing && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t.home.customize.addTitle}</h2>
          {hiddenIds.length === 0 ? (
            <p className="text-sm text-gray-400">{t.home.customize.addEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const Icon = WIDGET_ICONS[id];
                return (
                  <button
                    key={id}
                    onClick={() => addWidget(id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Icon size={15} />
                    {t.home.widgetNames[id]}
                    <Plus size={14} className="text-gray-400" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

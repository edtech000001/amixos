'use client';

export const dynamic = 'force-dynamic';

// Customizable widget dashboard. Widgets come from the shared registry
// (shared/src/lib/dashboardWidgets.ts) and the per-business layout is synced
// via businesses.dashboard_layout (migration 049) — same layout drives the
// mobile home screen. "Personalizar" toggles an edit mode with drag-and-drop
// reordering (@dnd-kit), show/hide, and a per-widget size control; every
// change auto-saves.
//
// Sizes change footprint AND content: sm = compact tile (1/3 row), md = wide
// tile with extra context (1/2 row), lg = full row with expanded content
// (more list rows, inline mini charts, chart totals).

import { useEffect, useMemo, useState } from 'react';
import { SkeletonBlock, SkeletonCard } from '@amixos/shared/ui/Skeleton';
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
import { useSwr } from '@amixos/shared/lib/swrCache';
import { fetchPayrollPeriodSummary } from '@amixos/shared/lib/payrollSummary';
import { kvGet, kvSet } from '@amixos/shared/lib/kvStore';
import {
  DASHBOARD_WIDGET_SIZES,
  buildDashboardLayout,
  resolveDashboardLayout,
  type DashboardWidgetId,
  type DashboardWidgetSize,
  type DashboardLayout,
} from '@amixos/shared/lib/dashboardWidgets';
import { can, isFieldOnly } from '@amixos/shared/lib/permissions';
import { FieldHome } from '@/components/dashboard/FieldHome';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// How many list rows each size shows (recent invoices / upcoming jobs).
const LIST_ROWS: Record<DashboardWidgetSize, number> = { sm: 3, md: 5, lg: 8 };

// Grid spans per size: 6-col grid on lg screens, 2-col on sm, stacked below.
const SIZE_SPAN: Record<DashboardWidgetSize, string> = {
  sm: 'sm:col-span-1 lg:col-span-2',
  md: 'sm:col-span-1 lg:col-span-3',
  lg: 'sm:col-span-2 lg:col-span-6',
};

interface DashboardStats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  /** Money behind the pending/overdue counts (migration 223). Absent until
   *  that migration is run, so both read 0 rather than breaking. */
  invoicesPendingAmount?: number;
  invoicesOverdueAmount?: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
  jobsActive: number;
  /** Paid revenue per calendar month of the current year (index 0 = Jan). */
  monthly: number[];
}
/** A recently-added client, shown inside the Clients stat widget at md/lg. */
interface RecentClient {
  id: string;
  name: string;
  company: string | null;
}
interface RawRecentClient {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
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
  draft: 'bg-border-soft text-muted',
  sent: 'bg-blue-100 text-blue-600',
  paid: 'bg-emerald-100 text-emerald-600',
  overdue: 'bg-red-100 text-red-600',
  cancelled: 'bg-border-soft text-muted',
};

const JOB_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-600',
  in_progress: 'bg-orange-100 text-orange-600',
};

const WIDGET_ICONS: Record<DashboardWidgetId, LucideIcon> = {
  quickActions: Plus,
  earningsMonth: DollarSign,
  invoicesPending: FileText,
  payrollPeriod: DollarSign,
  clientsTotal: Users,
  invoicesOverdue: AlertCircle,
  clockedIn: Clock,
  earningsYear: TrendingUp,
  jobsActive: Briefcase,
  monthlyChart: BarChart3,
  upcomingJobs: CalendarDays,
  recentInvoices: FileText,
};

// 12 thin bars used inside lg-sized earnings widgets. `light` renders white
// bars for the gradient hero card.
function MiniBars({
  monthly,
  light,
  /** Month initials under each bar. Without them the bars are decoration —
   *  a shape with no axis tells you nothing about WHEN the peak was. */
  labels,
  className = 'h-12 w-40 shrink-0',
}: {
  monthly: number[];
  light?: boolean;
  labels?: boolean;
  className?: string;
}) {
  const max = Math.max(...monthly);
  if (max === 0) return null;
  const currentMonth = new Date().getMonth();
  return (
    <div className={labels ? className.replace('h-12', 'h-auto') : className}>
      <div className={`flex items-end gap-1 ${labels ? 'h-12' : 'h-full'}`}>
        {monthly.map((amount, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              i === currentMonth
                ? light ? 'bg-card' : 'bg-primary'
                : amount > 0
                  ? light ? 'bg-white/40' : 'bg-primary/30'
                  : light ? 'bg-white/15' : 'bg-border-soft'
            }`}
            style={{ height: `${Math.max(amount > 0 ? 12 : 6, Math.round((amount / max) * 100))}%` }}
          />
        ))}
      </div>
      {labels ? (
        <div className="flex gap-1 mt-1">
          {monthly.map((_, i) => (
            <span
              key={i}
              className={`flex-1 text-center text-[9px] ${
                i === currentMonth
                  ? light ? 'text-white font-bold' : 'text-ink font-bold'
                  : light ? 'text-white/50' : 'text-faint'
              }`}
            >
              {new Intl.DateTimeFormat(undefined, { month: 'narrow' }).format(new Date(2024, i, 1))}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Sortable wrapper — in edit mode the whole card drags and gets a dashed
// outline, a hide button, and an S/M/L size control; outside edit mode it
// renders children untouched.
function SortableWidget({
  id,
  size,
  editing,
  hideLabel,
  sizeLabels,
  onHide,
  onSizeChange,
  children,
}: {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
  editing: boolean;
  hideLabel: string;
  sizeLabels: Record<DashboardWidgetSize, string>;
  onHide: (id: DashboardWidgetId) => void;
  onSizeChange: (id: DashboardWidgetId, size: DashboardWidgetSize) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined }}
      className={`relative ${SIZE_SPAN[size]}`}
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
          <div className="absolute top-3 right-3 z-10 text-faint">
            <GripVertical size={16} />
          </div>
          <div
            className="absolute bottom-2 right-2 z-20 flex rounded-lg bg-gray-900/90 p-0.5 shadow-md"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {DASHBOARD_WIDGET_SIZES.map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); onSizeChange(id, s); }}
                title={sizeLabels[s]}
                className={`w-6 h-6 rounded-md text-[11px] font-bold transition-colors ${
                  size === s ? 'bg-card text-ink' : 'text-white/60 hover:text-white'
                }`}
              >
                {sizeLabels[s].charAt(0)}
              </button>
            ))}
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
  const { business, user, currentRole, loading: appLoading, refetchBusiness } = useApp();
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
  const { t: full } = useLang();
  const t = full.dashboard;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingJob[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<{ id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<{ id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[]>([]);
  const [topClients, setTopClients] = useState<{ id: string; name: string; company: string | null; total: number; invoices: number }[]>([]);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [newClientsThisMonth, setNewClientsThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [visibleIds, setVisibleIds] = useState<DashboardWidgetId[]>([]);
  const [hiddenIds, setHiddenIds] = useState<DashboardWidgetId[]>([]);
  const [sizes, setSizes] = useState<Record<string, DashboardWidgetSize>>({});
  // null = saved. A string is the failure reason, printed under the banner.
  const [saveError, setSaveError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // Layout state follows the business (keyed on id so a background refetch
  // doesn't clobber in-progress edits).
  useEffect(() => {
    if (!business || profileLayout === undefined) return;
    const resolved = resolveDashboardLayout(profileLayout, currentRole);
    setVisibleIds(resolved.visible.map(w => w.id));
    setHiddenIds(resolved.hidden);
    setSizes(Object.fromEntries(resolved.visible.map(w => [w.id, w.size])));
  }, [business?.id, currentRole, profileLayout]);

  // Cache-first dashboard: cached numbers render instantly, one dashboard_stats
  // RPC (migration 181) + two small embed queries revalidate in the background.
  // Replaces 7 stat queries incl. an unbounded paid-invoice download.
  type DashPayload = {
    stats: DashboardStats;
    recent: RecentInvoice[];
    pending: { id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[];
    overdue: { id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[];
    upcoming: UpcomingJob[];
    recentClients: RecentClient[];
    topClients: { id: string; name: string; company: string | null; total: number; invoices: number }[];
    newClientsThisMonth: number;
  };
  const dashKey = business ? `dashboard_home_${business.id}` : null;
  const dash = useSwr<DashPayload>(
    dashKey,
    async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString();
      const today = now.toISOString().split('T')[0];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
      const [statsRes, recentInv, pendingInv, overdueInv, topCl, upcomingJobs, recentCl, newClientCount] = await Promise.all([
        supabase.rpc('dashboard_stats', {
          p_business_id: business!.id, p_start_month: startMonth, p_start_year: startYear, p_tz: tz,
        }),
        supabase.from('invoices').select('id, invoice_number, total_amount, status, due_date, clients(first_name, last_name)').eq('business_id', business!.id).order('created_at', { ascending: false }).limit(LIST_ROWS.lg),
        // Pending invoices for the pending tile, DUE SOONEST first. Filtering
        // the recent list above would show nothing whenever the newest invoices
        // happen to be paid, and "recent" is the wrong order anyway — what
        // matters about an unpaid invoice is how close its due date is.
        // Bounded, so no pagination loop needed.
        supabase.from('invoices').select('id, invoice_number, total_amount, due_date, clients(first_name, last_name)').eq('business_id', business!.id).eq('status', 'sent').order('due_date', { ascending: true, nullsFirst: false }).limit(8),
        // Overdue, OLDEST first — the further past due, the more it needs
        // chasing. Same bounded shape as the pending query above.
        supabase.from('invoices').select('id, invoice_number, total_amount, due_date, clients(first_name, last_name)').eq('business_id', business!.id).eq('status', 'overdue').order('due_date', { ascending: true, nullsFirst: false }).limit(8),
        // Top clients by paid revenue this year (migration 224). A GROUP BY,
        // so it has to be an RPC — summing client-side would truncate at 1000
        // invoices and quietly rank the wrong people.
        supabase.rpc('dashboard_top_clients', { p_business_id: business!.id, p_start: startYear, p_limit: 8 }),
        supabase.from('jobs').select('id, title, status, scheduled_date, clients(first_name, last_name)').eq('business_id', business!.id).in('status', ['scheduled', 'in_progress']).gte('scheduled_date', today).order('scheduled_date', { ascending: true }).limit(LIST_ROWS.lg),
        // Both bounded — a .limit(4) peek and a count-only query, so neither
        // needs the pagination loop the "load every row" reads do.
        supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', business!.id).order('created_at', { ascending: false }).limit(6),
        supabase.from('clients').select('id', { head: true, count: 'exact' }).eq('business_id', business!.id).gte('created_at', startMonth),
      ]);
      if (statsRes.error) throw new Error(statsRes.error.message);
      if (recentInv.error) throw new Error(recentInv.error.message);
      if (upcomingJobs.error) throw new Error(upcomingJobs.error.message);
      const d = (statsRes.data ?? {}) as Record<string, unknown>;
      const stats: DashboardStats = {
        earningsMonth: Number(d.earnings_month ?? 0),
        earningsYear: Number(d.earnings_year ?? 0),
        invoicesPending: Number(d.invoices_pending ?? 0),
        invoicesPendingAmount: Number(d.invoices_pending_amount ?? 0),
        invoicesOverdueAmount: Number(d.invoices_overdue_amount ?? 0),
        invoicesOverdue: Number(d.invoices_overdue ?? 0),
        clientsTotal: Number(d.clients_total ?? 0),
        clockedInNow: Number(d.clocked_in_now ?? 0),
        jobsActive: Number(d.jobs_active ?? 0),
        monthly: Array.isArray(d.monthly) ? (d.monthly as number[]).map(Number) : Array(12).fill(0),
      };
      const rawInv = (recentInv.data ?? []) as unknown as RawRecentInvoice[];
      const rawJobs = (upcomingJobs.data ?? []) as unknown as RawUpcomingJob[];
      // The two client extras are decorative — a failure there must not blank
      // the whole dashboard, so they degrade to empty instead of throwing.
      const rawClients = (recentCl.data ?? []) as unknown as RawRecentClient[];
      return {
        stats,
        topClients: ((topCl.data ?? []) as any[]).map(r => ({
          id: r.client_id,
          name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || (r.company ?? '—'),
          company: r.company,
          total: Number(r.total) || 0,
          invoices: Number(r.invoice_count) || 0,
        })),
        recentClients: rawClients.map(cl => ({
          id: cl.id,
          name: `${cl.first_name} ${cl.last_name}`.trim(),
          company: cl.company,
        })),
        newClientsThisMonth: newClientCount.count ?? 0,
        recent: rawInv.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          totalAmount: inv.total_amount,
          status: inv.status,
          clientName: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : null,
        })),
        pending: ((pendingInv.data ?? []) as any[]).map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          totalAmount: inv.total_amount,
          dueDate: inv.due_date,
          clientName: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : null,
        })),
        overdue: ((overdueInv.data ?? []) as any[]).map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          totalAmount: inv.total_amount,
          dueDate: inv.due_date,
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
  // Payroll rides its OWN cache entry rather than the dashboard payload: it is
  // a different RPC with a different cost, and a slow or failing payroll query
  // must not hold up (or invalidate) the rest of the dashboard. Keyed to null
  // for roles without access, so the RPC is never even issued for them.
  const payrollKey = business && can.seeReports(currentRole)
    ? `dashboard_payroll_${business.id}`
    : null;
  const payrollSwr = useSwr<{
      total: number; hours: number; workers: number;
      top: { id: string; name: string; pay: number; hours: number }[];
      previousTotal: number | null;
    }>(
    payrollKey,
    async () => {
      const r = await fetchPayrollPeriodSummary(supabase, business!);
      // Only the three primitives — the full result carries Date objects,
      // which would come back from the JSON cache as strings.
      // Cap the list here, not at render: the whole roster would bloat the
      // cached payload for rows no size ever shows.
      return { total: r.total, hours: r.hours, workers: r.workers, top: r.top.slice(0, 8), previousTotal: r.previousTotal };
    },
    { cacheKey: payrollKey, resetKey: business?.id ?? '' },
  );
  const payroll = payrollSwr.data ?? null;

  useEffect(() => {
    if (!dash.data) return;
    setStats(dash.data.stats);
    setRecent(dash.data.recent);
    setPendingInvoices(dash.data.pending);
    setOverdueInvoices(dash.data.overdue);
    setTopClients(dash.data.topClients);
    setUpcoming(dash.data.upcoming);
    setRecentClients(dash.data.recentClients);
    setNewClientsThisMonth(dash.data.newClientsThisMonth);
    setLoading(false);
  }, [dash.data]);
  useEffect(() => { if (dash.error) setLoading(false); }, [dash.error]);

  const persistLayout = async (
    visible: DashboardWidgetId[],
    hidden: DashboardWidgetId[],
    nextSizes: Record<string, DashboardWidgetSize>,
  ) => {
    if (!user || !business) return;
    setSaveError(null);
    const layout = buildDashboardLayout(visible, hidden, nextSizes);
    const { error } = await supabase
      .from('user_dashboard_layouts')
      .upsert({ user_id: user.id, business_id: business.id, layout, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,business_id' });
    if (error) {
      // Keep the reason: "couldn't save, try again" is untriagable on its own.
      console.warn('[dashboard] layout save failed', error);
      setSaveError([error.code, error.message].filter(Boolean).join(' · ') || 'Unknown error');
    } else {
      setProfileLayout(layout);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(active.id as DashboardWidgetId);
    const newIndex = visibleIds.indexOf(over.id as DashboardWidgetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(visibleIds, oldIndex, newIndex);
    setVisibleIds(next);
    void persistLayout(next, hiddenIds, sizes);
  };

  const hideWidget = (id: DashboardWidgetId) => {
    const nextVisible = visibleIds.filter(w => w !== id);
    const nextHidden = [...hiddenIds, id];
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    void persistLayout(nextVisible, nextHidden, sizes);
  };

  const addWidget = (id: DashboardWidgetId) => {
    const nextVisible = [...visibleIds, id];
    const nextHidden = hiddenIds.filter(w => w !== id);
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    void persistLayout(nextVisible, nextHidden, sizes);
  };

  const setWidgetSize = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    const nextSizes = { ...sizes, [id]: size };
    setSizes(nextSizes);
    void persistLayout(visibleIds, hiddenIds, nextSizes);
  };

  const finishEditing = () => {
    setEditing(false);
    void refetchBusiness();
  };

  const now = new Date();
  const yearStr = String(now.getFullYear());
  const currentMonth = now.getMonth();
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);
  const monthly = stats?.monthly ?? (Array(12).fill(0) as number[]);

  // Extra context line for md/lg earnings widgets — derived from data we
  // already have, no extra queries.
  const vsLastMonthLine = useMemo(() => {
    const prev = monthly[currentMonth - 1];
    if (currentMonth === 0 || !prev) return null;
    const pctNum = ((monthly[currentMonth] - prev) / prev) * 100;
    const pct = `${pctNum >= 0 ? '+' : ''}${Math.round(pctNum)}%`;
    return t.home.widgets.vsLastMonth.replace('{{pct}}', pct);
  }, [monthly, currentMonth, t]);

  const avgPerMonthLine = t.home.widgets.avgPerMonth.replace(
    '{{amount}}',
    formatCurrency((stats?.earningsYear ?? 0) / (currentMonth + 1)),
  );

  // `list` fills the extra room at md/lg — a widget that carries one stops
  // looking identical at every size, buying content instead of whitespace.
  const statWidgets = useMemo<Partial<Record<DashboardWidgetId, { label: string; value: string | number; icon: LucideIcon; color: string; bg: string; sub: string; extra?: string | null; bars?: boolean; list?: { id: string; primary: string; secondary?: string | null }[]; listHeading?: string; onListItemPress?: (id: string) => void;
    /** Makes the WHOLE tile a link (payroll → the payroll page). Separate from
     *  onListItemPress so row clicks don't fall through to the tile. */
    onClick?: () => void }>>>(() => ({
    payrollPeriod: {
      label: t.home.widgets.payrollPeriodLabel,
      value: formatCurrency(payroll?.total ?? 0),
      icon: DollarSign,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-500/10',
      // Hours + headcount rather than the date range: the range is already on
      // the payroll page this opens, and "0 h" is the honest reading of an
      // empty period — a $0 total with no context looks like a broken tile.
      sub: payroll && payroll.workers > 0
        ? t.home.widgets.payrollPeriodSub
            .replace('{{hours}}', String(Math.round(payroll.hours)))
            .replace('{{count}}', String(payroll.workers))
        : t.home.widgets.payrollPeriodEmpty,
      onClick: () => router.push('/dashboard/reportes/nomina'),
      // The list is what makes md/lg worth their extra space — without it a
      // wider tile is the same number with more whitespace around it.
      list: (payroll?.top ?? []).map(w => ({
        id: w.id,
        primary: w.name,
        secondary: `${formatCurrency(w.pay)} · ${Math.round(w.hours)} h`,
      })),
      listHeading: t.home.widgets.payrollPeriodWorkers,
    },
    invoicesPending: { label: t.home.widgets.invoicesPendingLabel, value: stats?.invoicesPending ?? 0, icon: FileText, color: 'text-primary', bg: 'bg-primary/10', sub: t.home.widgets.invoicesPendingSub, onClick: () => router.push('/dashboard/facturas?status=sent') },
    clientsTotal: {
      label: t.home.widgets.clientsLabel, value: stats?.clientsTotal ?? 0, icon: Users,
      color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', sub: t.home.widgets.clientsSub,
      extra: newClientsThisMonth
        ? t.home.widgets.clientsNewThisMonth.replace('{{count}}', String(newClientsThisMonth))
        : null,
      onClick: () => router.push('/dashboard/clientes'),
      list: recentClients.map(cl => ({ id: cl.id, primary: cl.name, secondary: cl.company })),
      listHeading: t.home.widgets.clientsRecentHeading,
      onListItemPress: (id: string) => router.push(`/dashboard/clientes/${id}`),
    },
    invoicesOverdue: { label: t.home.widgets.invoicesOverdueLabel, value: stats?.invoicesOverdue ?? 0, icon: AlertCircle, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-500/10', sub: t.home.widgets.invoicesOverdueSub, onClick: () => router.push('/dashboard/facturas?status=overdue') },
    clockedIn: { label: t.home.widgets.clockedInLabel, value: stats?.clockedInNow ?? 0, icon: Clock, color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-500/10', sub: t.home.widgets.clockedInSub },
    earningsYear: { label: t.home.widgets.earningsYearLabel, value: yearAmount, icon: TrendingUp, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr), extra: avgPerMonthLine, bars: true, onClick: () => router.push('/dashboard/reportes?range=year') },
    jobsActive: { label: t.home.widgets.jobsActiveLabel, value: stats?.jobsActive ?? 0, icon: Briefcase, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', sub: t.home.widgets.jobsActiveSub },
  }), [stats, t, yearAmount, yearStr, avgPerMonthLine, recentClients, newClientsThisMonth, router]);

  const formatJobDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return t.home.upcomingJobs.today;
    if (diffDays === 1) return t.home.upcomingJobs.tomorrow;
    return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' }).format(date);
  };

  // Only surface actions this role can actually perform — a hidden action
  // would just hit a silent RLS rejection (the quickActions widget itself is
  // dropped for roles that can do none, via resolveDashboardLayout).
  const quickActions = [
    { label: t.home.quickActions.newInvoice, icon: FileText, onClick: () => router.push('/dashboard/facturas/nueva'), classes: 'bg-primary/10 text-primary hover:bg-primary/15', show: can.createInvoice(currentRole) },
    { label: t.home.quickActions.newClient, icon: UserPlus, onClick: () => router.push('/dashboard/clientes?new=1'), classes: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20', show: can.createClient(currentRole) },
    { label: t.home.quickActions.newJob, icon: Briefcase, onClick: () => router.push('/dashboard/trabajos/nuevo'), classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20', show: can.createJob(currentRole) },
    { label: t.home.quickActions.calendar, icon: CalendarDays, onClick: () => router.push('/dashboard/calendario'), classes: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20', show: can.editCalendar(currentRole) },
  ].filter(a => a.show);

  // The revenue chart, shared by the standalone widget and the large earnings
  // tile. One implementation so the two can never drift — the earnings tile is
  // meant to BE this chart, with its own headline above it.
  const monthlyChartCard = (
    size: DashboardWidgetSize,
    header?: React.ReactNode,
    /** Render on the brand-blue card instead of the neutral one. Every colour
     *  below has to flip together — theme tokens like text-faint are tuned for
     *  the card background and vanish on blue. */
    light?: boolean,
  ) => {
        const max = Math.max(...monthly);
        // sm shows the most recent 6 months; md/lg show the full year.
        const startIdx = size === 'sm' ? Math.max(0, currentMonth - 5) : 0;
        const shown = size === 'sm' ? monthly.slice(startIdx, startIdx + 6) : monthly;
        const monthLabel = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'short' }).format(new Date(2026, i, 1)).replace('.', '');
        return (
          <div className={`rounded-2xl shadow-sm p-5 h-full ${light ? 'bg-primary' : 'bg-card border border-border-soft'}`}>
            <div className="flex items-center justify-between mb-4 gap-4">
              {header ?? <h2 className={`text-sm font-semibold ${light ? 'text-white' : 'text-ink'}`}>{t.home.monthlyChart.title}</h2>}
              {/* The totals line is part of the chart, not the heading: it is
                  what makes the axis readable ("is 250k a lot?"). */}
              {(size === 'lg' || header) && max > 0 ? (
                <div className={`flex items-center gap-4 text-xs ${light ? 'text-white/70' : 'text-muted'}`}>
                  <span><span className={`font-semibold ${light ? 'text-white' : 'text-ink'}`}>{yearAmount}</span> · {t.home.monthlyChart.totalLabel.replace('{{year}}', yearStr)}</span>
                  <span><span className={`font-semibold ${light ? 'text-white' : 'text-ink'}`}>{formatCurrency((stats?.earningsYear ?? 0) / (currentMonth + 1))}</span> · {t.home.monthlyChart.avgLabel}</span>
                </div>
              ) : null}
            </div>
            {max === 0 ? (
              <p className={`text-sm py-8 text-center ${light ? 'text-white/70' : 'text-faint'}`}>{t.home.monthlyChart.empty}</p>
            ) : (
              <div className={`flex items-end gap-2 ${size === 'sm' ? 'h-24' : 'h-32'}`}>
                {shown.map((amount, idx) => {
                  const i = startIdx + idx;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                      <span className={`absolute -top-6 text-[10px] font-semibold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap ${light ? 'bg-white text-primary' : 'bg-border-soft text-ink'}`}>
                        {formatCurrency(amount)}
                      </span>
                      <div className={`w-full flex items-end ${size === 'sm' ? 'h-16' : 'h-24'}`}>
                        <div
                          className={`w-full rounded-t-md transition-colors ${
                            light
                              ? i === currentMonth ? 'bg-white' : amount > 0 ? 'bg-white/45 group-hover:bg-white/70' : 'bg-white/15'
                              : i === currentMonth ? 'bg-primary' : amount > 0 ? 'bg-primary/30 group-hover:bg-primary/50' : 'bg-border-soft'
                          }`}
                          style={{ height: `${Math.max(amount > 0 ? 8 : 3, Math.round((amount / max) * 100))}%` }}
                        />
                      </div>
                      <span className={`text-[10px] ${
                        light
                          ? i === currentMonth ? 'text-white font-bold' : 'text-white/60'
                          : i === currentMonth ? 'text-primary font-semibold' : 'text-faint'
                      }`}>{monthLabel(i)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
  };

  const renderWidget = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    if (id === 'earningsMonth') {
      // Clicking opens Reports scoped to THIS month — the number's context.
      const EarnCard = 'button';
      const earnProps = {
        type: 'button' as const,
        onClick: () => router.push('/dashboard/reportes?range=month'),
        className: 'text-left w-full cursor-pointer',
      };
      // Hero card — gradient brand background so the headline number pops.
      //
      // md is the horizontal banner: it reads as a WIDER card, not a taller
      // one, and the width buys the chart on the right. lg is the tall card
      // below it. These were the other way round, which made md look bigger
      // than lg — the ladder ran backwards.
      if (size === 'md') {
        return (
          <EarnCard {...earnProps} className={`rounded-2xl bg-primary shadow-sm p-5 h-full text-white transition-shadow hover:shadow-md ${earnProps.className}`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <DollarSign size={26} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white/80">{t.home.widgets.earningsMonthLabel}</p>
                <p className="text-3xl font-bold mt-0.5">{formatCurrency(stats?.earningsMonth ?? 0)}</p>
                <p className="text-xs text-white/70 mt-0.5">
                  {t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}
                  {vsLastMonthLine ? ` · ${vsLastMonthLine}` : ''}
                </p>
              </div>
              <MiniBars monthly={monthly} light labels className="w-44 shrink-0" />
            </div>
          </EarnCard>
        );
      }
      if (size === 'lg') {
        // The biggest size IS the revenue chart, headed by this month's number:
        // same bars, same totals line, same per-bar readout. It replaces the
        // standalone Revenue-by-month widget rather than sitting beside it
        // showing the same twelve months in a poorer form.
        return monthlyChartCard(
          'lg',
          <button
            type="button"
            onClick={() => router.push('/dashboard/reportes?range=month')}
            className="flex items-center gap-3 text-left cursor-pointer min-w-0"
          >
            <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-white" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-white/80">{t.home.widgets.earningsMonthLabel}</span>
              <span className="block text-2xl font-bold text-white">{formatCurrency(stats?.earningsMonth ?? 0)}</span>
            </span>
            {vsLastMonthLine ? (
              <span className="text-xs font-semibold text-white/90 shrink-0">{vsLastMonthLine}</span>
            ) : null}
          </button>,
          true,
        );
      }
      return (
        <EarnCard {...earnProps} className={`rounded-2xl bg-primary shadow-sm p-5 h-full text-white transition-shadow hover:shadow-md ${earnProps.className}`}>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <DollarSign size={18} className="text-white" />
              </div>
              <span className="text-sm text-white/80">{t.home.widgets.earningsMonthLabel}</span>
            </div>
            <p className="text-2xl font-bold mt-3">{formatCurrency(stats?.earningsMonth ?? 0)}</p>
            <p className="text-xs text-white/70 mt-0.5">{t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}</p>
          </div>
        </EarnCard>
      );
    }

    // Clients at md/lg: the count on the left, WHO those clients are on the
    // right. A headcount is the least useful thing about a client list — the
    // question is which of them actually pay, and who just arrived.
    if (id === 'clientsTotal' && size !== 'sm') {
      const top = topClients.slice(0, size === 'lg' ? 5 : 3);
      const fresh = recentClients.slice(0, 3);
      return (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => router.push('/dashboard/clientes')}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <span className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                <Users size={18} className="text-blue-600 dark:text-blue-400" />
              </span>
              <p className="text-2xl font-bold text-ink">{stats?.clientsTotal ?? 0}</p>
              <p className="text-xs font-medium text-ink mt-0.5">{t.home.widgets.clientsLabel}</p>
              {newClientsThisMonth ? (
                <span className="block mt-3">
                  <span className="block text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {t.home.widgets.clientsNewThisMonth.replace('{{count}}', String(newClientsThisMonth))}
                  </span>
                  <span className="block text-[10px] text-faint">{t.home.widgets.clientsSub}</span>
                </span>
              ) : null}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.clientsTop}
              </p>
              {top.length === 0 ? (
                <p className="text-xs text-faint">{t.home.widgets.clientsNoRevenue}</p>
              ) : (
                top.map(cl => (
                  <button
                    key={cl.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/clientes/${cl.id}`)}
                    className="w-full flex items-center gap-2 py-1 text-left hover:opacity-70 transition-opacity"
                  >
                    <span className="text-xs text-ink flex-1 truncate">{cl.name}</span>
                    <span className="text-[11px] font-semibold text-ink shrink-0">
                      {formatCurrency(cl.total)}
                    </span>
                  </button>
                ))
              )}
              {/* lg only, mirroring the divider block on payroll and invoices:
                  who came in recently, which the top list never shows (a new
                  client has no revenue yet by definition). */}
              {size === 'lg' && fresh.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-border-soft">
                  <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1">
                    {t.home.widgets.clientsRecent}
                  </p>
                  {fresh.map(cl => (
                    <button
                      key={cl.id}
                      type="button"
                      onClick={() => router.push(`/dashboard/clientes/${cl.id}`)}
                      className="block w-full py-0.5 text-left hover:opacity-70 transition-opacity"
                    >
                      <span className="text-xs text-ink truncate block">{cl.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    // Date-only columns: append a time or they render a day early in US zones.
    const daysPastDue = (d: string | null): number | null => {
      if (!d) return null;
      const due = new Date(`${d}T00:00:00`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.round((today.getTime() - due.getTime()) / 86400000);
    };
    const dueLabel = (d: string | null) => {
      if (!d) return '';
      const late = daysPastDue(d);
      if (late === 0) return t.home.upcomingJobs.today;
      if (late === -1) return t.home.upcomingJobs.tomorrow;
      return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' })
        .format(new Date(`${d}T00:00:00`));
    };

    // Overdue at md/lg mirrors pending, but leads with how LATE things are —
    // an overdue invoice's age is the thing that decides who gets called first.
    if (id === 'invoicesOverdue' && size !== 'sm') {
      const rows = overdueInvoices.slice(0, size === 'lg' ? 8 : 3);
      // The list is ordered oldest-first, so the head is the worst one.
      const oldest = rows.length ? daysPastDue(rows[0].dueDate) : null;
      return (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => router.push('/dashboard/facturas?status=overdue')}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <span className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
                <AlertCircle size={18} className="text-red-500 dark:text-red-400" />
              </span>
              <p className="text-2xl font-bold text-ink">{stats?.invoicesOverdue ?? 0}</p>
              <p className="text-xs font-medium text-ink mt-0.5">{t.home.widgets.invoicesOverdueLabel}</p>
              {/* Same shape as the payroll tile's stat row, so the two cards
                  come out the same height at the same size. */}
              <span className="block mt-3">
                <span className="block text-sm font-semibold text-red-500 dark:text-red-400">
                  {formatCurrency(stats?.invoicesOverdueAmount ?? 0)}
                </span>
                <span className="block text-[10px] text-faint">{t.home.widgets.overdueTotalLabel}</span>
              </span>
              {size === 'lg' && oldest !== null && oldest > 0 ? (
                <span className="block mt-3 pt-3 border-t border-border-soft">
                  <span className="block text-sm font-bold text-ink">
                    {t.home.widgets.overdueDaysShort.replace('{{count}}', String(oldest))}
                  </span>
                  <span className="block text-[10px] text-faint">{t.home.widgets.overdueOldest}</span>
                </span>
              ) : null}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.invoicesOverdueLabel}
              </p>
              {rows.length === 0 ? (
                <p className="text-xs text-faint">{t.home.widgets.overdueNone}</p>
              ) : (
                rows.map(inv => {
                  const late = daysPastDue(inv.dueDate);
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => router.push(`/dashboard/facturas/${inv.id}`)}
                      className="w-full flex items-center gap-2 py-1 text-left hover:opacity-70 transition-opacity"
                    >
                      <span className="text-xs text-ink flex-1 truncate">
                        {inv.clientName ?? inv.invoiceNumber ?? '—'}
                      </span>
                      {late !== null && late > 0 ? (
                        <span className="text-[10px] font-semibold text-red-500 dark:text-red-400 shrink-0">
                          {t.home.widgets.overdueDaysShort.replace('{{count}}', String(late))}
                        </span>
                      ) : null}
                      <span className="text-[11px] font-semibold text-ink shrink-0">
                        {formatCurrency(inv.totalAmount ?? 0)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    // Pending invoices at md/lg: the count on the left, WHICH invoices on the
    // right. A count alone says nothing actionable — seven pending could be
    // $700 or $70,000, and the ones that matter are those due soonest.
    if (id === 'invoicesPending' && size !== 'sm') {
      const rows = pendingInvoices.slice(0, size === 'lg' ? 8 : 3);
      return (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => router.push('/dashboard/facturas?status=sent')}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <FileText size={18} className="text-primary" />
              </span>
              <p className="text-2xl font-bold text-ink">{stats?.invoicesPending ?? 0}</p>
              <p className="text-xs font-medium text-ink mt-0.5">{t.home.widgets.invoicesPendingLabel}</p>
              {/* Same shape as the payroll tile's stat row, so the two cards
                  come out the same height at the same size. */}
              <span className="block mt-3">
                <span className="block text-sm font-semibold text-ink">
                  {formatCurrency(stats?.invoicesPendingAmount ?? 0)}
                </span>
                <span className="block text-[10px] text-faint">{t.home.widgets.pendingTotalLabel}</span>
              </span>
              {size === 'lg' && (stats?.invoicesOverdue ?? 0) > 0 ? (
                <span className="block mt-3 pt-3 border-t border-border-soft">
                  <span className="block text-sm font-bold text-red-500 dark:text-red-400">
                    {formatCurrency(stats?.invoicesOverdueAmount ?? 0)}
                  </span>
                  <span className="block text-[10px] text-faint">
                    {t.home.widgets.pendingOverdueLabel} · {stats?.invoicesOverdue ?? 0}
                  </span>
                </span>
              ) : null}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.pendingDueSoon}
              </p>
              {rows.length === 0 ? (
                <p className="text-xs text-faint">{t.home.widgets.pendingNone}</p>
              ) : (
                rows.map(inv => (
                  // ONE line per invoice, like the payroll worker rows. A
                  // second line for the date doubled the row height, which is
                  // what made this card tower over the others at the same size.
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/facturas/${inv.id}`)}
                    className="w-full flex items-center gap-2 py-1 text-left hover:opacity-70 transition-opacity"
                  >
                    <span className="text-xs text-ink flex-1 truncate">
                      {inv.clientName ?? inv.invoiceNumber ?? '—'}
                    </span>
                    <span className="text-[10px] text-faint shrink-0">{dueLabel(inv.dueDate)}</span>
                    <span className="text-[11px] font-semibold text-ink shrink-0">
                      {formatCurrency(inv.totalAmount ?? 0)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      );
    }

    // Payroll at md/lg is its own layout: numbers on the left, who the hours
    // came from on the right. The generic stat card stacks a list UNDER the
    // number, which at full width is a narrow column of names beside a lot of
    // empty space. sm still uses the generic card — there is no room to split.
    if (id === 'payrollPeriod' && size !== 'sm' && payroll) {
      const prev = payroll.previousTotal;
      const deltaPct = prev != null && prev > 0 ? ((payroll.total - prev) / prev) * 100 : null;
      const workerRows = (payroll.top ?? []).slice(0, size === 'lg' ? 8 : 3);
      return (
        <button
          type="button"
          onClick={() => router.push('/dashboard/reportes/nomina')}
          className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full w-full text-left cursor-pointer transition-shadow hover:shadow-md"
        >
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center mb-3">
                <DollarSign size={18} className="text-teal-600 dark:text-teal-400" />
              </span>
              <p className="text-2xl font-bold text-ink">{formatCurrency(payroll.total)}</p>
              <p className="text-xs font-medium text-ink mt-0.5">{t.home.widgets.payrollPeriodLabel}</p>
              <div className="flex gap-6 mt-3">
                <span>
                  <span className="block text-sm font-semibold text-ink">{Math.round(payroll.hours)}</span>
                  <span className="block text-[10px] text-faint">{t.home.widgets.payrollPeriodHours}</span>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{payroll.workers}</span>
                  <span className="block text-[10px] text-faint">{t.home.widgets.payrollPeriodWorkerCount}</span>
                </span>
              </div>
              {/* lg adds the trend. Omitted when there is no comparable prior
                  period — "−100%" against a period nobody worked is noise. */}
              {size === 'lg' ? (
                <div className="mt-3 pt-3 border-t border-border-soft">
                  {deltaPct === null ? (
                    <p className="text-[11px] text-faint">{t.home.widgets.payrollPeriodNoPrev}</p>
                  ) : (
                    <>
                      <p className={`text-sm font-bold ${deltaPct >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(deltaPct))}%
                      </p>
                      <p className="text-[10px] text-faint">
                        {t.home.widgets.payrollPeriodVsPrev} · {formatCurrency(prev ?? 0)}
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.payrollPeriodWorkers}
              </p>
              {workerRows.length === 0 ? (
                <p className="text-xs text-faint">{t.home.widgets.payrollPeriodEmpty}</p>
              ) : (
                workerRows.map(w => (
                  <div key={w.id} className="flex items-center gap-2 py-1">
                    <span className="text-xs text-ink flex-1 truncate">{w.name}</span>
                    <span className="text-[11px] text-muted shrink-0">{Math.round(w.hours)} h</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </button>
      );
    }

    const stat = statWidgets[id];
    if (stat) {
      const { label, value, icon: Icon, color, bg, sub, extra, bars, list, listHeading, onListItemPress, onClick } = stat;
      // A clickable tile is a button so it's keyboard-reachable; a plain one
      // stays a div rather than advertising an interaction it doesn't have.
      const Card = onClick ? 'button' : 'div';
      const cardProps = onClick
        ? { type: 'button' as const, onClick, className: 'text-left w-full cursor-pointer' }
        : {};
      // lg has room for four rows, md for two.
      const listRows = (list ?? []).slice(0, size === 'lg' ? 4 : 2);
      const statList = listRows.length > 0 ? (
        <div className="mt-4 pt-3 border-t border-border-soft">
          {listHeading ? (
            <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">{listHeading}</p>
          ) : null}
          {listRows.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={onListItemPress ? () => onListItemPress(row.id) : undefined}
              disabled={!onListItemPress}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:opacity-70 disabled:cursor-default"
            >
              <span className="text-xs font-medium text-ink flex-1 truncate">{row.primary}</span>
              {row.secondary ? (
                <span className="text-[11px] text-faint truncate">{row.secondary}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null;
      // lg = horizontal banner (big icon left, value right) — clearly
      // different from the vertical sm/md tiles even with zero data.
      if (size === 'lg') {
        return (
          <Card {...cardProps} className={`bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full transition-shadow hover:shadow-md ${cardProps.className ?? ''}`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon size={26} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="text-3xl font-bold text-ink mt-0.5">{value}</p>
                <p className="text-xs text-faint mt-0.5">
                  {sub}
                  {extra ? ` · ${extra}` : ''}
                </p>
              </div>
              {bars ? <MiniBars monthly={monthly} /> : null}
            </div>
            {statList}
          </Card>
        );
      }
      return (
        <Card {...cardProps} className={`bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full transition-shadow hover:shadow-md ${cardProps.className ?? ''}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={18} className={color} />
            </div>
            <span className="text-sm text-muted">{label}</span>
          </div>
          <p className="text-2xl font-bold text-ink mt-3">{value}</p>
          <p className="text-xs text-faint mt-0.5">{sub}</p>
          {size === 'md' && extra ? (
            <p className="text-xs font-semibold text-muted mt-1">{extra}</p>
          ) : null}
          {size === 'md' ? statList : null}
        </Card>
      );
    }

    switch (id) {
      case 'quickActions':
        return (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 h-full">
            <div className={`grid gap-3 ${size === 'lg' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
              {quickActions.map(({ label, icon: Icon, onClick, classes }) => (
                <button
                  key={label}
                  onClick={onClick}
                  title={label}
                  className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold transition-colors ${classes}`}
                >
                  <Icon size={16} />
                  {size !== 'sm' ? label : null}
                </button>
              ))}
            </div>
          </div>
        );

      case 'monthlyChart': {
        // A LIST, not a chart — the large earnings tile already carries the
        // bars. Bars answer "what shape was the year"; this answers "what did
        // each month actually make, and which way is it moving", which is the
        // part you cannot read off a bar. Newest first: the months people act
        // on are the recent ones.
        const rows = size === 'sm' ? 3 : size === 'md' ? 6 : 12;
        const monthName = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'short' }).format(new Date(2026, i, 1)).replace('.', '');
        const items = Array.from({ length: rows }, (_, n) => currentMonth - n)
          .filter(i => i >= 0)
          .map(i => {
            const amount = monthly[i] ?? 0;
            const prev = i > 0 ? monthly[i - 1] ?? 0 : null;
            // Percent change needs a non-zero base; a month after nothing is
            // an infinite rise, which is true but useless, so it reads as new.
            const delta = prev === null || prev === 0 ? null : ((amount - prev) / prev) * 100;
            return { i, amount, delta, isFirst: prev === null };
          });
        const yearTotal = stats?.earningsYear ?? 0;
        return (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 h-full">
            <div className="flex items-center justify-between mb-3 gap-4">
              <h2 className="text-sm font-semibold text-ink">{t.home.monthlyChart.title}</h2>
              {size !== 'sm' && yearTotal > 0 ? (
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span><span className="font-semibold text-ink">{yearAmount}</span> · {t.home.monthlyChart.totalLabel.replace('{{year}}', yearStr)}</span>
                  <span><span className="font-semibold text-ink">{formatCurrency(yearTotal / (currentMonth + 1))}</span> · {t.home.monthlyChart.avgLabel}</span>
                </div>
              ) : null}
            </div>
            {items.every(m => m.amount === 0) ? (
              <p className="text-sm text-faint py-8 text-center">{t.home.monthlyChart.empty}</p>
            ) : (
              // Two columns at md/lg. A single column grows taller than the
              // grid cell the card sits in, leaving the row ragged. Splitting
              // in half keeps 6 rows within one cell-height and 12 within two.
              (() => {
                const cols = size === 'sm' ? 1 : 2;
                const perCol = Math.ceil(items.length / cols);
                const row = (m: typeof items[number], first: boolean) => (
                  <div
                    key={m.i}
                    className={`flex items-center py-1.5 ${first ? '' : 'border-t border-border-soft'}`}
                  >
                    <span className={`text-xs w-10 shrink-0 ${m.i === currentMonth ? 'text-primary font-bold' : 'text-muted'}`}>
                      {monthName(m.i)}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-ink truncate">
                      {formatCurrency(m.amount)}
                    </span>
                    {size !== 'sm' ? (
                      m.isFirst ? (
                        <span className="text-[10px] text-faint ml-1">{t.home.monthlyChart.noPrevMonth}</span>
                      ) : m.delta === null ? (
                        <span className="text-[10px] text-faint ml-1">—</span>
                      ) : (
                        <span className={`text-[10px] font-semibold ml-1 ${m.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {m.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(m.delta))}%
                        </span>
                      )
                    ) : null}
                  </div>
                );
                return (
                  <div className="flex gap-6">
                    {Array.from({ length: cols }, (_, cIdx) => (
                      <div key={cIdx} className="flex-1 min-w-0">
                        {items.slice(cIdx * perCol, (cIdx + 1) * perCol).map((m, rIdx) => row(m, rIdx === 0))}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        );
      }

      case 'upcomingJobs': {
        const rows = upcoming.slice(0, LIST_ROWS[size]);
        return (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
              <h2 className="text-sm font-semibold text-ink">{t.home.upcomingJobs.title}</h2>
              <button onClick={() => router.push('/dashboard/trabajos')} className="text-xs text-primary font-medium hover:underline">
                {t.home.upcomingJobs.viewAll}
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center py-10">
                <CalendarDays size={36} className="text-faint" />
                <p className="text-faint text-sm mt-3">{t.home.upcomingJobs.empty}</p>
              </div>
            ) : (
              <div>
                {rows.map((job) => {
                  const statusKey = job.status as keyof typeof t.jobs.statuses;
                  return (
                    <button
                      key={job.id}
                      onClick={() => router.push(`/dashboard/trabajos/${job.id}`)}
                      className={`w-full flex items-center justify-between px-5 border-b border-border-soft last:border-b-0 hover:bg-surface text-left ${size === 'sm' ? 'py-2.5' : 'py-4'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg shrink-0">
                          {formatJobDate(job.scheduledDate)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{job.title}</p>
                          {size !== 'sm' ? (
                            <p className="text-xs text-muted truncate">{job.clientName ?? t.home.upcomingJobs.noClient}</p>
                          ) : null}
                        </div>
                      </div>
                      {size !== 'sm' ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_PILL[job.status] ?? 'bg-border-soft text-muted'}`}>
                          {t.jobs.statuses[statusKey] ?? job.status}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      case 'recentInvoices': {
        const rows = recent.slice(0, LIST_ROWS[size]);
        return (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden h-full">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
              <h2 className="text-sm font-semibold text-ink">{t.home.recent.title}</h2>
              {/* status=all clears any saved filter — otherwise "View all" lands
                 on whatever the list was last filtered to, showing a subset. */}
              <button onClick={() => router.push('/dashboard/facturas?status=all')} className="text-xs text-primary font-medium hover:underline">
                {t.home.recent.viewAll}
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <FileText size={40} className="text-faint" />
                <p className="text-faint text-sm mt-3">{t.home.recent.empty}</p>
                <button onClick={() => router.push('/dashboard/facturas/nueva')} className="text-primary text-sm font-medium mt-1 hover:underline">
                  {t.home.recent.createFirst}
                </button>
              </div>
            ) : (
              <div>
                {rows.map((inv) => {
                  const statusKey = inv.status as keyof typeof t.invoiceStatus;
                  const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
                  const pill = STATUS_PILL[inv.status] ?? STATUS_PILL.draft;
                  return (
                    <button
                      key={inv.id}
                      onClick={() => router.push(`/dashboard/facturas/${inv.id}`)}
                      className={`w-full flex items-center justify-between px-5 border-b border-border-soft last:border-b-0 hover:bg-surface text-left ${size === 'sm' ? 'py-2.5' : 'py-4'}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{inv.invoiceNumber}</p>
                        {size !== 'sm' ? (
                          <p className="text-xs text-muted truncate">{inv.clientName ?? t.home.recent.noClient}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-ink">{formatCurrency(inv.totalAmount)}</span>
                        {size !== 'sm' ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill}`}>{statusLabel}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Field crew get a purpose-built home (assigned jobs + clock in/out), not
  // the owner's widget grid. Branch once the role is known.
  if (!appLoading && isFieldOnly(currentRole)) {
    return <FieldHome />;
  }

  if (appLoading || loading) {
    // Same header + widget-grid shape the loaded page uses, so the layout
    // doesn't jump when the data lands.
    return (
      <div className="p-6 lg:p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex flex-col gap-2">
            <SkeletonBlock className="h-7 w-56" />
            <SkeletonBlock className="h-4 w-40" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {[2, 2, 2, 3, 3, 6].map((span, i) => (
            <div key={i} className={span === 6 ? 'lg:col-span-6' : span === 3 ? 'lg:col-span-3' : 'lg:col-span-2'}>
              <SkeletonCard lines={span === 2 ? 2 : 4} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.home.welcome}</h1>
          {editing ? (
            <p className="text-sm text-primary mt-0.5">{t.home.customize.dragHint}</p>
          ) : business?.name ? (
            <p className="text-sm text-muted mt-0.5">{business.name}</p>
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
              className="flex items-center gap-1.5 bg-card border border-border text-ink px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface transition-colors"
            >
              <SlidersHorizontal size={15} /> {t.home.customize.editBtn}
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100 text-sm text-red-600">
          {t.home.customize.saveError}
          <span className="block text-xs text-red-600/80 mt-1">{saveError}</span>
        </div>
      )}

      {/* Widget grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            {visibleIds.map((id) => {
              const size = sizes[id] ?? 'sm';
              return (
                <SortableWidget
                  key={id}
                  id={id}
                  size={size}
                  editing={editing}
                  hideLabel={t.home.customize.hideLabel}
                  sizeLabels={t.home.customize.sizes}
                  onHide={hideWidget}
                  onSizeChange={setWidgetSize}
                >
                  {renderWidget(id, size)}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add-widget panel (edit mode only) */}
      {editing && (
        <div className="mt-6 bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">{t.home.customize.addTitle}</h2>
          {hiddenIds.length === 0 ? (
            <p className="text-sm text-faint">{t.home.customize.addEmpty}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const Icon = WIDGET_ICONS[id];
                return (
                  <button
                    key={id}
                    onClick={() => addWidget(id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-ink hover:border-primary hover:text-primary transition-colors"
                  >
                    <Icon size={15} />
                    {t.home.widgetNames[id]}
                    <Plus size={14} className="text-faint" />
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

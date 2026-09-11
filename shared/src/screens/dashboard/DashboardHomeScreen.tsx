import { useEffect, useState, type ReactNode } from 'react';
import { SkeletonBlock, SkeletonStats, SkeletonChart, SkeletonCard } from '../../ui/Skeleton';
import { useBarScrub } from '../../ui/useBarScrub';
import { niceCeil, axisTick } from '../../lib/chartAxis';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import type { SortableFlexDragEndParams } from 'react-native-sortables';
import {
  DollarSign,
  Users,
  FileText,
  AlertCircle,
  Clock,
  TrendingUp,
  Plus,
  Briefcase,
  CalendarDays,
  UserPlus,
  SlidersHorizontal,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import {
  DASHBOARD_WIDGET_SIZES,
  buildDashboardLayout,
  defaultWidgetSize,
  resolveDashboardLayout,
  type DashboardLayout,
  type DashboardWidgetId,
  type DashboardWidgetSize,
} from '../../lib/dashboardWidgets';
import { can, type Role } from '../../lib/permissions';

// NOTE: this screen is mobile-only (web has its own dashboard page), so it
// can import react-native-sortables / reanimated directly — same rule as the
// existing react-native imports in this file.

export interface DashboardStats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  /** Money behind the pending/overdue counts (migration 223). Absent until
   *  that migration is run, so both read 0 rather than breaking. */
  invoicesPendingAmount?: number;
  invoicesOverdueAmount?: number;
  /** Job status split (migration 225). Absent until it is run. */
  jobsScheduled?: number;
  jobsInProgress?: number;
  jobsToday?: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
  jobsActive: number;
  /** Paid revenue per calendar month of the current year (index 0 = Jan). */
  monthly: number[];
}

export interface DashboardRecentInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  clientName: string | null;
}

/** A recently-added client, shown inside the Clients stat widget at md/lg. */
export interface DashboardRecentClient {
  id: string;
  name: string;
  company: string | null;
}

export interface DashboardUpcomingJob {
  id: string;
  title: string;
  status: string;
  scheduledDate: string;
  clientName: string | null;
}

export interface DashboardHomeScreenProps {
  loading: boolean;
  /** Caller's role — filters widgets + quick actions to what they can use. */
  role?: Role | null;
  businessName: string;
  /**
   * Optional UI rendered in place of the plain business name in the header.
   * Mobile passes <BusinessSwitcher />, web passes its own dropdown — when
   * the user has multiple businesses they can switch right from the home
   * header. When this slot is set, businessName is ignored.
   */
  businessSlot?: ReactNode;
  stats: DashboardStats | null;
  recent: DashboardRecentInvoice[];
  upcomingJobs: DashboardUpcomingJob[];
  /** Newest clients — fills the empty space in the md/lg Clients widget, which
   *  otherwise renders the same single number at every size. */
  recentClients?: DashboardRecentClient[];
  /** Clients added since the 1st of this month. */
  newClientsThisMonth?: number;
  /** businesses.dashboard_layout (migration 049). Null = default layout. */
  layout: DashboardLayout | null;
  /** Persist a layout change. Resolve null on success, or the reason it failed
   *  — the banner prints it, so a rejected write says WHY instead of just
   *  "try again", which is untriagable from a screenshot. */
  onSaveLayout: (layout: DashboardLayout) => Promise<string | null>;
  /** Called when the user leaves edit mode (e.g. to refetch the business). */
  onEditingDone?: () => void;
  onNewInvoicePress: () => void;
  onInvoicePress: (id: string) => void;
  onViewAllInvoicesPress: () => void;
  onCreateFirstInvoicePress: () => void;
  onJobPress: (id: string) => void;
  onViewAllJobsPress: () => void;
  onNewClientPress: () => void;
  /** Open a client from the Clients widget's recent list. */
  onClientPress?: (id: string) => void;
  onNewJobPress: () => void;
  /** Opens the payroll screen from the payroll tile. */
  onPayrollPress: () => void;
  /** Stat tiles are shortcuts into the list they count — the number is only
   *  useful next to the rows behind it. Each carries its own filter. */
  onPendingInvoicesPress?: () => void;
  onOverdueInvoicesPress?: () => void;
  onClientsPress?: () => void;
  onReportsPress?: (range: 'month' | 'year') => void;
  /** Current pay period's totals. Undefined while loading — the tile shows
   *  zeros rather than a spinner, matching every other stat here. */
  payroll?: {
    total: number; hours: number; workers: number;
    top?: { id: string; name: string; pay: number; hours: number }[];
    /** Previous period's total, for the trend at lg. Null when unavailable. */
    previousTotal?: number | null;
  } | null;
  /** Unpaid invoices, due soonest first — the pending tile's right column. */
  pendingInvoices?: { id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[];
  /** Highest-revenue clients this year (migration 224) — the clients tile. */
  topClients?: { id: string; name: string; company: string | null; total: number; invoices: number }[];
  /** Overdue invoices, oldest first — the overdue tile's right column. */
  overdueInvoices?: { id: string; invoiceNumber: string | null; totalAmount: number | null; dueDate: string | null; clientName: string | null }[];
  onCalendarPress: () => void;
}

// How many list rows each size shows (recent invoices / upcoming jobs).
const LIST_ROWS: Record<DashboardWidgetSize, number> = { sm: 3, md: 5, lg: 8 };

const GAP = 12;
/**
 * FIXED height of a small widget. Sortable.Flex does not stretch items in a
 * wrap line to the tallest, so every sm card was simply its own content height
 * and no two matched. A minimum height only fixes cards that are too SHORT —
 * the list widgets were too TALL — so this is a ceiling as well as a floor,
 * applied to every sm widget so a 1x1 is literally one size.
 *
 * Sized to the tallest sm content (quick actions' 2x2 icon grid, ~158);
 * shorter cards like the stat cubes just carry a little slack.
 *
 * Only sm. Every other size is content-driven, which is what the rest of the
 * widgets want — pinning them all clipped cards that were perfectly fine.
 */
const SM_CARD_H = 160;
/** Two cube rows plus the gap between them — a true 2x2. Used by the upcoming
 *  jobs card only; nothing else asked for a pinned lg. */
const LG_CARD_H = SM_CARD_H * 2 + GAP;
const H_PAD = 24;

// Revenue-chart scrub readout: bubble box, the flex gap between bars (needed to
// map a finger x onto a bar), and the height of the month-label row under the
// bars — `bottom` on the bubble is measured from below that row.
const CHART_BUBBLE_W = 96;
const CHART_BUBBLE_H = 24;
const CHART_BAR_GAP = 6;
const LABEL_ROW_H = 17;
/** Y-axis gutter. Narrow — the small widget is only half the screen wide. */
const AXIS_W = 34;

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-border-soft',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-border-soft',
};

const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-muted',
  sent: 'text-blue-600',
  paid: 'text-emerald-600',
  overdue: 'text-red-600',
  cancelled: 'text-faint',
};

const JOB_STATUS_PILL_BG: Record<string, string> = {
  scheduled: 'bg-blue-100',
  in_progress: 'bg-orange-100',
};

const JOB_STATUS_PILL_TEXT: Record<string, string> = {
  scheduled: 'text-blue-600',
  in_progress: 'text-orange-600',
};

const WIDGET_ICONS: Record<DashboardWidgetId, LucideIcon> = {
  quickActions: Plus,
  earningsMonth: DollarSign,
  payrollPeriod: DollarSign,
  invoicesPending: FileText,
  clientsTotal: Users,
  invoicesOverdue: AlertCircle,
  clockedIn: Clock,
  earningsYear: TrendingUp,
  jobsActive: Briefcase,
  monthlyChart: TrendingUp,
  upcomingJobs: CalendarDays,
  recentInvoices: FileText,
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

// 12 thin bars used inside lg-sized earnings widgets. `light` renders white
// bars for the brand-colored hero card.
function MiniBars({
  monthly,
  light,
  labels,
  height = 48,
  width,
}: {
  monthly: number[];
  light?: boolean;
  /** Month initials under each bar. Without them the bars are decoration —
   *  a shape with no axis tells you nothing about WHEN the peak was. */
  labels?: boolean;
  height?: number;
  /** Fixed width for the inline variant; omitted = fill the parent. */
  width?: number;
}) {
  const max = Math.max(...monthly);
  if (max === 0) return null;
  const currentMonth = new Date().getMonth();
  const initials = labels
    ? monthly.map((_, i) =>
        new Intl.DateTimeFormat(undefined, { month: 'narrow' }).format(new Date(2024, i, 1)))
    : null;
  return (
    <View style={width ? { width } : { flex: 1 }}>
      <View className="flex-row items-end gap-1" style={{ height }}>
        {monthly.map((amount, i) => (
          <View
            key={i}
            className={`flex-1 rounded-sm ${
              i === currentMonth
                ? light ? 'bg-card' : 'bg-primary'
                : amount > 0
                  ? light ? 'bg-white/40' : 'bg-primary/30'
                  : light ? 'bg-white/15' : 'bg-border-soft'
            }`}
            style={{ height: Math.max(amount > 0 ? 6 : 3, Math.round((amount / max) * height)) }}
          />
        ))}
      </View>
      {initials ? (
        <View className="flex-row gap-1 mt-1">
          {initials.map((m, i) => (
            <Text
              key={i}
              className={`flex-1 text-center text-[9px] ${
                i === currentMonth
                  ? light ? 'text-white font-bold' : 'text-ink font-bold'
                  : light ? 'text-white/50' : 'text-faint'
              }`}
            >
              {m}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function DashboardHomeScreen({
  loading,
  role = null,
  businessName,
  businessSlot,
  stats,
  recent,
  upcomingJobs,
  recentClients,
  newClientsThisMonth,
  layout,
  onSaveLayout,
  onEditingDone,
  onNewInvoicePress,
  onInvoicePress,
  onViewAllInvoicesPress,
  onCreateFirstInvoicePress,
  onJobPress,
  onViewAllJobsPress,
  onNewClientPress,
  onClientPress,
  onNewJobPress,
  onPayrollPress,
  pendingInvoices,
  overdueInvoices,
  topClients,
  onPendingInvoicesPress,
  onOverdueInvoicesPress,
  onClientsPress,
  onReportsPress,
  payroll,
  onCalendarPress,
}: DashboardHomeScreenProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard;
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const [editing, setEditing] = useState(false);
  const [visibleIds, setVisibleIds] = useState<DashboardWidgetId[]>([]);
  const [hiddenIds, setHiddenIds] = useState<DashboardWidgetId[]>([]);
  const [sizes, setSizes] = useState<Record<string, DashboardWidgetSize>>({});
  // null = saved. A string is the failure reason, shown under the banner.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Hold-and-drag (and tap) readout for the bar chart, which now lives only on
  // the large earnings tile — Revenue by month became a comparison list. Always
  // the full year, so the count is fixed. Off in edit mode so the widget stays
  // draggable for reordering.
  const earningsScrub = useBarScrub({ count: 12, gap: CHART_BAR_GAP, enabled: !editing });

  // Re-resolve when the saved layout actually changes (auto-saves write the
  // same value back on refetch, so JSON-keying avoids clobbering edits).
  const layoutKey = JSON.stringify(layout ?? null);
  useEffect(() => {
    const resolved = resolveDashboardLayout(layout, role);
    setVisibleIds(resolved.visible.map(w => w.id));
    setHiddenIds(resolved.hidden);
    setSizes(Object.fromEntries(resolved.visible.map(w => [w.id, w.size])));
  }, [layoutKey, role]);

  const containerWidth = screenWidth - H_PAD * 2;
  const widthFor = (size: DashboardWidgetSize) =>
    size === 'sm' ? Math.floor((containerWidth - GAP) / 2) : containerWidth;


  const persist = (
    nextVisible: DashboardWidgetId[],
    nextHidden: DashboardWidgetId[],
    nextSizes: Record<string, DashboardWidgetSize>,
  ) => {
    setSaveError(null);
    void onSaveLayout(buildDashboardLayout(nextVisible, nextHidden, nextSizes)).then(setSaveError);
  };

  const handleDragEnd = ({ indexToKey }: SortableFlexDragEndParams) => {
    // react-native-sortables reports React's INTERNAL child keys, not ours:
    // it builds its list with Children.toArray, which prefixes array children
    // ("payrollPeriod" → ".$payrollPeriod"). Matching those raw against our
    // ids found nothing, the handler returned early, and since the library
    // moves the cards itself the reorder looked like it worked while never
    // being written. Strip everything up to the last '$' to get our id back.
    const idSet = new Set(visibleIds);
    const next = indexToKey
      .map(k => String(k).replace(/^.*\$/, '') as DashboardWidgetId)
      .filter(id => idSet.has(id));
    // Require a COMPLETE permutation before writing. A partial list would be
    // saved as the whole order, silently dropping the widgets missing from it.
    if (next.length !== visibleIds.length) {
      console.warn('[dashboard] drag produced an unexpected key set', indexToKey);
      return;
    }
    setVisibleIds(next);
    persist(next, hiddenIds, sizes);
  };

  const hideWidget = (id: DashboardWidgetId) => {
    const nextVisible = visibleIds.filter(w => w !== id);
    const nextHidden = [...hiddenIds, id];
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    persist(nextVisible, nextHidden, sizes);
  };

  const addWidget = (id: DashboardWidgetId) => {
    const nextVisible = [...visibleIds, id];
    const nextHidden = hiddenIds.filter(w => w !== id);
    setVisibleIds(nextVisible);
    setHiddenIds(nextHidden);
    persist(nextVisible, nextHidden, sizes);
  };

  const setWidgetSize = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    const nextSizes = { ...sizes, [id]: size };
    setSizes(nextSizes);
    persist(visibleIds, hiddenIds, nextSizes);
  };

  const finishEditing = () => {
    setEditing(false);
    onEditingDone?.();
  };

  if (loading) {
    // Greeting + stat tiles + the earnings chart and list cards below them —
    // the same shape the loaded home uses, so nothing jumps on arrival.
    return (
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 24, gap: 16 }}>
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonStats count={4} />
        <SkeletonChart />
        <SkeletonCard lines={4} />
      </ScrollView>
    );
  }

  const now = new Date();
  const yearStr = String(now.getFullYear());
  const currentMonth = now.getMonth();
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);
  const monthly = stats?.monthly ?? (Array(12).fill(0) as number[]);

  // Extra context lines for md/lg earnings widgets — derived from data we
  // already have, no extra queries.
  const prevMonthAmount = currentMonth > 0 ? monthly[currentMonth - 1] : 0;
  const vsLastMonthLine = prevMonthAmount
    ? t.home.widgets.vsLastMonth.replace(
        '{{pct}}',
        `${monthly[currentMonth] >= prevMonthAmount ? '+' : ''}${Math.round(((monthly[currentMonth] - prevMonthAmount) / prevMonthAmount) * 100)}%`,
      )
    : null;
  const avgPerMonthLine = t.home.widgets.avgPerMonth.replace(
    '{{amount}}',
    formatCurrency((stats?.earningsYear ?? 0) / (currentMonth + 1)),
  );

  type StatWidget = {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color: string;
    bg: string;
    sub: string;
    extra?: string | null;
    bars?: boolean;
    /** Rows rendered under the tile at md/lg. Widgets that carry one stop
     *  looking identical at every size — the extra width buys extra content,
     *  not just whitespace. */
    list?: { id: string; primary: string; secondary?: string | null }[];
    listHeading?: string;
    onListItemPress?: (id: string) => void;
    /** Makes the WHOLE tile a tap target (e.g. payroll → the payroll screen).
     *  Kept separate from onListItemPress so a tile can have both without the
     *  row taps falling through to the tile. */
    onPress?: () => void;
  };

  const statWidgets: Partial<Record<DashboardWidgetId, StatWidget>> = {
    payrollPeriod: {
      label: t.home.widgets.payrollPeriodLabel,
      value: formatCurrency(payroll?.total ?? 0),
      icon: DollarSign,
      color: 'text-teal-600',
      bg: 'bg-teal-500/10',
      // Hours + headcount rather than the date range: the range is already on
      // the payroll screen this opens, and "0 h" is the honest reading of an
      // empty period — a $0 total with no context looks like a broken tile.
      sub: payroll && payroll.workers > 0
        ? t.home.widgets.payrollPeriodSub
            .replace('{{hours}}', String(Math.round(payroll.hours)))
            .replace('{{count}}', String(payroll.workers))
        : t.home.widgets.payrollPeriodEmpty,
      onPress: onPayrollPress,
      // The list is what makes md/lg worth their extra space — without it a
      // wider tile is the same number with more whitespace around it.
      list: (payroll?.top ?? []).map(w => ({
        id: w.id,
        primary: w.name,
        secondary: `${formatCurrency(w.pay)} · ${Math.round(w.hours)} h`,
      })),
      listHeading: t.home.widgets.payrollPeriodWorkers,
    },
    invoicesPending: {
      label: t.home.widgets.invoicesPendingLabel,
      value: stats?.invoicesPending ?? 0,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: t.home.widgets.invoicesPendingSub,
      onPress: onPendingInvoicesPress,
    },
    clientsTotal: {
      label: t.home.widgets.clientsLabel,
      value: stats?.clientsTotal ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      sub: t.home.widgets.clientsSub,
      extra: newClientsThisMonth
        ? t.home.widgets.clientsNewThisMonth.replace('{{count}}', String(newClientsThisMonth))
        : null,
      onPress: onClientsPress,
      list: (recentClients ?? []).map(cl => ({ id: cl.id, primary: cl.name, secondary: cl.company })),
      listHeading: t.home.widgets.clientsRecentHeading,
      onListItemPress: onClientPress,
    },
    invoicesOverdue: {
      label: t.home.widgets.invoicesOverdueLabel,
      value: stats?.invoicesOverdue ?? 0,
      icon: AlertCircle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      sub: t.home.widgets.invoicesOverdueSub,
      onPress: onOverdueInvoicesPress,
    },
    clockedIn: {
      label: t.home.widgets.clockedInLabel,
      value: stats?.clockedInNow ?? 0,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      sub: t.home.widgets.clockedInSub,
    },
    earningsYear: {
      label: t.home.widgets.earningsYearLabel,
      value: yearAmount,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-500/10',
      sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr),
      extra: avgPerMonthLine,
      bars: true,
      onPress: onReportsPress ? () => onReportsPress('year') : undefined,
    },
    jobsActive: {
      label: t.home.widgets.jobsActiveLabel,
      value: stats?.jobsActive ?? 0,
      icon: Briefcase,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      sub: t.home.widgets.jobsActiveSub,
    },
  };

  const formatJobDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return t.home.upcomingJobs.today;
    if (diffDays === 1) return t.home.upcomingJobs.tomorrow;
    return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' }).format(date);
  };

  // The revenue chart, shared by the standalone widget and the large earnings
  // tile. One implementation so the two can never drift — the earnings tile is
  // meant to BE this chart, with its own headline above it.
  const monthlyChartCard = (
    size: DashboardWidgetSize,
    s: ReturnType<typeof useBarScrub>,
    header?: ReactNode,
    /** Render on the brand-blue card instead of the neutral one. Every colour
     *  below has to flip together — theme tokens like text-faint and
     *  bg-border-soft are tuned for the card background and vanish on blue. */
    light?: boolean,
  ) => {
        const max = Math.max(...monthly);
        // sm shows the most recent 6 months; md/lg show the full year.
        const startIdx = size === 'sm' ? Math.max(0, currentMonth - 5) : 0;
        const shown = size === 'sm' ? monthly.slice(startIdx, startIdx + 6) : monthly;
        const barArea = size === 'sm' ? 64 : 96;
        const monthLabel = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'narrow' }).format(new Date(2026, i, 1));
        // Scale to a rounded ceiling, not the raw peak, so the axis labels are
        // round numbers and the tallest bar lands on the top gridline.
        const axisMax = niceCeil(max);
        // The small widget is half-width — two bands keep its labels legible.
        const ticks = size === 'sm' ? 2 : 4;
        const barH = (amount: number) =>
          Math.max(amount > 0 ? 8 : 3, Math.round((amount / axisMax) * barArea));
        return (
          <View className={`rounded-2xl p-5 flex-1 ${light ? 'bg-primary' : 'bg-card border border-border-soft'}`}>
            {header ?? (
              <Text className={`text-sm font-semibold mb-1 ${light ? 'text-white' : 'text-ink'}`}>
                {t.home.monthlyChart.title}
              </Text>
            )}
            {/* The totals line is part of the chart, not the heading: it is what
                makes the axis readable ("is 250k a lot?"), so every caller
                gets it. */}
            {(size === 'lg' || header) && max > 0 ? (
              <Text className={`text-xs mb-3 ${light ? 'text-white/70' : 'text-muted'}`}>
                {t.home.monthlyChart.totalLabel.replace('{{year}}', yearStr)}: {yearAmount} · {t.home.monthlyChart.avgLabel}: {formatCurrency((stats?.earningsYear ?? 0) / (currentMonth + 1))}
              </Text>
            ) : (
              <View className="mb-3" />
            )}
            {max === 0 ? (
              <Text className={`text-sm text-center py-6 ${light ? 'text-white/70' : 'text-faint'}`}>
                {t.home.monthlyChart.empty}
              </Text>
            ) : (
              <View className="flex-row">
                {/* Y axis — labels sit ON their gridline (same top = i × band
                    formula), so the two can never drift apart. */}
                <View style={{ width: AXIS_W, height: barArea }}>
                  {Array.from({ length: ticks + 1 }, (_, i) => (
                    <Text
                      key={i}
                      className={`text-[9px] ${light ? 'text-white/60' : 'text-faint'}`}
                      style={{ position: 'absolute', top: (barArea / ticks) * i - 5, right: 6 }}
                    >
                      {axisTick((axisMax / ticks) * (ticks - i))}
                    </Text>
                  ))}
                </View>

                <View className="flex-1">
                  <View style={{ height: barArea }}>
                    {Array.from({ length: ticks + 1 }, (_, i) => (
                      <View
                        key={i}
                        className={`absolute left-0 right-0 h-px ${light ? 'bg-white/20' : 'bg-border-soft'}`}
                        style={{ top: (barArea / ticks) * i }}
                      />
                    ))}

                    <View className="flex-row items-end gap-1.5" style={{ height: barArea }}>
                      {shown.map((amount, idx) => {
                        const i = startIdx + idx;
                        // While scrubbing, the held bar takes the highlight so
                        // the finger — not today's date — is what the eye
                        // follows.
                        const lit = s.active === null ? i === currentMonth : s.active === idx;
                        return (
                          <View key={i} className="flex-1 justify-end" style={{ height: barArea }}>
                            <View
                              className={`w-full rounded-t-md ${
                                light
                                  ? lit ? 'bg-white' : amount > 0 ? 'bg-white/45' : 'bg-white/15'
                                  : lit ? 'bg-primary' : amount > 0 ? 'bg-primary/30' : 'bg-border-soft'
                              }`}
                              style={{ height: barH(amount) }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View className="flex-row gap-1.5 mt-1">
                    {shown.map((amount, idx) => {
                      const i = startIdx + idx;
                      const lit = s.active === null ? i === currentMonth : s.active === idx;
                      return (
                        <Text
                          key={i}
                          className={`flex-1 text-center text-[10px] ${
                            light
                              ? lit ? 'text-white font-bold' : 'text-white/60'
                              : lit ? 'text-primary font-semibold' : 'text-faint'
                          }`}
                        >
                          {monthLabel(i)}
                        </Text>
                      );
                    })}
                  </View>

                  {/* Value bubble, positioned in pixels over the held bar. */}
                  {s.active !== null && s.width > 0 && shown[s.active] !== undefined ? (
                    <View
                      className={`absolute rounded-lg px-2 py-1 ${light ? 'bg-white' : 'bg-ink'}`}
                      style={{
                        width: CHART_BUBBLE_W,
                        // `bottom` is measured from below the month-label row,
                        // and clamped so a full-height bar can't push the
                        // bubble out of the card (Android clips overflow).
                        bottom: Math.min(
                          barH(shown[s.active]) + 6 + LABEL_ROW_H,
                          LABEL_ROW_H + barArea - CHART_BUBBLE_H,
                        ),
                        left: Math.min(
                          Math.max(0, ((s.active + 0.5) / shown.length) * s.width - CHART_BUBBLE_W / 2),
                          Math.max(0, s.width - CHART_BUBBLE_W),
                        ),
                      }}
                    >
                      <Text className={`text-[10px] font-bold text-center ${light ? 'text-primary' : 'text-surface'}`} numberOfLines={1}>
                        {formatCurrency(shown[s.active])}
                      </Text>
                    </View>
                  ) : null}

                  {/* Hold-and-slide layer, over the plot only (the axis gutter
                      is outside it, so x maps straight onto a bar). Disabled in
                      edit mode so the widget stays draggable for reordering. */}
                  <View className="absolute left-0 right-0 top-0 bottom-0" {...s.handlers} />
                </View>
              </View>
            )}
          </View>
        );
  };

  const renderWidget = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    if (id === 'earningsMonth') {
      // Tapping opens Reports scoped to THIS month — the number's context.
      const EarnCard = onReportsPress ? Pressable : View;
      const earnProps = onReportsPress
        ? { onPress: () => onReportsPress('month'), className: 'active:opacity-90' }
        : {};
      // Hero card — solid brand background so the headline number pops.
      //
      // md is the horizontal banner: it reads as a WIDER card, not a taller
      // one, and the width buys the chart on the right. lg is the tall card
      // below it. These were the other way round, which made md look bigger
      // than lg — the ladder ran backwards.
      if (size === 'md') {
        return (
          <EarnCard {...earnProps} className={`bg-primary rounded-2xl p-5 overflow-hidden relative flex-1 justify-center ${earnProps.className ?? ''}`}>


            <View className="flex-row items-center gap-4">
              <View className="w-14 h-14 rounded-2xl bg-white/15 items-center justify-center">
                <DollarSign size={26} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-white/80">
                  {t.home.widgets.earningsMonthLabel}
                </Text>
                <Text className="text-3xl font-bold text-white mt-0.5">
                  {formatCurrency(stats?.earningsMonth ?? 0)}
                </Text>
                <Text className="text-xs text-white/70 mt-0.5">
                  {t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}
                  {vsLastMonthLine ? ` · ${vsLastMonthLine}` : ''}
                </Text>
              </View>
              <MiniBars monthly={monthly} light labels width={116} />
            </View>
          </EarnCard>
        );
      }
      if (size === 'lg') {
        // The biggest size IS the revenue chart, headed by this month's number:
        // same axis, same totals line, same hold-to-scrub and tap-to-read. It
        // replaces the standalone Revenue-by-month widget rather than sitting
        // beside it showing the same twelve bars in a poorer form.
        return monthlyChartCard(
          'lg',
          earningsScrub,
          // The PLOT owns taps here (tap a bar to read it), so the card can't
          // also be a link. The headline row is the nav target instead.
          <Pressable
            onPress={onReportsPress ? () => onReportsPress('month') : undefined}
            disabled={!onReportsPress}
            className="flex-row items-center gap-3 mb-1 active:opacity-70"
          >
            <View className="w-10 h-10 rounded-xl bg-white/15 items-center justify-center">
              <DollarSign size={18} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-medium text-white/80">
                {t.home.widgets.earningsMonthLabel}
              </Text>
              <Text className="text-2xl font-bold text-white">
                {formatCurrency(stats?.earningsMonth ?? 0)}
              </Text>
            </View>
            {vsLastMonthLine ? (
              <Text className="text-xs font-semibold text-white/90">{vsLastMonthLine}</Text>
            ) : null}
          </Pressable>,
          true,
        );
      }
      return (
        <EarnCard {...earnProps} className={`bg-primary rounded-2xl p-5 overflow-hidden relative flex-1 ${earnProps.className ?? ''}`}>


          <View className="w-9 h-9 rounded-xl bg-white/15 items-center justify-center mb-3">
            <DollarSign size={18} color="#FFFFFF" />
          </View>
          <Text className="text-2xl font-bold text-white">
            {formatCurrency(stats?.earningsMonth ?? 0)}
          </Text>
          <Text className="text-xs font-medium text-white/90 mt-0.5">
            {t.home.widgets.earningsMonthLabel}
          </Text>
          <Text className="text-xs text-white/70 mt-0.5">
            {t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}
          </Text>
        </EarnCard>
      );
    }

    // Active jobs at md/lg: the count on the left, WHICH jobs on the right.
    // The total alone can't tell "twelve crews are out right now" from "twelve
    // are booked for next month" — different days entirely.
    if (id === 'jobsActive' && size !== 'sm') {
      const rows = upcomingJobs.slice(0, size === 'lg' ? 6 : 3);
      return (
        <Pressable
          onPress={onViewAllJobsPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-emerald-500/10 items-center justify-center mb-3">
                <Briefcase size={18} className="text-emerald-600" />
              </View>
              <Text className="text-2xl font-bold text-ink">{stats?.jobsActive ?? 0}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.jobsActiveLabel}
              </Text>
              <View className="flex-row mt-3" style={{ columnGap: 16 }}>
                <View>
                  <Text className="text-sm font-semibold text-ink">{stats?.jobsInProgress ?? 0}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.jobsInProgress}</Text>
                </View>
                <View>
                  <Text className="text-sm font-semibold text-ink">{stats?.jobsScheduled ?? 0}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.jobsScheduled}</Text>
                </View>
              </View>
              {size === 'lg' ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  <Text className="text-sm font-bold text-ink">{stats?.jobsToday ?? 0}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.jobsToday}</Text>
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.jobsUpcoming}
              </Text>
              {rows.length === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.jobsNone}</Text>
              ) : (
                rows.map(job => (
                  <Pressable
                    key={job.id}
                    onPress={() => onJobPress(job.id)}
                    className="flex-row items-center gap-2 py-1 active:opacity-70"
                  >
                    <Text className="text-xs text-ink flex-1" numberOfLines={1}>{job.title}</Text>
                    <Text className="text-[10px] text-faint shrink-0">
                      {job.scheduledDate ? formatJobDate(job.scheduledDate) : ''}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        </Pressable>
      );
    }

    // Earnings this year at md/lg. A single yearly total is a number with no
    // shape — the useful questions are how it split across the year, which
    // month carried it, and whether the current pace lands anywhere near it.
    if (id === 'earningsYear' && size !== 'sm') {
      const yearTotal = stats?.earningsYear ?? 0;
      const quarters = [0, 1, 2, 3].map(q => ({
        q,
        amount: monthly.slice(q * 3, q * 3 + 3).reduce((sum, m) => sum + m, 0),
      }));
      const bestIdx = monthly.reduce((best, m, i) => (m > monthly[best] ? i : best), 0);
      const monthsElapsed = currentMonth + 1;
      // Straight-line pace, NOT a forecast: this year's average carried to
      // twelve months. Seasonal work will beat or miss it badly, which is why
      // it sits next to the quarters rather than replacing them.
      const projected = monthsElapsed > 0 ? (yearTotal / monthsElapsed) * 12 : 0;
      return (
        <Pressable
          onPress={onReportsPress ? () => onReportsPress('year') : undefined}
          disabled={!onReportsPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-violet-500/10 items-center justify-center mb-3">
                <TrendingUp size={18} className="text-violet-600" />
              </View>
              <Text className="text-2xl font-bold text-ink">{yearAmount}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.earningsYearLabel}
              </Text>
              <View className="mt-3">
                <Text className="text-sm font-semibold text-ink">{avgPerMonthLine}</Text>
                <Text className="text-[10px] text-faint">
                  {t.home.widgets.earningsYearSub.replace('{{year}}', yearStr)}
                </Text>
              </View>
              {size === 'lg' && yearTotal > 0 ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  <Text className="text-sm font-bold text-ink">{formatCurrency(projected)}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.yearProjected}</Text>
                  <Text className="text-sm font-semibold text-ink mt-2">
                    {new Intl.DateTimeFormat(t.dateLocale, { month: 'short' })
                      .format(new Date(2026, bestIdx, 1))
                      .replace('.', '')} · {formatCurrency(monthly[bestIdx] ?? 0)}
                  </Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.yearBestMonth}</Text>
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.yearQuarters}
              </Text>
              {yearTotal === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.yearNoRevenue}</Text>
              ) : (
                quarters.map(({ q, amount }) => {
                  // A quarter the year hasn't reached yet is blank, not $0 —
                  // zero reads as "we earned nothing then", which is false.
                  const future = q * 3 > currentMonth;
                  return (
                    <View key={q} className="flex-row items-center gap-2 py-1">
                      <Text className="text-xs text-muted w-7">Q{q + 1}</Text>
                      <Text
                        className={`flex-1 text-right text-[11px] font-semibold ${future ? 'text-faint' : 'text-ink'}`}
                        numberOfLines={1}
                      >
                        {future ? '—' : formatCurrency(amount)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </Pressable>
      );
    }

    // Clients at md/lg: the count on the left, WHO those clients are on the
    // right. A headcount is the least useful thing about a client list — the
    // question is which of them actually pay, and who just arrived.
    if (id === 'clientsTotal' && size !== 'sm') {
      const top = (topClients ?? []).slice(0, size === 'lg' ? 5 : 3);
      const fresh = (recentClients ?? []).slice(0, 3);
      return (
        <Pressable
          onPress={onClientsPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-blue-500/10 items-center justify-center mb-3">
                <Users size={18} className="text-blue-600" />
              </View>
              <Text className="text-2xl font-bold text-ink">{stats?.clientsTotal ?? 0}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.clientsLabel}
              </Text>
              {newClientsThisMonth ? (
                <View className="mt-3">
                  <Text className="text-sm font-semibold text-emerald-600">
                    {t.home.widgets.clientsNewThisMonth.replace('{{count}}', String(newClientsThisMonth))}
                  </Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.clientsSub}</Text>
                </View>
              ) : null}
              {/* lg only, mirroring the divider block on payroll and invoices:
                  who came in recently, which the top list never shows (a new
                  client has no revenue yet by definition). */}
              {size === 'lg' && fresh.length > 0 ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1">
                    {t.home.widgets.clientsRecent}
                  </Text>
                  {fresh.map(cl => (
                    <Pressable
                      key={cl.id}
                      onPress={() => onClientPress(cl.id)}
                      className="py-0.5 active:opacity-70"
                    >
                      <Text className="text-xs text-ink" numberOfLines={1}>{cl.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.clientsTop}
              </Text>
              {top.length === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.clientsNoRevenue}</Text>
              ) : (
                top.map(cl => (
                  <Pressable
                    key={cl.id}
                    onPress={() => onClientPress(cl.id)}
                    className="flex-row items-center gap-2 py-1 active:opacity-70"
                  >
                    <Text className="text-xs text-ink flex-1" numberOfLines={1}>{cl.name}</Text>
                    <Text className="text-[11px] font-semibold text-ink">
                      {formatCurrency(cl.total)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        </Pressable>
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
      const rows = (overdueInvoices ?? []).slice(0, size === 'lg' ? 8 : 3);
      // The list is ordered oldest-first, so the head is the worst one.
      const oldest = rows.length ? daysPastDue(rows[0].dueDate) : null;
      return (
        <Pressable
          onPress={onOverdueInvoicesPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-red-500/10 items-center justify-center mb-3">
                <AlertCircle size={18} className="text-red-500" />
              </View>
              <Text className="text-2xl font-bold text-ink">{stats?.invoicesOverdue ?? 0}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.invoicesOverdueLabel}
              </Text>
              {/* Same shape as the payroll tile's stat row, so the two cards
                  come out the same height at the same size. */}
              <View className="mt-3">
                <Text className="text-sm font-semibold text-red-500">
                  {formatCurrency(stats?.invoicesOverdueAmount ?? 0)}
                </Text>
                <Text className="text-[10px] text-faint">{t.home.widgets.overdueTotalLabel}</Text>
              </View>
              {size === 'lg' && oldest !== null && oldest > 0 ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  <Text className="text-sm font-bold text-ink">
                    {t.home.widgets.overdueDaysShort.replace('{{count}}', String(oldest))}
                  </Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.overdueOldest}</Text>
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.invoicesOverdueLabel}
              </Text>
              {rows.length === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.overdueNone}</Text>
              ) : (
                rows.map(inv => {
                  const late = daysPastDue(inv.dueDate);
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={() => onInvoicePress(inv.id)}
                      className="flex-row items-center gap-2 py-1 active:opacity-70"
                    >
                      <Text className="text-xs text-ink flex-1" numberOfLines={1}>
                        {inv.clientName ?? inv.invoiceNumber ?? '—'}
                      </Text>
                      {late !== null && late > 0 ? (
                        <Text className="text-[10px] font-semibold text-red-500">
                          {t.home.widgets.overdueDaysShort.replace('{{count}}', String(late))}
                        </Text>
                      ) : null}
                      <Text className="text-[11px] font-semibold text-ink">
                        {formatCurrency(inv.totalAmount ?? 0)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        </Pressable>
      );
    }

    // Pending invoices at md/lg: the count on the left, WHICH invoices on the
    // right. A count alone says nothing actionable — seven pending could be
    // $700 or $70,000, and the ones that matter are those due soonest.
    if (id === 'invoicesPending' && size !== 'sm') {
      const rows = (pendingInvoices ?? []).slice(0, size === 'lg' ? 8 : 3);
      return (
        <Pressable
          onPress={onPendingInvoicesPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mb-3">
                <FileText size={18} className="text-primary" />
              </View>
              <Text className="text-2xl font-bold text-ink">{stats?.invoicesPending ?? 0}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.invoicesPendingLabel}
              </Text>
              {/* Same shape as the payroll tile's stat row, so the two cards
                  come out the same height at the same size. */}
              <View className="mt-3">
                <Text className="text-sm font-semibold text-ink">
                  {formatCurrency(stats?.invoicesPendingAmount ?? 0)}
                </Text>
                <Text className="text-[10px] text-faint">{t.home.widgets.pendingTotalLabel}</Text>
              </View>
              {size === 'lg' && (stats?.invoicesOverdue ?? 0) > 0 ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  <Text className="text-sm font-bold text-red-500">
                    {formatCurrency(stats?.invoicesOverdueAmount ?? 0)}
                  </Text>
                  <Text className="text-[10px] text-faint">
                    {t.home.widgets.pendingOverdueLabel} · {stats?.invoicesOverdue ?? 0}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.pendingDueSoon}
              </Text>
              {rows.length === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.pendingNone}</Text>
              ) : (
                rows.map(inv => (
                  // ONE line per invoice, like the payroll worker rows. A
                  // second line for the date doubled the row height, which is
                  // what made this card tower over the others at the same size.
                  <Pressable
                    key={inv.id}
                    onPress={() => onInvoicePress(inv.id)}
                    className="flex-row items-center gap-2 py-1 active:opacity-70"
                  >
                    <Text className="text-xs text-ink flex-1" numberOfLines={1}>
                      {inv.clientName ?? inv.invoiceNumber ?? '—'}
                    </Text>
                    <Text className="text-[10px] text-faint">{dueLabel(inv.dueDate)}</Text>
                    <Text className="text-[11px] font-semibold text-ink">
                      {formatCurrency(inv.totalAmount ?? 0)}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        </Pressable>
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
        <Pressable
          onPress={onPayrollPress}
          className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
        >
          <View className="flex-row" style={{ columnGap: 16 }}>
            <View className="flex-1">
              <View className="w-9 h-9 rounded-xl bg-teal-500/10 items-center justify-center mb-3">
                <DollarSign size={18} className="text-teal-600" />
              </View>
              <Text className="text-2xl font-bold text-ink">{formatCurrency(payroll.total)}</Text>
              <Text className="text-xs font-medium text-ink mt-0.5">
                {t.home.widgets.payrollPeriodLabel}
              </Text>
              <View className="flex-row mt-3" style={{ columnGap: 16 }}>
                <View>
                  <Text className="text-sm font-semibold text-ink">{Math.round(payroll.hours)}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.payrollPeriodHours}</Text>
                </View>
                <View>
                  <Text className="text-sm font-semibold text-ink">{payroll.workers}</Text>
                  <Text className="text-[10px] text-faint">{t.home.widgets.payrollPeriodWorkerCount}</Text>
                </View>
              </View>
              {/* lg adds the trend. Omitted when there is no comparable prior
                  period — "−100%" against a period nobody worked is noise. */}
              {size === 'lg' ? (
                <View className="mt-3 pt-3 border-t border-border-soft">
                  {deltaPct === null ? (
                    <Text className="text-[11px] text-faint">{t.home.widgets.payrollPeriodNoPrev}</Text>
                  ) : (
                    <>
                      <Text
                        className={`text-sm font-bold ${deltaPct >= 0 ? 'text-red-500' : 'text-emerald-600'}`}
                      >
                        {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(deltaPct))}%
                      </Text>
                      <Text className="text-[10px] text-faint">
                        {t.home.widgets.payrollPeriodVsPrev} · {formatCurrency(prev ?? 0)}
                      </Text>
                    </>
                  )}
                </View>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
                {t.home.widgets.payrollPeriodWorkers}
              </Text>
              {workerRows.length === 0 ? (
                <Text className="text-xs text-faint">{t.home.widgets.payrollPeriodEmpty}</Text>
              ) : (
                workerRows.map(w => (
                  <View key={w.id} className="flex-row items-center gap-2 py-1">
                    <Text className="text-xs text-ink flex-1" numberOfLines={1}>{w.name}</Text>
                    <Text className="text-[11px] text-muted">{Math.round(w.hours)} h</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </Pressable>
      );
    }

    const stat = statWidgets[id];
    if (stat) {
      const { label, value, icon: Icon, color, bg, sub, extra, bars, list, listHeading, onListItemPress, onPress } = stat;
      // A tappable tile is a Pressable; a plain one stays a View so it doesn't
      // advertise an interaction it doesn't have.
      const Card = onPress ? Pressable : View;
      const cardProps = onPress ? { onPress, className: 'active:opacity-80' } : {};
      // lg has room for four rows, md for two.
      const listRows = (list ?? []).slice(0, size === 'lg' ? 4 : 2);
      const statList = listRows.length > 0 ? (
        <View className="mt-4 pt-3 border-t border-border-soft">
          {listHeading ? (
            <Text className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-1.5">
              {listHeading}
            </Text>
          ) : null}
          {listRows.map(row => (
            <Pressable
              key={row.id}
              onPress={onListItemPress ? () => onListItemPress(row.id) : undefined}
              disabled={!onListItemPress}
              className="flex-row items-center gap-2 py-1.5 active:opacity-70"
            >
              <Text className="text-xs font-medium text-ink flex-1" numberOfLines={1}>{row.primary}</Text>
              {row.secondary ? (
                <Text className="text-[11px] text-faint shrink" numberOfLines={1}>{row.secondary}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null;
      // lg = horizontal banner (big icon left, value right) — clearly
      // different from the vertical sm/md tiles even with zero data.
      if (size === 'lg') {
        return (
          <Card {...cardProps} className={`bg-card rounded-2xl border border-border-soft p-5 flex-1 ${onPress ? 'active:opacity-80' : ''}`}>
            <View className="flex-row items-center gap-4">
              <View className={`w-14 h-14 rounded-2xl ${bg} items-center justify-center`}>
                <Icon size={26} className={color} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-muted">{label}</Text>
                <Text className="text-3xl font-bold text-ink mt-0.5">{String(value)}</Text>
                <Text className="text-xs text-faint mt-0.5">
                  {sub}
                  {extra ? ` · ${extra}` : ''}
                </Text>
              </View>
              {bars ? <MiniBars monthly={monthly} /> : null}
            </View>
            {statList}
          </Card>
        );
      }
      return (
        <Card {...cardProps} className={`bg-card rounded-2xl border border-border-soft p-5 flex-1 ${onPress ? 'active:opacity-80' : ''}`}>
          <View className={`w-9 h-9 rounded-xl ${bg} items-center justify-center mb-3`}>
            <Icon size={18} className={color} />
          </View>
          <Text className="text-2xl font-bold text-ink">{String(value)}</Text>
          <Text className="text-xs font-medium text-ink mt-0.5">{label}</Text>
          <Text className="text-xs text-faint mt-0.5">{sub}</Text>
          {size === 'md' && extra ? (
            <Text className="text-xs font-semibold text-muted mt-1">{extra}</Text>
          ) : null}
          {size === 'md' ? statList : null}
        </Card>
      );
    }

    switch (id) {
      case 'quickActions': {
        // Only actions this role can perform (the tile itself is dropped for
        // roles that can do none — see resolveDashboardLayout).
        const actions = [
          { label: t.home.quickActions.newInvoice, icon: FileText, onPress: onNewInvoicePress, bg: 'bg-primary/10', color: '#4F46E5', show: can.createInvoice(role) },
          { label: t.home.quickActions.newClient, icon: UserPlus, onPress: onNewClientPress, bg: 'bg-blue-500/10', color: '#2563EB', show: can.createClient(role) },
          { label: t.home.quickActions.newJob, icon: Briefcase, onPress: onNewJobPress, bg: 'bg-emerald-500/10', color: '#059669', show: can.createJob(role) },
          { label: t.home.quickActions.calendar, icon: CalendarDays, onPress: onCalendarPress, bg: 'bg-orange-500/10', color: '#EA580C', show: can.editCalendar(role) },
        ].filter(a => a.show);
        if (size === 'sm') {
          // Compact half-width tile: 2x2 icon-only buttons. Each button gets
          // its height from padding (not a vertical flex, which collapses in
          // this non-stretched card) and flexes to fill its half-width, so
          // the grid is well-proportioned and never overflows. justify-center
          // keeps the rows centered if the card ends up taller than its content.
          const rows = [actions.slice(0, 2), actions.slice(2, 4)];
          return (
            <View className="bg-card rounded-2xl border border-border-soft p-3 flex-1">
              <View style={{ flex: 1, rowGap: 10, justifyContent: 'center' }}>
                {rows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', columnGap: 10 }}>
                    {row.map(({ label, icon: Icon, onPress, bg, color }) => (
                      <Pressable
                        key={label}
                        onPress={onPress}
                        accessibilityLabel={label}
                        style={{ flex: 1 }}
                        className={`items-center justify-center py-5 rounded-xl active:opacity-80 ${bg}`}
                      >
                        <Icon size={22} color={color} />
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        }
        if (size === 'md') {
          // Full-width strip: 4 across, icon over a small label.
          return (
            <View className="bg-card rounded-2xl border border-border-soft p-4 flex-1 justify-center">
              <View className="flex-row gap-2">
                {actions.map(({ label, icon: Icon, onPress, bg, color }) => (
                  <Pressable
                    key={label}
                    onPress={onPress}
                    className={`items-center justify-center gap-1.5 px-2 py-3 rounded-xl flex-1 active:opacity-80 ${bg}`}
                  >
                    <Icon size={17} color={color} />
                    <Text className="text-[11px] font-semibold text-center" style={{ color }} numberOfLines={1}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }
        // lg — 2x2 big buttons with labels.
        return (
          <View className="bg-card rounded-2xl border border-border-soft p-4 flex-1 justify-center">
            <View className="flex-row flex-wrap gap-3">
              {actions.map(({ label, icon: Icon, onPress, bg, color }) => (
                <Pressable
                  key={label}
                  onPress={onPress}
                  className={`flex-row items-center justify-center gap-2 px-3 py-3 rounded-xl flex-1 min-w-[45%] active:opacity-80 ${bg}`}
                >
                  <Icon size={16} color={color} />
                  <Text className="text-sm font-semibold" style={{ color }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      }

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
          <View className="bg-card rounded-2xl border border-border-soft p-5 flex-1">
            <Text className="text-sm font-semibold text-ink mb-1">
              {t.home.monthlyChart.title}
            </Text>
            {size !== 'sm' && yearTotal > 0 ? (
              <Text className="text-xs text-muted mb-2">
                {t.home.monthlyChart.totalLabel.replace('{{year}}', yearStr)}: {yearAmount} · {t.home.monthlyChart.avgLabel}: {formatCurrency(yearTotal / (currentMonth + 1))}
              </Text>
            ) : null}
            {items.every(m => m.amount === 0) ? (
              <Text className="text-sm text-faint text-center py-6">
                {t.home.monthlyChart.empty}
              </Text>
            ) : (
              // Two columns at md/lg. A single column grows taller than the
              // grid cube the card sits in, which is what made the row ragged:
              // some widgets sized to content, the rest stretched to match the
              // tallest. Splitting in half keeps 6 rows within one cube-height
              // and 12 within two.
              (() => {
                const cols = size === 'sm' ? 1 : 2;
                const perCol = Math.ceil(items.length / cols);
                const row = (m: typeof items[number], first: boolean) => (
                  <View
                    key={m.i}
                    className={`flex-row items-center py-1.5 ${first ? '' : 'border-t border-border-soft'}`}
                  >
                    <Text
                      className={`text-xs w-9 ${m.i === currentMonth ? 'text-primary font-bold' : 'text-muted'}`}
                    >
                      {monthName(m.i)}
                    </Text>
                    <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                      {formatCurrency(m.amount)}
                    </Text>
                    {size !== 'sm' ? (
                      m.isFirst ? (
                        <Text className="text-[10px] text-faint ml-1">{t.home.monthlyChart.noPrevMonth}</Text>
                      ) : m.delta === null ? (
                        <Text className="text-[10px] text-faint ml-1">—</Text>
                      ) : (
                        <Text
                          className={`text-[10px] font-semibold ml-1 ${m.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                        >
                          {m.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(m.delta))}%
                        </Text>
                      )
                    ) : null}
                  </View>
                );
                return (
                  <View className="flex-row" style={{ columnGap: 16 }}>
                    {Array.from({ length: cols }, (_, cIdx) => (
                      <View key={cIdx} className="flex-1">
                        {items.slice(cIdx * perCol, (cIdx + 1) * perCol).map((m, rIdx) => row(m, rIdx === 0))}
                      </View>
                    ))}
                  </View>
                );
              })()
            )}
          </View>
        );
      }

      case 'upcomingJobs': {
        // ONE column at every size, like recent invoices: the job title is the
        // part you read, and splitting the row in half truncates it to nothing.
        // Extra size buys rows.
        const rows = upcomingJobs.slice(0, size === 'sm' ? 3 : size === 'md' ? 4 : 7);
        return (
          // The whole card opens the jobs list — a separate "View all" link sat
          // on top of the title at sm.
          <Pressable
            onPress={onViewAllJobsPress}
            style={size === 'lg' ? { height: LG_CARD_H } : undefined}
            className={`bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80 ${
              size === 'lg' ? 'overflow-hidden' : ''
            }`}
          >
            <Text className="text-sm font-semibold text-ink mb-2">
              {t.home.upcomingJobs.title}
            </Text>
            {/* Compact empty state: an icon plus py-6 made the EMPTY card
                taller than a populated stat cube beside it, so a widget with
                nothing to show was the biggest thing in the row. */}
            {rows.length === 0 ? (
              <Text className="text-xs text-faint py-2">{t.home.upcomingJobs.empty}</Text>
            ) : (
              <View>
                {rows.map((job, idx) => {
                  const statusKey = job.status as keyof typeof t.jobs.statuses;
                  return (
                    <Pressable
                      key={job.id}
                      onPress={() => onJobPress(job.id)}
                      className={`flex-row items-center gap-2 active:opacity-70 ${
                        size === 'sm' ? 'py-1.5' : 'py-2'
                      } ${idx > 0 ? 'border-t border-border-soft' : ''}`}
                    >
                      {/* Date chip first — for a scheduled job WHEN is what
                         orders the list, so it reads before the name. */}
                      <View className="bg-primary/10 px-2 py-0.5 rounded-lg shrink-0">
                        <Text className="text-[10px] font-semibold text-primary">
                          {formatJobDate(job.scheduledDate)}
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>
                        {job.title}
                      </Text>
                      {size !== 'sm' ? (
                        <View className={`px-2 py-0.5 rounded-full shrink-0 ${JOB_STATUS_PILL_BG[job.status] ?? 'bg-border-soft'}`}>
                          <Text className={`text-[10px] font-medium ${JOB_STATUS_PILL_TEXT[job.status] ?? 'text-muted'}`}>
                            {t.jobs.statuses[statusKey] ?? job.status}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Pressable>
        );
      }

      case 'recentInvoices': {
        // ONE column at every size. Two columns fit more invoices but gave
        // each row half the width for a name, a status pill and an amount —
        // so the names truncated to "Corey…", which is the one part of the row
        // you actually read. Extra height buys rows instead.
        const cols = 1;
        const rows = recent.slice(0, size === 'sm' ? 3 : size === 'md' ? 4 : 8);
        const perCol = rows.length;
        const invoiceRow = (inv: typeof rows[number], first: boolean) => {
          const statusKey = inv.status as keyof typeof t.invoiceStatus;
          const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
          const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-border-soft';
          const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-muted';
          return (
            <Pressable
              key={inv.id}
              onPress={() => onInvoicePress(inv.id)}
              className={`flex-row items-center gap-2 active:opacity-70 ${
                size === 'sm' ? 'py-1.5' : 'py-2'
              } ${first ? '' : 'border-t border-border-soft'}`}
            >
              {/* flex-1 on the label + shrink-0 on the trailing cells: without
                 it a long invoice number pushed the amount past the card edge
                 instead of truncating, which is what made sm overlap. */}
              <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>
                {size === 'sm' ? inv.invoiceNumber : (inv.clientName ?? t.home.recent.noClient)}
              </Text>
              {size !== 'sm' ? (
                <View className={`px-2 py-0.5 rounded-full shrink-0 ${pillBg}`}>
                  <Text className={`text-[10px] font-medium ${pillText}`}>{statusLabel}</Text>
                </View>
              ) : null}
              <Text className="text-sm font-semibold text-ink shrink-0">
                {formatCurrency(inv.totalAmount)}
              </Text>
            </Pressable>
          );
        };
        return (
          // The whole card opens the list — a separate "View all" link sat on
          // top of the title at sm, and a card that is already one tap does not
          // need a second target inside it.
          <Pressable
            onPress={onViewAllInvoicesPress}
            className="bg-card rounded-2xl border border-border-soft p-5 flex-1 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-ink mb-2">{t.home.recent.title}</Text>
            {rows.length === 0 ? (
              <View className="py-2">
                <Text className="text-xs text-faint">{t.home.recent.empty}</Text>
                <Pressable onPress={onCreateFirstInvoicePress} className="mt-1">
                  <Text className="text-primary font-medium text-xs">
                    {t.home.recent.createFirst}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row" style={{ columnGap: 16 }}>
                {Array.from({ length: cols }, (_, cIdx) => (
                  <View key={cIdx} className="flex-1">
                    {rows.slice(cIdx * perCol, (cIdx + 1) * perCol).map((inv, rIdx) => invoiceRow(inv, rIdx === 0))}
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      }

      default:
        return null;
    }
  };

  const header = (
    <View className="mb-6">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-2xl font-bold text-ink">{t.home.welcome}</Text>
        </View>
        {editing ? (
          <Pressable
            onPress={finishEditing}
            className="flex-row items-center gap-2 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
          >
            <Check size={16} color="#FFFFFF" />
            <Text className="text-white text-sm font-semibold">{t.home.customize.doneBtn}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setEditing(true)}
            className="flex-row items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl active:opacity-80"
          >
            <SlidersHorizontal size={16} color={c.ink} />
            <Text className="text-ink text-sm font-semibold">{t.home.customize.editBtn}</Text>
          </Pressable>
        )}
      </View>
      {/* Business name / switcher gets its own row — sharing the title row
          with the buttons squeezed long business names into a tall sliver. */}
      {editing ? (
        <Text className="text-sm text-primary mt-1">{t.home.customize.dragHint}</Text>
      ) : businessSlot ? (
        <View className="mt-2 self-start">{businessSlot}</View>
      ) : businessName ? (
        <Text className="text-sm text-muted mt-1">{businessName}</Text>
      ) : null}
      {saveError ? (
        <View className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100">
          <Text className="text-sm text-red-600">{t.home.customize.saveError}</Text>
          <Text className="text-xs text-red-600/80 mt-1">{saveError}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Animated.ScrollView
      ref={scrollRef}
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 176 }}
    >
      {header}
      {/* In-place drag-and-drop: the real widgets reorder right in the grid
          (same as web). sortEnabled toggles dragging without remounting. */}
      <Sortable.Flex
        sortEnabled={editing}
        flexDirection="row"
        flexWrap="wrap"
        gap={GAP}
        scrollableRef={scrollRef}
        onDragEnd={handleDragEnd}
        dragActivationDelay={150}
        activeItemScale={1.03}
      >
        {visibleIds.map((id) => {
          const size = sizes[id] ?? defaultWidgetSize(id);
          return (
            <View
              key={id}
              style={{ width: widthFor(size), ...(size === 'sm' ? { height: SM_CARD_H } : null) }}
            >
              {/* flex:1 so the card fills the row height (Sortable.Flex
                  stretches items in a wrap line to the tallest), letting
                  half-width widgets like quick-actions fill their cube
                  instead of leaving empty space under the content. */}
              <View pointerEvents={editing ? 'none' : 'auto'} style={{ flex: 1 }}>{renderWidget(id, size)}</View>
              {editing ? (
                <>
                  <View
                    pointerEvents="none"
                    className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/40"
                  />
                  <Pressable
                    onPress={() => hideWidget(id)}
                    hitSlop={6}
                    accessibilityLabel={t.home.customize.hideLabel}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-900 items-center justify-center shadow-md"
                  >
                    <X size={14} color="#FFFFFF" />
                  </Pressable>
                  <View className="absolute bottom-2 right-2 flex-row rounded-lg bg-gray-900/90 p-0.5">
                    {DASHBOARD_WIDGET_SIZES.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setWidgetSize(id, s)}
                        hitSlop={4}
                        accessibilityLabel={t.home.customize.sizes[s]}
                        className={`w-7 h-7 rounded-md items-center justify-center ${
                          size === s ? 'bg-card' : ''
                        }`}
                      >
                        <Text className={`text-[11px] font-bold ${size === s ? 'text-ink' : 'text-white/60'}`}>
                          {t.home.customize.sizes[s].charAt(0)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
      </Sortable.Flex>

      {/* Add-widget panel (edit mode only) */}
      {editing ? (
        <View className="mt-4 bg-card rounded-2xl border border-border-soft p-5">
          <Text className="text-sm font-semibold text-ink mb-3">
            {t.home.customize.addTitle}
          </Text>
          {hiddenIds.length === 0 ? (
            <Text className="text-sm text-faint">{t.home.customize.addEmpty}</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const Icon = WIDGET_ICONS[id];
                return (
                  <Pressable
                    key={id}
                    onPress={() => addWidget(id)}
                    className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-border active:opacity-80"
                  >
                    <Icon size={15} color={c.primary} />
                    <Text className="text-sm font-medium text-ink">
                      {t.home.widgetNames[id]}
                    </Text>
                    <Plus size={14} color={c.faint} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </Animated.ScrollView>
  );
}

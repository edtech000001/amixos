import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
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
import {
  DASHBOARD_WIDGET_SIZES,
  buildDashboardLayout,
  defaultWidgetSize,
  resolveDashboardLayout,
  type DashboardLayout,
  type DashboardWidgetId,
  type DashboardWidgetSize,
} from '../../lib/dashboardWidgets';

// NOTE: this screen is mobile-only (web has its own dashboard page), so it
// can import react-native-sortables / reanimated directly — same rule as the
// existing react-native imports in this file.

export interface DashboardStats {
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

export interface DashboardRecentInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  clientName: string | null;
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
  /** businesses.dashboard_layout (migration 049). Null = default layout. */
  layout: DashboardLayout | null;
  /** Persist a layout change. Resolve false to surface the save-error banner. */
  onSaveLayout: (layout: DashboardLayout) => Promise<boolean>;
  /** Called when the user leaves edit mode (e.g. to refetch the business). */
  onEditingDone?: () => void;
  onNewInvoicePress: () => void;
  onInvoicePress: (id: string) => void;
  onViewAllInvoicesPress: () => void;
  onCreateFirstInvoicePress: () => void;
  onJobPress: (id: string) => void;
  onViewAllJobsPress: () => void;
  onNewClientPress: () => void;
  onNewJobPress: () => void;
  onCalendarPress: () => void;
}

// How many list rows each size shows (recent invoices / upcoming jobs).
const LIST_ROWS: Record<DashboardWidgetSize, number> = { sm: 3, md: 5, lg: 8 };

const GAP = 12;
const H_PAD = 24;

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-gray-100',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-gray-100',
};

const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-gray-600',
  sent: 'text-blue-600',
  paid: 'text-emerald-600',
  overdue: 'text-red-600',
  cancelled: 'text-gray-400',
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
function MiniBars({ monthly, light }: { monthly: number[]; light?: boolean }) {
  const max = Math.max(...monthly);
  if (max === 0) return null;
  const currentMonth = new Date().getMonth();
  return (
    <View className="flex-row items-end gap-1" style={{ height: 48, width: 110 }}>
      {monthly.map((amount, i) => (
        <View
          key={i}
          className={`flex-1 rounded-sm ${
            i === currentMonth
              ? light ? 'bg-white' : 'bg-primary'
              : amount > 0
                ? light ? 'bg-white/40' : 'bg-primary/30'
                : light ? 'bg-white/15' : 'bg-gray-100'
          }`}
          style={{ height: Math.max(amount > 0 ? 6 : 3, Math.round((amount / max) * 48)) }}
        />
      ))}
    </View>
  );
}

export function DashboardHomeScreen({
  loading,
  businessName,
  businessSlot,
  stats,
  recent,
  upcomingJobs,
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
  onNewJobPress,
  onCalendarPress,
}: DashboardHomeScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard;
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const [editing, setEditing] = useState(false);
  const [visibleIds, setVisibleIds] = useState<DashboardWidgetId[]>([]);
  const [hiddenIds, setHiddenIds] = useState<DashboardWidgetId[]>([]);
  const [sizes, setSizes] = useState<Record<string, DashboardWidgetSize>>({});
  const [saveError, setSaveError] = useState(false);

  // Re-resolve when the saved layout actually changes (auto-saves write the
  // same value back on refetch, so JSON-keying avoids clobbering edits).
  const layoutKey = JSON.stringify(layout ?? null);
  useEffect(() => {
    const resolved = resolveDashboardLayout(layout);
    setVisibleIds(resolved.visible.map(w => w.id));
    setHiddenIds(resolved.hidden);
    setSizes(Object.fromEntries(resolved.visible.map(w => [w.id, w.size])));
  }, [layoutKey]);

  const containerWidth = screenWidth - H_PAD * 2;
  const widthFor = (size: DashboardWidgetSize) =>
    size === 'sm' ? Math.floor((containerWidth - GAP) / 2) : containerWidth;

  const persist = (
    nextVisible: DashboardWidgetId[],
    nextHidden: DashboardWidgetId[],
    nextSizes: Record<string, DashboardWidgetSize>,
  ) => {
    setSaveError(false);
    void onSaveLayout(buildDashboardLayout(nextVisible, nextHidden, nextSizes)).then(ok => {
      if (!ok) setSaveError(true);
    });
  };

  const handleDragEnd = ({ indexToKey }: SortableFlexDragEndParams) => {
    const idSet = new Set(visibleIds);
    const next = indexToKey.filter(k => idSet.has(k as DashboardWidgetId)) as DashboardWidgetId[];
    if (!next.length) return;
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
    return (
      <View className="flex-1 items-center justify-center bg-surface py-20">
        <View className="flex-row gap-1">
          {[0, 1, 2].map(i => (
            <View key={i} className="w-2 h-2 rounded-full bg-primary" />
          ))}
        </View>
      </View>
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
  };

  const statWidgets: Partial<Record<DashboardWidgetId, StatWidget>> = {
    invoicesPending: {
      label: t.home.widgets.invoicesPendingLabel,
      value: stats?.invoicesPending ?? 0,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: t.home.widgets.invoicesPendingSub,
    },
    clientsTotal: {
      label: t.home.widgets.clientsLabel,
      value: stats?.clientsTotal ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      sub: t.home.widgets.clientsSub,
    },
    invoicesOverdue: {
      label: t.home.widgets.invoicesOverdueLabel,
      value: stats?.invoicesOverdue ?? 0,
      icon: AlertCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
      sub: t.home.widgets.invoicesOverdueSub,
    },
    clockedIn: {
      label: t.home.widgets.clockedInLabel,
      value: stats?.clockedInNow ?? 0,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      sub: t.home.widgets.clockedInSub,
    },
    earningsYear: {
      label: t.home.widgets.earningsYearLabel,
      value: yearAmount,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr),
      extra: avgPerMonthLine,
      bars: true,
    },
    jobsActive: {
      label: t.home.widgets.jobsActiveLabel,
      value: stats?.jobsActive ?? 0,
      icon: Briefcase,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
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

  const renderWidget = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    if (id === 'earningsMonth') {
      // Hero card — solid brand background so the headline number pops.
      return (
        <View className="bg-primary rounded-2xl p-5 overflow-hidden relative">
          <View className="absolute -right-5 -top-5 w-24 h-24 rounded-full bg-white/10" />
          <View className="absolute -right-10 top-10 w-24 h-24 rounded-full bg-white/5" />
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-2">
              <View className="w-9 h-9 rounded-xl bg-white/15 items-center justify-center mb-3">
                <DollarSign size={18} color="#FFFFFF" />
              </View>
              <Text className={`font-bold text-white ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>
                {formatCurrency(stats?.earningsMonth ?? 0)}
              </Text>
              <Text className="text-xs font-medium text-white/90 mt-0.5">
                {t.home.widgets.earningsMonthLabel}
              </Text>
              <Text className="text-xs text-white/70 mt-0.5">
                {t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount)}
              </Text>
              {size !== 'sm' && vsLastMonthLine ? (
                <Text className="text-xs font-semibold text-white/90 mt-1">{vsLastMonthLine}</Text>
              ) : null}
            </View>
            {size === 'lg' ? <MiniBars monthly={monthly} light /> : null}
          </View>
        </View>
      );
    }

    const stat = statWidgets[id];
    if (stat) {
      const { label, value, icon: Icon, color, bg, sub, extra, bars } = stat;
      return (
        <View className="bg-white rounded-2xl border border-gray-100 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-2">
              <View className={`w-9 h-9 rounded-xl ${bg} items-center justify-center mb-3`}>
                <Icon size={18} className={color} />
              </View>
              <Text className={`font-bold text-gray-900 ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>
                {String(value)}
              </Text>
              <Text className="text-xs font-medium text-gray-700 mt-0.5">{label}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{sub}</Text>
              {size !== 'sm' && extra ? (
                <Text className="text-xs font-semibold text-gray-600 mt-1">{extra}</Text>
              ) : null}
            </View>
            {size === 'lg' && bars ? <MiniBars monthly={monthly} /> : null}
          </View>
        </View>
      );
    }

    switch (id) {
      case 'quickActions': {
        const actions = [
          { label: t.home.quickActions.newInvoice, icon: FileText, onPress: onNewInvoicePress, bg: 'bg-primary/10', color: '#4F46E5' },
          { label: t.home.quickActions.newClient, icon: UserPlus, onPress: onNewClientPress, bg: 'bg-blue-50', color: '#2563EB' },
          { label: t.home.quickActions.newJob, icon: Briefcase, onPress: onNewJobPress, bg: 'bg-emerald-50', color: '#059669' },
          { label: t.home.quickActions.calendar, icon: CalendarDays, onPress: onCalendarPress, bg: 'bg-orange-50', color: '#EA580C' },
        ];
        if (size === 'sm') {
          // Compact half-width tile: 2x2 icon-only buttons.
          return (
            <View className="bg-white rounded-2xl border border-gray-100 p-4">
              <View className="flex-row flex-wrap gap-2">
                {actions.map(({ label, icon: Icon, onPress, bg, color }) => (
                  <Pressable
                    key={label}
                    onPress={onPress}
                    accessibilityLabel={label}
                    className={`items-center justify-center py-3 rounded-xl flex-1 min-w-[45%] active:opacity-80 ${bg}`}
                  >
                    <Icon size={18} color={color} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }
        if (size === 'md') {
          // Full-width strip: 4 across, icon over a small label.
          return (
            <View className="bg-white rounded-2xl border border-gray-100 p-4">
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
          <View className="bg-white rounded-2xl border border-gray-100 p-4">
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
        const max = Math.max(...monthly);
        // sm shows the most recent 6 months; md/lg show the full year.
        const startIdx = size === 'sm' ? Math.max(0, currentMonth - 5) : 0;
        const shown = size === 'sm' ? monthly.slice(startIdx, startIdx + 6) : monthly;
        const barArea = size === 'sm' ? 64 : 96;
        const monthLabel = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'narrow' }).format(new Date(2026, i, 1));
        return (
          <View className="bg-white rounded-2xl border border-gray-100 p-5">
            <Text className="text-sm font-semibold text-gray-900 mb-1">
              {t.home.monthlyChart.title}
            </Text>
            {size === 'lg' && max > 0 ? (
              <Text className="text-xs text-gray-500 mb-3">
                {t.home.monthlyChart.totalLabel.replace('{{year}}', yearStr)}: {yearAmount} · {t.home.monthlyChart.avgLabel}: {formatCurrency((stats?.earningsYear ?? 0) / (currentMonth + 1))}
              </Text>
            ) : (
              <View className="mb-3" />
            )}
            {max === 0 ? (
              <Text className="text-sm text-gray-400 text-center py-6">
                {t.home.monthlyChart.empty}
              </Text>
            ) : (
              <View className="flex-row items-end gap-1.5">
                {shown.map((amount, idx) => {
                  const i = startIdx + idx;
                  return (
                    <View key={i} className="flex-1 items-center gap-1">
                      <View className="w-full justify-end" style={{ height: barArea }}>
                        <View
                          className={`w-full rounded-t-md ${
                            i === currentMonth
                              ? 'bg-primary'
                              : amount > 0
                                ? 'bg-primary/30'
                                : 'bg-gray-100'
                          }`}
                          style={{ height: Math.max(amount > 0 ? 8 : 3, Math.round((amount / max) * barArea)) }}
                        />
                      </View>
                      <Text
                        className={`text-[10px] ${i === currentMonth ? 'text-primary font-semibold' : 'text-gray-400'}`}
                      >
                        {monthLabel(i)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      }

      case 'upcomingJobs': {
        const rows = upcomingJobs.slice(0, LIST_ROWS[size]);
        return (
          <View className="bg-white rounded-2xl border border-gray-100">
            <View className="px-6 py-4 border-b border-gray-50 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-gray-900">
                {t.home.upcomingJobs.title}
              </Text>
              <Pressable onPress={onViewAllJobsPress}>
                <Text className="text-xs text-primary font-medium">
                  {t.home.upcomingJobs.viewAll}
                </Text>
              </Pressable>
            </View>
            {rows.length === 0 ? (
              <View className="px-6 py-10 items-center">
                <CalendarDays size={32} color="#D1D5DB" />
                <Text className="text-gray-400 text-sm mt-3">{t.home.upcomingJobs.empty}</Text>
              </View>
            ) : (
              <View>
                {rows.map((job, idx) => {
                  const statusKey = job.status as keyof typeof t.jobs.statuses;
                  return (
                    <Pressable
                      key={job.id}
                      onPress={() => onJobPress(job.id)}
                      className={`flex-row items-center justify-between px-6 active:bg-gray-50 ${
                        size === 'sm' ? 'py-2.5' : 'py-3.5'
                      } ${idx > 0 ? 'border-t border-gray-50' : ''}`}
                    >
                      <View className="flex-row items-center gap-3 flex-1 mr-3">
                        <View className="bg-primary/10 px-2 py-1 rounded-lg">
                          <Text className="text-[11px] font-semibold text-primary">
                            {formatJobDate(job.scheduledDate)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                            {job.title}
                          </Text>
                          {size !== 'sm' ? (
                            <Text className="text-xs text-gray-400" numberOfLines={1}>
                              {job.clientName ?? t.home.upcomingJobs.noClient}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      {size !== 'sm' ? (
                        <View className={`px-2.5 py-1 rounded-full ${JOB_STATUS_PILL_BG[job.status] ?? 'bg-gray-100'}`}>
                          <Text className={`text-xs font-medium ${JOB_STATUS_PILL_TEXT[job.status] ?? 'text-gray-500'}`}>
                            {t.jobs.statuses[statusKey] ?? job.status}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      }

      case 'recentInvoices': {
        const rows = recent.slice(0, LIST_ROWS[size]);
        return (
          <View className="bg-white rounded-2xl border border-gray-100">
            <View className="px-6 py-4 border-b border-gray-50 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-gray-900">{t.home.recent.title}</Text>
              <Pressable onPress={onViewAllInvoicesPress}>
                <Text className="text-xs text-primary font-medium">{t.home.recent.viewAll}</Text>
              </Pressable>
            </View>
            {rows.length === 0 ? (
              <View className="px-6 py-12 items-center">
                <FileText size={32} color="#D1D5DB" />
                <Text className="text-gray-400 text-sm mt-3">{t.home.recent.empty}</Text>
                <Pressable onPress={onCreateFirstInvoicePress} className="mt-1">
                  <Text className="text-primary font-medium text-sm">
                    {t.home.recent.createFirst}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {rows.map((inv, idx) => {
                  const statusKey = inv.status as keyof typeof t.invoiceStatus;
                  const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
                  const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-gray-100';
                  const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-gray-500';
                  const clientName = inv.clientName ?? t.home.recent.noClient;
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={() => onInvoicePress(inv.id)}
                      className={`flex-row items-center justify-between px-6 active:bg-gray-50 ${
                        size === 'sm' ? 'py-2.5' : 'py-3.5'
                      } ${idx > 0 ? 'border-t border-gray-50' : ''}`}
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                          {inv.invoiceNumber}
                        </Text>
                        {size !== 'sm' ? (
                          <Text className="text-xs text-gray-400" numberOfLines={1}>{clientName}</Text>
                        ) : null}
                      </View>
                      <View className="flex-row items-center gap-3">
                        {size !== 'sm' ? (
                          <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                            <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                          </View>
                        ) : null}
                        <Text className="text-sm font-semibold text-gray-900">
                          {formatCurrency(inv.totalAmount)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
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
          <Text className="text-2xl font-bold text-gray-900">{t.home.welcome}</Text>
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
            className="flex-row items-center gap-2 bg-white border border-gray-200 px-4 py-2.5 rounded-xl active:opacity-80"
          >
            <SlidersHorizontal size={16} color="#374151" />
            <Text className="text-gray-700 text-sm font-semibold">{t.home.customize.editBtn}</Text>
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
        <Text className="text-sm text-gray-500 mt-1">{businessName}</Text>
      ) : null}
      {saveError ? (
        <View className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <Text className="text-sm text-red-600">{t.home.customize.saveError}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Animated.ScrollView
      ref={scrollRef}
      className="flex-1 bg-surface"
      contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 24, paddingBottom: 144 }}
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
            <View key={id} style={{ width: widthFor(size) }}>
              <View pointerEvents={editing ? 'none' : 'auto'}>{renderWidget(id, size)}</View>
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
                          size === s ? 'bg-white' : ''
                        }`}
                      >
                        <Text className={`text-[11px] font-bold ${size === s ? 'text-gray-900' : 'text-white/60'}`}>
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
        <View className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
          <Text className="text-sm font-semibold text-gray-900 mb-3">
            {t.home.customize.addTitle}
          </Text>
          {hiddenIds.length === 0 ? (
            <Text className="text-sm text-gray-400">{t.home.customize.addEmpty}</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {hiddenIds.map((id) => {
                const Icon = WIDGET_ICONS[id];
                return (
                  <Pressable
                    key={id}
                    onPress={() => addWidget(id)}
                    className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 active:opacity-80"
                  >
                    <Icon size={15} color="#4F46E5" />
                    <Text className="text-sm font-medium text-gray-700">
                      {t.home.widgetNames[id]}
                    </Text>
                    <Plus size={14} color="#9CA3AF" />
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

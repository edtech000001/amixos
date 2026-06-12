import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
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
  GripVertical,
  EyeOff,
  BarChart3,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import {
  buildDashboardLayout,
  resolveDashboardLayout,
  type DashboardLayout,
  type DashboardWidgetDef,
  type DashboardWidgetId,
} from '../../lib/dashboardWidgets';

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

// Edit mode reordering is delegated to the platform: mobile passes a
// DraggableFlatList-based implementation (the lib stays out of shared/).
export interface DashboardEditListArgs {
  items: { id: DashboardWidgetId }[];
  onReorder: (next: { id: DashboardWidgetId }[]) => void;
  renderRow: (
    item: { id: DashboardWidgetId },
    handle: { drag: () => void; isActive: boolean },
  ) => ReactNode;
  header: ReactNode;
  footer: ReactNode;
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
  renderEditList: (args: DashboardEditListArgs) => ReactNode;
}

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
  monthlyChart: BarChart3,
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
  renderEditList,
}: DashboardHomeScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard;

  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState<DashboardWidgetDef[]>([]);
  const [hidden, setHidden] = useState<DashboardWidgetDef[]>([]);
  const [saveError, setSaveError] = useState(false);

  // Re-resolve when the saved layout actually changes (auto-saves write the
  // same value back on refetch, so JSON-keying avoids clobbering edits).
  const layoutKey = JSON.stringify(layout ?? null);
  useEffect(() => {
    const resolved = resolveDashboardLayout(layout);
    setVisible(resolved.visible);
    setHidden(resolved.hidden);
  }, [layoutKey]);

  const persist = (nextVisible: DashboardWidgetDef[], nextHidden: DashboardWidgetDef[]) => {
    setSaveError(false);
    void onSaveLayout(
      buildDashboardLayout(nextVisible.map(w => w.id), nextHidden.map(w => w.id)),
    ).then(ok => {
      if (!ok) setSaveError(true);
    });
  };

  const reorderWidgets = (next: { id: DashboardWidgetId }[]) => {
    const byId = new Map(visible.map(w => [w.id, w]));
    const nextVisible = next.map(it => byId.get(it.id)!).filter(Boolean);
    setVisible(nextVisible);
    persist(nextVisible, hidden);
  };

  const hideWidget = (id: DashboardWidgetId) => {
    const widget = visible.find(w => w.id === id);
    if (!widget) return;
    const nextVisible = visible.filter(w => w.id !== id);
    const nextHidden = [...hidden, widget];
    setVisible(nextVisible);
    setHidden(nextHidden);
    persist(nextVisible, nextHidden);
  };

  const addWidget = (id: DashboardWidgetId) => {
    const widget = hidden.find(w => w.id === id);
    if (!widget) return;
    const nextVisible = [...visible, widget];
    const nextHidden = hidden.filter(w => w.id !== id);
    setVisible(nextVisible);
    setHidden(nextHidden);
    persist(nextVisible, nextHidden);
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

  const yearStr = String(new Date().getFullYear());
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);

  type StatWidget = {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color: string;
    bg: string;
    sub: string;
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

  const renderStatCard = (id: DashboardWidgetId) => {
    if (id === 'earningsMonth') {
      // Hero card — solid brand background so the headline number pops.
      return (
        <View className="bg-primary rounded-2xl p-5 flex-1 min-w-[45%] md:min-w-[30%] overflow-hidden relative">
          <View className="absolute -right-5 -top-5 w-24 h-24 rounded-full bg-white/10" />
          <View className="absolute -right-10 top-10 w-24 h-24 rounded-full bg-white/5" />
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
        </View>
      );
    }
    const stat = statWidgets[id];
    if (!stat) return null;
    const { label, value, icon: Icon, color, bg, sub } = stat;
    return (
      <View className="bg-white rounded-2xl border border-gray-100 p-5 flex-1 min-w-[45%] md:min-w-[30%]">
        <View className={`w-9 h-9 rounded-xl ${bg} items-center justify-center mb-3`}>
          <Icon size={18} className={color} />
        </View>
        <Text className="text-2xl font-bold text-gray-900">{String(value)}</Text>
        <Text className="text-xs font-medium text-gray-700 mt-0.5">{label}</Text>
        <Text className="text-xs text-gray-400 mt-0.5">{sub}</Text>
      </View>
    );
  };

  const renderFullWidget = (id: DashboardWidgetId) => {
    switch (id) {
      case 'quickActions': {
        const actions = [
          { label: t.home.quickActions.newInvoice, icon: FileText, onPress: onNewInvoicePress, bg: 'bg-primary/10', color: '#4F46E5' },
          { label: t.home.quickActions.newClient, icon: UserPlus, onPress: onNewClientPress, bg: 'bg-blue-50', color: '#2563EB' },
          { label: t.home.quickActions.newJob, icon: Briefcase, onPress: onNewJobPress, bg: 'bg-emerald-50', color: '#059669' },
          { label: t.home.quickActions.calendar, icon: CalendarDays, onPress: onCalendarPress, bg: 'bg-orange-50', color: '#EA580C' },
        ];
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
        const monthly = stats?.monthly ?? Array(12).fill(0);
        const max = Math.max(...monthly);
        const currentMonth = new Date().getMonth();
        const monthLabel = (i: number) =>
          new Intl.DateTimeFormat(t.dateLocale, { month: 'narrow' }).format(new Date(2026, i, 1));
        return (
          <View className="bg-white rounded-2xl border border-gray-100 p-5">
            <Text className="text-sm font-semibold text-gray-900 mb-4">
              {t.home.monthlyChart.title}
            </Text>
            {max === 0 ? (
              <Text className="text-sm text-gray-400 text-center py-6">
                {t.home.monthlyChart.empty}
              </Text>
            ) : (
              <View className="flex-row items-end gap-1.5">
                {monthly.map((amount, i) => (
                  <View key={i} className="flex-1 items-center gap-1">
                    <View className="w-full justify-end" style={{ height: 96 }}>
                      <View
                        className={`w-full rounded-t-md ${
                          i === currentMonth
                            ? 'bg-primary'
                            : amount > 0
                              ? 'bg-primary/30'
                              : 'bg-gray-100'
                        }`}
                        style={{ height: Math.max(amount > 0 ? 8 : 3, Math.round((amount / max) * 96)) }}
                      />
                    </View>
                    <Text
                      className={`text-[10px] ${i === currentMonth ? 'text-primary font-semibold' : 'text-gray-400'}`}
                    >
                      {monthLabel(i)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      }

      case 'upcomingJobs':
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
            {upcomingJobs.length === 0 ? (
              <View className="px-6 py-10 items-center">
                <CalendarDays size={32} color="#D1D5DB" />
                <Text className="text-gray-400 text-sm mt-3">{t.home.upcomingJobs.empty}</Text>
              </View>
            ) : (
              <View>
                {upcomingJobs.map((job, idx) => {
                  const statusKey = job.status as keyof typeof t.jobs.statuses;
                  return (
                    <Pressable
                      key={job.id}
                      onPress={() => onJobPress(job.id)}
                      className={`flex-row items-center justify-between px-6 py-3.5 active:bg-gray-50 ${
                        idx > 0 ? 'border-t border-gray-50' : ''
                      }`}
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
                          <Text className="text-xs text-gray-400" numberOfLines={1}>
                            {job.clientName ?? t.home.upcomingJobs.noClient}
                          </Text>
                        </View>
                      </View>
                      <View className={`px-2.5 py-1 rounded-full ${JOB_STATUS_PILL_BG[job.status] ?? 'bg-gray-100'}`}>
                        <Text className={`text-xs font-medium ${JOB_STATUS_PILL_TEXT[job.status] ?? 'text-gray-500'}`}>
                          {t.jobs.statuses[statusKey] ?? job.status}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );

      case 'recentInvoices':
        return (
          <View className="bg-white rounded-2xl border border-gray-100">
            <View className="px-6 py-4 border-b border-gray-50 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-gray-900">{t.home.recent.title}</Text>
              <Pressable onPress={onViewAllInvoicesPress}>
                <Text className="text-xs text-primary font-medium">{t.home.recent.viewAll}</Text>
              </Pressable>
            </View>
            {recent.length === 0 ? (
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
                {recent.map((inv, idx) => {
                  const statusKey = inv.status as keyof typeof t.invoiceStatus;
                  const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
                  const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-gray-100';
                  const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-gray-500';
                  const clientName = inv.clientName ?? t.home.recent.noClient;
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={() => onInvoicePress(inv.id)}
                      className={`flex-row items-center justify-between px-6 py-3.5 active:bg-gray-50 ${
                        idx > 0 ? 'border-t border-gray-50' : ''
                      }`}
                    >
                      <View>
                        <Text className="text-sm font-medium text-gray-900">{inv.invoiceNumber}</Text>
                        <Text className="text-xs text-gray-400">{clientName}</Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                          <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                        </View>
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
          with two buttons squeezed long business names into a tall sliver. */}
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

  // ── Edit mode — single-column drag list + add-widget panel ───────────────
  if (editing) {
    const footer = (
      <View className="mt-3 bg-white rounded-2xl border border-gray-100 p-5">
        <Text className="text-sm font-semibold text-gray-900 mb-3">
          {t.home.customize.addTitle}
        </Text>
        {hidden.length === 0 ? (
          <Text className="text-sm text-gray-400">{t.home.customize.addEmpty}</Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {hidden.map(({ id }) => {
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
    );

    return (
      <View className="flex-1 bg-surface">
        {renderEditList({
          items: visible.map(w => ({ id: w.id })),
          onReorder: reorderWidgets,
          header,
          footer,
          renderRow: ({ id }, { drag, isActive }) => {
            const Icon = WIDGET_ICONS[id];
            return (
              <Pressable
                onLongPress={drag}
                delayLongPress={150}
                disabled={isActive}
                className={`flex-row items-center gap-3 bg-white rounded-2xl border px-4 py-3.5 mb-3 ${
                  isActive ? 'border-primary shadow-md' : 'border-gray-100'
                }`}
              >
                <Pressable onPressIn={drag} hitSlop={8}>
                  <GripVertical size={18} color="#9CA3AF" />
                </Pressable>
                <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
                  <Icon size={16} color="#4F46E5" />
                </View>
                <Text className="flex-1 text-sm font-medium text-gray-900">
                  {t.home.widgetNames[id]}
                </Text>
                <Pressable
                  onPress={() => hideWidget(id)}
                  hitSlop={8}
                  className="w-8 h-8 rounded-full bg-gray-50 items-center justify-center"
                  accessibilityLabel={t.home.customize.hideLabel}
                >
                  <EyeOff size={15} color="#6B7280" />
                </Pressable>
              </Pressable>
            );
          },
        })}
      </View>
    );
  }

  // ── Normal mode — render widgets in saved order. Consecutive stat cards
  // are grouped into one wrapping row so the 2-col grid flows naturally.
  const sections: { key: string; node: ReactNode }[] = [];
  let statRun: DashboardWidgetId[] = [];
  const flushStats = () => {
    if (!statRun.length) return;
    const ids = statRun;
    statRun = [];
    sections.push({
      key: `stats-${ids.join('-')}`,
      node: (
        <View className="flex-row flex-wrap gap-4 mb-4">
          {ids.map(id => (
            <Fragment key={id}>{renderStatCard(id)}</Fragment>
          ))}
        </View>
      ),
    });
  };
  for (const w of visible) {
    if (w.size === 'stat') {
      statRun.push(w.id);
    } else {
      flushStats();
      sections.push({ key: w.id, node: <View className="mb-4">{renderFullWidget(w.id)}</View> });
    }
  }
  flushStats();

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {header}
      {sections.map(s => (
        <View key={s.key}>{s.node}</View>
      ))}
    </ScrollView>
  );
}

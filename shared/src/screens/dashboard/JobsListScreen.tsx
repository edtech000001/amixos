import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, ScrollView, Modal as RNModal } from 'react-native';
import {
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  ListChecks,
  Users,
  ArrowRight,
  Send,
  Building2,
  ArrowUpDown,
  Check,
  AlertTriangle,
  Clock,
  List,
  Lightbulb,
  Receipt,
  Trash2,
  X,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { buildDateRangePresets } from '../../lib/dateRangePresets';
import { Fab } from '../../ui/Fab';
import { formatDateLong, formatTime12h } from '../../lib/format';
import { formatProjectDuration } from '../../lib/duration';
import { searchMatches, usStateName } from '../../lib/usStates';
import {
  matchJobAlert,
  isJobOverdue,
  JOB_ALERT_STYLE,
  DEFAULT_JOB_ALERT_THRESHOLDS,
  type JobAlertThresholds,
} from '../../lib/jobAlerts';
import {
  sortJobs,
  groupJobs,
  JOB_SORT_KEYS,
  JOB_GROUP_KEYS,
  type JobSortKey,
  type JobGroupKey,
} from '../../lib/jobSort';
import {
  JOBS_FILTERS_KEY,
  jobsFiltersActive,
  jobInDateRange,
  parseJobsFilters,
} from '../../lib/jobsFilters';

export interface JobListItem {
  id: string;
  title: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimateNumber: string | null;
  totalAmount: number;
  scheduledDate: string | null;
  timeStart: string | null;
  /** Multi-day finish + manual estimate + end time, for the duration label. */
  endDate?: string | null;
  estimatedHours?: number | null;
  timeEnd?: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  jobAddress: string | null;
  jobCity: string | null;
  jobState: string | null;
  invoiceId: string | null;
  clientId: string | null;
  clientName: string | null;
  clientCompany: string | null;
  workerNames: string[];
  /** Assignment marked is_lead (migration 033) — drives sort/group by lead. */
  leadName?: string | null;
  delegatedToBusinessName?: string | null;
  delegatedFromBusinessName?: string | null;
  // Crew visibility (migration 044). false = scheduler-only; shown as a
  // "Privado" badge so the owner can tell published vs draft at a glance.
  publishedToCrew?: boolean;
}

const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];
// Closed/terminal work hidden from the default (no-tab) "active" view — still
// reachable by selecting the corresponding status tab.
const CLOSED_DEFAULT_HIDDEN = ['invoiced', 'cancelled'];
const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = (typeof TAB_KEYS)[number];
type StatusTabKey = Exclude<TabKey, 'all'>;
// Selectable status filters (everything except the "all" reset). Multi-select.
const STATUS_TAB_KEYS = TAB_KEYS.filter((k): k is StatusTabKey => k !== 'all');

// Icon per status filter — matches the web tabs (calendar = scheduled,
// check = completed, etc.) so both platforms read the same at a glance.
const TAB_ICON: Record<StatusTabKey, typeof List> = {
  propuestas: FileText,
  posible: Lightbulb,
  scheduled: Calendar,
  in_progress: Clock,
  completed: CheckCircle2,
  invoiced: Receipt,
  cancelled: XCircle,
  delegated: Send,
};

export interface JobsListScreenProps {
  loading: boolean;
  jobs: JobListItem[];
  initialTab?: TabKey;
  onJobPress: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
  onGenerateInvoice: (id: string) => void;
  /** Batch-invoice: one invoice from several completed same-client jobs.
   *  When omitted, the select-to-invoice toolbar is hidden. */
  onCreateInvoice?: (jobIds: string[]) => Promise<void> | void;
  /** Bulk delete for the selection toolbar. Pass ONLY when the current role
   *  can delete jobs — its presence opens selection to every row (not just
   *  invoiceable ones) and shows the red Eliminar pill. The caller owns the
   *  confirmation dialog + the actual delete. */
  onBulkDelete?: (jobIds: string[]) => Promise<void> | void;
  onViewInvoice: (invoiceId: string) => void;
  onNewJob: () => void;
  onNewProposal: () => void;
  /**
   * Whether the viewer may create jobs/proposals. Hides the FAB + empty-state
   * "create first" link when false (e.g. field crew / viewers — they can't
   * INSERT jobs under RLS and have no clients to pick). Defaults to true.
   */
  canCreate?: boolean;
  /** Whether the viewer may create estimates/proposals (createEstimates cap).
   *  When false the FAB creates a work order directly and the proposal option
   *  is hidden. Keep in sync with the web variant. Defaults to true. */
  canCreateEstimates?: boolean;
  // Upcoming-job alert tiers from businesses.job_alert_thresholds. When
  // omitted or disabled, cards render without the indicator.
  alertThresholds?: JobAlertThresholds;
  /** Active business id — scopes persisted filters per business so they don't
   *  carry over when switching companies. */
  businessId?: string;
}

const STATUS_PILL_BG: Record<string, string> = {
  posible: 'bg-teal-100',
  proposal: 'bg-gray-100',
  sent: 'bg-blue-100',
  accepted: 'bg-emerald-100',
  declined: 'bg-red-100',
  scheduled: 'bg-blue-100',
  in_progress: 'bg-amber-100',
  completed: 'bg-emerald-100',
  cancelled: 'bg-gray-100',
  invoiced: 'bg-purple-100',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  posible: 'text-teal-700',
  proposal: 'text-gray-600',
  sent: 'text-blue-600',
  accepted: 'text-emerald-700',
  declined: 'text-red-600',
  scheduled: 'text-blue-700',
  in_progress: 'text-amber-700',
  completed: 'text-emerald-700',
  cancelled: 'text-gray-400',
  invoiced: 'text-purple-700',
};
const STATUS_DOT: Record<string, string> = {
  posible: 'bg-teal-500',
  proposal: 'bg-gray-400',
  sent: 'bg-blue-500',
  accepted: 'bg-emerald-500',
  declined: 'bg-red-400',
  scheduled: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-gray-400',
  invoiced: 'bg-purple-500',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400',
  normal: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function isExpired(j: JobListItem) {
  return j.expiryDate && j.status === 'sent' && new Date(j.expiryDate) < new Date();
}

export function JobsListScreen({
  loading,
  jobs,
  initialTab = 'all',
  onJobPress,
  onUpdateStatus,
  onGenerateInvoice,
  onCreateInvoice,
  onBulkDelete,
  onViewInvoice,
  onNewJob,
  onNewProposal,
  canCreate = true,
  canCreateEstimates = true,
  alertThresholds = DEFAULT_JOB_ALERT_THRESHOLDS,
  businessId,
}: JobsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const overdueBadgeLabel = full.dashboard.settings.jobAlerts.overdueBadge;
  const [search, setSearch] = useState('');
  // Multi-select status filters. Empty = "all". A ?tab deep link seeds it.
  const [tabs, setTabs] = useState<StatusTabKey[]>(initialTab !== 'all' ? [initialTab as StatusTabKey] : []);
  const tabSet = useMemo(() => new Set(tabs), [tabs]);
  const toggleTab = (k: StatusTabKey) =>
    setTabs(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  // Persisted view (tabs/search/sort/group) — restored on mount so the list
  // survives navigating into a job + back AND an app refresh; only resets when
  // the user clears it. AsyncStorage is async, so load once then save changes.
  const hydrated = useRef(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<JobSortKey>('recent');
  const [groupBy, setGroupBy] = useState<JobGroupKey>('none');
  // Scheduled-date range filter (yyyy-mm-dd). null = open-ended that side.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);

  // Persisted filters are scoped per business so switching companies doesn't
  // carry one company's filters into another.
  const filtersKey = businessId ? `${JOBS_FILTERS_KEY}.${businessId}` : JOBS_FILTERS_KEY;

  // Load on mount AND whenever the business changes. Always apply (saved OR
  // reset to defaults) so a business with no saved filters doesn't inherit the
  // previous one's. An explicit ?tab deep link still wins for the tab.
  useEffect(() => {
    let cancelled = false;
    hydrated.current = false; // gate persist until this business's filters load
    AsyncStorage.getItem(filtersKey)
      .then(raw => {
        if (cancelled) return;
        const s = parseJobsFilters(raw);
        if (initialTab === 'all') {
          setTabs(Array.isArray(s?.tabs) ? s.tabs.filter((k): k is StatusTabKey => (STATUS_TAB_KEYS as readonly string[]).includes(k)) : []);
        }
        setSearch(typeof s?.search === 'string' ? s.search : '');
        setSortBy(s?.sortBy ?? 'recent');
        setGroupBy(s?.groupBy ?? 'none');
        setDateFrom(s?.dateFrom ?? null);
        setDateTo(s?.dateTo ?? null);
        hydrated.current = true;
      })
      .catch(() => { hydrated.current = true; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);
  // Persist on change (after the initial load so we don't clobber stored values).
  useEffect(() => {
    if (!hydrated.current) return;
    void AsyncStorage.setItem(filtersKey, JSON.stringify({ tabs, search, sortBy, groupBy, dateFrom, dateTo })).catch(() => {});
  }, [filtersKey, tabs, search, sortBy, groupBy, dateFrom, dateTo]);

  const filtersActive = jobsFiltersActive({ tabs, search, sortBy, groupBy, dateFrom, dateTo });
  const dateActive = !!dateFrom || !!dateTo;
  const clearFilters = () => { setTabs([]); setSearch(''); setSortBy('recent'); setGroupBy('none'); setDateFrom(null); setDateTo(null); };

  const tw = full.dashboard.workspaces;
  const tabLabels: Record<TabKey, string> = {
    all: t.tabs.all,
    propuestas: t.tabs.proposals,
    posible: t.tabs.posible,
    scheduled: t.tabs.scheduled,
    in_progress: t.tabs.in_progress,
    completed: t.tabs.completed,
    invoiced: t.tabs.invoiced,
    cancelled: t.tabs.cancelled,
    delegated: tw.delegatedFilterTab,
  };

  // Multi-select: a job matches if it satisfies ANY selected tab. With no tabs
  // (the default "active" view) we hide closed work — invoiced + cancelled.
  const matchesTab = (j: JobListItem) => {
    if (tabs.length === 0) return !CLOSED_DEFAULT_HIDDEN.includes(j.status);
    return tabs.some(tk =>
      tk === 'propuestas'
        ? PROPOSAL_STATUSES.includes(j.status)
        : tk === 'delegated'
          ? !!j.delegatedToBusinessName
          : j.status === tk,
    );
  };

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const matchSearch = searchMatches(
        [j.title, j.estimateNumber, j.clientName, j.clientCompany, j.jobCity, j.jobState,
         j.leadName, ...j.workerNames]
          .filter(Boolean)
          .join(' '),
        search,
      );
      return matchSearch && matchesTab(j) && jobInDateRange(j.scheduledDate, j.endDate, dateFrom, dateTo);
    });
  }, [jobs, search, tabs, dateFrom, dateTo]);

  const sections = useMemo(
    () => groupJobs(sortJobs(filtered, sortBy), groupBy, {
      lead: t.sort.noLead,
      company: t.sort.noCompany,
      state: t.sort.noState,
    }, (v) => usStateName(v, locale)),
    [filtered, sortBy, groupBy, t, locale],
  );
  const sortActive = sortBy !== 'recent' || groupBy !== 'none';

  // Icons for the sort/group sheet rows (matches the Equipment group sheet style).
  const SORT_ICON: Record<JobSortKey, typeof Clock> = {
    recent: Clock,
    status: ListChecks,
    startDate: Calendar,
    lead: Users,
  };
  const GROUP_ICON: Record<JobGroupKey, typeof Clock> = {
    none: List,
    lead: Users,
    company: Building2,
    state: MapPin,
  };

  const counts = useMemo(() =>
    TAB_KEYS.reduce((acc, k) => {
      if (k === 'all') acc[k] = jobs.length;
      else if (k === 'propuestas') acc[k] = jobs.filter(j => PROPOSAL_STATUSES.includes(j.status)).length;
      else if (k === 'delegated') acc[k] = jobs.filter(j => !!j.delegatedToBusinessName).length;
      else acc[k] = jobs.filter(j => j.status === k).length;
      return acc;
    }, {} as Record<TabKey, number>),
  [jobs]);

  const pendingValue = jobs.filter(j => j.status === 'sent' && !isExpired(j))
    .reduce((s, j) => s + j.totalAmount, 0);
  const inProgressRevenue = jobs.filter(j => j.status === 'in_progress')
    .reduce((s, j) => s + j.totalAmount, 0);

  const renderActionBar = (job: JobListItem) => {
    const expired = isExpired(job);
    if (job.status === 'posible') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'scheduled')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-50">
            <Calendar size={11} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.schedule}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'proposal') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'sent')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-50">
            <Send size={11} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.markSent}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'sent' && !expired) {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'accepted')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-emerald-50">
            <CheckCircle2 size={11} color="#059669" />
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markAccepted}</Text>
          </Pressable>
          <Pressable onPress={() => onUpdateStatus(job.id, 'declined')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-red-50">
            <XCircle size={11} color="#EF4444" />
            <Text className="text-xs font-semibold text-red-500">{t.actions.markDeclined}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'accepted') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'scheduled')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-50">
            <Calendar size={11} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.schedule}</Text>
          </Pressable>
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-50">
            <FileText size={11} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'scheduled') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'in_progress')} className="px-3 py-1.5 rounded-lg active:bg-amber-50">
            <Text className="text-xs font-semibold text-amber-600">{t.actions.startWork}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'in_progress') {
      return (
        <View className="flex-row items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'completed')} className="px-3 py-1.5 rounded-lg active:bg-emerald-50">
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markCompleted}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'completed') {
      return (
        <View className="border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-50 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'invoiced' && job.invoiceId) {
      return (
        <View className="border-t border-gray-50 px-5 py-2.5">
          <Pressable onPress={() => onViewInvoice(job.invoiceId!)} className="flex-row items-center gap-1 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.viewInvoice}</Text>
            <ArrowRight size={11} color="#9333EA" />
          </Pressable>
        </View>
      );
    }
    return null;
  };

  // ── Select-to-invoice (batch) ───────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const isInvoiceable = (j: JobListItem) => j.status === 'completed' && !j.invoiceId;
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
  const sameClient = new Set(selectedJobs.map(j => j.clientId ?? '∅')).size <= 1;
  const visibleInvoiceable = sections.flatMap(s => s.jobs).filter(isInvoiceable);
  // With delete available, EVERY visible row is selectable (delete applies to
  // any job); otherwise selection stays restricted to invoiceable rows.
  const canDelete = !!onBulkDelete;
  const selectPool = canDelete ? sections.flatMap(s => s.jobs) : visibleInvoiceable;
  const allSelected = selectPool.length > 0 && selectPool.every(j => selectedIds.has(j.id));
  const toggleSelectAll = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selectPool.every(j => prev.has(j.id))) {
        selectPool.forEach(j => next.delete(j.id));
      } else {
        selectPool.forEach(j => next.add(j.id));
      }
      return next;
    });
  // Invoicing needs every picked job invoiceable (selection may now include
  // non-invoiceable rows picked for deletion).
  const allInvoiceable = selectedJobs.every(isInvoiceable);
  const canCreateInvoice = selectedJobs.length > 0 && sameClient && allInvoiceable && !creatingInvoice;
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const runCreateInvoice = async () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !sameClient || !allInvoiceable || creatingInvoice) return;
    setCreatingInvoice(true);
    await onCreateInvoice(selectedJobs.map(j => j.id));
    setCreatingInvoice(false);
    exitSelect();
  };
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const runBulkDelete = async () => {
    if (!onBulkDelete || selectedJobs.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    await onBulkDelete(selectedJobs.map(j => j.id));
    setBulkDeleting(false);
    exitSelect();
  };

  // Card-derived labels/styles are pure functions of the job + thresholds —
  // precomputed here so selection taps and select-mode toggles (which
  // re-render every visible card) skip all the date math and formatting.
  const cardDataByJob = useMemo(() => {
    const compute = (job: JobListItem) => {
      const statusKey = job.status as keyof typeof t.statuses;
      const isProposal = PROPOSAL_STATUSES.includes(job.status);
      const alertMatch = !isProposal ? matchJobAlert(alertThresholds, job.scheduledDate) : null;
      return {
        statusLabel: t.statuses[statusKey] ?? job.status,
        pillBg: STATUS_PILL_BG[job.status] ?? 'bg-blue-100',
        pillText: STATUS_PILL_TEXT[job.status] ?? 'text-blue-700',
        dot: STATUS_DOT[job.status] ?? 'bg-blue-500',
        priorityLabel: t.priorities[job.priority as keyof typeof t.priorities],
        priorityColor: PRIORITY_COLORS[job.priority] ?? 'text-blue-500',
        expired: isExpired(job),
        isProposal,
        alertStyle: alertMatch ? JOB_ALERT_STYLE[alertMatch.level.color] : null,
        overdue: !isProposal && isJobOverdue(alertThresholds, job.scheduledDate, job.status),
        durationText: formatProjectDuration(
          { startDate: job.scheduledDate, endDate: job.endDate, estimatedHours: job.estimatedHours, timeStart: job.timeStart, timeEnd: job.timeEnd },
          full.common.duration,
        ),
        alertChipLabel: alertMatch
          ? alertMatch.daysUntil === 0
            ? t.alertChip.today
            : alertMatch.daysUntil === 1
              ? t.alertChip.tomorrow
              : t.alertChip.inDays.replace('{{count}}', String(alertMatch.daysUntil))
          : null,
      };
    };
    const map = new Map<string, ReturnType<typeof compute>>();
    sections.forEach(s => s.jobs.forEach(job => map.set(job.id, compute(job))));
    return map;
  }, [sections, alertThresholds, t, full]);

  return (
    <View className="flex-1 bg-surface">
    <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-start justify-between mb-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {search.trim()
              ? t.countFound.replace('{{count}}', String(filtered.length))
              : t.countTotal.replace('{{count}}', String(jobs.length))}
            {pendingValue > 0 ? (
              <Text className="text-blue-600 font-medium">
                {' · '}{t.pendingValue.replace('{{amount}}', fmt(pendingValue))}
              </Text>
            ) : null}
            {inProgressRevenue > 0 ? (
              <Text className="text-amber-600 font-medium">
                {' · '}{t.inProgressValue.replace('{{amount}}', fmt(inProgressRevenue))}
              </Text>
            ) : null}
          </Text>
        </View>
        {/* Filter controls live up here so the search bar gets the full width. */}
        <View className="flex-row items-center gap-2 ml-2">
          {filtersActive ? (
            <Pressable
              onPress={clearFilters}
              accessibilityLabel={t.clearFilters}
              className="w-11 h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center active:opacity-80"
            >
              <XCircle size={16} color="#DC2626" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setDateMenuOpen(o => !o)}
            accessibilityLabel={t.dateFilter.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              dateActive ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <Calendar size={16} color={dateActive ? '#4F46E5' : '#6B7280'} />
          </Pressable>
          <Pressable
            onPress={() => setSortMenuOpen(true)}
            accessibilityLabel={t.sort.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              sortActive ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <ArrowUpDown size={16} color={sortActive ? '#4F46E5' : '#6B7280'} />
          </Pressable>
          {/* Select-all moved into the selection banner below (Todos). */}
          {onCreateInvoice || canDelete ? (
            <Pressable
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              accessibilityLabel={canDelete ? t.selectButton : t.batchInvoice.selectButton}
              className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
                selectMode ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
              }`}
            >
              {/* With delete available the mode is generic ("Seleccionar"),
                 not invoice-specific — that's also where bulk delete lives. */}
              {canDelete ? (
                <ListChecks size={16} color={selectMode ? '#4F46E5' : '#6B7280'} />
              ) : (
                <FileText size={16} color={selectMode ? '#4F46E5' : '#6B7280'} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Search + Tabs */}
      <View className="flex-col gap-3 mb-5">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          leftIcon={<Search size={16} color="#9CA3AF" />}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* Date-range filter now lives in a bottom sheet (DateRangeSheet,
            rendered at the screen root) for one-hand reach. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 pb-1"
        >
          {/* "All" reset — an icon. Active (highlighted) when no status filter
             is applied; tapping it clears the selection back to all. */}
          <Pressable
            onPress={() => setTabs([])}
            accessibilityLabel={tabLabels.all}
            className={`flex-row items-center justify-center px-2.5 py-1.5 rounded-xl ${
              tabs.length === 0 ? 'bg-primary' : 'bg-gray-100'
            }`}
          >
            <List size={15} color={tabs.length === 0 ? '#FFFFFF' : '#6B7280'} />
          </Pressable>
          {STATUS_TAB_KEYS.map(k => {
            const isActive = tabSet.has(k);
            const Icon = TAB_ICON[k];
            return (
              <Pressable
                key={k}
                onPress={() => toggleTab(k)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                  isActive ? 'bg-primary' : 'bg-gray-100'
                }`}
              >
                <Icon size={13} color={isActive ? '#FFFFFF' : '#6B7280'} />
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? 'text-white' : 'text-gray-500'
                  }`}
                >
                  {tabLabels[k]}
                </Text>
                {counts[k] > 0 ? (
                  <View
                    className={`px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20' : 'bg-gray-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isActive ? 'text-white' : 'text-gray-600'
                      }`}
                    >
                      {counts[k]}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Selection banner — ✕ / count / Todos, same as the clients list. */}
      {selectMode ? (
        <View className="flex-row items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
          <Pressable onPress={exitSelect} className="p-1 rounded">
            <X size={14} color="#4F46E5" />
          </Pressable>
          <Text className="text-sm font-medium text-primary flex-shrink" numberOfLines={1}>
            {t.batchInvoice.selectedCount.replace('{{count}}', String(selectedJobs.length))}
          </Text>
          <View className="flex-1" />
          {!allSelected && selectPool.length > 0 ? (
            <Pressable onPress={toggleSelectAll} className="px-2 py-1.5 rounded-lg active:bg-primary/10">
              <Text className="text-xs font-semibold text-primary">{full.dashboard.clients.selectAllShort}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Job list */}
      {loading ? (
        <View className="items-center py-20">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <ClipboardList size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">
            {search || tabs.length > 0 ? t.emptyNoMatch : t.emptyAll}
          </Text>
          {!search && tabs.length === 0 && canCreate ? (
            <Pressable onPress={onNewJob} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="flex-col gap-3">
          {sections.map(section => (
          <Fragment key={section.title ?? '__all__'}>
          {section.title ? (
            <View className="flex-row items-center gap-2 mt-2">
              <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                {section.title}
              </Text>
              <View className="px-1.5 py-0.5 rounded-full bg-gray-200">
                <Text className="text-[10px] font-bold text-gray-600">{section.jobs.length}</Text>
              </View>
            </View>
          ) : null}
          {section.jobs.map(job => {
            // Precomputed in cardDataByJob — see the useMemo above.
            const {
              statusLabel, pillBg, pillText, dot, priorityLabel, priorityColor,
              expired, isProposal, alertStyle, overdue, durationText, alertChipLabel,
            } = cardDataByJob.get(job.id)!;

            const selectable = selectMode && (canDelete || isInvoiceable(job));
            const picked = selectedIds.has(job.id);
            return (
              // Outer view carries the shadow; inner clips content (RN clips
              // shadows under overflow-hidden).
              <View key={job.id} className={`bg-white rounded-2xl shadow-sm ${selectMode && !selectable ? 'opacity-40' : ''}`}>
              <View
                className={`rounded-2xl border overflow-hidden ${
                  picked
                    ? 'bg-primary/5 border-primary'
                    : overdue
                    ? 'bg-red-50 border-red-200 border-l-4 border-l-red-500'
                    : alertStyle
                      ? `bg-white border-gray-100 border-l-4 ${alertStyle.borderClass}`
                      : 'bg-white border-gray-100'
                }`}
              >
                <Pressable
                  onPress={() => (selectable ? toggleSelect(job.id) : selectMode ? undefined : onJobPress(job.id))}
                  // Long-press enters selection with this job picked — same
                  // gesture as the clients list (discoverable bulk delete).
                  onLongPress={() => {
                    if (selectMode || !(canDelete || isInvoiceable(job))) return;
                    setSelectMode(true);
                    toggleSelect(job.id);
                  }}
                  className={`flex-row items-start gap-4 p-5 ${overdue ? 'active:bg-red-100' : 'active:bg-gray-50'}`}
                >
                  {selectMode ? (
                    <View className={`w-5 h-5 mt-0.5 rounded-md border items-center justify-center ${
                      picked ? 'bg-primary border-primary' : selectable ? 'border-gray-300' : 'border-gray-200'
                    }`}>
                      {picked ? <Check size={13} color="#FFFFFF" /> : null}
                    </View>
                  ) : (
                    <View className={`w-2.5 h-2.5 rounded-full mt-1.5 ${dot}`} />
                  )}

                  <View className="flex-1 min-w-0">
                    {/* Title — full width on its own line so it isn't squeezed
                       by the status pills. */}
                    <View className="flex-row items-center gap-2">
                      {job.estimateNumber ? (
                        <Text className="text-xs font-mono text-gray-400">
                          {job.estimateNumber}
                        </Text>
                      ) : null}
                      <Text className="text-sm font-bold text-gray-900 flex-1" numberOfLines={1}>
                        {job.title}
                      </Text>
                    </View>
                    {job.clientName ? (
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {job.clientName}
                        {job.clientCompany ? ` · ${job.clientCompany}` : ''}
                      </Text>
                    ) : null}

                    {/* Status indicators — their own line, wrap as needed. */}
                    <View className="flex-row flex-wrap items-center gap-2 mt-2">
                      {!isProposal && job.priority !== 'normal' ? (
                        <Text className={`text-xs font-semibold ${priorityColor}`}>
                          {priorityLabel}
                        </Text>
                      ) : null}
                      <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                        <Text className={`text-xs font-semibold ${pillText}`}>
                          {statusLabel}
                        </Text>
                      </View>
                      {/* Crew-visibility marker. Default migration value
                         is true, so this badge only fires when the owner
                         explicitly kept the job in their private scheduler. */}
                      {job.publishedToCrew === false ? (
                        <View className="px-2 py-0.5 rounded-full bg-gray-200">
                          <Text className="text-[10px] font-semibold text-gray-600">{t.new.privateBadge}</Text>
                        </View>
                      ) : null}
                      {expired ? (
                        <Text className="text-xs text-orange-500 font-medium">{t.expired}</Text>
                      ) : null}
                    </View>

                    {/* Meta row */}
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
                      {isProposal && job.issueDate ? (
                        <View className="flex-row items-center gap-1">
                          <Calendar size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {formatDateLong(job.issueDate, dateLoc)}
                            {job.expiryDate
                              ? ` · ${t.dueShort.replace('{{date}}', formatDateLong(job.expiryDate, dateLoc))}`
                              : ''}
                          </Text>
                        </View>
                      ) : null}
                      {!isProposal && job.scheduledDate ? (
                        <View className="flex-row items-center gap-1">
                          {overdue
                            ? <AlertTriangle size={13} color="#DC2626" accessibilityLabel={overdueBadgeLabel} />
                            : <Calendar size={12} color="#9CA3AF" />}
                          <Text className={`text-xs ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                            {formatDateLong(job.scheduledDate, dateLoc)}
                            {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {durationText ? (
                        <View className="flex-row items-center gap-1">
                          <Clock size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">{durationText}</Text>
                        </View>
                      ) : null}
                      {alertStyle && alertChipLabel ? (
                        <View className={`flex-row items-center px-2 py-0.5 rounded-full ${alertStyle.bgClass}`}>
                          <Text className={`text-[10px] font-semibold ${alertStyle.textClass}`}>
                            {alertChipLabel}
                          </Text>
                        </View>
                      ) : null}
                      {job.jobCity || job.jobAddress ? (
                        <View className="flex-row items-center gap-1">
                          <MapPin size={12} color="#9CA3AF" />
                          <Text className="text-xs text-gray-400">
                            {job.jobCity || job.jobAddress}
                            {job.jobState ? `, ${job.jobState}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      {job.totalAmount > 0 ? (
                        <Text className="text-xs font-bold text-gray-700">
                          {fmt(job.totalAmount)}
                        </Text>
                      ) : null}
                      {job.delegatedToBusinessName ? (
                        <View className="flex-row items-center gap-1">
                          <Building2 size={12} color="#9333EA" />
                          <Text className="text-xs font-semibold text-purple-600">
                            {tw.delegatedBadge.replace('{{name}}', job.delegatedToBusinessName)}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Lead / crew — its own right-aligned line near the bottom
                       so the lead is easy to scan, distinct from the meta row. */}
                    {job.leadName || job.workerNames.length > 0 ? (
                      <View className="flex-row items-center gap-1 mt-2">
                        <Users size={12} color="#9CA3AF" />
                        <Text className="text-xs text-gray-500 font-medium">
                          {job.leadName
                            ? `${t.leadPrefix}: ${job.leadName}`
                            : `${job.workerNames.slice(0, 2).join(', ')}${job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}`}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {selectMode ? null : <ChevronRight size={16} color="#9CA3AF" />}
                </Pressable>

                {selectMode ? null : renderActionBar(job)}
              </View>
              </View>
            );
          })}
          </Fragment>
          ))}
        </View>
      )}

      {/* Sort & group bottom sheet — selectable chips instead of long
          radio rows. animationType="fade" (not "slide") on purpose: slide
          animates the whole overlay INCLUDING the dim backdrop up from the
          bottom, which reads as a gray bar rising. Fade matches the
          delegate target picker. */}
      <RNModal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <Pressable
          onPress={() => setSortMenuOpen(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-6 pt-3 pb-10">
            <View className="self-center w-10 h-1 rounded-full bg-gray-200 mb-4" />
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-base font-bold text-gray-900">{t.sort.title}</Text>
              <Pressable onPress={() => setSortMenuOpen(false)} hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">{full.common.buttons.done}</Text>
              </Pressable>
            </View>

            <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              {t.sort.sortByTitle}
            </Text>
            <View className="gap-1 mb-6">
              {JOB_SORT_KEYS.map(k => {
                const selected = sortBy === k;
                const Icon = SORT_ICON[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => setSortBy(k)}
                    className={`flex-row items-center gap-3 px-3 py-3 rounded-2xl ${
                      selected ? 'bg-primary/10' : 'active:bg-gray-50'
                    }`}
                  >
                    <View className={`w-9 h-9 rounded-xl items-center justify-center ${selected ? 'bg-primary' : 'bg-gray-100'}`}>
                      <Icon size={18} color={selected ? '#FFFFFF' : '#6B7280'} />
                    </View>
                    <Text className={`flex-1 text-base ${selected ? 'text-primary font-semibold' : 'text-gray-900'}`}>
                      {t.sort.by[k]}
                    </Text>
                    {selected ? <Check size={20} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              {t.sort.groupByTitle}
            </Text>
            <View className="gap-1">
              {JOB_GROUP_KEYS.map(k => {
                const selected = groupBy === k;
                const Icon = GROUP_ICON[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => setGroupBy(k)}
                    className={`flex-row items-center gap-3 px-3 py-3 rounded-2xl ${
                      selected ? 'bg-primary/10' : 'active:bg-gray-50'
                    }`}
                  >
                    <View className={`w-9 h-9 rounded-xl items-center justify-center ${selected ? 'bg-primary' : 'bg-gray-100'}`}>
                      <Icon size={18} color={selected ? '#FFFFFF' : '#6B7280'} />
                    </View>
                    <Text className={`flex-1 text-base ${selected ? 'text-primary font-semibold' : 'text-gray-900'}`}>
                      {t.sort.group[k]}
                    </Text>
                    {selected ? <Check size={20} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </RNModal>

      {/* New job/proposal action sheet — bottom sheet, one-handed reach.
          animationType="fade" (not "slide") — slide animates the dim
          backdrop up with the sheet, which reads as a gray bar rising. */}
      <RNModal
        visible={newMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewMenuOpen(false)}
      >
        <Pressable
          onPress={() => setNewMenuOpen(false)}
          className="flex-1 justify-end bg-black/40"
        >
          {/* No-op press swallows taps on the sheet so they don't close it. */}
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pb-8 pt-4">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="bg-gray-50 rounded-2xl overflow-hidden">
              <Pressable
                onPress={() => { setNewMenuOpen(false); onNewJob(); }}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-100 border-b border-gray-100"
              >
                <ClipboardList size={18} color="#6B7280" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900">{t.newDropdown.jobOption}</Text>
                  <Text className="text-xs text-gray-400">{t.newDropdown.jobOptionSub}</Text>
                </View>
              </Pressable>
              {canCreateEstimates ? (
              <Pressable
                onPress={() => { setNewMenuOpen(false); onNewProposal(); }}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-gray-100"
              >
                <FileText size={18} color="#6B7280" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900">
                    {t.newDropdown.proposalOption}
                  </Text>
                  <Text className="text-xs text-gray-400">{t.newDropdown.proposalOptionSub}</Text>
                </View>
              </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setNewMenuOpen(false)}
              className="mt-3 items-center py-3.5 rounded-2xl bg-gray-100 active:bg-gray-200"
            >
              <Text className="text-sm font-semibold text-gray-700">
                {full.common.buttons.cancel}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>
    </ScrollView>

    {/* New job/proposal — floating action, bottom-right thumb reach.
       Hidden for roles that can't create jobs (field crew / viewers). */}
    {selectMode ? null : canCreate ? <Fab onPress={() => (canCreateEstimates ? setNewMenuOpen(true) : onNewJob())} /> : null}

    {/* Batch-invoice FAB pill — sits above the dock (bottom-32, like Fab) so it
       isn't hidden behind the floating tab bar. Only in select mode. */}
    {selectMode ? (
      <>
        {!sameClient && selectedJobs.length > 0 ? (
          <View className="absolute bottom-48 right-5 bg-amber-50 px-3 py-1.5 rounded-full" style={{ elevation: 4 }}>
            <Text className="text-xs font-medium text-amber-700">{t.batchInvoice.sameClientHint}</Text>
          </View>
        ) : null}
        {/* Bulk-delete pill — left side, mirroring the invoice pill. */}
        {canDelete ? (
          <Pressable
            onPress={runBulkDelete}
            disabled={selectedJobs.length === 0 || bulkDeleting}
            className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
            style={{
              backgroundColor: selectedJobs.length === 0 || bulkDeleting ? '#D1D5DB' : '#DC2626',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Trash2 size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {`${t.bulkDelete}${selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}`}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={runCreateInvoice}
          disabled={!canCreateInvoice}
          className={`absolute bottom-32 right-5 flex-row items-center gap-2 px-5 h-14 rounded-full ${
            canCreateInvoice ? 'bg-primary active:opacity-90' : 'bg-gray-300'
          }`}
          style={{ elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
        >
          <FileText size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold">
            {creatingInvoice
              ? t.batchInvoice.creating
              : `${t.batchInvoice.createButton}${selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}`}
          </Text>
        </Pressable>
      </>
    ) : null}

    <DateRangeSheet
      open={dateMenuOpen}
      onClose={() => setDateMenuOpen(false)}
      from={dateFrom}
      to={dateTo}
      onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
      title={t.dateFilter.title}
      fromLabel={t.dateFilter.from}
      toLabel={t.dateFilter.to}
      clearLabel={t.dateFilter.clear}
      applyLabel={t.dateFilter.apply}
      presets={buildDateRangePresets(t.dateFilter)}
    />
    </View>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, ScrollView, SectionList, Modal as RNModal, Alert, type ViewToken } from 'react-native';
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
  User,
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
  Archive,
  X,
  Flag,
  History,
  ArrowDownAZ,
  CalendarClock,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Input } from '../../ui/Input';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import { Fab } from '../../ui/Fab';
import { SkeletonList } from '../../ui/Skeleton';
import { ChipScroll } from '../../ui/ChipScroll';
import { formatDateLong, formatTime12h } from '../../lib/format';
import { formatProjectDuration } from '../../lib/duration';
import { searchMatches, usStateName } from '../../lib/usStates';
import { jobRefLabel } from '../../lib/jobRef';
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
  /** Source-system Project ID (jobs.external_ref) — the job's visible identifier. */
  externalRef?: string | null;
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
  /** Archived (jobs.archived_at, migration 118) — hidden from every tab
   *  except 'archived'; the second exit from Completed besides invoicing. */
  archivedAt?: string | null;
  /** Assignment marked is_lead (migration 033) — drives sort/group by lead. */
  leadName?: string | null;
  /** jobs.updated_at — drives the "Recently updated" sort. */
  updatedAt?: string | null;
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
const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated', 'archived'] as const;
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
  archived: Archive,
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
  /** Archive/unarchive the selection (jobs.archived_at). archive=false on the
   *  Archivados tab (restore). Caller owns confirmation + the update. */
  onBulkArchive?: (jobIds: string[], archive: boolean) => Promise<void> | void;
  /** Reassign the selected jobs to a different client (opens a picker). */
  onBulkChangeClient?: (jobIds: string[]) => Promise<void> | void;
  onViewInvoice: (invoiceId: string) => void;
  /** Role gates (role editor): hide the invoice actions when the member
   *  can't create / view invoices (e.g. field crew). Default allowed. */
  canCreateInvoice?: boolean;
  canViewInvoice?: boolean;
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
  // Server-side mode (opt-in). Implemented on the web variant first; mobile
  // accepts the props for a shared type but ignores them until its own phase.
  serverMode?: boolean;
  serverCounts?: Record<string, number>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onFiltersChange?: (f: {
    search: string; tabs: string[]; sortBy: JobSortKey; groupBy: JobGroupKey;
    dateFrom: string | null; dateTo: string | null;
  }) => void;
  /** Business payroll settings — adds "This/Last pay period" chips to the
   *  date filter that match the Payroll screen's periods exactly. */
  payPeriod?: { frequency: unknown; anchorDate: unknown; customDays?: unknown };
  /** Background revalidation in flight while rows are on screen — renders a
   *  thin bar above the list instead of blanking (swrCache). */
  refreshing?: boolean;
  /** Rows came from the local cache and the fresh fetch hasn't landed yet. */
  stale?: boolean;
  /** Epoch-ms the cached rows were saved (for the "Actualizado hace…" caption). */
  cachedAt?: number | null;
}

const STATUS_PILL_BG: Record<string, string> = {
  posible: 'bg-teal-100',
  proposal: 'bg-border-soft',
  sent: 'bg-blue-100',
  accepted: 'bg-emerald-100',
  declined: 'bg-red-100',
  scheduled: 'bg-blue-100',
  in_progress: 'bg-amber-100',
  completed: 'bg-emerald-100',
  cancelled: 'bg-border-soft',
  invoiced: 'bg-purple-100',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  posible: 'text-teal-700',
  proposal: 'text-muted',
  sent: 'text-blue-600',
  accepted: 'text-emerald-700',
  declined: 'text-red-600',
  scheduled: 'text-blue-700',
  in_progress: 'text-amber-700',
  completed: 'text-emerald-700',
  cancelled: 'text-faint',
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
  low: 'text-faint',
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

// SectionList section shape (needs a `data` key rather than groupJobs' `jobs`).
type JobFlatSection = { title: string; data: JobListItem[] };

export function JobsListScreen({
  loading,
  jobs,
  initialTab = 'all',
  onJobPress,
  onUpdateStatus,
  onGenerateInvoice,
  onCreateInvoice,
  onBulkDelete,
  onBulkArchive,
  onBulkChangeClient,
  onViewInvoice,
  canCreateInvoice: canInvoicePerm = true,
  canViewInvoice: canViewInvoicePerm = true,
  onNewJob,
  onNewProposal,
  canCreate = true,
  canCreateEstimates = true,
  alertThresholds = DEFAULT_JOB_ALERT_THRESHOLDS,
  businessId,
  serverMode = false,
  serverCounts,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onFiltersChange,
  payPeriod,
  refreshing = false,
  stale = false,
  cachedAt = null,
}: JobsListScreenProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
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
  // Re-render trigger so the server-mode filter-report effect fires once the
  // persisted filters have loaded (hydrated is a ref, which doesn't re-render).
  const [ready, setReady] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<JobSortKey>('recent');
  const [groupBy, setGroupBy] = useState<JobGroupKey>('none');
  // Scheduled-date range filter (yyyy-mm-dd). null = open-ended that side.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);

  // Re-anchor after returning from a job detail. The screen stays mounted so
  // the native scroll offset survives, but the on-focus refresh can regroup /
  // reorder rows — a preserved pixel offset would then point at a different
  // job. So: remember which job was opened, and when the refreshed data lands
  // scroll that row back into view (positions tracked via onLayout).
  const sectionListRef = useRef<SectionList<JobListItem, JobFlatSection>>(null);
  // The job that was opened; on return we bring it back into view.
  const pendingAnchor = useRef<string | null>(null);
  // Ids currently on screen — lets us SKIP re-scrolling when the anchored job
  // is already visible (its native offset survived), avoiding a double hop.
  const viewableIds = useRef<Set<string>>(new Set());
  const openJob = (id: string) => {
    pendingAnchor.current = id;
    onJobPress(id);
  };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    viewableIds.current = new Set(
      viewableItems.map(v => (v.item as JobListItem | undefined)?.id).filter((x): x is string => !!x),
    );
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

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
        setReady(true);
      })
      .catch(() => { hydrated.current = true; setReady(true); });
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
    archived: t.tabs.archived,
  };

  const searching = search.trim().length > 0;

  // Whether a job belongs to a single status tab (archived jobs live only under
  // the Archived tab). Shared by the tab filter and the per-tab counts.
  const jobInTab = (j: JobListItem, tk: StatusTabKey): boolean =>
    tk === 'archived'
      ? !!j.archivedAt
      : j.archivedAt
        ? false
        : tk === 'propuestas'
          ? PROPOSAL_STATUSES.includes(j.status)
          : tk === 'delegated'
            ? !!j.delegatedToBusinessName
            : j.status === tk;

  // Multi-select: a job matches if it satisfies ANY selected tab. With no tabs
  // (the default "active" view) we hide closed work — invoiced + cancelled. BUT
  // while a search is active we span EVERY status (incl. closed + archived) so a
  // targeted match always surfaces.
  const matchesTab = (j: JobListItem) => {
    if (tabs.length === 0) {
      if (searching) return true;
      return !CLOSED_DEFAULT_HIDDEN.includes(j.status) && !j.archivedAt;
    }
    return tabs.some(tk => jobInTab(j, tk));
  };

  // Search + date-range gate, independent of the status tabs — powers both the
  // visible list and the per-tab counts (so a search shows WHERE matches are).
  const passesSearchDate = (j: JobListItem) =>
    searchMatches(
      [j.title, j.estimateNumber, j.externalRef, j.clientName, j.clientCompany, j.jobCity, j.jobState,
       j.leadName, ...j.workerNames]
        .filter(Boolean)
        .join(' '),
      search,
    ) && jobInDateRange(j.scheduledDate, j.endDate, dateFrom, dateTo);

  // Server mode: `jobs` is already the search/tab-filtered page(s) — only
  // sort/group the loaded rows. Client mode: filter the full array.
  const filtered = useMemo(() => {
    if (serverMode) return jobs;
    return jobs.filter(j => passesSearchDate(j) && matchesTab(j));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, tabs, dateFrom, dateTo, serverMode]);

  const sections = useMemo(
    () => groupJobs(sortJobs(filtered, sortBy), groupBy, {
      client: t.sort.noClient,
      lead: t.sort.noLead,
      company: t.sort.noCompany,
      state: t.sort.noState,
    }, (v) => usStateName(v, locale)),
    [filtered, sortBy, groupBy, t, locale],
  );
  const sortActive = sortBy !== 'recent' || groupBy !== 'none';

  // SectionList data + an id → {sectionIndex,itemIndex} map for scroll-restore.
  const flatSections = useMemo<JobFlatSection[]>(
    () => sections.map(s => ({ title: s.title, data: s.jobs })),
    [sections],
  );
  const jobLocation = useMemo(() => {
    const m = new Map<string, { sectionIndex: number; itemIndex: number }>();
    flatSections.forEach((s, si) => s.data.forEach((j, ii) => m.set(j.id, { sectionIndex: si, itemIndex: ii })));
    return m;
  }, [flatSections]);
  // Re-anchor after returning from a job detail. The list stays mounted so its
  // native offset survives; only when the on-focus refresh regroups/reorders
  // does the anchored job move off screen — then scroll it back. If it's still
  // visible we do nothing, avoiding a second hop.
  useEffect(() => {
    const id = pendingAnchor.current;
    if (!id) return;
    // A partial fast-paint (first 30) may not include the anchor — stay armed.
    if (!jobs.some(j => j.id === id)) return;
    pendingAnchor.current = null;
    if (viewableIds.current.has(id)) return;
    const loc = jobLocation.get(id);
    if (!loc) return;
    const timer = setTimeout(() => {
      try {
        sectionListRef.current?.scrollToLocation({ ...loc, viewPosition: 0.3, animated: false });
      } catch { /* not laid out yet — onScrollToIndexFailed retries */ }
    }, 80);
    return () => clearTimeout(timer);
  }, [jobs, jobLocation]);

  // Icons for the sort/group sheet rows (matches the Equipment group sheet style).
  const SORT_ICON: Record<JobSortKey, typeof Clock> = {
    recent: Clock,
    status: ListChecks,
    startDate: Calendar,
    endDate: CalendarClock,
    priority: Flag,
    updated: History,
    title: ArrowDownAZ,
    client: User,
    lead: Users,
  };
  const GROUP_ICON: Record<JobGroupKey, typeof Clock> = {
    none: List,
    client: User,
    lead: Users,
    company: Building2,
    state: MapPin,
  };

  // Counts reflect the active search + date range so the badges tell the user
  // WHERE matches are (e.g. "Invoiced 1"). With no search this is every job,
  // i.e. the plain totals.
  const computedCounts = useMemo(() => {
    const pool = jobs.filter(passesSearchDate);
    return TAB_KEYS.reduce((acc, k) => {
      acc[k] = k === 'all' ? pool.length : pool.filter(j => jobInTab(j, k as StatusTabKey)).length;
      return acc;
    }, {} as Record<TabKey, number>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, dateFrom, dateTo]);
  const counts = serverMode && serverCounts
    ? (serverCounts as Record<TabKey, number>)
    : computedCounts;

  // Server mode: report filter changes UP (debounced search) so the wrapper
  // re-queries; gated on `ready` so the first query uses restored filters.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !ready) return;
    onFiltersChange({ search: debouncedSearch, tabs, sortBy, groupBy, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, ready, debouncedSearch, tabs, sortBy, groupBy, dateFrom, dateTo]);

  const pendingValue = jobs.filter(j => j.status === 'sent' && !isExpired(j))
    .reduce((s, j) => s + j.totalAmount, 0);
  const inProgressRevenue = jobs.filter(j => j.status === 'in_progress')
    .reduce((s, j) => s + j.totalAmount, 0);

  const renderActionBar = (job: JobListItem) => {
    const expired = isExpired(job);
    if (job.status === 'posible') {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'scheduled')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-500/10">
            <Calendar size={11} color={c.primary} />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.schedule}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'proposal') {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'sent')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-500/10">
            <Send size={11} color={c.primary} />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.markSent}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'sent' && !expired) {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'accepted')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-emerald-500/10">
            <CheckCircle2 size={11} color={c.success} />
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markAccepted}</Text>
          </Pressable>
          <Pressable onPress={() => onUpdateStatus(job.id, 'declined')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-red-500/10">
            <XCircle size={11} color={c.danger} />
            <Text className="text-xs font-semibold text-red-500">{t.actions.markDeclined}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'accepted') {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'scheduled')} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-blue-500/10">
            <Calendar size={11} color={c.primary} />
            <Text className="text-xs font-semibold text-blue-600">{t.actions.schedule}</Text>
          </Pressable>
          {canInvoicePerm ? (
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-500/10">
            <FileText size={11} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
          ) : null}
        </View>
      );
    }
    if (job.status === 'scheduled') {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'in_progress')} className="px-3 py-1.5 rounded-lg active:bg-amber-500/10">
            <Text className="text-xs font-semibold text-amber-600">{t.actions.startWork}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'in_progress') {
      return (
        <View className="flex-row items-center gap-2 border-t border-border-soft px-5 py-2.5">
          <Pressable onPress={() => onUpdateStatus(job.id, 'completed')} className="px-3 py-1.5 rounded-lg active:bg-emerald-500/10">
            <Text className="text-xs font-semibold text-emerald-600">{t.actions.markCompleted}</Text>
          </Pressable>
        </View>
      );
    }
    if (job.status === 'completed') {
      return (
        <View className="border-t border-border-soft px-5 py-2.5">
          {canInvoicePerm ? (
          <Pressable onPress={() => onGenerateInvoice(job.id)} className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg active:bg-purple-500/10 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.generateInvoice}</Text>
          </Pressable>
          ) : null}
        </View>
      );
    }
    if (job.status === 'invoiced' && job.invoiceId) {
      return (
        <View className="border-t border-border-soft px-5 py-2.5">
{canViewInvoicePerm ? (
          <Pressable onPress={() => onViewInvoice(job.invoiceId!)} className="flex-row items-center gap-1 self-start">
            <FileText size={12} color="#9333EA" />
            <Text className="text-xs font-semibold text-purple-600">{t.actions.viewInvoice}</Text>
            <ArrowRight size={11} color="#9333EA" />
          </Pressable>
) : null}
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
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
    // Deselecting the last picked row drops out of select mode — the quick
    // "oops" exit, no hunting for the header toggle.
    if (next.size === 0) setSelectMode(false);
  };
  const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
  // Jobs may span clients — one invoice is created per distinct client.
  const invoiceClientCount = new Set(selectedJobs.filter(j => isInvoiceable(j)).map(j => j.clientId ?? '∅')).size;
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
  const canCreateInvoice = selectedJobs.length > 0 && allInvoiceable && !creatingInvoice;
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const doCreateInvoice = async () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !allInvoiceable || creatingInvoice) return;
    setCreatingInvoice(true);
    await onCreateInvoice(selectedJobs.map(j => j.id));
    setCreatingInvoice(false);
    exitSelect();
  };
  const runCreateInvoice = () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !allInvoiceable || creatingInvoice) return;
    // Multiple clients → confirm first (one invoice will be created per client).
    if (invoiceClientCount > 1) {
      Alert.alert(
        t.batchInvoice.multiConfirmTitle,
        t.batchInvoice.multiClientHint.replace('{{count}}', String(invoiceClientCount)),
        [
          { text: t.batchInvoice.cancel, style: 'cancel' },
          { text: t.batchInvoice.multiConfirmCreate.replace('{{count}}', String(invoiceClientCount)), onPress: () => void doCreateInvoice() },
        ],
      );
      return;
    }
    void doCreateInvoice();
  };
  // Archive: on the Archivados tab the pill restores instead. Only completed
  // jobs archive (that's the "never invoicing this" case).
  const archivedTabActive = tabs.includes('archived');
  const allArchivable = selectedJobs.length > 0 && selectedJobs.every(j =>
    archivedTabActive ? !!j.archivedAt : j.status === 'completed' && !j.archivedAt);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const runBulkArchive = async () => {
    if (!onBulkArchive || !allArchivable || bulkArchiving) return;
    setBulkArchiving(true);
    await onBulkArchive(selectedJobs.map(j => j.id), !archivedTabActive);
    setBulkArchiving(false);
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

  // One job card (renderItem). Same layout as before; the outer view no longer
  // needs onLayout — scroll-restore now uses scrollToLocation, not row Ys.
  const renderJob = ({ item: job }: { item: JobListItem }) => {
    const {
      statusLabel, pillBg, pillText, dot, priorityLabel, priorityColor,
      expired, isProposal, alertStyle, overdue, durationText, alertChipLabel,
    } = cardDataByJob.get(job.id)!;
    const selectable = selectMode && (canDelete || isInvoiceable(job));
    const picked = selectedIds.has(job.id);
    return (
      <View className={`bg-card rounded-2xl shadow-sm ${selectMode && !selectable ? 'opacity-40' : ''}`}>
      <View
        className={`rounded-2xl border overflow-hidden ${
          picked
            ? 'bg-primary/5 border-primary'
            : overdue
            ? 'bg-red-500/10 border-red-200 border-l-4 border-l-red-500'
            : alertStyle
              ? `bg-card border-border-soft border-l-4 ${alertStyle.borderClass}`
              : 'bg-card border-border-soft'
        }`}
      >
        <Pressable
          onPress={() => (selectable ? toggleSelect(job.id) : selectMode ? undefined : openJob(job.id))}
          onLongPress={() => {
            if (selectMode) { exitSelect(); return; }
            if (!(canDelete || isInvoiceable(job))) return;
            setSelectMode(true);
            toggleSelect(job.id);
          }}
          className={`flex-row items-start gap-4 p-5 ${overdue ? 'active:bg-red-100' : 'active:bg-surface'}`}
        >
          {selectMode ? (
            <View className={`w-5 h-5 mt-0.5 rounded-md border items-center justify-center ${
              picked ? 'bg-primary border-primary' : 'border-border'
            }`}>
              {picked ? <Check size={13} color="#FFFFFF" /> : null}
            </View>
          ) : (
            <View className={`w-2.5 h-2.5 rounded-full mt-1.5 ${dot}`} />
          )}

          <View className="flex-1 min-w-0">
            <Text className="text-xs font-mono text-faint" numberOfLines={1}>
              {jobRefLabel({ estimateNumber: job.estimateNumber, externalRef: job.externalRef, id: job.id })}
            </Text>
            <Text className="text-sm font-bold text-ink" numberOfLines={1}>{job.title}</Text>
            {job.clientName ? (
              <Text className="text-xs text-muted mt-0.5">
                {job.clientName}{job.clientCompany ? ` · ${job.clientCompany}` : ''}
              </Text>
            ) : null}

            <View className="flex-row flex-wrap items-center gap-2 mt-2">
              {!isProposal && job.priority !== 'normal' ? (
                <Text className={`text-xs font-semibold ${priorityColor}`}>{priorityLabel}</Text>
              ) : null}
              <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                <Text className={`text-xs font-semibold ${pillText}`}>{statusLabel}</Text>
              </View>
              {job.publishedToCrew === false ? (
                <View className="px-2 py-0.5 rounded-full bg-border">
                  <Text className="text-[10px] font-semibold text-muted">{t.new.privateBadge}</Text>
                </View>
              ) : null}
              {expired ? <Text className="text-xs text-orange-500 font-medium">{t.expired}</Text> : null}
            </View>

            <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-2">
              {isProposal && job.issueDate ? (
                <View className="flex-row items-center gap-1">
                  <Calendar size={12} color={c.faint} />
                  <Text className="text-xs text-faint">
                    {formatDateLong(job.issueDate, dateLoc)}
                    {job.expiryDate ? ` · ${t.dueShort.replace('{{date}}', formatDateLong(job.expiryDate, dateLoc))}` : ''}
                  </Text>
                </View>
              ) : null}
              {!isProposal && job.scheduledDate ? (
                <View className="flex-row items-center gap-1">
                  {overdue
                    ? <AlertTriangle size={13} color={c.danger} accessibilityLabel={overdueBadgeLabel} />
                    : <Calendar size={12} color={c.faint} />}
                  <Text className={`text-xs ${overdue ? 'text-red-600 font-bold' : 'text-faint'}`}>
                    {formatDateLong(job.scheduledDate, dateLoc)}
                    {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                  </Text>
                </View>
              ) : null}
              {durationText ? (
                <View className="flex-row items-center gap-1">
                  <Clock size={12} color={c.faint} />
                  <Text className="text-xs text-faint">{durationText}</Text>
                </View>
              ) : null}
              {alertStyle && alertChipLabel ? (
                <View className={`flex-row items-center px-2 py-0.5 rounded-full ${alertStyle.bgClass}`}>
                  <Text className={`text-[10px] font-semibold ${alertStyle.textClass}`}>{alertChipLabel}</Text>
                </View>
              ) : null}
              {job.jobCity || job.jobAddress ? (
                <View className="flex-row items-center gap-1">
                  <MapPin size={12} color={c.faint} />
                  <Text className="text-xs text-faint">
                    {job.jobCity || job.jobAddress}{job.jobState ? `, ${job.jobState}` : ''}
                  </Text>
                </View>
              ) : null}
              {job.totalAmount > 0 ? (
                <Text className="text-xs font-bold text-ink">{fmt(job.totalAmount)}</Text>
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

            {job.leadName || job.workerNames.length > 0 ? (
              <View className="flex-row items-center gap-1 mt-2">
                <Users size={12} color={c.faint} />
                <Text className="text-xs text-muted font-medium">
                  {job.leadName
                    ? `${t.leadPrefix}: ${job.leadName}`
                    : `${job.workerNames.slice(0, 2).join(', ')}${job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}`}
                </Text>
              </View>
            ) : null}
          </View>

          {selectMode ? null : <ChevronRight size={16} color={c.faint} />}
        </Pressable>

        {selectMode ? null : renderActionBar(job)}
      </View>
      </View>
    );
  };

  const renderJobSection = ({ section }: { section: JobFlatSection }) =>
    section.title ? (
      <View className="flex-row items-center gap-2 mt-2 mb-2">
        <Text className="text-xs font-bold text-muted uppercase tracking-wide">{section.title}</Text>
        <View className="px-1.5 py-0.5 rounded-full bg-border">
          <Text className="text-[10px] font-bold text-muted">{section.data.length}</Text>
        </View>
      </View>
    ) : null;

  // Header + search + status tabs + selection banner ride above the rows.
  const jobsHeader = (
    <>
      {/* Header */}
      <View className="flex-row items-start justify-between mb-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-ink">{t.title}</Text>
          <Text className="text-sm text-muted mt-0.5">
            {(() => {
              const total = serverMode
                ? ((tabs.length === 1 ? counts[tabs[0]] : counts.all) ?? filtered.length)
                : (search.trim() ? filtered.length : jobs.length);
              return search.trim()
                ? t.countFound.replace('{{count}}', String(total))
                : t.countTotal.replace('{{count}}', String(total));
            })()}
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
              className="w-11 h-11 rounded-xl border border-red-200 bg-red-500/10 items-center justify-center active:opacity-80"
            >
              <XCircle size={16} color={c.danger} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setDateMenuOpen(o => !o)}
            accessibilityLabel={t.dateFilter.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              dateActive ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <Calendar size={16} color={dateActive ? c.primary : c.muted} />
          </Pressable>
          <Pressable
            onPress={() => setSortMenuOpen(true)}
            accessibilityLabel={t.sort.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              sortActive ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <ArrowUpDown size={16} color={sortActive ? c.primary : c.muted} />
          </Pressable>
          {/* Select-all moved into the selection banner below (Todos). */}
          {onCreateInvoice || canDelete ? (
            <Pressable
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              accessibilityLabel={canDelete ? t.selectButton : t.batchInvoice.selectButton}
              className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
                selectMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'
              }`}
            >
              {/* With delete available the mode is generic ("Seleccionar"),
                 not invoice-specific — that's also where bulk delete lives. */}
              {canDelete ? (
                <ListChecks size={16} color={selectMode ? c.primary : c.muted} />
              ) : (
                <FileText size={16} color={selectMode ? c.primary : c.muted} />
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
          leftIcon={<Search size={16} color={c.faint} />}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* Date-range filter now lives in a bottom sheet (DateRangeSheet,
            rendered at the screen root) for one-hand reach. */}
        <ChipScroll contentContainerClassName="gap-1 pb-1">
          {/* "All" reset — an icon. Active (highlighted) when no status filter
             is applied; tapping it clears the selection back to all. */}
          <Pressable
            onPress={() => setTabs([])}
            accessibilityLabel={tabLabels.all}
            className={`flex-row items-center justify-center px-2.5 py-1.5 rounded-xl ${
              tabs.length === 0 ? 'bg-primary' : 'bg-border-soft'
            }`}
          >
            <List size={15} color={tabs.length === 0 ? '#FFFFFF' : c.muted} />
          </Pressable>
          {STATUS_TAB_KEYS.map(k => {
            const isActive = tabSet.has(k);
            const Icon = TAB_ICON[k];
            return (
              <Pressable
                key={k}
                onPress={() => toggleTab(k)}
                className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${
                  isActive ? 'bg-primary' : 'bg-border-soft'
                }`}
              >
                <Icon size={13} color={isActive ? '#FFFFFF' : c.muted} />
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? 'text-white' : 'text-muted'
                  }`}
                >
                  {tabLabels[k]}
                </Text>
                {counts[k] > 0 ? (
                  <View
                    className={`px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20' : 'bg-border'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isActive ? 'text-white' : 'text-muted'
                      }`}
                    >
                      {counts[k]}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ChipScroll>
      </View>

      {/* Selection banner — ✕ / count / Todos, same as the clients list. */}
      {selectMode ? (
        <View className="flex-row items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
          <Pressable onPress={exitSelect} className="p-1 rounded">
            <X size={14} color={c.primary} />
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

    </>
  );


  // "Actualizado hace 5 min" caption for cache-served rows (swrCache).
  const swrT = full.common.swr;
  const relTime = (ts: number): string => {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return swrT.justNow;
    if (m < 60) return locale === 'es' ? `hace ${m} min` : `${m} min ago`;
    const h = Math.round(m / 60);
    return locale === 'es' ? `hace ${h} h` : `${h}h ago`;
  };
  const staleCaption = stale && cachedAt ? swrT.updatedAgo.replace('{{time}}', relTime(cachedAt)) : null;

  return (
    <View className="flex-1 bg-surface">
      {refreshing ? (
        <View className="h-0.5 overflow-hidden bg-border-soft">
          <View className="h-full w-1/3 rounded-full bg-primary" />
        </View>
      ) : staleCaption ? (
        <Text className="text-[10px] text-faint text-center py-0.5">{staleCaption}</Text>
      ) : null}
      <SectionList
        ref={sectionListRef}
        sections={filtered.length === 0 ? [] : flatSections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={jobsHeader}
        renderSectionHeader={renderJobSection}
        renderItem={renderJob}
        ItemSeparatorComponent={() => <View className="h-3" />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={() => { pendingAnchor.current = null; }}
        onScrollToIndexFailed={() => {}}
        // Anchors the visible rows so growing the header (the selection banner
        // appearing on long-press) doesn't shift/drift the list under the user.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        // Constant so toggling select mode doesn't reflow the content height
        // (leaves room for the floating action pills that appear while selecting).
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 220 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={9}
        maxToRenderPerBatch={8}
        onEndReached={() => { if (serverMode && hasMore && !loadingMore) onLoadMore?.(); }}
        onEndReachedThreshold={0.6}
        ListFooterComponent={serverMode && loadingMore ? (
          <View className="items-center py-5">
            <View className="flex-row gap-1">
              {[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}
            </View>
          </View>
        ) : null}
        ListEmptyComponent={loading ? (
        <SkeletonList rows={8} />
      ) : (
        <View className="items-center py-20">
          <ClipboardList size={40} color={c.faint} />
          <Text className="text-sm text-faint mt-3">
            {search || tabs.length > 0 ? t.emptyNoMatch : t.emptyAll}
          </Text>
          {!search && tabs.length === 0 && canCreate ? (
            <Pressable onPress={onNewJob} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
        />

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
        {/* Canonical sheet structure (see CLAUDE.md): absolute backdrop
            Pressable FIRST, card as plain sibling — the card's ScrollView
            gets drags natively (7 sort + 5 group rows overflow small phones). */}
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setSortMenuOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            className="bg-black/40"
          />
          {/* Compact rows so all 12 options fit without scrolling on most
              phones; the ScrollView + visible indicator cover small screens. */}
          <View className="bg-card rounded-t-3xl px-6 pt-3 pb-6" style={{ maxHeight: '85%' }}>
            <View className="self-center w-10 h-1 rounded-full bg-border mb-3" />
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-ink">{t.sort.title}</Text>
              <Pressable onPress={() => setSortMenuOpen(false)} hitSlop={8}>
                <Text className="text-sm font-semibold text-primary">{full.common.buttons.done}</Text>
              </Pressable>
            </View>

            <ScrollView>
            <Text className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-1.5">
              {t.sort.sortByTitle}
            </Text>
            <View className="gap-0.5 mb-4">
              {JOB_SORT_KEYS.map(k => {
                const selected = sortBy === k;
                const Icon = SORT_ICON[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => setSortBy(k)}
                    className={`flex-row items-center gap-3 px-3 py-1.5 rounded-2xl ${
                      selected ? 'bg-primary/10' : 'active:bg-surface'
                    }`}
                  >
                    <View className={`w-8 h-8 rounded-xl items-center justify-center ${selected ? 'bg-primary' : 'bg-border-soft'}`}>
                      <Icon size={16} color={selected ? '#FFFFFF' : '#6B7280'} />
                    </View>
                    <Text className={`flex-1 text-[15px] ${selected ? 'text-primary font-semibold' : 'text-ink'}`}>
                      {t.sort.by[k]}
                    </Text>
                    {selected ? <Check size={18} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-1.5">
              {t.sort.groupByTitle}
            </Text>
            <View className="gap-0.5">
              {JOB_GROUP_KEYS.map(k => {
                const selected = groupBy === k;
                const Icon = GROUP_ICON[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => setGroupBy(k)}
                    className={`flex-row items-center gap-3 px-3 py-1.5 rounded-2xl ${
                      selected ? 'bg-primary/10' : 'active:bg-surface'
                    }`}
                  >
                    <View className={`w-8 h-8 rounded-xl items-center justify-center ${selected ? 'bg-primary' : 'bg-border-soft'}`}>
                      <Icon size={16} color={selected ? '#FFFFFF' : '#6B7280'} />
                    </View>
                    <Text className={`flex-1 text-[15px] ${selected ? 'text-primary font-semibold' : 'text-ink'}`}>
                      {t.sort.group[k]}
                    </Text>
                    {selected ? <Check size={18} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
            </ScrollView>
          </View>
        </View>
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
          <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-4 pb-8 pt-4">
            <View className="items-center mb-3">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="bg-surface rounded-2xl overflow-hidden">
              <Pressable
                onPress={() => { setNewMenuOpen(false); onNewJob(); }}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft border-b border-border-soft"
              >
                <ClipboardList size={18} color={c.muted} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">{t.newDropdown.jobOption}</Text>
                  <Text className="text-xs text-faint">{t.newDropdown.jobOptionSub}</Text>
                </View>
              </Pressable>
              {canCreateEstimates ? (
              <Pressable
                onPress={() => { setNewMenuOpen(false); onNewProposal(); }}
                className="flex-row items-center gap-3 px-5 py-4 active:bg-border-soft"
              >
                <FileText size={18} color={c.muted} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink">
                    {t.newDropdown.proposalOption}
                  </Text>
                  <Text className="text-xs text-faint">{t.newDropdown.proposalOptionSub}</Text>
                </View>
              </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setNewMenuOpen(false)}
              className="mt-3 items-center py-3.5 rounded-2xl bg-border-soft active:bg-border"
            >
              <Text className="text-sm font-semibold text-ink">
                {full.common.buttons.cancel}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>

    {/* New job/proposal — floating action, bottom-right thumb reach.
       Hidden for roles that can't create jobs (field crew / viewers). */}
    {selectMode ? null : canCreate ? <Fab onPress={() => (canCreateEstimates ? setNewMenuOpen(true) : onNewJob())} /> : null}

    {/* Batch-invoice FAB pill — sits above the dock (bottom-32, like Fab) so it
       isn't hidden behind the floating tab bar. Only in select mode. */}
    {selectMode ? (
      <>
        {allInvoiceable && invoiceClientCount > 1 ? (
          <View className="absolute bottom-48 right-5 bg-primary/10 px-3 py-1.5 rounded-full" style={{ elevation: 4 }}>
            <Text className="text-xs font-medium text-primary">{t.batchInvoice.multiClientHint.replace('{{count}}', String(invoiceClientCount))}</Text>
          </View>
        ) : null}
        {/* Bulk move-to-client pill — top of the left stack. */}
        {onBulkChangeClient ? (
          <Pressable
            onPress={() => { if (selectedJobs.length) void onBulkChangeClient(selectedJobs.map(j => j.id)); }}
            disabled={selectedJobs.length === 0}
            className="absolute bottom-64 left-5 flex-row items-center gap-2 px-5 h-12 rounded-full"
            style={{
              backgroundColor: selectedJobs.length === 0 ? '#D1D5DB' : '#2563EB',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Users size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {`${t.bulkMoveClient}${selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}`}
            </Text>
          </Pressable>
        ) : null}
        {/* Bulk-archive pill — stacked above delete on the left. */}
        {onBulkArchive ? (
          <Pressable
            onPress={runBulkArchive}
            disabled={!allArchivable || bulkArchiving}
            className="absolute bottom-48 left-5 flex-row items-center gap-2 px-5 h-12 rounded-full"
            style={{
              backgroundColor: !allArchivable || bulkArchiving ? '#D1D5DB' : '#374151',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Archive size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {`${archivedTabActive ? t.bulkUnarchive : t.bulkArchive}${selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}`}
            </Text>
          </Pressable>
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
      presets={buildHistoryRangePresets(full.dashboard.reports.payroll.historyPresets, payPeriod)}
    />
    </View>
  );
}

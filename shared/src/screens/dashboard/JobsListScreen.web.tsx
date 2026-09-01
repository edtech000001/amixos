'use client';

// Web-only JobsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as JobsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonRow } from '../../ui/Skeleton';
import { JobsSummarySheet } from './JobsSummarySheet';
import type { JobsSummaryTotals } from '../../lib/jobsSummary';
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
  X,
  FileText,
  Users,
  User,
  ArrowRight,
  Send,
  ChevronDown,
  Building2,
  ArrowUpDown,
  Check,
  AlertTriangle,
  Clock,
  List,
  ListChecks,
  Lightbulb,
  Receipt,
  Trash2,
  Archive,
  Flag,
  History,
  ArrowDownAZ,
  CalendarClock,
  BarChart3,
} from 'lucide-react';
import { useLang } from '../../i18n';
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
  type JobsFilters,
} from '../../lib/jobsFilters';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import { formatHours } from '../../lib/fieldHome';
import { Tooltip } from '../../ui/Tooltip';

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
  delegatedToBusinessName?: string | null;
  delegatedFromBusinessName?: string | null;
}

const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];
// Closed/terminal work hidden from the default (no-tab) "active" view — still
// reachable by selecting the corresponding status tab.
const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated', 'archived'] as const;
type TabKey = (typeof TAB_KEYS)[number];
type StatusTabKey = Exclude<TabKey, 'all'>;
// Selectable status filters (everything except the "all" reset). Multi-select.
const STATUS_TAB_KEYS = TAB_KEYS.filter((k): k is StatusTabKey => k !== 'all');

// Icon per status filter — mirrors the status semantics mobile uses on cards
// (calendar = scheduled, check = completed, etc.) so the tabs read at a glance.
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

// Icons for the sort/group menu chips — mirror the mobile sort sheet so both
// platforms read the same (clock = newest, calendar = start date, etc.).
const SORT_ICON: Record<JobSortKey, typeof List> = {
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
const GROUP_ICON: Record<JobGroupKey, typeof List> = {
  none: List,
  client: User,
  lead: Users,
  company: Building2,
  state: MapPin,
};

export interface JobsListScreenProps {
  /** Opens the filtered-set summary. Resolves null when the tab selection
   *  can't be aggregated server-side (see jobSummaryFilterParams). Omit to
   *  hide the Summary button entirely. */
  onRequestSummary?: () => Promise<JobsSummaryTotals | null>;
  loading: boolean;
  jobs: JobListItem[];
  initialTab?: TabKey;
  onJobPress: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
  onGenerateInvoice: (id: string) => void;
  /** Batch-invoice: create one invoice from several completed same-client jobs.
   *  When omitted, the select-to-invoice toolbar is hidden. */
  onCreateInvoice?: (jobIds: string[]) => Promise<void> | void;
  /** Bulk delete for the selection toolbar. Pass ONLY when the current role
   *  can delete jobs — its presence opens selection to every row (not just
   *  invoiceable ones) and shows the red Eliminar button. The caller owns
   *  the confirmation dialog + the actual delete. */
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
  /** Whether the viewer may create jobs/proposals. Hides the "+ Nuevo"
   *  trigger + empty-state link when false. Keep in sync with the native
   *  variant. Defaults to true. */
  canCreate?: boolean;
  /** Whether the viewer may create estimates/proposals (the createEstimates
   *  capability). When false, the "new" trigger creates a work order directly
   *  and the proposal option is hidden. Defaults to true. */
  canCreateEstimates?: boolean;
  // Upcoming-job alert tiers (Ajustes → Trabajos, migration 046). Keep in
  // sync with JobsListScreen.tsx — the native variant declares the same prop.
  alertThresholds?: JobAlertThresholds;
  /** Active business id — scopes persisted filters per business so they don't
   *  carry over when switching companies. */
  businessId?: string;
  // ─── Server-side mode (opt-in) ──────────────────────────────────────────
  // When true, `jobs` is the server-filtered page(s) (not the full table): the
  // screen skips its own search/tab filtering, uses `serverCounts` for the tab
  // badges, reports filter changes via `onFiltersChange`, and asks for more via
  // `onLoadMore` when scrolled near the bottom. Off = today's client-side behavior.
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
   *  thin animated bar above the list instead of blanking (swrCache). */
  refreshing?: boolean;
  /** Rows came from the local cache and the fresh fetch hasn't landed yet. */
  stale?: boolean;
  /** Epoch-ms the cached rows were saved (for the "Actualizado hace…" caption). */
  cachedAt?: number | null;
}

const STATUS_PILL: Record<string, string> = {
  posible: 'bg-teal-100 text-teal-700',
  proposal: 'bg-border-soft text-muted',
  sent: 'bg-blue-100 text-blue-600',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-600',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-border-soft text-faint',
  invoiced: 'bg-purple-100 text-purple-700',
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
  canCreateInvoice = true,
  canViewInvoice = true,
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
  onRequestSummary,
}: JobsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const tw = full.dashboard.workspaces;
  const overdueBadgeLabel = full.dashboard.settings.jobAlerts.overdueBadge;
  // Restore the saved view (tab/search/sort/group) so navigating into a job
  // and back — or refreshing — keeps the filters. An explicit ?tab= deep link
  // (initialTab !== 'all') still wins for the tab.
  // Filters start at defaults (a ?tab deep link still seeds the tab). Persisted
  // filters are restored AFTER mount — reading localStorage during the initial
  // render would diverge from the server HTML and throw a hydration error.
  const [search, setSearch] = useState('');
  const [tabs, setTabs] = useState<StatusTabKey[]>(initialTab !== 'all' ? [initialTab as StatusTabKey] : []);
  const tabSet = useMemo(() => new Set(tabs), [tabs]);
  const toggleTab = (k: StatusTabKey) =>
    setTabs(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<JobSortKey>('recent');
  const [groupBy, setGroupBy] = useState<JobGroupKey>('none');
  // Scheduled-date range filter (yyyy-mm-dd). null = open-ended that side.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  // Gate persistence until after the restore pass, so we don't overwrite saved
  // filters with defaults on the first render.
  const [hydrated, setHydrated] = useState(false);

  // Persisted filters are scoped per business so switching companies doesn't
  // carry one company's filters into another.
  const filtersKey = businessId ? `${JOBS_FILTERS_KEY}.${businessId}` : JOBS_FILTERS_KEY;

  // Restore on mount AND whenever the business changes. Always apply (saved OR
  // reset to defaults) so a business with no saved filters doesn't inherit the
  // previous one's.
  useEffect(() => {
    const saved = parseJobsFilters(
      typeof window !== 'undefined' ? window.localStorage.getItem(filtersKey) : null,
    );
    setSearch(saved?.search ?? '');
    // Prime the DEBOUNCED copy too: the report effect fires on hydration, and
    // if the debounce hasn't caught up it reports an empty search — the
    // container briefly shows the unfiltered list, then "reapplies" the
    // search 250ms later. Debounce is for typing, not restoration.
    setDebouncedSearch(saved?.search ?? '');
    // A ?tab deep link wins over saved tabs.
    if (initialTab === 'all') {
      setTabs((saved?.tabs ?? []).filter((k): k is StatusTabKey => (STATUS_TAB_KEYS as readonly string[]).includes(k)));
    }
    setSortBy(saved?.sortBy ?? 'recent');
    setGroupBy(saved?.groupBy ?? 'none');
    setDateFrom(saved?.dateFrom ?? null);
    setDateTo(saved?.dateTo ?? null);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Persist on change — only after restore, so defaults don't clobber saved.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const f: JobsFilters = { tabs, search, sortBy, groupBy, dateFrom, dateTo };
    window.localStorage.setItem(filtersKey, JSON.stringify(f));
  }, [hydrated, filtersKey, tabs, search, sortBy, groupBy, dateFrom, dateTo]);

  const filtersActive = jobsFiltersActive({ tabs, search, sortBy, groupBy, dateFrom, dateTo });
  const dateActive = !!dateFrom || !!dateTo;

  // Filtered-set summary. Fetched on open (not with the list) so the extra
  // aggregate query only runs when someone asks for it.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryTotals, setSummaryTotals] = useState<JobsSummaryTotals | null>(null);
  const openSummary = async () => {
    if (!onRequestSummary) return;
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryTotals(null);
    try {
      setSummaryTotals(await onRequestSummary());
    } catch {
      setSummaryTotals(null); // renders the "unavailable" copy
    } finally {
      setSummaryLoading(false);
    }
  };
  // Quick date-range chips — same set as payroll history, including the
  // "This/Last pay period" chips when the caller passes payPeriod.
  const dateRangePresets = buildHistoryRangePresets(full.dashboard.reports.payroll.historyPresets, payPeriod);

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

  const applyDatePreset = (from: string, to: string) => { setDateFrom(from); setDateTo(to); };
  const clearFilters = () => { setTabs([]); setSearch(''); setSortBy('recent'); setGroupBy('none'); setDateFrom(null); setDateTo(null); };

  const tabLabels: Record<TabKey, string> = {
    all: t.tabs.all,
    propuestas: t.tabs.proposals,
    posible: t.tabs.posible,
    scheduled: t.tabs.scheduled,
    in_progress: t.tabs.in_progress,
    completed: t.tabs.completed,
    archived: t.tabs.archived,
    invoiced: t.tabs.invoiced,
    cancelled: t.tabs.cancelled,
    delegated: tw.delegatedFilterTab,
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
  // (the default "active" view) we hide closed work — invoiced + cancelled —
  // so the working list stays clean. BUT while a search is active we span EVERY
  // status (incl. closed + archived) so a targeted match always surfaces.
  const matchesTab = (j: JobListItem) => {
    if (tabs.length === 0) {
      if (searching) return true;
      return !j.archivedAt;
    }
    return tabs.some((tk) => jobInTab(j, tk));
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

  // In server mode `jobs` is ALREADY the search/tab-filtered page(s) from the
  // DB, so we don't re-filter — we only sort/group the loaded rows. In client
  // mode we filter the full array as before.
  const filtered = useMemo(() => {
    if (serverMode) return jobs;
    return jobs.filter((j) => passesSearchDate(j) && matchesTab(j));
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

  // Counts reflect the active search + date range so the badges tell the user
  // WHERE matches are (e.g. "Invoiced 1"). With no search this is every job,
  // i.e. the plain totals.
  const computedCounts = useMemo(() => {
    const pool = jobs.filter(passesSearchDate);
    return TAB_KEYS.reduce((acc, k) => {
      acc[k] = k === 'all' ? pool.length : pool.filter((j) => jobInTab(j, k as StatusTabKey)).length;
      return acc;
    }, {} as Record<TabKey, number>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, dateFrom, dateTo]);
  // Server mode gets exact counts from the DB (the loaded page can't be counted
  // client-side); client mode computes them from the full array.
  const counts = serverMode && serverCounts
    ? (serverCounts as Record<TabKey, number>)
    : computedCounts;

  // Server mode: report filter changes UP so the wrapper re-queries. Search is
  // debounced so we don't fire a query per keystroke. Gated on `hydrated` so the
  // first query uses the restored filters, not the pre-restore defaults.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !hydrated) return;
    onFiltersChange({ search: debouncedSearch, tabs, sortBy, groupBy, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, hydrated, debouncedSearch, tabs, sortBy, groupBy, dateFrom, dateTo]);

  // Infinite scroll: load the next page when a sentinel near the list bottom
  // scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!serverMode || !onLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && hasMore && !loadingMore) onLoadMore(); },
      { rootMargin: '800px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [serverMode, onLoadMore, hasMore, loadingMore]);

  const pendingValue = jobs
    .filter((j) => j.status === 'sent' && !isExpired(j))
    .reduce((s, j) => s + j.totalAmount, 0);
  const inProgressRevenue = jobs
    .filter((j) => j.status === 'in_progress')
    .reduce((s, j) => s + j.totalAmount, 0);

  const renderActionBar = (job: JobListItem) => {
    const expired = isExpired(job);
    if (job.status === 'posible') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'scheduled')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 text-xs font-semibold text-blue-600">
            <Calendar size={11} /> {t.actions.schedule}
          </button>
        </div>
      );
    }
    if (job.status === 'proposal') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'sent')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 text-xs font-semibold text-blue-600">
            <Send size={11} /> {t.actions.markSent}
          </button>
        </div>
      );
    }
    if (job.status === 'sent' && !expired) {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'accepted')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={11} /> {t.actions.markAccepted}
          </button>
          <button onClick={() => onUpdateStatus(job.id, 'declined')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-xs font-semibold text-red-500">
            <XCircle size={11} /> {t.actions.markDeclined}
          </button>
        </div>
      );
    }
    if (job.status === 'accepted') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'scheduled')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 text-xs font-semibold text-blue-600">
            <Calendar size={11} /> {t.actions.schedule}
          </button>
          {canCreateInvoice ? (
          <button onClick={() => onGenerateInvoice(job.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-purple-500/10 text-xs font-semibold text-purple-600">
            <FileText size={11} /> {t.actions.generateInvoice}
          </button>
          ) : null}
        </div>
      );
    }
    if (job.status === 'scheduled') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'in_progress')} className="px-3 py-1.5 rounded-lg hover:bg-amber-500/10 text-xs font-semibold text-amber-600">
            {t.actions.startWork}
          </button>
        </div>
      );
    }
    if (job.status === 'in_progress') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
          <button onClick={() => onUpdateStatus(job.id, 'completed')} className="px-3 py-1.5 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-emerald-600">
            {t.actions.markCompleted}
          </button>
        </div>
      );
    }
    if (job.status === 'completed') {
      return (
        <div className="flex items-center justify-end shrink-0">
{canCreateInvoice ? (
          <button onClick={() => onGenerateInvoice(job.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-purple-500/10 text-xs font-semibold text-purple-600">
            <FileText size={12} /> {t.actions.generateInvoice}
          </button>
) : null}
        </div>
      );
    }
    if (job.status === 'invoiced' && job.invoiceId) {
      return (
        <div className="flex items-center justify-end shrink-0">
{canViewInvoice ? (
          <button onClick={() => onViewInvoice(job.invoiceId!)} className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
            <FileText size={12} /> {t.actions.viewInvoice} <ArrowRight size={11} />
          </button>
) : null}
        </div>
      );
    }
    return null;
  };

  // ── Select-to-invoice (batch) ───────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  // Confirm modal shown only when the selection spans multiple clients (so the
  // user knows several invoices will be created, one each).
  const [multiConfirm, setMultiConfirm] = useState(false);
  const isInvoiceable = (j: JobListItem) => j.status === 'completed' && !j.invoiceId;
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  // Shift-click selects the whole visible range between the last clicked row
  // and this one (standard desktop multi-select). Anchor = last plain click.
  const lastPickRef = useRef<string | null>(null);
  const handleSelectClick = (id: string, shiftKey: boolean) => {
    const order = sections.flatMap(sec => sec.jobs);
    const anchor = lastPickRef.current;
    if (shiftKey && anchor && anchor !== id) {
      const a = order.findIndex(j => j.id === anchor);
      const b = order.findIndex(j => j.id === id);
      if (a >= 0 && b >= 0) {
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1)
          .filter(j => canDelete || isInvoiceable(j));
        setSelectedIds(prev => {
          const next = new Set(prev);
          range.forEach(j => next.add(j.id));
          return next;
        });
        return; // anchor stays where the plain click set it
      }
    }
    lastPickRef.current = id;
    toggleSelect(id);
  };
  const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
  // Jobs may span clients — one invoice is created per distinct client. This
  // counts how many invoices the current selection would produce.
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
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); lastPickRef.current = null; };
  // Invoicing needs every picked job invoiceable (selection may now include
  // non-invoiceable rows picked for deletion).
  const allInvoiceable = selectedJobs.every(isInvoiceable);
  const doCreateInvoice = async () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !allInvoiceable || creatingInvoice) return;
    setCreatingInvoice(true);
    await onCreateInvoice(selectedJobs.map(j => j.id));
    setCreatingInvoice(false);
    exitSelect();
  };
  const runCreateInvoice = () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !allInvoiceable || creatingInvoice) return;
    // Multiple clients → confirm first (several invoices will be created).
    if (invoiceClientCount > 1) { setMultiConfirm(true); return; }
    void doCreateInvoice();
  };
  // Archive: on the Archivados tab the button restores instead. Only COMPLETED
  // jobs archive: invoiced/cancelled are already hidden from the default view
  // under their own tabs, so completed is the one closed state that still
  // clutters the working list — archive is its "never invoicing this" exit.
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
  // precomputed here so selection clicks and select-mode toggles (which
  // re-render every visible card — potentially hundreds) skip all the date
  // math and formatting.
  // Amount column only renders when some visible job HAS an amount —
  // otherwise it's a blank hole and the title can use the width instead.
  const showAmountCol = useMemo(() => filtered.some(j => j.totalAmount > 0), [filtered]);

  const cardDataByJob = useMemo(() => {
    const compute = (job: JobListItem) => {
      const statusKey = job.status as keyof typeof t.statuses;
      const isProposal = PROPOSAL_STATUSES.includes(job.status);
      const alertMatch = !isProposal ? matchJobAlert(alertThresholds, job.scheduledDate) : null;
      return {
        statusLabel: t.statuses[statusKey] ?? job.status,
        pill: STATUS_PILL[job.status] ?? 'bg-blue-100 text-blue-700',
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
    <div className={`p-6 lg:p-8 ${selectMode ? 'pb-72 lg:pb-72' : 'pb-24 lg:pb-24'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">
            {(() => {
              // In server mode the loaded page isn't the total — use the DB
              // count (active tab, else 'all') so the header shows the real number.
              const total = serverMode
                ? (tabs.length === 1 ? counts[tabs[0]] : counts.all) ?? filtered.length
                : (search.trim() ? filtered.length : jobs.length);
              return search.trim()
                ? t.countFound.replace('{{count}}', String(total))
                : t.countTotal.replace('{{count}}', String(total));
            })()}
            {pendingValue > 0 ? (
              <span className="text-blue-600 font-medium">
                {' · '}
                {t.pendingValue.replace('{{amount}}', fmt(pendingValue))}
              </span>
            ) : null}
            {inProgressRevenue > 0 ? (
              <span className="text-amber-600 font-medium">
                {' · '}
                {t.inProgressValue.replace('{{amount}}', fmt(inProgressRevenue))}
              </span>
            ) : null}
          </p>
        </div>
        <div className="relative">
          {canCreate ? (
          <button
            onClick={() => (canCreateEstimates ? setNewMenuOpen((v) => !v) : onNewJob())}
            className="flex items-center gap-1 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
          >
            <Plus size={15} /> {t.newDropdown.trigger}{canCreateEstimates ? <ChevronDown size={14} /> : null}
          </button>
          ) : null}
          {newMenuOpen && canCreateEstimates ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNewMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-card rounded-2xl border border-border-soft shadow-lg overflow-hidden z-20">
                <button
                  onClick={() => { setNewMenuOpen(false); onNewJob(); }}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface border-b border-border-soft text-left"
                >
                  <ClipboardList size={18} className="text-muted shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t.newDropdown.jobOption}</span>
                    <span className="block text-xs text-faint">{t.newDropdown.jobOptionSub}</span>
                  </span>
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); onNewProposal(); }}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface text-left"
                >
                  <FileText size={18} className="text-muted shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t.newDropdown.proposalOption}</span>
                    <span className="block text-xs text-faint">{t.newDropdown.proposalOptionSub}</span>
                  </span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-border bg-card pl-10 pr-10 py-2.5 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t.clearFilters}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        {filtersActive ? (
          <Tooltip tip="clearFilters">
            <button
              onClick={clearFilters}
              className="shrink-0 flex items-center justify-center p-2.5 rounded-2xl border border-red-200 bg-red-500/10 text-red-600 shadow-sm hover:bg-red-100 transition-colors"
            >
              <XCircle size={16} />
            </button>
          </Tooltip>
        ) : null}
        {onRequestSummary ? (
          <button
            onClick={openSummary}
            title={t.summary.title}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border border-primary bg-primary/10 text-sm font-semibold text-primary shadow-sm hover:bg-primary/20 transition-colors"
          >
            <BarChart3 size={16} /> {t.summary.button}
          </button>
        ) : null}
        {onCreateInvoice || canDelete ? (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            title={canDelete ? t.selectButton : t.batchInvoice.selectButton}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              selectMode
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            {/* With delete available the mode is generic ("Seleccionar"), not
               invoice-specific — that's also where bulk delete lives. */}
            {canDelete ? <ListChecks size={15} /> : <FileText size={15} />}{' '}
            {selectMode ? t.batchInvoice.cancel : canDelete ? t.selectButton : t.batchInvoice.selectButton}
          </button>
        ) : null}
        <div className="relative shrink-0">
          <button
            onClick={() => setDateMenuOpen(o => !o)}
            title={t.dateFilter.button}
            aria-label={t.dateFilter.button}
            className={`flex items-center justify-center p-2.5 rounded-2xl border shadow-sm transition-colors ${
              dateActive
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <Calendar size={16} />
          </button>
          {dateMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDateMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-card rounded-2xl border border-border-soft shadow-lg p-4">
                <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">
                  {t.dateFilter.title}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {dateRangePresets.map(p => {
                    const active = dateFrom === p.from && dateTo === p.to;
                    return (
                      <button
                        key={p.label}
                        onClick={() => applyDatePreset(p.from, p.to)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <label className="block text-xs font-medium text-muted mb-1">{t.dateFilter.from}</label>
                <input
                  type="date"
                  value={dateFrom ?? ''}
                  onChange={e => setDateFrom(e.target.value || null)}
                  className="w-full mb-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <label className="block text-xs font-medium text-muted mb-1">{t.dateFilter.to}</label>
                <input
                  type="date"
                  value={dateTo ?? ''}
                  onChange={e => setDateTo(e.target.value || null)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dateActive ? (
                  <button
                    onClick={() => { setDateFrom(null); setDateTo(null); }}
                    className="mt-3 w-full py-2 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border"
                  >
                    {t.dateFilter.clear}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setSortMenuOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              sortActive
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-card border-border text-muted hover:bg-surface'
            }`}
          >
            <ArrowUpDown size={15} /> {t.sort.button}
          </button>
          {sortMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-card rounded-2xl border border-border-soft shadow-lg p-4">
                <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">
                  {t.sort.sortByTitle}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {JOB_SORT_KEYS.map(k => {
                    const selected = sortBy === k;
                    const Icon = SORT_ICON[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setSortBy(k)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          selected ? 'bg-primary border-primary text-white' : 'bg-card border-border text-muted hover:border-border'
                        }`}
                      >
                        {selected ? <Check size={12} /> : <Icon size={12} />}
                        {t.sort.by[k]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">
                  {t.sort.groupByTitle}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_GROUP_KEYS.map(k => {
                    const selected = groupBy === k;
                    const Icon = GROUP_ICON[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setGroupBy(k)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          selected ? 'bg-primary border-primary text-white' : 'bg-card border-border text-muted hover:border-border'
                        }`}
                      >
                        {selected ? <Check size={12} /> : <Icon size={12} />}
                        {t.sort.group[k]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Tabs — multi-select status filters. The leading "all" reset is an icon,
         highlighted when no status filter is applied. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5">
        <button
          onClick={() => setTabs([])}
          title={tabLabels.all}
          aria-label={tabLabels.all}
          className={`flex items-center justify-center shrink-0 px-2.5 py-1.5 rounded-xl ${
            tabs.length === 0 ? 'bg-primary text-white' : 'bg-border-soft text-muted hover:bg-border'
          }`}
        >
          <List size={15} />
        </button>
        {STATUS_TAB_KEYS.map((k) => {
          const isActive = tabSet.has(k);
          const Icon = TAB_ICON[k];
          return (
            <button
              key={k}
              onClick={() => toggleTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 text-xs font-semibold ${
                isActive ? 'bg-primary text-white' : 'bg-border-soft text-muted hover:bg-border'
              }`}
            >
              <Icon size={13} />
              {tabLabels[k]}
              {counts[k] > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-border text-muted'}`}>
                  {counts[k]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Job list — loading only shows a skeleton when there are NO rows;
          otherwise the previous rows stay on screen while `refreshing`. */}
      {refreshing ? (
        <div className="h-0.5 -mt-2 mb-1 overflow-hidden rounded-full bg-border-soft">
          <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
        </div>
      ) : staleCaption ? (
        <p className="text-[10px] text-faint text-center -mt-2 mb-1">{staleCaption}</p>
      ) : null}
      {loading && filtered.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-2xl border border-border-soft bg-card px-4 py-4">
              <div className="w-10 h-10 rounded-full bg-border-soft" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/5 rounded bg-border-soft" />
                <div className="h-3 w-2/5 rounded bg-border-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <ClipboardList size={40} className="text-faint" />
          <p className="text-sm text-faint mt-3">{search || tabs.length > 0 ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && tabs.length === 0 && canCreate ? (
            <button onClick={onNewJob} className="text-primary text-sm font-medium mt-1 hover:underline">{t.createFirst}</button>
          ) : null}
        </div>
      ) : (
        <div className={`flex flex-col gap-3 ${selectMode ? 'select-none' : ''}`}>
          {sections.map(section => (
          <Fragment key={section.title ?? '__all__'}>
          {section.title ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold text-muted uppercase tracking-wide">{section.title}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-border text-[10px] font-bold text-muted">
                {section.jobs.length}
              </span>
            </div>
          ) : null}
          {section.jobs.map((job) => {
            // Precomputed in cardDataByJob — see the useMemo above.
            const {
              statusLabel, pill, dot, priorityLabel, priorityColor,
              expired, isProposal, alertStyle, overdue, durationText, alertChipLabel,
            } = cardDataByJob.get(job.id)!;

            // Select mode: any row is pickable when delete is available.
            const selectable = selectMode && (canDelete || isInvoiceable(job));
            const picked = selectedIds.has(job.id);
            return (
              <div
                key={job.id}
                // Lets the page's scroll restore find and re-center this exact
                // row when the user returns from the job detail.
                data-scroll-anchor={job.id}
                // content-visibility skips layout/paint for offscreen rows —
                // keeps huge lists (hundreds of jobs) cheap to render/scroll.
                // contain-intrinsic-size reserves an estimated height so the
                // scrollbar doesn't jump. Unsupported browsers ignore both.
                className={`[content-visibility:auto] [contain-intrinsic-size:auto_72px] rounded-2xl border shadow-sm overflow-hidden transition-opacity ${
                  selectMode && !selectable ? 'opacity-40' : ''
                } ${
                  picked
                    ? 'bg-primary/5 border-primary ring-1 ring-primary'
                    : overdue
                    ? 'bg-red-500/10 border-red-200 border-l-4 border-l-red-500'
                    : alertStyle
                      ? `bg-card border-border-soft border-l-4 ${alertStyle.borderClass}`
                      : 'bg-card border-border-soft'
                }`}
              >
                {/* One wide scannable row: title/client | status | date | lead |
                   location | amount | actions. Fixed column widths keep rows
                   aligned like a table; columns drop off as the window narrows
                   (xl → lg → md) — the detail view still has everything. */}
                <div className={`flex items-center gap-3 pr-4 ${overdue ? 'hover:bg-red-100/60' : 'hover:bg-surface'}`}>
                  <button
                    onClick={(e) => (selectable ? handleSelectClick(job.id, e.shiftKey) : selectMode ? undefined : onJobPress(job.id))}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left pl-5 pr-1 py-3.5"
                  >
                    {selectMode ? (
                      <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                        picked ? 'bg-primary border-primary' : selectable ? 'border-border' : 'border-border'
                      }`}>
                        {picked ? <Check size={13} className="text-white" /> : null}
                      </span>
                    ) : (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                    )}

                    {/* Title + client. The reference code sits on its own line
                       above the title so it never eats the title's width. */}
                    <div className="flex-1 min-w-0">
                      <span className="block text-xs font-mono text-faint truncate">{jobRefLabel({ estimateNumber: job.estimateNumber, externalRef: job.externalRef, id: job.id })}</span>
                      <span className="block text-sm font-bold text-ink truncate">{job.title}</span>
                      {job.clientName ? (
                        <p className="text-xs text-muted mt-0.5 truncate">
                          {job.clientName}
                          {job.clientCompany ? ` · ${job.clientCompany}` : ''}
                        </p>
                      ) : null}
                      {job.delegatedToBusinessName ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-purple-600 mt-0.5">
                          <Building2 size={12} />
                          {tw.delegatedBadge.replace('{{name}}', job.delegatedToBusinessName)}
                        </span>
                      ) : null}
                      {/* Status pill inline when the dedicated column is hidden */}
                      <div className="md:hidden mt-1.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${pill}`}>{statusLabel}</span>
                      </div>
                    </div>

                    {/* Status — pills anchored to a SHARED LEFT EDGE so they
                       line up row-to-row; priority/expired sit to the right of
                       the pill and the alert chip below, so neither can shift
                       the pill's position. */}
                    <div className="hidden md:flex w-36 shrink-0 flex-col items-start gap-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${pill}`}>{statusLabel}</span>
                        {!isProposal && job.priority !== 'normal' ? (
                          <span className={`text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
                        ) : null}
                        {expired ? <span className="text-xs text-orange-500 font-medium">{t.expired}</span> : null}
                      </span>
                      {alertStyle && alertChipLabel ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${alertStyle.bgClass} ${alertStyle.textClass}`}>
                          {alertChipLabel}
                        </span>
                      ) : null}
                    </div>

                    {/* Date / duration */}
                    <div className="hidden lg:flex w-40 shrink-0 flex-col gap-0.5">
                      {isProposal && job.issueDate ? (
                        <span className="flex items-center gap-1 text-xs text-faint">
                          <Calendar size={12} />
                          {formatDateLong(job.issueDate, dateLoc)}
                          {job.expiryDate ? ` · ${t.dueShort.replace('{{date}}', formatDateLong(job.expiryDate, dateLoc))}` : ''}
                        </span>
                      ) : null}
                      {!isProposal && job.scheduledDate ? (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-bold' : 'text-faint'}`}>
                          {overdue ? <AlertTriangle size={13} aria-label={overdueBadgeLabel} /> : <Calendar size={12} />}
                          {formatDateLong(job.scheduledDate, dateLoc)}
                          {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                        </span>
                      ) : null}
                      {durationText ? (
                        <span className="flex items-center gap-1 text-xs text-faint">
                          <Clock size={12} />
                          {durationText}
                        </span>
                      ) : null}
                    </div>

                    {/* Lead + location — ONE stacked column (rows are already
                       two lines tall), so both stay visible without starving
                       the job title at laptop widths. */}
                    <div className="hidden xl:flex w-44 shrink-0 flex-col gap-0.5 min-w-0">
                      {job.leadName || job.workerNames.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-muted font-medium min-w-0">
                          <Users size={12} className="shrink-0" />
                          <span className="truncate">
                            {job.leadName
                              ? `${t.leadPrefix}: ${job.leadName}`
                              : `${job.workerNames.slice(0, 2).join(', ')}${job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}`}
                          </span>
                        </span>
                      ) : null}
                      {job.jobCity || job.jobAddress ? (
                        <span className="flex items-center gap-1 text-xs text-faint min-w-0">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate">
                            {job.jobCity || job.jobAddress}
                            {job.jobState ? `, ${job.jobState}` : ''}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    {/* Hours recorded on the job (mobile shows this bottom-right
                        of the card; here it reads as its own column). */}
                    <div className="hidden md:flex w-16 shrink-0 justify-end items-center gap-1">
                      {job.totalHours ? (
                        <>
                          <Clock size={12} className="text-faint shrink-0" />
                          <span className="text-xs font-semibold text-muted">{formatHours(job.totalHours)}</span>
                        </>
                      ) : null}
                    </div>

                    {/* Amount — hidden entirely when no visible job has one */}
                    {showAmountCol ? (
                      <div className="hidden md:block w-24 shrink-0 text-right">
                        {job.totalAmount > 0 ? <span className="text-xs font-bold text-ink">{fmt(job.totalAmount)}</span> : null}
                      </div>
                    ) : null}
                  </button>

                  {/* Status action(s) inline on the right */}
                  {/* Fixed width: "Start work" vs "Mark completed" differ in length —
                     an auto-width action area shifts every column row-by-row. */}
                  {selectMode ? null : <div className="hidden sm:flex w-44 shrink-0 justify-end">{renderActionBar(job)}</div>}
                  {selectMode ? null : <ChevronRight size={16} className="text-faint shrink-0" />}
                </div>
              </div>
            );
          })}
          </Fragment>
          ))}
          {serverMode ? (
            <>
              {loadingMore ? (
                <>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="border-t border-border-soft">
                      <SkeletonRow />
                    </div>
                  ))}
                </>
              ) : null}
              <div ref={sentinelRef} className="h-1" />
            </>
          ) : null}
        </div>
      )}

      {/* Sticky batch-invoice action bar */}
      {selectMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              {t.batchInvoice.selectedCount.replace('{{count}}', String(selectedJobs.length))}
            </span>
            {selectPool.length > 0 ? (
              <button onClick={toggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
                {allSelected ? t.batchInvoice.deselectAll : t.batchInvoice.selectAll}
              </button>
            ) : null}
            {allInvoiceable && invoiceClientCount > 1 ? (
              <span className="text-xs font-medium text-primary">{t.batchInvoice.multiClientHint.replace('{{count}}', String(invoiceClientCount))}</span>
            ) : null}
            <div className="flex-1" />
            <button onClick={exitSelect} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted hover:bg-border-soft">
              {t.batchInvoice.cancel}
            </button>
            {onBulkChangeClient ? (
              <button
                onClick={() => { if (selectedJobs.length) void onBulkChangeClient(selectedJobs.map(j => j.id)); }}
                disabled={selectedJobs.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border text-ink hover:bg-surface disabled:opacity-40"
              >
                <Users size={15} /> {t.bulkMoveClient}{selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}
              </button>
            ) : null}
            {onBulkArchive ? (
              <button
                onClick={runBulkArchive}
                disabled={!allArchivable || bulkArchiving}
                title={allArchivable
                  ? t.confirmArchiveBulk.replace('{{count}}', String(selectedJobs.length))
                  : t.archiveDisabledHint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-40"
              >
                <Archive size={15} /> {archivedTabActive ? t.bulkUnarchive : t.bulkArchive}{selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}
              </button>
            ) : null}
            {canDelete ? (
              <button
                onClick={runBulkDelete}
                disabled={selectedJobs.length === 0 || bulkDeleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
              >
                <Trash2 size={15} /> {t.bulkDelete}{selectedJobs.length > 0 ? ` · ${selectedJobs.length}` : ''}
              </button>
            ) : null}
            <Tooltip tip="createInvoice" labelled>
              <button
                onClick={runCreateInvoice}
                disabled={selectedJobs.length === 0 || !allInvoiceable || creatingInvoice}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-40"
              >
                <FileText size={15} /> {creatingInvoice ? t.batchInvoice.creating : t.batchInvoice.createButton}
              </button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      {/* Multi-client confirm — only when the selection spans >1 client. */}
      {multiConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setMultiConfirm(false)}>
          <div className="bg-card rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <FileText size={20} className="text-primary" />
            </div>
            <p className="text-lg font-bold text-ink">{t.batchInvoice.multiConfirmTitle}</p>
            <p className="text-sm text-muted mt-1">{t.batchInvoice.multiClientHint.replace('{{count}}', String(invoiceClientCount))}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setMultiConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted hover:bg-border-soft">
                {t.batchInvoice.cancel}
              </button>
              <button onClick={() => { setMultiConfirm(false); void doCreateInvoice(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:opacity-90">
                <FileText size={15} /> {t.batchInvoice.multiConfirmCreate.replace('{{count}}', String(invoiceClientCount))}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <JobsSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        loading={summaryLoading}
        totals={summaryTotals}
        filtered={filtersActive}
        statusLabels={t.statuses as unknown as Record<string, string>}
        formatMoney={fmt}
      />
    </div>
  );
}

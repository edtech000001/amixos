'use client';

// Web-only JobsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as JobsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { Fragment, useEffect, useMemo, useState } from 'react';
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
  ArrowRight,
  Send,
  ChevronDown,
  Building2,
  ArrowUpDown,
  Check,
  AlertTriangle,
  Clock,
  List,
} from 'lucide-react';
import { useLang } from '../../i18n';
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
  type JobsFilters,
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

export interface JobsListScreenProps {
  loading: boolean;
  jobs: JobListItem[];
  initialTab?: TabKey;
  onJobPress: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
  onGenerateInvoice: (id: string) => void;
  /** Batch-invoice: create one invoice from several completed same-client jobs.
   *  When omitted, the select-to-invoice toolbar is hidden. */
  onCreateInvoice?: (jobIds: string[]) => Promise<void> | void;
  onViewInvoice: (invoiceId: string) => void;
  onNewJob: () => void;
  onNewProposal: () => void;
  /** Whether the viewer may create jobs/proposals. Hides the "+ Nuevo"
   *  trigger + empty-state link when false. Keep in sync with the native
   *  variant. Defaults to true. */
  canCreate?: boolean;
  // Upcoming-job alert tiers (Ajustes → Trabajos, migration 046). Keep in
  // sync with JobsListScreen.tsx — the native variant declares the same prop.
  alertThresholds?: JobAlertThresholds;
}

const STATUS_PILL: Record<string, string> = {
  posible: 'bg-teal-100 text-teal-700',
  proposal: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-600',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-600',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-400',
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
  onViewInvoice,
  onNewJob,
  onNewProposal,
  canCreate = true,
  alertThresholds = DEFAULT_JOB_ALERT_THRESHOLDS,
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

  // Restore persisted filters once, after mount.
  useEffect(() => {
    const saved = parseJobsFilters(
      typeof window !== 'undefined' ? window.localStorage.getItem(JOBS_FILTERS_KEY) : null,
    );
    if (saved) {
      setSearch(saved.search ?? '');
      // A ?tab deep link wins over saved tabs.
      if (initialTab === 'all') {
        setTabs((saved.tabs ?? []).filter((k): k is StatusTabKey => (STATUS_TAB_KEYS as readonly string[]).includes(k)));
      }
      setSortBy(saved.sortBy ?? 'recent');
      setGroupBy(saved.groupBy ?? 'none');
      setDateFrom(saved.dateFrom ?? null);
      setDateTo(saved.dateTo ?? null);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change — only after restore, so defaults don't clobber saved.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const f: JobsFilters = { tabs, search, sortBy, groupBy, dateFrom, dateTo };
    window.localStorage.setItem(JOBS_FILTERS_KEY, JSON.stringify(f));
  }, [hydrated, tabs, search, sortBy, groupBy, dateFrom, dateTo]);

  const filtersActive = jobsFiltersActive({ tabs, search, sortBy, groupBy, dateFrom, dateTo });
  const dateActive = !!dateFrom || !!dateTo;
  const clearFilters = () => { setTabs([]); setSearch(''); setSortBy('recent'); setGroupBy('none'); setDateFrom(null); setDateTo(null); };

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
  // (the default "active" view) we hide closed work — invoiced + cancelled —
  // so the working list stays clean. Those are one tap away via their tab.
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
    return jobs.filter((j) => {
      const matchSearch = searchMatches(
        [j.title, j.estimateNumber, j.clientName, j.clientCompany, j.jobCity, j.jobState]
          .filter(Boolean)
          .join(' '),
        search,
      );
      return matchSearch && matchesTab(j) && jobInDateRange(j.scheduledDate, j.endDate, dateFrom, dateTo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const counts = useMemo(
    () =>
      TAB_KEYS.reduce((acc, k) => {
        if (k === 'all') acc[k] = jobs.length;
        else if (k === 'propuestas') acc[k] = jobs.filter((j) => PROPOSAL_STATUSES.includes(j.status)).length;
        else if (k === 'delegated') acc[k] = jobs.filter((j) => !!j.delegatedToBusinessName).length;
        else acc[k] = jobs.filter((j) => j.status === k).length;
        return acc;
      }, {} as Record<TabKey, number>),
    [jobs],
  );

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
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'scheduled')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-xs font-semibold text-blue-600">
            <Calendar size={11} /> {t.actions.schedule}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'proposal') {
      return (
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'sent')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-xs font-semibold text-blue-600">
            <Send size={11} /> {t.actions.markSent}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'sent' && !expired) {
      return (
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'accepted')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-emerald-50 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={11} /> {t.actions.markAccepted}
          </button>
          <button onClick={() => onUpdateStatus(job.id, 'declined')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 text-xs font-semibold text-red-500">
            <XCircle size={11} /> {t.actions.markDeclined}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'accepted') {
      return (
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'scheduled')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-xs font-semibold text-blue-600">
            <Calendar size={11} /> {t.actions.schedule}
          </button>
          <button onClick={() => onGenerateInvoice(job.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-purple-50 text-xs font-semibold text-purple-600">
            <FileText size={11} /> {t.actions.generateInvoice}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'scheduled') {
      return (
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'in_progress')} className="px-3 py-1.5 rounded-lg hover:bg-amber-50 text-xs font-semibold text-amber-600">
            {t.actions.startWork}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'in_progress') {
      return (
        <div className="flex items-center gap-2 border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onUpdateStatus(job.id, 'completed')} className="px-3 py-1.5 rounded-lg hover:bg-emerald-50 text-xs font-semibold text-emerald-600">
            {t.actions.markCompleted}
          </button>
          <div className="flex-1" />
          <button onClick={() => onUpdateStatus(job.id, 'cancelled')} className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-400">
            {t.actions.cancel}
          </button>
        </div>
      );
    }
    if (job.status === 'completed') {
      return (
        <div className="border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onGenerateInvoice(job.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-purple-50 text-xs font-semibold text-purple-600">
            <FileText size={12} /> {t.actions.generateInvoice}
          </button>
        </div>
      );
    }
    if (job.status === 'invoiced' && job.invoiceId) {
      return (
        <div className="border-t border-gray-50 px-5 py-2.5">
          <button onClick={() => onViewInvoice(job.invoiceId!)} className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline">
            <FileText size={12} /> {t.actions.viewInvoice} <ArrowRight size={11} />
          </button>
        </div>
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
  // All picked jobs must share a client to land on one invoice.
  const sameClient = new Set(selectedJobs.map(j => j.clientId ?? '∅')).size <= 1;
  const visibleInvoiceable = sections.flatMap(s => s.jobs).filter(isInvoiceable);
  const allSelected = visibleInvoiceable.length > 0 && visibleInvoiceable.every(j => selectedIds.has(j.id));
  const toggleSelectAll = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (visibleInvoiceable.every(j => prev.has(j.id))) {
        visibleInvoiceable.forEach(j => next.delete(j.id));
      } else {
        visibleInvoiceable.forEach(j => next.add(j.id));
      }
      return next;
    });
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const runCreateInvoice = async () => {
    if (!onCreateInvoice || selectedJobs.length === 0 || !sameClient || creatingInvoice) return;
    setCreatingInvoice(true);
    await onCreateInvoice(selectedJobs.map(j => j.id));
    setCreatingInvoice(false);
    exitSelect();
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t.countTotal.replace('{{count}}', String(jobs.length))}
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
            onClick={() => setNewMenuOpen((v) => !v)}
            className="flex items-center gap-1 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
          >
            <Plus size={15} /> {t.newDropdown.trigger} <ChevronDown size={14} />
          </button>
          ) : null}
          {newMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNewMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden z-20">
                <button
                  onClick={() => { setNewMenuOpen(false); onNewJob(); }}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 border-b border-gray-50 text-left"
                >
                  <ClipboardList size={18} className="text-gray-500 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{t.newDropdown.jobOption}</span>
                    <span className="block text-xs text-gray-400">{t.newDropdown.jobOptionSub}</span>
                  </span>
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); onNewProposal(); }}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 text-left"
                >
                  <FileText size={18} className="text-gray-500 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{t.newDropdown.proposalOption}</span>
                    <span className="block text-xs text-gray-400">{t.newDropdown.proposalOptionSub}</span>
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
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t.clearFilters}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        {filtersActive ? (
          <button
            onClick={clearFilters}
            title={t.clearFilters}
            aria-label={t.clearFilters}
            className="shrink-0 flex items-center justify-center p-2.5 rounded-2xl border border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 transition-colors"
          >
            <XCircle size={16} />
          </button>
        ) : null}
        {onCreateInvoice ? (
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            title={t.batchInvoice.selectButton}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
              selectMode
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText size={15} /> {selectMode ? t.batchInvoice.cancel : t.batchInvoice.selectButton}
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
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Calendar size={16} />
          </button>
          {dateMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDateMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t.dateFilter.title}
                </p>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t.dateFilter.from}</label>
                <input
                  type="date"
                  value={dateFrom ?? ''}
                  onChange={e => setDateFrom(e.target.value || null)}
                  className="w-full mb-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <label className="block text-xs font-medium text-gray-600 mb-1">{t.dateFilter.to}</label>
                <input
                  type="date"
                  value={dateTo ?? ''}
                  onChange={e => setDateTo(e.target.value || null)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dateActive ? (
                  <button
                    onClick={() => { setDateFrom(null); setDateTo(null); }}
                    className="mt-3 w-full py-2 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200"
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
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ArrowUpDown size={15} /> {t.sort.button}
          </button>
          {sortMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t.sort.sortByTitle}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {JOB_SORT_KEYS.map(k => {
                    const selected = sortBy === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setSortBy(k)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          selected ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {selected ? <Check size={12} /> : null}
                        {t.sort.by[k]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t.sort.groupByTitle}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_GROUP_KEYS.map(k => {
                    const selected = groupBy === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setGroupBy(k)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          selected ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {selected ? <Check size={12} /> : null}
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
            tabs.length === 0 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <List size={15} />
        </button>
        {STATUS_TAB_KEYS.map((k) => {
          const isActive = tabSet.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 text-xs font-semibold ${
                isActive ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {tabLabels[k]}
              {counts[k] > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {counts[k]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <ClipboardList size={40} className="text-gray-300" />
          <p className="text-sm text-gray-400 mt-3">{search || tabs.length > 0 ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && tabs.length === 0 && canCreate ? (
            <button onClick={onNewJob} className="text-primary text-sm font-medium mt-1 hover:underline">{t.createFirst}</button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(section => (
          <Fragment key={section.title ?? '__all__'}>
          {section.title ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{section.title}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                {section.jobs.length}
              </span>
            </div>
          ) : null}
          {section.jobs.map((job) => {
            const statusKey = job.status as keyof typeof t.statuses;
            const statusLabel = t.statuses[statusKey] ?? job.status;
            const pill = STATUS_PILL[job.status] ?? 'bg-blue-100 text-blue-700';
            const dot = STATUS_DOT[job.status] ?? 'bg-blue-500';
            const priorityKey = job.priority as keyof typeof t.priorities;
            const priorityLabel = t.priorities[priorityKey];
            const priorityColor = PRIORITY_COLORS[job.priority] ?? 'text-blue-500';
            const expired = isExpired(job);
            const isProposal = PROPOSAL_STATUSES.includes(job.status);
            // Upcoming-job alert tier. Skipped for proposal-stage cards
            // (they don't have a real scheduled date yet) so the indicator
            // only fires on jobs the owner actually needs to prep for.
            const alertMatch = !isProposal
              ? matchJobAlert(alertThresholds, job.scheduledDate)
              : null;
            const alertStyle = alertMatch ? JOB_ALERT_STYLE[alertMatch.level.color] : null;
            // Past the scheduled date and not done — red date + "overdue" badge.
            const overdue = !isProposal && isJobOverdue(alertThresholds, job.scheduledDate, job.status);
            // How long the project runs (multi-day span / estimated hours / time window).
            const durationText = formatProjectDuration(
              { startDate: job.scheduledDate, endDate: job.endDate, estimatedHours: job.estimatedHours, timeStart: job.timeStart, timeEnd: job.timeEnd },
              full.common.duration,
            );
            // chip copy: "Hoy" / "Mañana" / "En N días".
            const alertChipLabel = alertMatch
              ? alertMatch.daysUntil === 0
                ? t.alertChip.today
                : alertMatch.daysUntil === 1
                  ? t.alertChip.tomorrow
                  : t.alertChip.inDays.replace('{{count}}', String(alertMatch.daysUntil))
              : null;

            // Select mode: completed + un-invoiced jobs are pickable; others dim.
            const selectable = selectMode && isInvoiceable(job);
            const picked = selectedIds.has(job.id);
            return (
              <div
                key={job.id}
                className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity ${
                  selectMode && !selectable ? 'opacity-40' : ''
                } ${
                  picked
                    ? 'bg-primary/5 border-primary ring-1 ring-primary'
                    : overdue
                    ? 'bg-red-50 border-red-200 border-l-4 border-l-red-500'
                    : alertStyle
                      ? `bg-white border-gray-100 border-l-4 ${alertStyle.borderClass}`
                      : 'bg-white border-gray-100'
                }`}
              >
                <button
                  onClick={() => (selectable ? toggleSelect(job.id) : selectMode ? undefined : onJobPress(job.id))}
                  className={`w-full flex items-start gap-4 p-5 text-left ${overdue ? 'hover:bg-red-100/60' : 'hover:bg-gray-50'}`}
                >
                  {selectMode ? (
                    <span className={`w-5 h-5 mt-0.5 shrink-0 rounded-md border flex items-center justify-center ${
                      picked ? 'bg-primary border-primary' : selectable ? 'border-gray-300' : 'border-gray-200'
                    }`}>
                      {picked ? <Check size={13} className="text-white" /> : null}
                    </span>
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Title — full width on its own line so it isn't squeezed
                       by the status pills. */}
                    <div className="flex items-center gap-2 min-w-0">
                      {job.estimateNumber ? <span className="text-xs font-mono text-gray-400 shrink-0">{job.estimateNumber}</span> : null}
                      <span className="text-sm font-bold text-gray-900 truncate">{job.title}</span>
                    </div>
                    {job.clientName ? (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {job.clientName}
                        {job.clientCompany ? ` · ${job.clientCompany}` : ''}
                      </p>
                    ) : null}
                    {/* Status indicators — their own line, wrap as needed. */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {!isProposal && job.priority !== 'normal' ? (
                        <span className={`text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
                      ) : null}
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${pill}`}>{statusLabel}</span>
                      {expired ? <span className="text-xs text-orange-500 font-medium">{t.expired}</span> : null}
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      {alertStyle && alertChipLabel ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${alertStyle.bgClass} ${alertStyle.textClass}`}>
                          {alertChipLabel}
                        </span>
                      ) : null}
                      {isProposal && job.issueDate ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={12} />
                          {formatDateLong(job.issueDate, dateLoc)}
                          {job.expiryDate ? ` · ${t.dueShort.replace('{{date}}', formatDateLong(job.expiryDate, dateLoc))}` : ''}
                        </span>
                      ) : null}
                      {!isProposal && job.scheduledDate ? (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                          {overdue ? <AlertTriangle size={13} aria-label={overdueBadgeLabel} /> : <Calendar size={12} />}
                          {formatDateLong(job.scheduledDate, dateLoc)}
                          {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                        </span>
                      ) : null}
                      {durationText ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock size={12} />
                          {durationText}
                        </span>
                      ) : null}
                      {job.jobCity || job.jobAddress ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin size={12} />
                          {job.jobCity || job.jobAddress}
                          {job.jobState ? `, ${job.jobState}` : ''}
                        </span>
                      ) : null}
                      {job.totalAmount > 0 ? <span className="text-xs font-bold text-gray-700">{fmt(job.totalAmount)}</span> : null}
                      {job.delegatedToBusinessName ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-purple-600">
                          <Building2 size={12} />
                          {tw.delegatedBadge.replace('{{name}}', job.delegatedToBusinessName)}
                        </span>
                      ) : null}
                    </div>

                    {/* Lead / crew — its own right-aligned line near the bottom
                       so the lead is easy to scan, distinct from the meta row. */}
                    {job.leadName || job.workerNames.length > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-gray-500 font-medium mt-2">
                        <Users size={12} />
                        {job.leadName
                          ? `${t.leadPrefix}: ${job.leadName}`
                          : `${job.workerNames.slice(0, 2).join(', ')}${job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}`}
                      </div>
                    ) : null}
                  </div>
                  {selectMode ? null : <ChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />}
                </button>
                {selectMode ? null : renderActionBar(job)}
              </div>
            );
          })}
          </Fragment>
          ))}
        </div>
      )}

      {/* Sticky batch-invoice action bar */}
      {selectMode ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {t.batchInvoice.selectedCount.replace('{{count}}', String(selectedJobs.length))}
            </span>
            {visibleInvoiceable.length > 0 ? (
              <button onClick={toggleSelectAll} className="text-xs font-semibold text-primary hover:underline">
                {allSelected ? t.batchInvoice.deselectAll : t.batchInvoice.selectAll}
              </button>
            ) : null}
            {!sameClient ? (
              <span className="text-xs font-medium text-amber-600">{t.batchInvoice.sameClientHint}</span>
            ) : null}
            <div className="flex-1" />
            <button onClick={exitSelect} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
              {t.batchInvoice.cancel}
            </button>
            <button
              onClick={runCreateInvoice}
              disabled={selectedJobs.length === 0 || !sameClient || creatingInvoice}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-40"
            >
              <FileText size={15} /> {creatingInvoice ? t.batchInvoice.creating : t.batchInvoice.createButton}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

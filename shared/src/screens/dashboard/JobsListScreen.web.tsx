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
  FileText,
  Users,
  ArrowRight,
  Send,
  ChevronDown,
  Building2,
  ArrowUpDown,
  Check,
} from 'lucide-react';
import { useLang } from '../../i18n';
import { formatDateLong, formatTime12h } from '../../lib/format';
import { searchMatches, usStateName } from '../../lib/usStates';
import {
  matchJobAlert,
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
  issueDate: string | null;
  expiryDate: string | null;
  jobAddress: string | null;
  jobCity: string | null;
  jobState: string | null;
  invoiceId: string | null;
  clientName: string | null;
  clientCompany: string | null;
  workerNames: string[];
  /** Assignment marked is_lead (migration 033) — drives sort/group by lead. */
  leadName?: string | null;
  delegatedToBusinessName?: string | null;
  delegatedFromBusinessName?: string | null;
}

const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];
const TAB_KEYS = ['all', 'propuestas', 'posible', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled', 'delegated'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export interface JobsListScreenProps {
  loading: boolean;
  jobs: JobListItem[];
  initialTab?: TabKey;
  onJobPress: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => Promise<void> | void;
  onGenerateInvoice: (id: string) => void;
  onViewInvoice: (invoiceId: string) => void;
  onNewJob: () => void;
  onNewProposal: () => void;
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
  onViewInvoice,
  onNewJob,
  onNewProposal,
  alertThresholds = DEFAULT_JOB_ALERT_THRESHOLDS,
}: JobsListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const tw = full.dashboard.workspaces;
  // Restore the saved view (tab/search/sort/group) so navigating into a job
  // and back — or refreshing — keeps the filters. An explicit ?tab= deep link
  // (initialTab !== 'all') still wins for the tab.
  const saved = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return parseJobsFilters(window.localStorage.getItem(JOBS_FILTERS_KEY));
  }, []);
  const savedTab = saved?.tab && (TAB_KEYS as readonly string[]).includes(saved.tab) ? (saved.tab as TabKey) : null;
  const [search, setSearch] = useState(saved?.search ?? '');
  const [tab, setTab] = useState<TabKey>(initialTab !== 'all' ? initialTab : (savedTab ?? 'all'));
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<JobSortKey>(saved?.sortBy ?? 'recent');
  const [groupBy, setGroupBy] = useState<JobGroupKey>(saved?.groupBy ?? 'none');

  // Persist on any change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const f: JobsFilters = { tab, search, sortBy, groupBy };
    window.localStorage.setItem(JOBS_FILTERS_KEY, JSON.stringify(f));
  }, [tab, search, sortBy, groupBy]);

  const filtersActive = jobsFiltersActive({ tab, search, sortBy, groupBy });
  const clearFilters = () => { setTab('all'); setSearch(''); setSortBy('recent'); setGroupBy('none'); };

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

  const matchesTab = (j: JobListItem) => {
    if (tab === 'all') return true;
    if (tab === 'propuestas') return PROPOSAL_STATUSES.includes(j.status);
    if (tab === 'delegated') return !!j.delegatedToBusinessName;
    return j.status === tab;
  };

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch = searchMatches(
        [j.title, j.estimateNumber, j.clientName, j.clientCompany, j.jobCity, j.jobState]
          .filter(Boolean)
          .join(' '),
        search,
      );
      return matchSearch && matchesTab(j);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, search, tab]);

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
  const totalRevenue = jobs
    .filter((j) => j.status === 'completed' || j.status === 'invoiced')
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

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
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
            {totalRevenue > 0 ? (
              <span className="text-emerald-600 font-medium">
                {' · '}
                {t.completedValue.replace('{{amount}}', fmt(totalRevenue))}
              </span>
            ) : null}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setNewMenuOpen((v) => !v)}
            className="flex items-center gap-1 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90"
          >
            <Plus size={15} /> {t.newDropdown.trigger} <ChevronDown size={14} />
          </button>
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
            className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
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

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5">
        {filtersActive ? (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100"
          >
            <XCircle size={13} /> {t.clearFilters}
          </button>
        ) : null}
        {TAB_KEYS.map((k) => {
          const isActive = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
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
          <p className="text-sm text-gray-400 mt-3">{search || tab !== 'all' ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && tab === 'all' ? (
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
            // chip copy: "Hoy" / "Mañana" / "En N días".
            const alertChipLabel = alertMatch
              ? alertMatch.daysUntil === 0
                ? t.alertChip.today
                : alertMatch.daysUntil === 1
                  ? t.alertChip.tomorrow
                  : t.alertChip.inDays.replace('{{count}}', String(alertMatch.daysUntil))
              : null;

            return (
              <div
                key={job.id}
                className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
                  alertStyle ? `border-l-4 ${alertStyle.borderClass}` : ''
                }`}
              >
                <button onClick={() => onJobPress(job.id)} className="w-full flex items-start gap-4 p-5 hover:bg-gray-50 text-left">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {job.estimateNumber ? <span className="text-xs font-mono text-gray-400 shrink-0">{job.estimateNumber}</span> : null}
                          <span className="text-sm font-bold text-gray-900 truncate">{job.title}</span>
                        </div>
                        {job.clientName ? (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {job.clientName}
                            {job.clientCompany ? ` · ${job.clientCompany}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isProposal && job.priority !== 'normal' ? (
                          <span className={`text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
                        ) : null}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${pill}`}>{statusLabel}</span>
                        {expired ? <span className="text-xs text-orange-500 font-medium">{t.expired}</span> : null}
                      </div>
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
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={12} />
                          {formatDateLong(job.scheduledDate, dateLoc)}
                          {job.timeStart ? ` · ${formatTime12h(job.timeStart)}` : ''}
                        </span>
                      ) : null}
                      {job.jobCity || job.jobAddress ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin size={12} />
                          {job.jobCity || job.jobAddress}
                          {job.jobState ? `, ${job.jobState}` : ''}
                        </span>
                      ) : null}
                      {job.workerNames.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Users size={12} />
                          {job.workerNames.slice(0, 2).join(', ')}
                          {job.workerNames.length > 2 ? ` +${job.workerNames.length - 2}` : ''}
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
                  </div>
                  <ChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />
                </button>
                {renderActionBar(job)}
              </div>
            );
          })}
          </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

// Web-only JobsListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale: shared RN screens render unstyled on web). Same exported
// API as JobsListScreen.tsx so the web page wrapper is untouched and the
// bundler resolves this .web.tsx variant automatically.

import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useLang } from '../../i18n';
import { formatDateLong, formatTime12h } from '../../lib/format';
import { searchMatches } from '../../lib/usStates';

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
}: JobsListScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const tw = full.dashboard.workspaces;
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

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

      {/* Search */}
      <div className="relative mb-3">
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

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5">
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
          {filtered.map((job) => {
            const statusKey = job.status as keyof typeof t.statuses;
            const statusLabel = t.statuses[statusKey] ?? job.status;
            const pill = STATUS_PILL[job.status] ?? 'bg-blue-100 text-blue-700';
            const dot = STATUS_DOT[job.status] ?? 'bg-blue-500';
            const priorityKey = job.priority as keyof typeof t.priorities;
            const priorityLabel = t.priorities[priorityKey];
            const priorityColor = PRIORITY_COLORS[job.priority] ?? 'text-blue-500';
            const expired = isExpired(job);
            const isProposal = PROPOSAL_STATUSES.includes(job.status);

            return (
              <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
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
        </div>
      )}
    </div>
  );
}

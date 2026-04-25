'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Briefcase, Calendar, MapPin,
  ChevronRight, AlertTriangle, Clock, CheckCircle2,
  XCircle, FileText, Users, ArrowRight, Send, ChevronDown,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/i18n/LangProvider';

interface Job {
  id: string;
  client_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  scheduled_date: string | null;
  time_start: string | null;
  total_amount: number;
  estimate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  created_at: string;
  clients: { first_name: string; last_name: string; company: string | null } | null;
  job_assignments: { worker_name: string | null; employees: { first_name: string; last_name: string } | null }[];
}

const STATUS_VISUALS: Record<string, { color: string; dot: string }> = {
  proposal:    { color: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400' },
  sent:        { color: 'bg-blue-100 text-blue-600',        dot: 'bg-blue-500' },
  accepted:    { color: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500' },
  declined:    { color: 'bg-red-100 text-red-600',          dot: 'bg-red-400' },
  scheduled:   { color: 'bg-blue-100 text-blue-700',        dot: 'bg-blue-500' },
  in_progress: { color: 'bg-amber-100 text-amber-700',      dot: 'bg-amber-500' },
  completed:   { color: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500' },
  cancelled:   { color: 'bg-gray-100 text-gray-400',        dot: 'bg-gray-400' },
  invoiced:    { color: 'bg-purple-100 text-purple-700',    dot: 'bg-purple-500' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low:    'text-gray-400',
  normal: 'text-blue-500',
  high:   'text-orange-500',
  urgent: 'text-red-500',
};

const PROPOSAL_STATUSES = ['proposal', 'sent', 'accepted', 'declined'];

const TAB_KEYS = ['all', 'propuestas', 'scheduled', 'in_progress', 'completed', 'invoiced', 'cancelled'] as const;
type TabKey = typeof TAB_KEYS[number];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function isExpired(j: Job) {
  return j.expiry_date && j.status === 'sent' && new Date(j.expiry_date) < new Date();
}

export default function TrabajosPage() {
  const { t: full } = useLang();
  const t = full.dashboard.jobs;
  const dateLoc = full.dashboard.dateLocale;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const tabLabels: Record<TabKey, string> = {
    all: t.tabs.all,
    propuestas: t.tabs.proposals,
    scheduled: t.tabs.scheduled,
    in_progress: t.tabs.in_progress,
    completed: t.tabs.completed,
    invoiced: t.tabs.invoiced,
    cancelled: t.tabs.cancelled,
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && TAB_KEYS.includes(urlTab as TabKey)) setTab(urlTab as TabKey);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('jobs')
      .select(`
        *,
        clients(first_name, last_name, company),
        job_assignments(worker_name, employees(first_name, last_name))
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    setJobs((data ?? []) as Job[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    await supabase.from('jobs').update(update).eq('id', id);
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...update } : j));
  };

  const matchesTab = (j: Job) => {
    if (tab === 'all') return true;
    if (tab === 'propuestas') return PROPOSAL_STATUSES.includes(j.status);
    return j.status === tab;
  };

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = [
      j.title, j.estimate_number, j.clients?.first_name, j.clients?.last_name,
      j.clients?.company, j.job_city,
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
    return matchSearch && matchesTab(j);
  });

  const counts = TAB_KEYS.reduce((acc, k) => {
    if (k === 'all') acc[k] = jobs.length;
    else if (k === 'propuestas') acc[k] = jobs.filter(j => PROPOSAL_STATUSES.includes(j.status)).length;
    else acc[k] = jobs.filter(j => j.status === k).length;
    return acc;
  }, {} as Record<TabKey, number>);

  const pendingValue = jobs.filter(j => j.status === 'sent' && !isExpired(j))
    .reduce((s, j) => s + j.total_amount, 0);
  const totalRevenue = jobs.filter(j => j.status === 'completed' || j.status === 'invoiced')
    .reduce((s, j) => s + j.total_amount, 0);
  const inProgressRevenue = jobs.filter(j => j.status === 'in_progress')
    .reduce((s, j) => s + j.total_amount, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t.countTotal.replace('{{count}}', String(jobs.length))}
            {pendingValue > 0 && <span className="ml-2 text-blue-600 font-medium">· {t.pendingValue.replace('{{amount}}', fmt(pendingValue))}</span>}
            {inProgressRevenue > 0 && <span className="ml-2 text-amber-600 font-medium">· {t.inProgressValue.replace('{{amount}}', fmt(inProgressRevenue))}</span>}
            {totalRevenue > 0 && <span className="ml-2 text-emerald-600 font-medium">· {t.completedValue.replace('{{amount}}', fmt(totalRevenue))}</span>}
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <Button size="md" onClick={() => setNewMenuOpen(!newMenuOpen)}>
            <Plus size={15} className="mr-1.5"/> {t.newDropdown.trigger} <ChevronDown size={14} className="ml-1"/>
          </Button>
          {newMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
              <Link href="/dashboard/trabajos/nuevo"
                onClick={() => setNewMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50">
                <Briefcase size={16} className="text-gray-500"/>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.newDropdown.jobOption}</p>
                  <p className="text-xs text-gray-400">{t.newDropdown.jobOptionSub}</p>
                </div>
              </Link>
              <Link href="/dashboard/trabajos/nuevo?modo=propuesta"
                onClick={() => setNewMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <FileText size={16} className="text-gray-500"/>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.newDropdown.proposalOption}</p>
                  <p className="text-xs text-gray-400">{t.newDropdown.proposalOptionSub}</p>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col gap-3 mb-5">
        <Input placeholder={t.searchPlaceholder} value={search}
          onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>}/>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TAB_KEYS.map(k => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                tab === k
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {tabLabels[k]}
              {counts[k] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === k ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{counts[k]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-1">{[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
          ))}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Briefcase size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">{search || tab !== 'all' ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && tab === 'all' && (
            <Link href="/dashboard/trabajos/nuevo" className="text-primary text-sm font-medium hover:underline mt-1 inline-block">
              {t.createFirst}
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(job => {
            const statusKey = job.status as keyof typeof t.statuses;
            const statusLabel = t.statuses[statusKey] ?? job.status;
            const visual = STATUS_VISUALS[job.status] ?? STATUS_VISUALS.scheduled;
            const priorityKey = job.priority as keyof typeof t.priorities;
            const priorityLabel = t.priorities[priorityKey];
            const priorityColor = PRIORITY_COLORS[job.priority] ?? 'text-blue-500';
            const clientName = job.clients
              ? `${job.clients.first_name} ${job.clients.last_name}`
              : null;
            const workers = job.job_assignments.map(a =>
              a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name
            ).filter(Boolean);
            const expired = isExpired(job);
            const isProposal = PROPOSAL_STATUSES.includes(job.status);

            return (
              <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start gap-4 p-5">
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${visual.dot}`}/>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {job.estimate_number && (
                            <span className="text-xs font-mono text-gray-400">{job.estimate_number}</span>
                          )}
                          <Link href={`/dashboard/trabajos/${job.id}`}
                            className="text-sm font-bold text-gray-900 hover:text-primary transition-colors truncate block">
                            {job.title}
                          </Link>
                        </div>
                        {clientName && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {clientName}{job.clients?.company ? ` · ${job.clients.company}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isProposal && job.priority !== 'normal' && (
                          <span className={`text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
                        )}
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${visual.color}`}>
                          {statusLabel}
                        </span>
                        {expired && <span className="text-xs text-orange-500 font-medium">{t.expired}</span>}
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      {isProposal && job.issue_date && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={12}/>
                          {new Date(job.issue_date + 'T12:00:00').toLocaleDateString(dateLoc, { day: 'numeric', month: 'short' })}
                          {job.expiry_date && ` · ${t.dueShort.replace('{{date}}', new Date(job.expiry_date + 'T12:00:00').toLocaleDateString(dateLoc, { day: 'numeric', month: 'short' }))}`}
                        </span>
                      )}
                      {!isProposal && job.scheduled_date && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={12}/>
                          {new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString(dateLoc, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {job.time_start && ` · ${job.time_start.slice(0,5)}`}
                        </span>
                      )}
                      {(job.job_city || job.job_address) && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin size={12}/>
                          {job.job_city || job.job_address}
                          {job.job_state && `, ${job.job_state}`}
                        </span>
                      )}
                      {workers.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Users size={12}/>
                          {workers.slice(0, 2).join(', ')}{workers.length > 2 ? ` +${workers.length - 2}` : ''}
                        </span>
                      )}
                      {job.total_amount > 0 && (
                        <span className="text-xs font-bold text-gray-700">{fmt(job.total_amount)}</span>
                      )}
                    </div>
                  </div>

                  {/* Right actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Link href={`/dashboard/trabajos/${job.id}`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      <ChevronRight size={16} className="text-gray-400"/>
                    </Link>
                  </div>
                </div>

                {/* Status actions bar — Proposal phase */}
                {job.status === 'proposal' && (
                  <div className="border-t border-gray-50 px-5 py-2.5 flex items-center gap-2">
                    <button onClick={() => updateStatus(job.id, 'sent')}
                      className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <Send size={11}/> {t.actions.markSent}
                    </button>
                    <button onClick={() => updateStatus(job.id, 'cancelled')}
                      className="text-xs text-gray-400 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-auto">
                      {t.actions.cancel}
                    </button>
                  </div>
                )}

                {job.status === 'sent' && !expired && (
                  <div className="border-t border-gray-50 px-5 py-2.5 flex items-center gap-2">
                    <button onClick={() => updateStatus(job.id, 'accepted')}
                      className="text-xs font-semibold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <CheckCircle2 size={11}/> {t.actions.markAccepted}
                    </button>
                    <button onClick={() => updateStatus(job.id, 'declined')}
                      className="text-xs font-semibold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <XCircle size={11}/> {t.actions.markDeclined}
                    </button>
                    <button onClick={() => updateStatus(job.id, 'cancelled')}
                      className="text-xs text-gray-400 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-auto">
                      {t.actions.cancel}
                    </button>
                  </div>
                )}

                {job.status === 'accepted' && (
                  <div className="border-t border-gray-50 px-5 py-2.5 flex items-center gap-2">
                    <button onClick={() => updateStatus(job.id, 'scheduled')}
                      className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <Calendar size={11}/> {t.actions.schedule}
                    </button>
                    <Link href={`/dashboard/trabajos/${job.id}?action=invoice`}
                      className="text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <FileText size={11}/> {t.actions.generateInvoice}
                    </Link>
                    <button onClick={() => updateStatus(job.id, 'cancelled')}
                      className="text-xs text-gray-400 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-auto">
                      {t.actions.cancel}
                    </button>
                  </div>
                )}

                {/* Status actions bar — Work phase */}
                {job.status === 'scheduled' && (
                  <div className="border-t border-gray-50 px-5 py-2.5 flex items-center gap-2">
                    <button onClick={() => updateStatus(job.id, 'in_progress')}
                      className="text-xs font-semibold text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      {t.actions.startWork}
                    </button>
                    <button onClick={() => updateStatus(job.id, 'cancelled')}
                      className="text-xs text-gray-400 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-auto">
                      {t.actions.cancel}
                    </button>
                  </div>
                )}

                {job.status === 'in_progress' && (
                  <div className="border-t border-gray-50 px-5 py-2.5 flex items-center gap-2">
                    <button onClick={() => updateStatus(job.id, 'completed')}
                      className="text-xs font-semibold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      {t.actions.markCompleted}
                    </button>
                    <button onClick={() => updateStatus(job.id, 'cancelled')}
                      className="text-xs text-gray-400 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-auto">
                      {t.actions.cancel}
                    </button>
                  </div>
                )}

                {job.status === 'completed' && (
                  <div className="border-t border-gray-50 px-5 py-2.5">
                    <Link href={`/dashboard/trabajos/${job.id}?action=invoice`}
                      className="text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1">
                      <FileText size={12}/> {t.actions.generateInvoice}
                    </Link>
                  </div>
                )}

                {job.status === 'invoiced' && job.invoice_id && (
                  <div className="border-t border-gray-50 px-5 py-2.5">
                    <Link href={`/dashboard/facturas/${job.invoice_id}`}
                      className="text-xs font-semibold text-purple-600 hover:underline flex items-center gap-1">
                      <FileText size={12}/> {t.actions.viewInvoice} <ArrowRight size={11}/>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

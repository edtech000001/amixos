'use client';

// Purpose-built home for the "field" role (crew). Instead of the owner's
// revenue/invoice widget grid (which RLS would leave empty for them), a field
// worker lands here: clock in/out + the jobs they're assigned to, with a
// one-tap status advance. Data + writes come from the shared fieldHome module
// so web and mobile behave identically.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Play, CheckCircle2, CalendarDays, Briefcase, TrendingUp, Plus, type LucideIcon } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  fetchFieldHome,
  fetchFieldClients,
  logFieldJob,
  clockIn as doClockIn,
  clockOut as doClockOut,
  updateFieldJobStatus,
  formatHours,
  type FieldHomeJob,
  type FieldHomeStats,
  type FieldClient,
  type OpenTimesheet,
} from '@amixos/shared/lib/fieldHome';
import { firstName } from '@amixos/shared/lib/userName';
import { LogJobModal } from '@/components/dashboard/LogJobModal';

const JOB_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-600',
  in_progress: 'bg-orange-100 text-orange-600',
  accepted: 'bg-violet-100 text-violet-600',
};

export function FieldHome() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, loading: appLoading } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard;
  const f = t.fieldHome;

  const [jobs, setJobs] = useState<FieldHomeJob[]>([]);
  const [open, setOpen] = useState<OpenTimesheet | null>(null);
  const [stats, setStats] = useState<FieldHomeStats | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [clients, setClients] = useState<FieldClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!business || !user) return;
    const data = await fetchFieldHome(supabase, business.id, user.id);
    setJobs(data.jobs);
    setOpen(data.openTimesheet);
    setStats(data.stats);
    setEmployeeId(data.employeeId);
    setLoading(false);
  }, [business?.id, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const toggleClock = async () => {
    if (!business || !user || busy) return;
    setBusy(true);
    setError(false);
    if (open) {
      const ok = await doClockOut(supabase, open);
      if (ok) { setOpen(null); void load(); } else setError(true);
    } else {
      const ts = await doClockIn(supabase, business.id, user.id, employeeId);
      if (ts) setOpen(ts); else setError(true);
    }
    setBusy(false);
  };

  const advance = async (job: FieldHomeJob, next: string) => {
    setError(false);
    const ok = await updateFieldJobStatus(supabase, job.id, next);
    // Optimistic, then refetch so the lists + summary counts reconcile
    // (a completed job leaves the active list and bumps "completed (mo.)").
    if (ok) { setJobs(prev => prev.map(j => (j.id === job.id ? { ...j, status: next } : j))); void load(); }
    else setError(true);
  };

  const openLog = () => {
    setLogOpen(true);
    if (clients.length === 0 && business) {
      setClientsLoading(true);
      void fetchFieldClients(supabase, business.id).then(setClients).finally(() => setClientsLoading(false));
    }
  };

  const handleLog = async (input: { title: string; clientId: string | null; description: string | null }) => {
    if (!business) return false;
    const ok = await logFieldJob(supabase, {
      businessId: business.id,
      employeeId,
      title: input.title,
      clientId: input.clientId,
      completedDate: new Date().toISOString().split('T')[0],
      description: input.description,
    });
    if (ok) void load();
    return ok;
  };

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(t.dateLocale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const fmtDate = (dateStr: string | null) => {
    if (!dateStr) return f.noDate;
    const date = new Date(`${dateStr}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return t.home.upcomingJobs.today;
    if (diff === 1) return t.home.upcomingJobs.tomorrow;
    return new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short' }).format(date);
  };

  if (appLoading || loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayJobs = jobs.filter(j => j.scheduledDate === todayStr);
  const upcomingJobs = jobs.filter(j => !j.scheduledDate || j.scheduledDate > todayStr);

  const JobCard = ({ job }: { job: FieldHomeJob }) => {
    const statusKey = job.status as keyof typeof t.jobs.statuses;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <button onClick={() => router.push(`/dashboard/trabajos/${job.id}`)} className="w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 truncate">{job.title}</p>
                {job.isLead && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{f.lead}</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{job.clientName ?? f.noClient}</p>
              {(job.jobAddress || job.jobCity) && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 truncate">
                  <MapPin size={12} className="shrink-0" />
                  {[job.jobAddress, job.jobCity, job.jobState].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">{fmtDate(job.scheduledDate)}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${JOB_STATUS_PILL[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {t.jobs.statuses[statusKey] ?? job.status}
              </span>
            </div>
          </div>
        </button>
        {/* Field worker can advance the status of a job they're on. */}
        {(job.status === 'scheduled' || job.status === 'accepted') && (
          <button onClick={() => advance(job, 'in_progress')} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-50 text-orange-600 text-sm font-semibold hover:bg-orange-100 transition-colors">
            <Play size={15} /> {f.start}
          </button>
        )}
        {job.status === 'in_progress' && (
          <button onClick={() => advance(job, 'completed')} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-semibold hover:bg-emerald-100 transition-colors">
            <CheckCircle2 size={15} /> {f.complete}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{f.greeting}{firstName(user?.name) ? ',' : ''}</h1>
          {/* Crew don't get the business logo/name header — greet them by name. */}
          {firstName(user?.name) && <p className="text-lg font-semibold text-gray-800 mt-1">{firstName(user?.name)}</p>}
        </div>
        <button
          onClick={openLog}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 shrink-0"
        >
          <Plus size={16} /> {f.logJob}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{f.clockError}</div>
      )}

      {/* Clock in/out */}
      <div className={`rounded-2xl shadow-sm p-5 mb-6 ${open ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-100'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${open ? 'bg-white/15' : 'bg-primary/10'}`}>
              <Clock size={20} className={open ? 'text-white' : 'text-primary'} />
            </div>
            <p className={`text-sm font-medium truncate ${open ? 'text-white' : 'text-gray-700'}`}>
              {open ? f.clockedInSince.replace('{{time}}', fmtTime(open.clockIn)) : f.notClockedIn}
            </p>
          </div>
          <button
            onClick={toggleClock}
            disabled={busy}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 shrink-0 ${open ? 'bg-white text-emerald-700' : 'bg-primary text-white hover:opacity-90'}`}
          >
            {open ? f.clockOut : f.clockIn}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {([
          { label: f.statAssigned, value: String(stats?.assignedActive ?? 0), icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: f.statCompleted, value: String(stats?.completedMonth ?? 0), icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10' },
          { label: f.statHoursWeek, value: formatHours(stats?.hoursWeek ?? 0), icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50' },
          { label: f.statHoursMonth, value: formatHours(stats?.hoursMonth ?? 0), icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
        ] as { label: string; value: string; icon: LucideIcon; color: string; bg: string }[]).map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Today */}
      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <CalendarDays size={16} className="text-primary" /> {f.todayTitle}
      </h2>
      {todayJobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-10 flex flex-col items-center mb-6">
          <Briefcase size={36} className="text-gray-300" />
          <p className="text-gray-400 text-sm mt-3">{f.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {todayJobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      )}

      {/* Upcoming */}
      {upcomingJobs.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{f.upcomingTitle}</h2>
          <div className="flex flex-col gap-3">
            {upcomingJobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        </>
      )}

      <LogJobModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        clients={clients}
        clientsLoading={clientsLoading}
        onSubmit={handleLog}
      />
    </div>
  );
}

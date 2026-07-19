'use client';

// Purpose-built home for the "field" role (crew). Instead of the owner's
// revenue/invoice widget grid (which RLS would leave empty for them), a field
// worker lands here: clock in/out + the jobs they're assigned to, with a
// one-tap status advance. Data + writes come from the shared fieldHome module
// so web and mobile behave identically.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, MapPin, Play, CheckCircle2, CalendarDays, Briefcase, Timer, type LucideIcon } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import {
  fetchFieldHome,
  clockIn as doClockIn,
  clockOut as doClockOut,
  updateFieldJobStatus,
  formatHours,
  type FieldHomeJob,
  type FieldHomeStats,
  type OpenTimesheet,
} from '@amixos/shared/lib/fieldHome';
import { normalizeFrequency, parsePayrollAnchor } from '@amixos/shared/lib/payroll';
import { can } from '@amixos/shared/lib/permissions';
import { firstName } from '@amixos/shared/lib/userName';

const JOB_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-600',
  in_progress: 'bg-orange-100 text-orange-600',
  accepted: 'bg-violet-100 text-violet-600',
  completed: 'bg-emerald-100 text-emerald-600',
};

type HoursView = 'active' | 'week' | 'month';

export function FieldHome() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, loading: appLoading, readOnly } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard;
  const f = t.fieldHome;
  // Clock in/out is on by default for crew; hidden when an owner turns the
  // clockInOut capability off for the role.
  const showClock = can.clockInOut(currentRole);

  const [jobs, setJobs] = useState<FieldHomeJob[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<FieldHomeJob[]>([]);
  const [open, setOpen] = useState<OpenTimesheet | null>(null);
  const [stats, setStats] = useState<FieldHomeStats | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [hoursView, setHoursView] = useState<HoursView>('active');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!business || !user) return;
    const data = await fetchFieldHome(supabase, business.id, user.id, {
      frequency: normalizeFrequency(business.payroll_frequency),
      anchor: parsePayrollAnchor(business.payroll_anchor_date),
      customDays: (business as { payroll_custom_days?: number | null }).payroll_custom_days ?? null,
    });
    setJobs(data.jobs);
    setRecentCompleted(data.recentCompleted);
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
      <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-4">
        <button onClick={() => router.push(`/dashboard/trabajos/${job.id}`)} className="w-full text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink truncate">{job.title}</p>
                {job.isLead && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{f.lead}</span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5 truncate">{job.clientName ?? f.noClient}</p>
              {(job.jobAddress || job.jobCity) && (
                <p className="text-xs text-faint mt-1 flex items-center gap-1 truncate">
                  <MapPin size={12} className="shrink-0" />
                  {[job.jobAddress, job.jobCity, job.jobState].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">{fmtDate(job.status === 'completed' ? (job.completedDate ?? job.scheduledDate) : job.scheduledDate)}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${JOB_STATUS_PILL[job.status] ?? 'bg-border-soft text-muted'}`}>
                {t.jobs.statuses[statusKey] ?? job.status}
              </span>
            </div>
          </div>
        </button>
        {/* Field worker can advance the status of a job they're on. Hidden in
            read-only "Ver como" preview. */}
        {!readOnly && (job.status === 'scheduled' || job.status === 'accepted') && (
          <button onClick={() => advance(job, 'in_progress')} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500/10 text-orange-600 text-sm font-semibold hover:bg-orange-100 transition-colors">
            <Play size={15} /> {f.start}
          </button>
        )}
        {!readOnly && job.status === 'in_progress' && (
          <button onClick={() => advance(job, 'completed')} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 text-sm font-semibold hover:bg-emerald-100 transition-colors">
            <CheckCircle2 size={15} /> {f.complete}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{f.greeting}{firstName(user?.name) ? ',' : ''}</h1>
          {/* Crew don't get the business logo/name header — greet them by name. */}
          {firstName(user?.name) && <p className="text-lg font-semibold text-ink mt-1">{firstName(user?.name)}</p>}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100 text-sm text-red-600">{f.clockError}</div>
      )}

      {/* Clock in/out — opt-in per role. */}
      {showClock && (
        <div className={`rounded-2xl shadow-sm p-5 mb-6 ${open ? 'bg-emerald-600 text-white' : 'bg-card border border-border-soft'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${open ? 'bg-white/15' : 'bg-primary/10'}`}>
                <Clock size={20} className={open ? 'text-white' : 'text-primary'} />
              </div>
              <p className={`text-sm font-medium truncate ${open ? 'text-white' : 'text-ink'}`}>
                {open ? f.clockedInSince.replace('{{time}}', fmtTime(open.clockIn)) : f.notClockedIn}
              </p>
            </div>
            <button
              onClick={toggleClock}
              disabled={busy || readOnly}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 shrink-0 ${open ? 'bg-card text-emerald-700' : 'bg-primary text-white hover:opacity-90'}`}
            >
              {open ? f.clockOut : f.clockIn}
            </button>
          </div>
        </div>
      )}

      {/* Summary stats — assigned, completed, and a single hours tile that
          toggles between active (unpaid) / week / month. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {([
          { label: f.statAssigned, value: String(stats?.assignedActive ?? 0), icon: Briefcase, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
          { label: f.statCompleted, value: String(stats?.completedMonth ?? 0), icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10' },
        ] as { label: string; value: string; icon: LucideIcon; color: string; bg: string }[]).map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-2xl border border-border-soft shadow-sm p-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-xl font-bold text-ink">{value}</p>
            <p className="text-xs text-muted mt-0.5">{label}</p>
          </div>
        ))}

        {/* Hours tile — spans the remaining 2 columns on wide screens. */}
        <div className="col-span-2 bg-card rounded-2xl border border-border-soft shadow-sm p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Timer size={18} className="text-orange-500" />
            </div>
            {/* Active / Week / Month segmented toggle. */}
            <div className="inline-flex rounded-lg bg-border-soft p-0.5 text-xs font-semibold">
              {([
                { key: 'active', label: f.hoursToggleActive },
                { key: 'week', label: f.hoursToggleWeek },
                { key: 'month', label: f.hoursToggleMonth },
              ] as { key: HoursView; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setHoursView(key)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${hoursView === key ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xl font-bold text-ink">
            {formatHours(hoursView === 'active' ? (stats?.hoursActive ?? 0) : hoursView === 'week' ? (stats?.hoursWeek ?? 0) : (stats?.hoursMonth ?? 0))}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {hoursView === 'active' ? f.statActiveHours : hoursView === 'week' ? f.statHoursWeek : f.statHoursMonth}
          </p>
        </div>
      </div>

      {/* Today */}
      <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
        <CalendarDays size={16} className="text-primary" /> {f.todayTitle}
      </h2>
      {todayJobs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm py-10 flex flex-col items-center mb-6">
          <Briefcase size={36} className="text-faint" />
          <p className="text-faint text-sm mt-3">{f.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          {todayJobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      )}

      {/* Upcoming */}
      {upcomingJobs.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-ink mb-3">{f.upcomingTitle}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {upcomingJobs.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        </>
      )}

      {/* Recent projects completed — the last 7 days. */}
      {recentCompleted.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-ink mb-3 mt-6 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" /> {f.recentCompletedTitle}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {recentCompleted.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        </>
      )}

    </div>
  );
}

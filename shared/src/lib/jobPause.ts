// Pausing a job (migration 246).
//
// A job gets paused when the work is blocked on something outside the crew's
// control — material hasn't arrived, the client hasn't decided, the weather
// won't allow it. The crew then moves to other jobs instead of the job sitting
// "in progress" holding them.
//
// Paused is NOT a pipeline step and NOT terminal like cancelled: it SUSPENDS
// whatever the job was, and resuming restores exactly that. `paused_from` is
// why — you can be blocked before you start (scheduled) as easily as mid-job
// (in_progress), and inferring the resume target would get the common
// "waiting on material before we start" case wrong.
//
// What pausing does NOT do: clear the scheduled date. The calendar keeps
// showing the original plan, which is usually what you want to renegotiate
// from. The crew is freed by crewFinderData / jobConflicts, which skip paused
// jobs the same way they skip cancelled ones.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Statuses a job can be paused FROM — mirrors the jobs_paused_from_check
 *  constraint in migration 246. Completed/invoiced/cancelled/declined work
 *  isn't blocked on anything, so there's nothing to hold. */
export const PAUSABLE_STATUSES = [
  'posible', 'proposal', 'sent', 'accepted', 'scheduled', 'in_progress',
] as const;

export function canPauseStatus(status: string | null | undefined): boolean {
  return !!status && (PAUSABLE_STATUSES as readonly string[]).includes(status);
}

export interface PauseReason {
  reason: string;
  uses: number;
}

/**
 * Reasons this business has used before, most-used first — the quick-picks in
 * the pause sheet. There is no reason catalog: typing one once makes it a
 * suggestion next time, so a business converges on its own vocabulary without
 * anyone maintaining a list.
 *
 * Returns [] on failure rather than throwing: suggestions are a convenience,
 * and the free-text field works without them.
 */
export async function fetchPauseReasons(
  supabase: AnySupabase,
  businessId: string,
  limit = 8,
): Promise<PauseReason[]> {
  try {
    const { data, error } = await supabase.rpc('job_pause_reasons', {
      p_business_id: businessId,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as PauseReason[]).filter(r => !!r?.reason);
  } catch {
    return [];
  }
}

/** The patch that pauses a job. Applied through the caller's own writer so the
 *  mobile offline outbox still covers it. */
export function pausePatch(
  currentStatus: string,
  reason: string,
  note?: string | null,
): Record<string, string | null> {
  return {
    status: 'paused',
    paused_from: currentStatus,
    paused_at: new Date().toISOString(),
    pause_reason: reason.trim() || null,
    pause_note: note?.trim() ? note.trim() : null,
  };
}

/**
 * The patch that resumes a job. `paused_from` is cleared, but `pause_reason`
 * is deliberately KEPT: it's the record of why this job was once delayed, and
 * it keeps feeding the suggestions. Falls back to in_progress only if
 * paused_from is somehow missing (a row paused outside the app).
 */
export function resumePatch(pausedFrom: string | null | undefined): Record<string, string | null> {
  return {
    status: canPauseStatus(pausedFrom) ? (pausedFrom as string) : 'in_progress',
    paused_from: null,
    paused_at: null,
  };
}

// ── History (migration 247) ────────────────────────────────────────────────
// jobs.paused_at / pause_reason are the CURRENT hold and are cleared on
// resume. job_pause_log keeps every episode, so "how many times has this
// stalled?" and "what actually blocks us?" stay answerable.

export interface PauseSummary {
  /** How many times this job has been put on hold, ever. */
  episodes: number;
  /** Total time on hold. An open episode counts up to now. */
  totalDays: number;
  /** Set while the job is on hold right now. */
  openSince: string | null;
}

/** Open a pause episode. Best-effort: a failure here must not block the status
 *  change itself — losing one history row is better than a job that won't
 *  pause. The unique index on (job_id) where resumed_at is null makes a
 *  double-tap or a replayed offline write a no-op rather than a double count. */
export async function logPauseStart(
  supabase: AnySupabase,
  args: {
    businessId: string;
    jobId: string;
    pausedFrom: string;
    reason: string;
    note?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from('job_pause_log').insert({
      business_id: args.businessId,
      job_id: args.jobId,
      paused_from: args.pausedFrom,
      reason: args.reason.trim() || null,
      note: args.note?.trim() ? args.note.trim() : null,
      paused_by: args.userId ?? null,
    });
  } catch {
    /* history is best-effort — see above */
  }
}

/** Close the open episode. Scoped to resumed_at is null so resuming twice
 *  can't rewrite an already-closed one. */
export async function logPauseEnd(
  supabase: AnySupabase,
  jobId: string,
  userId?: string | null,
): Promise<void> {
  try {
    await supabase
      .from('job_pause_log')
      .update({ resumed_at: new Date().toISOString(), resumed_by: userId ?? null })
      .eq('job_id', jobId)
      .is('resumed_at', null);
  } catch {
    /* best-effort */
  }
}

/** Episode count + total time for one job, for the detail banner. */
export async function fetchPauseSummary(
  supabase: AnySupabase,
  jobId: string,
): Promise<PauseSummary | null> {
  try {
    const { data, error } = await supabase.rpc('job_pause_summary', { p_job_id: jobId });
    if (error || !Array.isArray(data) || !data.length) return null;
    const row = data[0] as { episodes: number; total_seconds: number; open_since: string | null };
    if (!row || !Number(row.episodes)) return null;
    return {
      episodes: Number(row.episodes),
      totalDays: Number(row.total_seconds || 0) / 86400,
      openSince: row.open_since ?? null,
    };
  } catch {
    return null;
  }
}

/** Short "3 times · 12 days" style line. Days are rounded to whole numbers
 *  above a day and shown as hours below, so a morning's delay doesn't read as
 *  "0 days". */
export function formatPauseSummary(
  s: PauseSummary,
  labels: { times: string; timesOne: string; days: string; hours: string },
): string {
  const count = s.episodes === 1 ? labels.timesOne : labels.times.replace('{{count}}', String(s.episodes));
  const span = s.totalDays >= 1
    ? labels.days.replace('{{count}}', String(Math.round(s.totalDays)))
    : labels.hours.replace('{{count}}', String(Math.max(1, Math.round(s.totalDays * 24))));
  return `${count} · ${span}`;
}

export interface PauseEpisode {
  id: string;
  paused_at: string;
  resumed_at: string | null;
  reason: string | null;
  note: string | null;
  paused_from: string | null;
}

/** Every hold on this job, newest first. Bounded by how many times one job can
 *  realistically stall, so no pagination — but capped anyway so a pathological
 *  row count can't bloat the screen. */
export async function fetchPauseLog(
  supabase: AnySupabase,
  jobId: string,
  limit = 50,
): Promise<PauseEpisode[]> {
  try {
    const { data, error } = await supabase
      .from('job_pause_log')
      .select('id, paused_at, resumed_at, reason, note, paused_from')
      .eq('job_id', jobId)
      .order('paused_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as PauseEpisode[];
  } catch {
    return [];
  }
}

/** How long one episode lasted. An open episode counts up to now. */
export function episodeDuration(e: PauseEpisode): { days: number; hours: number } {
  const end = e.resumed_at ? new Date(e.resumed_at).getTime() : Date.now();
  const ms = Math.max(0, end - new Date(e.paused_at).getTime());
  return { days: ms / 86_400_000, hours: ms / 3_600_000 };
}

/** "3 d" / "5 h" — days above a day, hours below, so a morning's delay doesn't
 *  render as "0 d". */
export function formatDuration(
  e: PauseEpisode,
  labels: { days: string; hours: string },
): string {
  const { days, hours } = episodeDuration(e);
  return days >= 1
    ? labels.days.replace('{{count}}', String(Math.round(days)))
    : labels.hours.replace('{{count}}', String(Math.max(1, Math.round(hours))));
}


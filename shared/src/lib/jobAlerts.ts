// Upcoming-job alert logic. Owners configure N "days before" tiers in
// Ajustes → Trabajos; the jobs list highlights any scheduled job whose
// scheduled_date is inside one of those tiers.
//
// Stored on businesses.job_alert_thresholds (migration 046):
//   { enabled: boolean, levels: [{ days: number, color: string }] }
//
// Matching: levels are sorted ascending by `days`; the first level whose
// `days >= daysUntil` wins (so the most urgent tier always takes
// precedence). Past-due jobs (daysUntil < 0) and far-future jobs (no
// matching tier) get no indicator.

export const JOB_ALERT_COLORS = ['red', 'orange', 'yellow', 'blue', 'purple'] as const;
export type JobAlertColor = (typeof JOB_ALERT_COLORS)[number];

export interface JobAlertLevel {
  days: number;
  color: JobAlertColor;
}

export interface JobAlertThresholds {
  enabled: boolean;
  levels: JobAlertLevel[];
  /** Highlight jobs past their scheduled date (red date + "overdue" badge). */
  overdue: boolean;
}

export const DEFAULT_JOB_ALERT_THRESHOLDS: JobAlertThresholds = {
  enabled: false,
  levels: [],
  overdue: false,
};

// Statuses exempt from the "overdue" flag even when past the scheduled date:
// the job is done/cancelled, or already in progress (being worked on, so a
// passed start date isn't a problem).
const OVERDUE_EXEMPT_STATUSES = new Set(['in_progress', 'completed', 'invoiced', 'cancelled']);

// Shared colour map used by both the list-card indicator and the
// settings preview. Tailwind utility classes so the same value works on
// web (react-native-web) and native (NativeWind).
export const JOB_ALERT_STYLE: Record<JobAlertColor, {
  borderClass: string;   // left-border colour
  bgClass: string;       // chip background
  textClass: string;     // chip text
  dotClass: string;      // small swatch (settings UI)
}> = {
  red:    { borderClass: 'border-l-red-500',    bgClass: 'bg-red-50',    textClass: 'text-red-700',    dotClass: 'bg-red-500' },
  orange: { borderClass: 'border-l-orange-500', bgClass: 'bg-orange-50', textClass: 'text-orange-700', dotClass: 'bg-orange-500' },
  yellow: { borderClass: 'border-l-yellow-500', bgClass: 'bg-yellow-50', textClass: 'text-yellow-800', dotClass: 'bg-yellow-500' },
  blue:   { borderClass: 'border-l-blue-500',   bgClass: 'bg-blue-50',   textClass: 'text-blue-700',   dotClass: 'bg-blue-500' },
  purple: { borderClass: 'border-l-purple-500', bgClass: 'bg-purple-50', textClass: 'text-purple-700', dotClass: 'bg-purple-500' },
};

// Normalize whatever's in the DB (or undefined) into a usable shape.
// Filters out malformed levels so a hand-edited JSONB blob can't crash
// the list page.
export function normalizeJobAlertThresholds(raw: unknown): JobAlertThresholds {
  if (!raw || typeof raw !== 'object') return DEFAULT_JOB_ALERT_THRESHOLDS;
  const obj = raw as { enabled?: unknown; levels?: unknown; overdue?: unknown };
  const enabled = obj.enabled === true;
  const overdue = obj.overdue === true;
  const levels: JobAlertLevel[] = Array.isArray(obj.levels)
    ? obj.levels
        .map((l): JobAlertLevel | null => {
          if (!l || typeof l !== 'object') return null;
          const lvl = l as { days?: unknown; color?: unknown };
          const days = typeof lvl.days === 'number' ? Math.floor(lvl.days) : NaN;
          const color = JOB_ALERT_COLORS.includes(lvl.color as JobAlertColor)
            ? (lvl.color as JobAlertColor)
            : null;
          if (!Number.isFinite(days) || days < 0 || !color) return null;
          return { days, color };
        })
        .filter((l): l is JobAlertLevel => l !== null)
    : [];
  return { enabled, levels, overdue };
}

// True when the "overdue" indicator is on and this job is past its scheduled
// date but not yet done/cancelled. Callers should skip proposal-stage jobs
// (no real scheduled date), mirroring matchJobAlert.
export function isJobOverdue(
  thresholds: JobAlertThresholds,
  scheduledDate: string | null | undefined,
  status: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!thresholds.overdue) return false;
  if (!scheduledDate) return false;
  if (status && OVERDUE_EXEMPT_STATUSES.has(status)) return false;
  const daysUntil = daysUntilDate(scheduledDate, now);
  return Number.isFinite(daysUntil) && daysUntil < 0;
}

// Whole number of days from today (local midnight) to the given date
// string (YYYY-MM-DD). Positive = future, 0 = today, negative = past.
export function daysUntilDate(dateStr: string, now: Date = new Date()): number {
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
  if (!y || !m || !d) return Number.NaN;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// Resolve the matching alert level for a job. Returns null when the
// feature is off, the date is missing/past, or no tier matches.
export function matchJobAlert(
  thresholds: JobAlertThresholds,
  scheduledDate: string | null | undefined,
  now: Date = new Date(),
): { level: JobAlertLevel; daysUntil: number } | null {
  if (!thresholds.enabled || thresholds.levels.length === 0) return null;
  if (!scheduledDate) return null;
  const daysUntil = daysUntilDate(scheduledDate, now);
  if (!Number.isFinite(daysUntil) || daysUntil < 0) return null;
  const sorted = [...thresholds.levels].sort((a, b) => a.days - b.days);
  for (const lvl of sorted) {
    if (daysUntil <= lvl.days) return { level: lvl, daysUntil };
  }
  return null;
}

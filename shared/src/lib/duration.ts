// Project-duration display logic shared by web + mobile job forms & detail.
//
// A project's "total time" is shown one of three ways, in precedence order:
//   1. Manual estimate in hours (jobs.estimated_hours) → days / hours / minutes
//      using a 24-hour day. 52h → "2 días 4 h 0 min".
//   2. A start→finish date range (scheduled_date → end_date) → the span in
//      days, inclusive of both endpoints. Jun 4 → Jun 8 = "5 días".
//   3. Single-day time window (time_start → time_end) → "2h 30min".
//
// Day/hour/minute words come from the caller (i18n) so this stays locale-free.

export interface DurationLabels {
  day: string;   // "día" / "day"
  days: string;  // "días" / "days"
  hourAbbr: string; // "h"
  minAbbr: string;  // "min"
}

function parseYMD(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Whole-day span counting BOTH endpoints (local): Jun 15 → Jun 26 = 12.
 * Same-day / reversed / invalid → 0, so a single-day job still falls
 * through to the time-window display in formatProjectDuration.
 */
export function daySpan(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  const a = parseYMD(start);
  const b = parseYMD(end);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 86400000) + 1;
}

function dayWord(n: number, labels: DurationLabels): string {
  return `${n} ${n === 1 ? labels.day : labels.days}`;
}

/**
 * Break a decimal hours value into "Nd Nh Nm" using a 24-hour day.
 * 52 → "2 días 4 h 0 min". Hours + minutes are always shown; days only when
 * > 0. Returns '' for null / non-positive input.
 */
export function formatHoursAsDuration(
  hours: number | null | undefined,
  labels: DurationLabels,
): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '';
  const totalMin = Math.round(hours * 60);
  const days = Math.floor(totalMin / (24 * 60));
  const rem = totalMin - days * 24 * 60;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(dayWord(days, labels));
  parts.push(`${h} ${labels.hourAbbr}`);
  parts.push(`${m} ${labels.minAbbr}`);
  return parts.join(' ');
}

/** Single-day window "HH:MM"–"HH:MM" → "2h 30min". '' if missing / <= 0. */
export function formatTimeWindow(
  timeStart: string | null | undefined,
  timeEnd: string | null | undefined,
): string {
  if (!timeStart || !timeEnd) return '';
  const [sh, sm] = timeStart.split(':').map(Number);
  const [eh, em] = timeEnd.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return '';
  const diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) return '';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  return parts.join(' ');
}

/**
 * The single "total time" string for a job/proposal, applying the precedence
 * above. Returns '' when nothing is set.
 */
export function formatProjectDuration(
  opts: {
    startDate?: string | null;
    endDate?: string | null;
    estimatedHours?: number | null;
    timeStart?: string | null;
    timeEnd?: string | null;
  },
  labels: DurationLabels,
): string {
  if (opts.estimatedHours != null && opts.estimatedHours > 0) {
    return formatHoursAsDuration(opts.estimatedHours, labels);
  }
  const span = daySpan(opts.startDate, opts.endDate);
  if (span > 0) return dayWord(span, labels);
  return formatTimeWindow(opts.timeStart, opts.timeEnd);
}

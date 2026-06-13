// Calendar data model + date math shared by the web and mobile calendar.
//
// The calendar shows two kinds of things on the same grid:
//   - "event"  → a row from calendar_events (meeting, delivery, reminder, …)
//   - "job"    → a scheduled job/project from the jobs table
// Both are normalized to a single `CalItem` so the views, agenda list and
// per-day filtering don't have to special-case the source. Jobs can span
// multiple days (scheduled_date → end_date); events can too (multi-day).

export type CalItemKind = 'event' | 'job';

export type CalEventType =
  | 'job'
  | 'meeting'
  | 'delivery'
  | 'reminder'
  | 'follow_up'
  | 'other';

export const CAL_EVENT_TYPES: CalEventType[] = [
  'job',
  'meeting',
  'delivery',
  'reminder',
  'follow_up',
  'other',
];

// Types a user can pick when creating a manual event. 'job' is excluded — real
// jobs are created in the Jobs module and surface on the calendar as kind:'job'.
export const SELECTABLE_EVENT_TYPES: CalEventType[] = [
  'meeting',
  'delivery',
  'reminder',
  'follow_up',
  'other',
];

export function asEventType(key: string): CalEventType {
  return (CAL_EVENT_TYPES as string[]).includes(key)
    ? (key as CalEventType)
    : 'other';
}

export interface CalItem {
  /** Globally-unique within a render: "event:<id>" / "job:<id>". */
  key: string;
  /** Original row id (used for edit/delete/navigation). */
  id: string;
  kind: CalItemKind;
  title: string;
  /** Precise start (all-day items use the day's 00:00). */
  start: Date;
  /** Precise end, or null when unknown / open-ended. */
  end: Date | null;
  allDay: boolean;
  eventType: CalEventType;
  clientName: string | null;
  location: string | null;
  /** Events only — carried so the edit form can prefill without a refetch. */
  description: string | null;
  clientId: string | null;
  /** Jobs only — pipeline status, drives the status chip. */
  status: string | null;
  /** Jobs only — name of the assigned crew lead (is_lead assignment). */
  leadName: string | null;
  /** Jobs only — employee ids + names assigned to this job (drives the
      team availability panel: who is booked on a given day). */
  assignees: { id: string; name: string }[];
  /** First calendar day the item occupies (00:00 local). */
  spanStart: Date;
  /** Last calendar day the item occupies (00:00 local). */
  spanEnd: Date;
}

// ── Day math ──────────────────────────────────────────────────────────────

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole calendar days from a → b (negative if b is before a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Inclusive day-level containment: is `day` within [spanStart, spanEnd]? */
export function dayInSpan(day: Date, spanStart: Date, spanEnd: Date): boolean {
  const t = startOfDay(day).getTime();
  return t >= startOfDay(spanStart).getTime() && t <= startOfDay(spanEnd).getTime();
}

/** Sunday-based 7-day week containing `d`. */
export function weekDays(d: Date): Date[] {
  const start = addDays(startOfDay(d), -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Month grid cells: leading blanks to align the 1st on its weekday, then every
 * day of the month, padded with trailing blanks to a whole number of weeks.
 */
export function monthCells(cursor: Date): (Date | null)[] {
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Month grid as weeks of REAL dates (including leading/trailing days from the
 * adjacent months), so multi-day items can span columns continuously. The
 * renderer fades the out-of-month days. 5 or 6 rows depending on the month.
 */
export function monthWeeks(cursor: Date): Date[][] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(startOfDay(first), -first.getDay());
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
  return Array.from({ length: rows }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
  );
}

// ── Visible range (what the parent should fetch) ────────────────────────────

export type CalView = 'month' | 'week' | 'day';

/**
 * The inclusive [start, end] day range visible for a given view/anchor. For
 * month we extend to the full 6-week grid so trailing/leading days populate.
 */
export function visibleRange(view: CalView, cursor: Date): { start: Date; end: Date } {
  if (view === 'day') {
    const s = startOfDay(cursor);
    return { start: s, end: s };
  }
  if (view === 'week') {
    const days = weekDays(cursor);
    return { start: days[0], end: days[6] };
  }
  // month: pad to whole weeks around the month
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  return { start: addDays(startOfDay(first), -first.getDay()), end: addDays(startOfDay(last), 6 - last.getDay()) };
}

// ── Filtering / sorting ─────────────────────────────────────────────────────

export function itemsForDay(items: CalItem[], day: Date): CalItem[] {
  return items.filter(it => dayInSpan(day, it.spanStart, it.spanEnd)).sort(compareItems);
}

/** All-day first, then by start time, then title. Stable + deterministic. */
export function compareItems(a: CalItem, b: CalItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const at = a.start.getTime();
  const bt = b.start.getTime();
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title);
}

export function countForDay(items: CalItem[], day: Date): number {
  let n = 0;
  for (const it of items) if (dayInSpan(day, it.spanStart, it.spanEnd)) n++;
  return n;
}

// ── Normalizers (raw DB rows → CalItem) ─────────────────────────────────────

export interface RawEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  event_type: string;
  all_day?: boolean | null;
  client_id: string | null;
}

export interface RawJob {
  id: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  all_day?: boolean | null;
  job_city: string | null;
  job_state: string | null;
  client_name?: string | null;
  lead_name?: string | null;
  assignees?: { id: string; name: string }[];
}

export function eventToItem(e: RawEvent): CalItem {
  const start = new Date(e.start_time);
  const end = e.end_time ? new Date(e.end_time) : null;
  const allDay = !!e.all_day;
  return {
    key: `event:${e.id}`,
    id: e.id,
    kind: 'event',
    title: e.title,
    start,
    end,
    allDay,
    eventType: asEventType(e.event_type),
    clientName: null,
    location: e.location,
    description: e.description,
    clientId: e.client_id,
    status: null,
    leadName: null,
    assignees: [],
    spanStart: startOfDay(start),
    spanEnd: startOfDay(end ?? start),
  };
}

/** Combine a "YYYY-MM-DD" date with an optional "HH:MM[:SS]" time, local tz. */
function dateAtTime(dateStr: string, timeStr: string | null): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1, hh || 0, mm || 0);
  }
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Jobs without a scheduled_date are not placed on the calendar (returns null). */
export function jobToItem(j: RawJob): CalItem | null {
  if (!j.scheduled_date) return null;
  // A job reads as all-day when explicitly flagged OR when it has no start time.
  const allDay = j.all_day === true || !j.time_start;
  const start = dateAtTime(j.scheduled_date, allDay ? null : j.time_start);
  const end =
    j.time_end && !allDay ? dateAtTime(j.end_date ?? j.scheduled_date, j.time_end) : null;
  const spanStart = dateAtTime(j.scheduled_date, null);
  const spanEnd = dateAtTime(j.end_date ?? j.scheduled_date, null);
  const location = [j.job_city, j.job_state].filter(Boolean).join(', ') || null;
  return {
    key: `job:${j.id}`,
    id: j.id,
    kind: 'job',
    title: j.title,
    start,
    end,
    allDay,
    eventType: 'job',
    clientName: j.client_name ?? null,
    location,
    description: null,
    clientId: null,
    status: j.status,
    leadName: j.lead_name ?? null,
    assignees: j.assignees ?? [],
    spanStart,
    spanEnd,
  };
}

// Weekly business operating hours (businesses.operating_hours JSONB) + the
// out-of-hours check used to flag jobs scheduled outside business hours.
//
// Shape: one entry per weekday, e.g.
//   { mon: { enabled: true, start: "08:00", end: "17:00" }, ... }
// A NULL/absent value means the business hasn't configured hours yet — callers
// treat that as "don't warn".

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface DayHours {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export type OperatingHours = Record<DayKey, DayHours>;

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  mon: { enabled: true, start: '08:00', end: '17:00' },
  tue: { enabled: true, start: '08:00', end: '17:00' },
  wed: { enabled: true, start: '08:00', end: '17:00' },
  thu: { enabled: true, start: '08:00', end: '17:00' },
  fri: { enabled: true, start: '08:00', end: '17:00' },
  sat: { enabled: false, start: '08:00', end: '17:00' },
  sun: { enabled: false, start: '08:00', end: '17:00' },
};

/**
 * Coerce an unknown JSONB value into a complete OperatingHours, filling any
 * missing/invalid fields from the defaults. Returns null ONLY when the input
 * is null/undefined (business hasn't configured hours yet).
 */
export function normalizeOperatingHours(raw: unknown): OperatingHours | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, { enabled?: unknown; start?: unknown; end?: unknown }>;
  const out = {} as OperatingHours;
  for (const k of DAY_KEYS) {
    const d = obj[k];
    out[k] = {
      enabled: typeof d?.enabled === 'boolean' ? d.enabled : DEFAULT_OPERATING_HOURS[k].enabled,
      start: typeof d?.start === 'string' ? d.start : DEFAULT_OPERATING_HOURS[k].start,
      end: typeof d?.end === 'string' ? d.end : DEFAULT_OPERATING_HOURS[k].end,
    };
  }
  return out;
}

// JS Date.getDay(): 0=Sun..6=Sat → our keys.
const JS_DAY_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function dayKeyForDate(dateStr: string | null | undefined): DayKey | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return JS_DAY_TO_KEY[new Date(y, m - 1, d).getDay()];
}

function toMin(t: string | null | undefined): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export type OperatingHoursStatus =
  | { status: 'ok' }
  | { status: 'closed'; day: DayHours }
  | { status: 'outside'; day: DayHours };

/**
 * Evaluate whether a scheduled date/time falls within the business's operating
 * hours. Returns null when it can't/shouldn't be judged (no configured hours,
 * or no date → unknown weekday). Otherwise 'ok', 'closed' (day disabled), or
 * 'outside' (a provided time falls outside the open window).
 */
export function evaluateOperatingHours(
  operatingHours: OperatingHours | null | undefined,
  dateStr: string | null | undefined,
  timeStart: string | null | undefined,
  timeEnd: string | null | undefined,
): OperatingHoursStatus | null {
  if (!operatingHours) return null;
  const key = dayKeyForDate(dateStr);
  if (!key) return null;
  const day = operatingHours[key];
  if (!day) return null;
  if (!day.enabled) return { status: 'closed', day };
  const open = toMin(day.start);
  const close = toMin(day.end);
  if (open == null || close == null) return { status: 'ok' };
  const s = toMin(timeStart);
  const e = toMin(timeEnd);
  if (s == null && e == null) return { status: 'ok' };
  const startOk = s == null || (s >= open && s <= close);
  const endOk = e == null || (e >= open && e <= close);
  if (!startOk || !endOk) return { status: 'outside', day };
  return { status: 'ok' };
}

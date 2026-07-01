// Crew Finder — rank a business's crew for a given job by proximity +
// availability, and surface route-efficient days ("already has a job nearby on
// <day>"). Pure logic (no I/O): callers pass pre-fetched data (see
// crewFinderData.ts). Reuses haversineMiles (geo), the calendar day-math /
// itemsForDay primitive (calendarModel), and operating-hours helpers.

import { haversineMiles } from './geo';
import {
  itemsForDay,
  startOfDay,
  addDays,
  type CalItem,
} from './calendarModel';
import { dayKeyForDate, type OperatingHours } from './operatingHours';

// How far ahead of "today" a scheduled job still counts as the worker's
// "current" position (they're about to be there).
const CURRENT_LOOKAHEAD_DAYS = 2;
const DEFAULT_WINDOW_DAYS = 45;
const DEFAULT_NEARBY_RADIUS_MI = 25;

export type CrewLocationBasis = 'current-job' | 'job' | 'home' | 'branch' | 'none';

export interface CrewSuggestion {
  employeeId: string;
  name: string;
  basis: CrewLocationBasis;
  /** Straight-line miles from the resolved location to the job. Null when the
   *  worker has no usable coordinates (basis 'none') or the target has none. */
  distanceMi: number | null;
  /** Free on the job's scheduled date (no assigned job that day). True when the
   *  job has no date yet. */
  isFreeOnDate: boolean;
  /** First working day (>= the job date) with no assigned job, 'YYYY-MM-DD'. */
  nextFreeDate: string | null;
  /** Route-aware: this worker's assigned jobs within the radius, by date. */
  nearbyJobs: { jobId: string; date: string; distanceMi: number }[];
}

export interface CrewFinderEmployee {
  id: string;
  name: string;
  homeLat: number | null;
  homeLng: number | null;
  branchLat?: number | null;
  branchLng?: number | null;
}

export interface CrewFinderInput {
  target: { lat: number | null; lng: number | null; scheduledDate: string | null };
  employees: CrewFinderEmployee[];
  /** All jobs across the forward window as calendar items (carry assignees). */
  assignedItems: CalItem[];
  /** jobId -> coords. Separate map because CalItem intentionally omits coords. */
  jobCoords: Record<string, { lat: number; lng: number } | null>;
  operatingHours: OperatingHours | null;
  /** Horizon for the nextFreeDate scan (default 45). */
  windowDays?: number;
  /** Route-aware radius in miles (default 25). */
  nearbyRadiusMi?: number;
  /** Injected for testability; defaults to now. */
  today?: Date;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function jobItemsFor(employeeId: string, items: CalItem[]): CalItem[] {
  return items.filter(it => it.kind === 'job' && it.assignees.some(a => a.id === employeeId));
}

/** Is the worker booked on `date` (any assigned job spans that day)? */
export function isBusyOn(employeeId: string, date: Date, items: CalItem[]): boolean {
  return itemsForDay(items, date).some(
    it => it.kind === 'job' && it.assignees.some(a => a.id === employeeId),
  );
}

/**
 * The worker's proximity location, best signal first:
 *   1. 'current-job' — a job they're on right now (span contains today) or
 *      starting within CURRENT_LOOKAHEAD_DAYS.
 *   2. 'job' — their NEAREST-in-time assigned job (upcoming preferred, else most
 *      recent) that has coordinates, anywhere in the fetched window. This is the
 *      main signal when crews carry job map links rather than home addresses.
 *   3. 'home' — geocoded home address.
 *   4. 'branch' — home branch coords (deferred; usually absent).
 * Returns null when nothing resolves.
 */
export function crewCurrentLocation(
  emp: CrewFinderEmployee,
  items: CalItem[],
  jobCoords: Record<string, { lat: number; lng: number } | null>,
  today: Date,
): { lat: number; lng: number; basis: CrewLocationBasis } | null {
  const t0 = startOfDay(today).getTime();
  const horizon = addDays(startOfDay(today), CURRENT_LOOKAHEAD_DAYS).getTime();
  const withCoords = jobItemsFor(emp.id, items).filter(it => jobCoords[it.id]);
  if (withCoords.length) {
    // On a job now, or one starting within the lookahead → "current".
    const current = withCoords
      .filter(it => it.spanEnd.getTime() >= t0 && it.spanStart.getTime() <= horizon)
      .sort((a, b) => a.spanStart.getTime() - b.spanStart.getTime())[0];
    if (current) {
      const c = jobCoords[current.id]!;
      return { lat: c.lat, lng: c.lng, basis: 'current-job' };
    }
    // Else their nearest job in time: soonest upcoming, else most recent past.
    const upcoming = withCoords
      .filter(it => it.spanStart.getTime() >= t0)
      .sort((a, b) => a.spanStart.getTime() - b.spanStart.getTime());
    const past = withCoords
      .filter(it => it.spanEnd.getTime() < t0)
      .sort((a, b) => b.spanEnd.getTime() - a.spanEnd.getTime());
    const near = upcoming[0] ?? past[0];
    if (near) {
      const c = jobCoords[near.id]!;
      return { lat: c.lat, lng: c.lng, basis: 'job' };
    }
  }
  if (emp.homeLat != null && emp.homeLng != null) {
    return { lat: emp.homeLat, lng: emp.homeLng, basis: 'home' };
  }
  if (emp.branchLat != null && emp.branchLng != null) {
    return { lat: emp.branchLat, lng: emp.branchLng, basis: 'branch' };
  }
  return null;
}

/** First working day >= fromDate with no assigned job (skips closed days). */
export function nextFreeDate(
  employeeId: string,
  fromDate: Date,
  items: CalItem[],
  operatingHours: OperatingHours | null,
  windowDays: number,
): string | null {
  for (let i = 0; i < windowDays; i++) {
    const day = addDays(startOfDay(fromDate), i);
    if (operatingHours) {
      const key = dayKeyForDate(ymdLocal(day));
      if (key && !operatingHours[key].enabled) continue; // non-working day
    }
    if (!isBusyOn(employeeId, day, items)) return ymdLocal(day);
  }
  return null;
}

/** Route-aware: the worker's assigned jobs (with coords) within `radiusMi` of
 *  the target, on/after today, sorted by date. */
export function nearbyJobsFor(
  employeeId: string,
  target: { lat: number; lng: number },
  items: CalItem[],
  jobCoords: Record<string, { lat: number; lng: number } | null>,
  today: Date,
  radiusMi: number,
): { jobId: string; date: string; distanceMi: number }[] {
  const t0 = startOfDay(today).getTime();
  return jobItemsFor(employeeId, items)
    .filter(it => it.spanEnd.getTime() >= t0)
    .map(it => {
      const c = jobCoords[it.id];
      if (!c) return null;
      const distanceMi = haversineMiles(target, c);
      if (distanceMi > radiusMi) return null;
      return { jobId: it.id, date: ymdLocal(it.spanStart), distanceMi: +distanceMi.toFixed(1) };
    })
    .filter((x): x is { jobId: string; date: string; distanceMi: number } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rank crew for the target job. Order: free-on-date first, then nearest
 * (coord-less last), then soonest next-free as a tiebreak among the busy.
 */
export function buildCrewSuggestions(input: CrewFinderInput): CrewSuggestion[] {
  const today = input.today ?? new Date();
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const radiusMi = input.nearbyRadiusMi ?? DEFAULT_NEARBY_RADIUS_MI;
  const targetHasCoords = input.target.lat != null && input.target.lng != null;
  const targetPt = targetHasCoords
    ? { lat: input.target.lat as number, lng: input.target.lng as number }
    : null;
  // Availability + next-free scan start from the job's date, else today.
  const fromDate = input.target.scheduledDate ? parseYmd(input.target.scheduledDate) : startOfDay(today);

  const suggestions: CrewSuggestion[] = input.employees.map(emp => {
    const loc = crewCurrentLocation(emp, input.assignedItems, input.jobCoords, today);
    const distanceMi =
      loc && targetPt ? +haversineMiles(targetPt, loc).toFixed(1) : null;
    const isFreeOnDate = input.target.scheduledDate
      ? !isBusyOn(emp.id, parseYmd(input.target.scheduledDate), input.assignedItems)
      : true;
    const next = nextFreeDate(emp.id, fromDate, input.assignedItems, input.operatingHours, windowDays);
    const nearbyJobs = targetPt
      ? nearbyJobsFor(emp.id, targetPt, input.assignedItems, input.jobCoords, today, radiusMi)
      : [];
    return {
      employeeId: emp.id,
      name: emp.name,
      basis: loc?.basis ?? 'none',
      distanceMi,
      isFreeOnDate,
      nextFreeDate: next,
      nearbyJobs,
    };
  });

  return suggestions.sort((a, b) => {
    // 1. Free on the requested day first.
    if (a.isFreeOnDate !== b.isFreeOnDate) return a.isFreeOnDate ? -1 : 1;
    // 2. Nearest first; unknown distance sorts last.
    const ad = a.distanceMi ?? Infinity;
    const bd = b.distanceMi ?? Infinity;
    if (ad !== bd) return ad - bd;
    // 3. Soonest next-free (nulls last).
    if (a.nextFreeDate !== b.nextFreeDate) {
      if (!a.nextFreeDate) return 1;
      if (!b.nextFreeDate) return -1;
      return a.nextFreeDate.localeCompare(b.nextFreeDate);
    }
    return a.name.localeCompare(b.name);
  });
}

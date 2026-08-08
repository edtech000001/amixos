// Pure helpers for the legacy data import (AppSheet projects + FileMaker
// invoices). No Supabase / no platform APIs here — just parsing + matching, so
// the logic is shared and unit-testable. The web import wizard drives these.

/** Lowercase, strip diacritics, collapse whitespace. "Héctor  Ramírez" →
 *  "hector ramirez". Used to match free-text worker names to employee rows and
 *  customer names to clients. */
export function normalizeName(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a free-text crew list into individual names. AppSheet exports them
 *  comma-separated ("Alex Cardona,Allan Guerra,..."); also tolerate ';',
 *  '/', '&', '|', and newlines. Blanks dropped, each name trimmed. */
export function splitNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;/|\n]+|\s&\s/)
    .map(n => n.trim())
    .filter(Boolean);
}

export interface EmployeeLite {
  id: string;
  first_name: string;
  last_name: string | null;
  /** "Name on checks" — matched too (payroll exports often use it). */
  check_name?: string | null;
  /** Ambiguity tiebreak: when several employees share a name, a SINGLE active
   *  one among them wins (an inactive namesake is almost never the intent).
   *  Optional so callers without the column keep the strict behavior. */
  active?: boolean;
}

/** Ambiguity resolution shared by every matching stage: a unique candidate
 *  wins; among several, a SINGLE active one wins; otherwise no match — we
 *  never silently guess between two active people with the same name. */
function pickUnique(candidates: EmployeeLite[]): string | null {
  if (candidates.length === 1) return candidates[0].id;
  if (candidates.length > 1) {
    const act = candidates.filter(e => e.active !== false);
    if (act.length === 1) return act[0].id;
  }
  return null;
}

/** Resolve a free-text name to an employee id, or null if no confident match.
 *  Tries, in order: exact normalized full name → check name → full-name prefix
 *  → first-name-only. At every stage an ambiguous set (two employees named
 *  "Noel") resolves to the single ACTIVE one if there is exactly one, else NO
 *  match — so we never silently link to the wrong person; the importer records
 *  the name in the snapshot regardless. */
export function matchEmployeeId(name: string, employees: EmployeeLite[]): string | null {
  const target = normalizeName(name);
  if (!target) return null;

  const full = (e: EmployeeLite) => normalizeName(`${e.first_name} ${e.last_name ?? ''}`);
  const exact = employees.filter(e => full(e) === target);
  const exactPick = pickUnique(exact);
  if (exactPick) return exactPick;
  if (exact.length > 1) return null; // active-tie on the FULL name → don't guess

  // Check-name match ("name on checks" often IS the payroll-export name).
  const byCheck = pickUnique(employees.filter(e => e.check_name && normalizeName(e.check_name) === target));
  if (byCheck) return byCheck;

  // Prefix tolerance: "Edvin Ramirez" ↔ stored "Edvin Ramirez Gomez" (extra
  // surname on either side).
  const byPrefix = pickUnique(employees.filter(e => {
    const f = full(e);
    return f.startsWith(`${target} `) || target.startsWith(`${f} `);
  }));
  if (byPrefix) return byPrefix;

  // First-name-only fallback.
  return pickUnique(employees.filter(e => normalizeName(e.first_name) === target));
}

/** Parse a money/quantity string into a number. Strips $, commas, spaces.
 *  "1,297.00" → 1297, "$2,159.50" → 2159.5, "" → null, "abc" → null. */
export function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a date cell into 'YYYY-MM-DD' (Postgres date), or null if unparseable.
 *  Handles ISO ("2026-06-10"), US slash ("6/10/2026", interpreted M/D/Y), and
 *  long form ("June 8, 2026"). Returns null rather than throwing so a bad date
 *  just leaves the field empty instead of failing the whole row. */
export function parseDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO yyyy-mm-dd (optionally with time) → take the date part.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // M/D/Y or M-D-Y (US). Two-digit year → 2000s.
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let [, mm, dd, yy] = slash;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    const m = String(parseInt(mm, 10)).padStart(2, '0');
    const d = String(parseInt(dd, 10)).padStart(2, '0');
    if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${year}-${m}-${d}`;
  }

  // Fall back to the JS Date parser (handles "June 8, 2026") — but read the
  // LOCAL components, not toISOString(), which would shift across UTC midnight.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/** Parse a time cell into 'HH:MM' (24h), or null if blank/unparseable.
 *  Handles "7:30", "07:30", "7:30 AM", "3:15pm", "15:00", and bare hours
 *  ("7", "7 AM"). Returns null rather than throwing — a bad time just leaves
 *  the field empty. */
export function parseTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.[0]; // 'a' | 'p' | undefined
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'p' && hours !== 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Parse a timestamp cell into an ISO string, or null if blank/unparseable.
 *  Accepts full timestamps ("2026-06-10T14:32:00Z", "6/10/2026 14:32",
 *  "6/10/2026 2:32 PM") via the JS Date parser; date-only values fall back to
 *  parseDate anchored at local noon so timezones can't shift the date. */
export function parseTimestamp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Date-only forms go through parseDate (it validates M/D/Y properly).
  const dateOnly = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/.test(s);
  if (!dateOnly) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const date = parseDate(s);
  return date ? new Date(`${date}T12:00:00`).toISOString() : null;
}

/** Parse a raw "lat, lng" pair (comma or whitespace separated) — same format
 *  the job form's coordinates field accepts. Null on blank/invalid/out-of-range. */
export function parseLatLng(raw: string | null | undefined): { lat: number; lng: number } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Pull coordinates out of a Google/Apple Maps link — same patterns the job
 *  form uses (@lat,lng · ?q=/ll= · !3d!4d). Shortened links (maps.app.goo.gl)
 *  carry no coords in the URL; those return null and the raw link is still
 *  saved. */
export function coordsFromMapLink(link: string | null | undefined): { lat: number; lng: number } | null {
  const s = String(link ?? '').trim();
  if (!s) return null;
  const m =
    s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
    s.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ||
    s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export type ImportJobStatus =
  | 'proposal'
  | 'sent'
  | 'accepted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'invoiced';

const JOB_STATUS_SYNONYMS: Record<string, ImportJobStatus> = {
  proposal: 'proposal', propuesta: 'proposal', cotizacion: 'proposal', estimate: 'proposal',
  sent: 'sent', enviado: 'sent', enviada: 'sent',
  accepted: 'accepted', aceptado: 'accepted', aceptada: 'accepted',
  scheduled: 'scheduled', agendado: 'scheduled', agendada: 'scheduled',
  programado: 'scheduled', programada: 'scheduled',
  'in progress': 'in_progress', in_progress: 'in_progress',
  'en progreso': 'in_progress', 'en proceso': 'in_progress', activo: 'in_progress',
  completed: 'completed', completado: 'completed', completada: 'completed',
  terminado: 'completed', terminada: 'completed', done: 'completed',
  invoiced: 'invoiced', facturado: 'invoiced', facturada: 'invoiced',
};

/** Map a free-text status cell to a pipeline status. Blank → null (caller
 *  applies its default); unrecognized non-blank → undefined so the caller can
 *  record a row error instead of silently misclassifying. */
export function parseJobStatus(
  raw: string | null | undefined,
): ImportJobStatus | null | undefined {
  const s = normalizeName(raw ?? '');
  if (!s) return null;
  return JOB_STATUS_SYNONYMS[s];
}

/** Group invoice line-item rows into one entry per invoice number, preserving
 *  first-seen order for both invoices and their lines. Each row is whatever the
 *  caller passes (already mapped to fields); `keyOf` extracts the invoice
 *  number. Rows with a blank invoice number are grouped under '' and the caller
 *  can decide to reject them. */
export function groupBy<T>(rows: T[], keyOf: (row: T) => string): { key: string; rows: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }
  return order.map(key => ({ key, rows: map.get(key)! }));
}

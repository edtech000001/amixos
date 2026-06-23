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
}

/** Resolve a free-text name to an employee id, or null if no confident match.
 *  Tries, in order: exact normalized full name → exact "first last" → unique
 *  first-name-only. A first-name match that is ambiguous (two employees named
 *  "Noel") is treated as NO match so we never silently link to the wrong
 *  person; the importer records the name in the snapshot regardless. */
export function matchEmployeeId(name: string, employees: EmployeeLite[]): string | null {
  const target = normalizeName(name);
  if (!target) return null;

  const full = (e: EmployeeLite) => normalizeName(`${e.first_name} ${e.last_name ?? ''}`);
  const exact = employees.filter(e => full(e) === target);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null; // ambiguous full-name dup → don't guess

  // First-name-only fallback, but ONLY when it's unambiguous.
  const byFirst = employees.filter(e => normalizeName(e.first_name) === target);
  if (byFirst.length === 1) return byFirst[0].id;
  return null;
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

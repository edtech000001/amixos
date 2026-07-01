// Universal display formatters used across mobile + web so time/date
// rendering stays consistent regardless of OS locale defaults.

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Live-format a US phone number as the user types: "(402) 555-1234".
 * Strips non-digits, caps at 10, and partially formats while typing so the
 * field reads cleanly mid-entry. Shared by every phone input.
 */
export function formatPhoneInput(raw: string): string {
  let all = raw.replace(/\D/g, '');
  // Strip a leading US country code so pasting "+1 (555) 123-4567" from Apple
  // Contacts (digits become "15551234567") lines up to the 10-digit number
  // instead of keeping the "1" and dropping the last digit. A real US 10-digit
  // number never starts with 1, so this only catches the country code.
  if (all.length === 11 && all.startsWith('1')) all = all.slice(1);
  const digits = all.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Group a number's integer part with US thousands separators for display:
 * "1123.21" → "1,123.21", "1000" → "1,000", "-2500" → "-2,500". Decimals are
 * preserved exactly as entered (no rounding). Non-numeric input (ranges, notes,
 * text that happens to sit in a number field) is returned unchanged, and
 * empty/null yields ''. Display-only — number inputs can't hold the commas.
 */
export function formatNumberGrouped(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value).trim();
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(str);
  if (!m) return str;
  const [, sign, intPart, decPart = ''] = m;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${decPart}`;
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Format a time as "1:00 PM" / "10:30 AM" — always uppercase AM/PM, no
 * periods, single space. Accepts either an "HH:MM" string (24-hour) or a
 * Date. Returns '' for empty / unparseable input.
 */
export function formatTime12h(input: string | Date | null | undefined): string {
  if (!input) return '';
  let h: number;
  let m: number;
  if (typeof input === 'string') {
    const [hStr, mStr] = input.split(':');
    h = Number(hStr);
    m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return '';
  } else {
    h = input.getHours();
    m = input.getMinutes();
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/**
 * Parse a date-ish input into a Date. Accepts:
 *   - "YYYY-MM-DD" — interpreted as local date (no UTC off-by-one)
 *   - ISO timestamp ("YYYY-MM-DDTHH:MM:SS...") — parsed as-is
 *   - Date — returned as-is
 */
function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date as "Mayo 24, 2026" (ES) or "May 24, 2026" (EN).
 * Used everywhere a date is shown without a time.
 */
export function formatDateLong(
  input: string | Date | null | undefined,
  locale?: string,
): string {
  const d = toDate(input);
  if (!d) return '';
  const isEs = (locale ?? '').toLowerCase().startsWith('es');
  const months = isEs ? MONTHS_ES : MONTHS_EN;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Compact date + time for tight UI (e.g. under each pipeline step). Returns the
 * pieces separately so the caller can stack them: `{ date: "Jun 15", time:
 * "9:30 PM" }`. `time` is '' for date-only inputs ("YYYY-MM-DD"), since those
 * carry no meaningful time.
 */
export function formatStamp(
  input: string | Date | null | undefined,
  locale?: string,
): { date: string; time: string } {
  const d = toDate(input);
  if (!d) return { date: '', time: '' };
  const isEs = (locale ?? '').toLowerCase().startsWith('es');
  const months = isEs ? MONTHS_ES_SHORT : MONTHS_EN_SHORT;
  const date = isEs ? `${d.getDate()} ${months[d.getMonth()]}` : `${months[d.getMonth()]} ${d.getDate()}`;
  const hasTime = typeof input === 'string' ? input.includes('T') : true;
  return { date, time: hasTime ? formatTime12h(d) : '' };
}

/**
 * Long-form, locale-aware relative-time label: "hace 5 minutos" / "hace
 * 3 horas" / "hace 2 días" / "ahora mismo". Singular vs plural is picked
 * from the labels object based on the count; each label embeds {{n}}.
 *
 * Labels are passed in (rather than imported) so this stays in the shared
 * formatter layer with no i18n dependency — callers feed it the strings
 * from `dashboard.clients.detail.commLog.rel`.
 */
export interface RelativeTimeLabels {
  now: string;
  minute: string;
  minutes: string;
  hour: string;
  hours: string;
  day: string;
  days: string;
  week: string;
  weeks: string;
  month: string;
  months: string;
  year: string;
  years: string;
}

export function formatRelativeLong(
  input: string | Date | null | undefined,
  labels: RelativeTimeLabels,
): string {
  const d = toDate(input);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const pick = (one: string, many: string, n: number) =>
    (n === 1 ? one : many).replace('{{n}}', String(n));

  if (diffMs < 60_000) return labels.now;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return pick(labels.minute, labels.minutes, mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return pick(labels.hour, labels.hours, hrs);
  const days = Math.floor(hrs / 24);
  if (days < 7) return pick(labels.day, labels.days, days);
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return pick(labels.week, labels.weeks, weeks);
  const months = Math.floor(days / 30);
  if (months < 12) return pick(labels.month, labels.months, months);
  const years = Math.floor(days / 365);
  return pick(labels.year, labels.years, years);
}

/**
 * Format a date + time as "Mayo 24, 2026, 9:30 PM". Used for created /
 * updated_at metadata where the time matters.
 */
export function formatDateTimeLong(
  input: string | Date | null | undefined,
  locale?: string,
): string {
  const d = toDate(input);
  if (!d) return '';
  return `${formatDateLong(d, locale)}, ${formatTime12h(d)}`;
}

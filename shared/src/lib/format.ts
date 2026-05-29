// Universal display formatters used across mobile + web so time/date
// rendering stays consistent regardless of OS locale defaults.

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Live-format a US phone number as the user types: "(402) 555-1234".
 * Strips non-digits, caps at 10, and partially formats while typing so the
 * field reads cleanly mid-entry. Shared by every phone input.
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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

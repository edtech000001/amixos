// Universal display formatters used across mobile + web so time/date
// rendering stays consistent regardless of OS locale defaults.

const pad = (n: number) => String(n).padStart(2, '0');

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

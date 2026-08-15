// Small shared helpers for the rentals module (web).

/** Currency — shows cents only when present (whole amounts stay clean). */
export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Keep digits + one decimal point (max 2 places) for a money input. The form
 *  stores this raw string; Number() parses it on save. */
export function sanitizeMoney(s: string): string {
  let cleaned = s.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  }
  return cleaned;
}

/** Display a raw money string with thousands separators, preserving whatever
 *  decimals the user has typed (incl. a trailing "." mid-entry). */
export function withCommas(raw: string): string {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const intFmt = int ? Number(int).toLocaleString('en-US') : '';
  return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
}

/** Current month as the ledger's canonical YYYY-MM-01 (local time). */
export function currentPeriodStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Quick presets for date-range filters (map weather filter, jobs list, …).
// Shared by web and mobile so both platforms offer the identical chip row:
// Hoy · Ayer · Últimos 2 días · Últimos 5 días.

/** Local YYYY-MM-DD, `days` ago (not toISOString — that's UTC and drifts). */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DateRangePreset {
  label: string;
  from: string;
  to: string;
}

/**
 * Build the labeled preset list. Ranges are inclusive and end today except
 * "yesterday" (a single day). Compute at open/render time so a screen left
 * mounted past midnight doesn't serve stale ranges.
 */
export function buildDateRangePresets(labels: {
  today: string;
  yesterday: string;
  last2Days: string;
  last5Days: string;
}): DateRangePreset[] {
  const today = isoDaysAgo(0);
  return [
    { label: labels.today, from: today, to: today },
    { label: labels.yesterday, from: isoDaysAgo(1), to: isoDaysAgo(1) },
    { label: labels.last2Days, from: isoDaysAgo(1), to: today },
    { label: labels.last5Days, from: isoDaysAgo(4), to: today },
  ];
}

// Y-axis helpers shared by the mobile bar charts (Reportes → Revenue by month,
// and the dashboard's revenue widget). Web gets the same behaviour for free
// from recharts' YAxis + tickFormatter; these reproduce it for React Native,
// which has no charting library in this project.

/** Round an axis maximum up to a readable 1 / 2 / 2.5 / 5 × 10ⁿ step.
 *
 *  Bars are scaled against this rather than the raw peak, which does two
 *  things: the gridline labels land on round numbers ($50k, not $46,812), and
 *  the tallest bar meets a gridline instead of floating above all of them. */
export function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * pow;
}

/** Compact axis label — mirrors the web chart's tickFormatter ($12k / $450). */
export function axisTick(n: number): string {
  if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

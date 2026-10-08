// Which payment method to preselect when recording payroll.
//
// It used to be hardcoded to 'check' for everyone. A business that pays by
// transfer re-picked "wire" on every single payment, and one that pays cash
// re-picked "cash" — a tax on the most frequent action in the screen.
//
// So preselect what the business actually uses. Deliberately RECENT rather
// than all-time: a business that moved from cheques to transfers should get
// transfers immediately, not after the new method finally outnumbers years of
// old cheques.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any };

export type PreferredPayMethod = 'cash' | 'check' | 'wire';

const VALID: readonly string[] = ['cash', 'check', 'wire'];

/** Kept as the fallback so a brand-new business behaves exactly as before. */
export const DEFAULT_PAY_METHOD: PreferredPayMethod = 'check';

/**
 * The method used most often across this business's recent payments.
 *
 * Bounded by `sample` rather than paginated — this is a preference hint, not a
 * report, and the last 50 payments describe current habit better than every
 * payment ever made. Ties go to the more recent method, since `data` comes
 * back newest-first and the first to reach the winning count wins.
 *
 * Returns DEFAULT_PAY_METHOD when there's no history or the read fails: a
 * preselected radio button is never worth failing a screen over.
 */
export async function fetchPreferredPayMethod(
  supabase: AnySupabase,
  businessId: string,
  sample = 50,
): Promise<PreferredPayMethod> {
  try {
    const { data, error } = await supabase
      .from('payroll_payments')
      .select('method')
      .eq('business_id', businessId)
      .not('method', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(sample);
    if (error || !Array.isArray(data) || !data.length) return DEFAULT_PAY_METHOD;

    // A plain object, not a Map: web's tsconfig target predates downlevel
    // iteration, so `for (const [k, v] of map)` doesn't compile there.
    const counts: Record<string, number> = {};
    for (const row of data as { method: string }[]) {
      const m = row?.method;
      if (!VALID.includes(m)) continue;
      counts[m] = (counts[m] ?? 0) + 1;
    }
    let best: PreferredPayMethod | null = null;
    let bestCount = 0;
    for (const m of VALID) {
      const n = counts[m] ?? 0;
      if (n > bestCount) { best = m as PreferredPayMethod; bestCount = n; }
    }
    return best ?? DEFAULT_PAY_METHOD;
  } catch {
    return DEFAULT_PAY_METHOD;
  }
}

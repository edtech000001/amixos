// Per-business storage cap (combined files + photos) derived from the plan, and
// small formatting/percent helpers for the usage meter + upload enforcement.
//
// Storage is cheap, so caps are generous abuse guardrails + an upgrade nudge.
// Usage bytes come from the business_storage_bytes() RPC (migration 100).

import { PLANS } from './plans';
import { activePlanKey, type SubscriptionInfo } from './subscription';

const GB = 1024 * 1024 * 1024;

/** Allowance during the no-card trial (and the lenient fallback when there's no
 *  active paid plan). Matches the Básico tier so trials aren't over-generous. */
export const TRIAL_STORAGE_GB = 10;

/** The business's storage cap in GB. null = unmetered (Empresa/custom). */
export function storageLimitGb(s: SubscriptionInfo): number | null {
  const plan = activePlanKey(s);
  if (plan === 'empresa') return null; // custom / unmetered
  if (plan) return PLANS.find((p) => p.key === plan)?.storageGb ?? TRIAL_STORAGE_GB;
  // Trialing / none / canceled → lenient default; don't hard-block on lapse.
  return TRIAL_STORAGE_GB;
}

/** The cap in bytes. null = unmetered. */
export function storageLimitBytes(s: SubscriptionInfo): number | null {
  const gb = storageLimitGb(s);
  return gb === null ? null : gb * GB;
}

/** Would adding `addBytes` to `usedBytes` exceed the cap? false when unmetered. */
export function wouldExceedStorage(
  s: SubscriptionInfo,
  usedBytes: number,
  addBytes: number,
): boolean {
  const limit = storageLimitBytes(s);
  if (limit === null) return false;
  return usedBytes + addBytes > limit;
}

/** Used / limit as a 0–100 percentage (0 when unmetered). */
export function storagePercent(usedBytes: number, limitBytes: number | null): number {
  if (!limitBytes) return 0;
  return Math.min(100, Math.round((usedBytes / limitBytes) * 100));
}

/** Human-readable size: GB with one decimal at/above 1 GB, else whole MB. */
export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

// Per-business subscription status helpers (Stripe billing). Pure functions over
// the businesses.subscription_* columns (migration 099). Shared by web + mobile
// gating + the trial banner.

import type { PlanKey } from './plans';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'none';

export interface SubscriptionInfo {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

const DAY_MS = 86_400_000;

function trialEndMs(s: SubscriptionInfo): number | null {
  if (!s.trial_ends_at) return null;
  const t = Date.parse(s.trial_ends_at);
  return Number.isNaN(t) ? null : t;
}

/** True while the business is in its (app-managed, no-card) trial window. */
export function isInTrial(s: SubscriptionInfo, now = Date.now()): boolean {
  if (s.subscription_status !== 'trialing') return false;
  const end = trialEndMs(s);
  return end === null ? true : end > now;
}

/** Whole days left in the trial (0 once expired); null if not trialing. */
export function trialDaysLeft(s: SubscriptionInfo, now = Date.now()): number | null {
  if (s.subscription_status !== 'trialing') return null;
  const end = trialEndMs(s);
  if (end === null) return null;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/**
 * Whether the business currently has access to paid features.
 * - active            → yes
 * - trialing + unexpired → yes
 * - past_due          → yes (grace period; Stripe is retrying the card)
 * - trialing + expired, canceled, none → no
 */
export function hasActiveAccess(s: SubscriptionInfo, now = Date.now()): boolean {
  switch (s.subscription_status) {
    case 'active':
    case 'past_due':
      return true;
    case 'trialing':
      return isInTrial(s, now);
    default:
      return false;
  }
}

/** True when the trial has lapsed and no paid subscription took over. */
export function isTrialExpired(s: SubscriptionInfo, now = Date.now()): boolean {
  return s.subscription_status === 'trialing' && !isInTrial(s, now);
}

/** The active paid plan key, or null while trialing / lapsed / unsubscribed.
 *  Mirrors activePlanKey() in api/src/lib/planLimits.ts — the app and the
 *  server must agree on seat limits. (This list used to omit 'corporativo',
 *  so a 40-seat Corporativo business showed no plan and the app capped
 *  invites at the 10-seat trial allowance while the API allowed 40.) */
export function activePlanKey(s: SubscriptionInfo): PlanKey | null {
  const live = s.subscription_status === 'active' || s.subscription_status === 'past_due';
  if (!live || !s.plan) return null;
  const valid: PlanKey[] = ['basico', 'profesional', 'negocio', 'corporativo', 'empresa'];
  return (valid as string[]).includes(s.plan) ? (s.plan as PlanKey) : null;
}

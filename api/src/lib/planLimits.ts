// Server-side mirror of shared/src/lib/planLimits.ts (+ the maxMembers column
// of shared/src/lib/plans.ts).
//
// The api workspace doesn't depend on @amixos/shared (rootDir is scoped to
// api/src), so the seat table is duplicated here. The two copies must stay in
// sync — this one is AUTHORITATIVE. The client check exists to show the limit
// without a round trip; this one is what actually stops the invite, because a
// client-side cap is not a cap.

export type PlanKey = 'basico' | 'profesional' | 'negocio' | 'corporativo' | 'empresa';

/** Seats per plan. null = unmetered (Empresa/custom). */
const PLAN_MAX_MEMBERS: Record<PlanKey, number | null> = {
  basico: 2,
  profesional: 10,
  negocio: 20,
  corporativo: 40,
  empresa: null,
};

/** Seats during the no-card trial — Profesional's allowance, so a crew
 *  evaluating the app can get everyone in. See the shared copy for why. */
export const TRIAL_MEMBER_LIMIT = 10;

export interface SubscriptionRow {
  plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
}

/**
 * The active paid plan key, or null while trialing / lapsed / unsubscribed.
 * Mirrors activePlanKey() in shared/src/lib/subscription.ts: a plan only
 * counts while the subscription is actually live.
 */
export function activePlanKey(s: SubscriptionRow): PlanKey | null {
  const live = s.subscription_status === 'active' || s.subscription_status === 'past_due';
  if (!live || !s.plan) return null;
  return (s.plan as PlanKey) in PLAN_MAX_MEMBERS ? (s.plan as PlanKey) : null;
}

/** How many people this business may have. null = unmetered. */
export function memberLimit(s: SubscriptionRow): number | null {
  const plan = activePlanKey(s);
  if (plan === 'empresa') return null;
  if (plan) return PLAN_MAX_MEMBERS[plan] ?? TRIAL_MEMBER_LIMIT;
  return TRIAL_MEMBER_LIMIT;
}

/** Would adding `add` more people exceed the cap? false when unmetered.
 *  `used` must include pending invites — an unaccepted invite is a seat
 *  already spoken for, or you could queue 100 of them under a 2-seat plan. */
export function wouldExceedMembers(s: SubscriptionRow, used: number, add = 1): boolean {
  const limit = memberLimit(s);
  if (limit === null) return false;
  return used + add > limit;
}

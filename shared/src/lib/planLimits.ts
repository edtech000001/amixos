// Per-business team-size cap derived from the plan — the primary price lever.
//
// Counts business_members rows, ALL roles: a field worker who only clocks in
// costs the same seat as the owner. Simple to explain ("hasta 20 miembros"),
// simple to enforce, and at these prices it stays fair.
//
// Enforcement is ONE-DIRECTIONAL: a new invite is blocked once the business is
// at its cap, but nobody who is already a member is ever removed. A business
// that lands over its cap (downgrade, or a plan change on our side) keeps
// everyone and simply can't add more until it upgrades. The authoritative
// check lives in the API (api/src/lib/planLimits.ts — keep the two in sync);
// the client copy of it is there to show the limit before the round trip.

import { PLANS } from './plans';
import { activePlanKey, type SubscriptionInfo } from './subscription';

/** Seats during the no-card trial. Deliberately the Profesional allowance
 *  rather than Básico's 2 — a crew evaluating the app needs to get the whole
 *  team in to judge it. Landing over the cap after they pick Básico is fine:
 *  existing members stay, only new invites are blocked. */
export const TRIAL_MEMBER_LIMIT = 10;

/** How many people this business may have. null = unmetered (Empresa/custom). */
export function memberLimit(s: SubscriptionInfo): number | null {
  const plan = activePlanKey(s);
  if (plan === 'empresa') return null; // custom / unmetered
  if (plan) return PLANS.find((p) => p.key === plan)?.maxMembers ?? TRIAL_MEMBER_LIMIT;
  // Trialing / none / canceled → lenient default; don't hard-block on lapse.
  return TRIAL_MEMBER_LIMIT;
}

/** Would adding `add` more people exceed the cap? false when unmetered.
 *  `used` should include pending invites — an unaccepted invite is a seat
 *  already spoken for, or you could queue 100 of them under a 2-seat plan. */
export function wouldExceedMembers(
  s: SubscriptionInfo,
  used: number,
  add = 1,
): boolean {
  const limit = memberLimit(s);
  if (limit === null) return false;
  return used + add > limit;
}

/** Used / limit as a 0–100 percentage (0 when unmetered). */
export function memberPercent(used: number, limit: number | null): number {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** The cheapest plan that fits `count` people, or null when only Empresa does.
 *  Drives the "upgrade to X" prompt when an invite is blocked. */
export function smallestPlanFor(count: number): (typeof PLANS)[number] | null {
  return PLANS.find((p) => !p.custom && p.maxMembers !== null && p.maxMembers >= count) ?? null;
}

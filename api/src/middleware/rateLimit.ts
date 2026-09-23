// Shared rate limiters.
//
// The global limiter in index.ts is keyed on IP and is a backstop: it catches
// blunt scraping, but an office or a mobile carrier puts dozens of legitimate
// users behind ONE address, so it cannot be tightened much without punishing
// them. These limiters key on the VERIFIED user id instead (req.user, set by
// `authenticate`), which is the meaningful unit for "one account is hammering
// an expensive endpoint".
//
// Verified matters: keying on an unverified token would let an attacker mint
// fake ids and hand themselves a fresh bucket per request — strictly worse
// than the IP limit it replaced. So these must be mounted AFTER authenticate.
//
// NOTE — these counters live in the process's memory. Each Cloud Run instance
// keeps its own, so with N instances the effective ceiling is N x max. That is
// acceptable for the sizes below (they exist to stop runaway loops and cost
// blowouts, not to enforce an exact quota); an exact global cap needs a shared
// store such as Redis.

import rateLimit from 'express-rate-limit';
import type { AuthRequest } from './auth';

/** Per-authenticated-user limiter. Falls back to IP for unauthenticated hits
 *  (which should not reach these routes anyway — they sit behind authenticate). */
export function userLimiter(max: number, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'anon',
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/** Spawns pdftoppm and re-uploads the render: CPU and memory, per call. */
export const thumbnailLimiter = userLimiter(30);

/** Walks every file in a business — one deliberate run, never a loop. */
export const backfillLimiter = userLimiter(3, 5 * 60_000);

/** Sends email to an address the caller types. Abused, it is a spam cannon
 *  wearing our return address. */
export const inviteLimiter = userLimiter(10);

/** Burns someone else's API quota (Google) and can rewrite their contacts. */
export const googleSyncLimiter = userLimiter(60);

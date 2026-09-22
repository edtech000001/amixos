// Client for the account/business deletion endpoints (api/src/routes/account.ts,
// migration 230). Both apps call these — the rules that decide whether a
// deletion is allowed live on the server, so this file only carries the
// request and the shapes.

export interface DeletionBlocker {
  businessId: string;
  name: string | null;
  otherMembers: number;
}

export interface AccountStatus {
  /** Set while a deletion is scheduled — the app shows the restore screen. */
  pendingDeletion: { purgeAfter: string; requestedAt: string } | null;
  /** Businesses that stop an account deletion (owned + still have members). */
  blockers: DeletionBlocker[];
  /** Every business the caller owns, for the "delete this business" action. */
  ownedBusinesses: DeletionBlocker[];
  pendingBusinessDeletions: { businessId: string; purgeAfter: string }[];
}

interface Ctx {
  apiBaseUrl: string;
  jwt: string;
}

async function call<T>(ctx: Ctx, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ctx.apiBaseUrl}/api/v1/account${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.jwt}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Carry the server's code + blockers through so the UI can name the
    // businesses standing in the way instead of a generic failure.
    const err = new Error(String(body.message ?? 'request_failed')) as Error & {
      code?: string;
      blockers?: DeletionBlocker[];
      status?: number;
    };
    err.code = typeof body.code === 'string' ? body.code : undefined;
    err.blockers = Array.isArray(body.blockers) ? (body.blockers as DeletionBlocker[]) : undefined;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export const fetchAccountStatus = (ctx: Ctx) =>
  call<AccountStatus & { success: true }>(ctx, '/status');

/** Schedule the caller's own deletion. Throws with code
 *  'owns_business_with_members' (+ blockers) when a business is in the way. */
export const requestAccountDeletion = (ctx: Ctx, reason?: string) =>
  call<{ purgeAfter: string | null }>(ctx, '/delete', {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? null }),
  });

export const restoreAccount = (ctx: Ctx) => call<unknown>(ctx, '/restore', { method: 'POST' });

/** Close a business (owner only) — allowed even with other members. */
export const requestBusinessDeletion = (ctx: Ctx, businessId: string, reason?: string) =>
  call<{ purgeAfter: string | null }>(ctx, '/business/delete', {
    method: 'POST',
    body: JSON.stringify({ businessId, reason: reason ?? null }),
  });

export const restoreBusiness = (ctx: Ctx, businessId: string) =>
  call<unknown>(ctx, '/business/restore', {
    method: 'POST',
    body: JSON.stringify({ businessId }),
  });

/** Whole days until the hard delete — for "your data is removed in N days". */
export function daysUntilPurge(purgeAfter: string | null | undefined): number {
  if (!purgeAfter) return 0;
  const ms = Date.parse(purgeAfter) - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

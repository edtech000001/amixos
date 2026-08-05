// Client-side core for the "Ver como" (login-as-member) feature. Shared by web
// and mobile so the two platforms behave identically.
//
// HOW IT WORKS — the key idea is that we never touch the admin's real session.
// Instead, the Supabase client is created with a `global.fetch` wrapper
// (`impersonatingFetch`) that, while an impersonation token is active, rewrites
// the Authorization header on data requests to that token. PostgREST then
// evaluates RLS as the impersonated member, so every existing query returns the
// member's real, filtered view — with zero per-query changes. The admin's
// cookies / AsyncStorage session stays intact, so exiting is instant and safe.
//
// Auth endpoints (/auth/v1/*) are deliberately NOT rewritten: the admin's own
// token refresh must keep working in the background during impersonation.

import type { Role } from './permissions';

export interface ImpersonationTarget {
  userId: string;
  role: Role;
  email: string | null;
  name: string | null;
}

export interface ImpersonationState {
  token: string;
  businessId: string;
  target: ImpersonationTarget;
  expiresAt: number; // unix seconds
}

let state: ImpersonationState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(l => l());
}

/** Subscribe to start/stop/expiry changes (useSyncExternalStore-compatible). */
export function subscribeImpersonation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current snapshot (stable reference until it changes — safe for useSyncExternalStore). */
export function getImpersonation(): ImpersonationState | null {
  return state;
}

export function isImpersonating(): boolean {
  return state !== null;
}

/**
 * The active token, or null. Auto-clears (and notifies) once expired so a stale
 * token can never be used and the UI drops back to the admin automatically.
 */
export function getImpersonationToken(): string | null {
  if (!state) return null;
  if (Math.floor(Date.now() / 1000) >= state.expiresAt) {
    state = null;
    notify();
    return null;
  }
  return state.token;
}

/** Begin impersonating. Caller supplies the minted token + target context. */
export function startImpersonation(next: ImpersonationState): void {
  state = next;
  notify();
}

/** Stop impersonating and fall back to the admin's real session. */
export function stopImpersonation(): void {
  if (!state) return;
  state = null;
  notify();
}

/**
 * fetch wrapper installed into the Supabase client's `global.fetch`. Transparent
 * passthrough when not impersonating; otherwise overrides Authorization on data
 * requests so RLS runs as the member. Leaves /auth/v1/* untouched.
 */
export function impersonatingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getImpersonationToken();
  if (!token) return fetch(input, init);

  const isRequest = typeof input !== 'string' && !(input instanceof URL);
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  // Never hijack auth flows — the admin's own refresh must keep working.
  if (url.includes('/auth/v1/')) return fetch(input, init);

  // Read-only enforcement. "Ver como" is a preview, not a way to act as the
  // member, so block database mutations at the transport layer — this covers
  // BOTH platforms with no per-button wiring. Reads (GET/HEAD) pass through.
  // RPCs are POSTs too, and some are read-only aggregations, so we allow only
  // an explicit read-only allowlist and block every other RPC (a mutating
  // SECURITY DEFINER RPC — respond_shared_proposal, accept_invite,
  // transfer_business_ownership, … — must not run in preview mode).
  const method = (init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase();
  const isRpc = url.includes('/rest/v1/rpc/');
  // Read-only RPCs safe to run while impersonating (aggregations / lookups).
  const READONLY_RPCS = [
    'business_storage_bytes',
    'business_storage_breakdown',
    'list_audit_log',
    'list_business_members',
    'get_shared_invoice',
    'get_shared_proposal',
    'default_role_permissions',
    'member_res',
    'member_view',
    // List/dashboard aggregates (165, 181, 183) — pure SELECTs under the
    // caller's RLS; without these the jobs list badges, sorted views, group-by
    // and dashboard all error in "Ver como".
    'job_group_index',
    'job_tab_counts',
    'jobs_page_ids',
    'dashboard_stats',
    'invoice_tab_counts',
  ];
  const isReadOnlyRpc = isRpc && READONLY_RPCS.some(fn => url.includes(`/rest/v1/rpc/${fn}`));
  const isDbWrite =
    url.includes('/rest/v1/') &&
    !isReadOnlyRpc &&
    (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE');
  if (isDbWrite) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          code: 'impersonation_read_only',
          message: 'Acción no permitida en modo “Ver como” (solo lectura).',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const headers = new Headers(
    init?.headers ?? (isRequest ? (input as Request).headers : undefined),
  );
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

// ─── API helpers ───────────────────────────────────────────────────────────
// Thin clients over the /admin/impersonate endpoints. Both platforms pass the
// API base URL + the admin's real JWT (never the impersonation token).

export interface RequestImpersonationArgs {
  apiBaseUrl: string;
  jwt: string;
  businessId: string;
  targetUserId: string;
}

export interface ImpersonationGrant {
  token: string;
  expiresAt: number;
  target: ImpersonationTarget;
}

/** Ask the API to mint a token for a member. Throws with the server code on failure. */
export async function requestImpersonation(
  args: RequestImpersonationArgs,
): Promise<ImpersonationGrant> {
  const res = await fetch(`${args.apiBaseUrl.replace(/\/$/, '')}/api/v1/admin/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.jwt}` },
    body: JSON.stringify({ business_id: args.businessId, target_user_id: args.targetUserId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.code || json?.message || `impersonate_failed_${res.status}`);
  }
  const d = json.data;
  return {
    token: d.token,
    expiresAt: d.expiresAt,
    target: {
      userId: d.target.userId,
      role: d.target.role as Role,
      email: d.target.email ?? null,
      name: d.target.name ?? null,
    },
  };
}

// Server codes that reflect a real business rule — retrying can't change the
// outcome, so they surface to the caller immediately.
const NON_RETRYABLE_CODES = new Set(['role_not_allowed', 'not_a_member', 'impersonate_self']);

/**
 * requestImpersonation with a one-shot recovery for transient auth failures.
 * The admin's access token can be mid-rotation right after leaving a previous
 * "Ver como" session (autoRefreshToken race), which makes the mint 401 even
 * though the admin is perfectly logged in. On any retryable failure we force a
 * session refresh, grab a fresh JWT, and try once more before giving up.
 */
export async function requestImpersonationWithRetry(args: {
  apiBaseUrl: string;
  businessId: string;
  targetUserId: string;
  getJwt: () => Promise<string>;
  refreshSession: () => Promise<unknown>;
}): Promise<ImpersonationGrant> {
  const base = { apiBaseUrl: args.apiBaseUrl, businessId: args.businessId, targetUserId: args.targetUserId };
  try {
    return await requestImpersonation({ ...base, jwt: await args.getJwt() });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (NON_RETRYABLE_CODES.has(code)) throw e;
    try {
      await args.refreshSession();
    } catch {
      /* refresh is best-effort — the retry below decides the outcome */
    }
    return await requestImpersonation({ ...base, jwt: await args.getJwt() });
  }
}

/** Best-effort audit marker on exit. Failures are swallowed — the token self-expires. */
export async function notifyStopImpersonation(args: {
  apiBaseUrl: string;
  jwt: string;
  businessId: string;
  targetUserId: string;
}): Promise<void> {
  try {
    await fetch(`${args.apiBaseUrl.replace(/\/$/, '')}/api/v1/admin/impersonate/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.jwt}` },
      body: JSON.stringify({ business_id: args.businessId, target_user_id: args.targetUserId }),
    });
  } catch {
    /* swallow — audit-only */
  }
}

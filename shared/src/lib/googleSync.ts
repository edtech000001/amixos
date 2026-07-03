/**
 * Fire-and-forget hook to notify the API that a client was mutated, so it
 * can mirror the change to the user's Google Contacts. Never throws or
 * blocks the UI — sync is best-effort.
 *
 * Usage:
 *   triggerGoogleSync('create', clientId, { apiBaseUrl, jwt });
 *
 * If sync isn't enabled / connected for this user, the API silently no-ops.
 */
export type GoogleSyncAction = 'create' | 'update' | 'delete';

export interface TriggerGoogleSyncOptions {
  apiBaseUrl: string;
  jwt: string;
}

/**
 * Thrown by the *OrThrow variants when the mirror didn't happen. `code`
 * lets callers pick the right user message:
 *  - 'reconnect_required' → the Google connection is dead (token revoked /
 *    expired); the user must reconnect in Ajustes. Surface prominently.
 *  - 'sync_failed' → transient failure (rate limit, People API hiccup);
 *    the row will sync next time it's touched.
 */
export class GoogleSyncError extends Error {
  code: 'reconnect_required' | 'sync_failed';
  constructor(code: 'reconnect_required' | 'sync_failed', message: string) {
    super(message);
    this.name = 'GoogleSyncError';
    this.code = code;
  }
}

/** Banner copy for a dead connection — points the user at the fix. */
export const GOOGLE_SYNC_RECONNECT_MESSAGE =
  'Google Contacts se desconectó — vuelve a conectarlo en Ajustes para seguir sincronizando tus contactos.';

/**
 * Pick the right banner message for a failed *OrThrow sync: a dead
 * connection gets the actionable reconnect copy; anything else keeps the
 * caller's op-specific fallback ("No se pudo agregar…", etc.).
 */
export function googleSyncErrorMessage(e: unknown, fallback: string): string {
  return e instanceof GoogleSyncError && e.code === 'reconnect_required'
    ? GOOGLE_SYNC_RECONNECT_MESSAGE
    : fallback;
}

// The sync endpoints reply 200 even when the mirror failed — the outcome
// rides in data.error. Benign outcomes (sync paused, row never synced) are
// NOT failures and must not throw.
const BENIGN_SYNC_ERRORS = new Set(['sync_disabled', 'no_resource_name', 'no_etag']);

async function throwIfBodyReportsFailure(res: Response, label: string): Promise<void> {
  const json = (await res.json().catch(() => null)) as { data?: { error?: string } } | null;
  const errCode = json?.data?.error;
  if (!errCode || BENIGN_SYNC_ERRORS.has(errCode)) return;
  throw new GoogleSyncError(
    errCode === 'reconnect_required' ? 'reconnect_required' : 'sync_failed',
    `${label}: ${errCode}`,
  );
}

/**
 * Mirror a client_contact mutation to Google Contacts. Each client_contact
 * becomes its own Google contact whose organization is the parent client's
 * company and whose biography links it back to that client.
 *
 * Same await semantics as triggerGoogleSync — caller can fire-and-forget
 * for create/update, or `await` for delete so the API can read the
 * google_resource_name before the local row is dropped.
 */
export function triggerClientContactGoogleSync(
  action: GoogleSyncAction,
  contactId: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
): Promise<void> {
  return doClientContactGoogleSyncRequest(action, contactId, { apiBaseUrl, jwt }).catch(() => {});
}

/**
 * Same as triggerClientContactGoogleSync but throws on non-2xx so the batch
 * runner can surface failures. Used by the GoogleSyncBanner queue when it
 * reapplies the note template across both clients AND client_contacts.
 */
export function triggerClientContactGoogleSyncOrThrow(
  action: GoogleSyncAction,
  contactId: string,
  opts: TriggerGoogleSyncOptions,
): Promise<void> {
  return doClientContactGoogleSyncRequest(action, contactId, opts);
}

async function doClientContactGoogleSyncRequest(
  action: GoogleSyncAction,
  contactId: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/client-contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, contactId }),
  });
  if (!res.ok) {
    throw new Error(`Google sync (contact) failed (${res.status})`);
  }
  await throwIfBodyReportsFailure(res, 'Google sync (contact)');
}

/**
 * Internal raw request — throws on network failure OR non-2xx response.
 * Used by the batch runner and the new error-reporting variant so failures
 * can be surfaced to the user via the GoogleSyncBanner. The fire-and-forget
 * variants below wrap this with a catch.
 */
async function doGoogleSyncRequest(
  action: GoogleSyncAction,
  clientId: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
  skipContactCascade = false,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, clientId, skipContactCascade }),
  });
  if (!res.ok) {
    throw new Error(`Google sync failed (${res.status})`);
  }
  await throwIfBodyReportsFailure(res, 'Google sync');
}

export function triggerGoogleSync(
  action: GoogleSyncAction,
  clientId: string,
  opts: TriggerGoogleSyncOptions,
): Promise<void> {
  // Fire-and-forget — swallows errors. Use this for callers that don't
  // want to surface sync failures to the user.
  return doGoogleSyncRequest(action, clientId, opts).catch(() => {});
}

/**
 * Same as triggerGoogleSync, but throws on failure so the caller can
 * report the error (e.g. via the GoogleSyncBanner). Use for single-op
 * mutations (add/edit/delete one client) where the user should know if
 * the Google mirror didn't go through.
 *
 * skipContactCascade: on 'update' the API re-pushes the client's synced
 * contact people too (they inherit address/company/template from the
 * parent). Batch runners that already enqueue contacts separately pass
 * true to avoid pushing each contact twice.
 */
export function triggerGoogleSyncOrThrow(
  action: GoogleSyncAction,
  clientId: string,
  opts: TriggerGoogleSyncOptions,
  skipContactCascade = false,
): Promise<void> {
  return doGoogleSyncRequest(action, clientId, opts, skipContactCascade);
}

/**
 * Delete a Google contact by resourceName — used by the bulk-delete
 * queue runner once the local Amixos row is gone (so we can't go
 * through the clientId endpoint anymore). Throws on failure.
 */
export async function triggerGoogleSyncDeleteOrphan(
  businessId: string,
  resourceName: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/contact/delete-orphan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ businessId, resourceName }),
  });
  if (!res.ok) {
    throw new Error(`Google sync delete-orphan failed (${res.status})`);
  }
}

// Bulk batch runner moved into GoogleSyncBannerProvider — it owns
// throttling + persistence + auto-resume. Callers should use
// `syncBanner.runCreateBatch(ids)` (or `runDeleteBatch` for orphan
// cleanup) instead — the provider owns throttling + persistence.

/**
 * Check whether the active business has Google Contacts sync connected AND
 * enabled. Used to gate the banner / batch runner — without this, importing
 * a CSV on a fresh account triggers a "Agregando a Google Contacts" banner
 * even though no connection was ever established. The API silently no-ops
 * disconnected requests, so the call would "succeed" while doing nothing.
 *
 * Returns false on any error (missing creds, network, auth) — sync is
 * best-effort and false is always the safe default.
 */
export async function isGoogleSyncConnected(
  businessId: string,
  opts: { apiBaseUrl: string | null; jwt: string | null },
): Promise<boolean> {
  if (!opts.apiBaseUrl || !opts.jwt || !businessId) return false;
  try {
    const res = await fetch(
      `${opts.apiBaseUrl}/api/v1/google-sync/status?business_id=${businessId}`,
      { headers: { Authorization: `Bearer ${opts.jwt}` } },
    );
    if (!res.ok) return false;
    const json = await res.json();
    const data = json?.data;
    // Mirror the server-side gate at /google-sync/contact: a row must
    // exist (connected) AND not be paused (enabled !== false).
    return Boolean(data?.connected) && data?.enabled !== false;
  } catch {
    return false;
  }
}

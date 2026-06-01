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
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, clientId }),
  });
  if (!res.ok) {
    throw new Error(`Google sync failed (${res.status})`);
  }
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
 */
export function triggerGoogleSyncOrThrow(
  action: GoogleSyncAction,
  clientId: string,
  opts: TriggerGoogleSyncOptions,
): Promise<void> {
  return doGoogleSyncRequest(action, clientId, opts);
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

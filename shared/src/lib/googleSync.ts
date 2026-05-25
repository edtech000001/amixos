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
  return fetch(`${apiBaseUrl}/api/v1/google-sync/client-contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, contactId }),
  })
    .then(() => undefined)
    .catch(() => {
      // Same swallow behavior as triggerGoogleSync.
    });
}

export function triggerGoogleSync(
  action: GoogleSyncAction,
  clientId: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
): Promise<void> {
  // Returns a Promise so callers that NEED ordering (delete: must run before
  // the local row is dropped, otherwise the API can't look up its
  // google_resource_name) can await. Existing create/update callers don't
  // await — they remain fire-and-forget. Either pattern is supported.
  return fetch(`${apiBaseUrl}/api/v1/google-sync/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, clientId }),
  })
    .then(() => undefined)
    .catch(() => {
      // Swallow — sync failures should not surface as errors to the user.
      // The API logs the actual error and the settings page surfaces it.
    });
}

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

export function triggerGoogleSync(
  action: GoogleSyncAction,
  clientId: string,
  { apiBaseUrl, jwt }: TriggerGoogleSyncOptions,
): void {
  // Don't await — UI should never wait on this.
  fetch(`${apiBaseUrl}/api/v1/google-sync/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action, clientId }),
  }).catch(() => {
    // Swallow — sync failures should not surface as errors to the user.
    // The API logs the actual error and the settings page surfaces it.
  });
}

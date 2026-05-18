import { supabase } from '../config/supabase';

/**
 * Google Contacts sync engine.
 *
 * Reads per-user credentials from `user_oauth_credentials`, exchanges the
 * stored refresh token for an access token via Google's OAuth endpoint, and
 * calls the People API to mirror our `clients` table into the user's
 * personal Google Contacts.
 *
 * Mirrors the architecture of the user's previous Apps Script CRM
 * (createContact / updateContact / deleteContact) but server-side so the
 * refresh token never leaves the backend and web + mobile share one engine.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PEOPLE_API_BASE = 'https://people.googleapis.com/v1';

export interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  phone_cell: string | null;
  phone_office: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  google_resource_name: string | null;
}

export interface OAuthCreds {
  user_id: string;
  refresh_token: string;
  enabled: boolean;
  contact_group_id: string | null;
}

/**
 * Exchange a refresh token for a fresh access token.
 * Returns null on failure (revoked token, network error, etc.) so callers
 * can flag the credential as needing reconnection.
 */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET not set');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Build the People API contact payload from a client row. Mirrors the
 * structure used in the user's old Apps Script (names, emails, phones,
 * addresses, organizations, biographies, userDefined, memberships).
 */
function buildContactPayload(client: ClientRow, contactGroupId: string | null) {
  const fullAddress = [client.address, client.address_line2, client.city, client.state, client.zip_code]
    .filter(Boolean)
    .join(', ');

  const payload: Record<string, unknown> = {
    names: [{ givenName: client.first_name, familyName: client.last_name }],
    userDefined: [{ key: 'IDnumber', value: client.id }],
  };

  const emails: { type: string; value: string }[] = [];
  if (client.email_office) emails.push({ type: 'work', value: client.email_office });
  if (client.email_home) emails.push({ type: 'home', value: client.email_home });
  if (emails.length) payload.emailAddresses = emails;

  const phones: { type: string; value: string }[] = [];
  if (client.phone_cell) phones.push({ type: 'mobile', value: client.phone_cell });
  if (client.phone_office) phones.push({ type: 'work', value: client.phone_office });
  if (phones.length) payload.phoneNumbers = phones;

  if (fullAddress) payload.addresses = [{ type: 'work', formattedValue: fullAddress }];
  if (client.company) payload.organizations = [{ name: client.company }];
  if (client.notes) payload.biographies = [{ value: client.notes }];

  if (contactGroupId) {
    payload.memberships = [{ contactGroupMembership: { contactGroupResourceName: `contactGroups/${contactGroupId}` } }];
  }

  return payload;
}

/**
 * Mark credentials as needing reconnection (called when the token has been
 * revoked server-side). Caller continues normally — the failed sync just
 * doesn't write a resourceName.
 */
async function markReconnectNeeded(userId: string, message: string) {
  await supabase
    .from('user_oauth_credentials')
    .update({
      enabled: false,
      last_sync_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

async function recordSyncError(userId: string, message: string) {
  await supabase
    .from('user_oauth_credentials')
    .update({
      last_sync_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

async function recordSyncSuccess(userId: string) {
  await supabase
    .from('user_oauth_credentials')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/**
 * Create a Google contact for the given client and write the resourceName
 * back to the clients table. Idempotency: if the client already has a
 * google_resource_name, this is a no-op (returns the existing one).
 */
export async function createGoogleContact(
  client: ClientRow,
  creds: OAuthCreds,
): Promise<{ resourceName: string } | { error: string }> {
  if (client.google_resource_name) {
    return { resourceName: client.google_resource_name };
  }
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  const payload = buildContactPayload(client, creds.contact_group_id);
  const res = await fetch(`${PEOPLE_API_BASE}/people:createContact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API ${res.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${res.status}` };
  }

  const json = (await res.json()) as { resourceName?: string };
  if (!json.resourceName) {
    await recordSyncError(creds.user_id, 'People API returned no resourceName');
    return { error: 'no_resource_name' };
  }

  // Persist the resourceName so future updates/deletes can target this contact.
  await supabase
    .from('clients')
    .update({ google_resource_name: json.resourceName })
    .eq('id', client.id);

  await recordSyncSuccess(creds.user_id);
  return { resourceName: json.resourceName };
}

/**
 * Look up the user's Google Contact Groups (for the optional dropdown in
 * Ajustes). Returns an empty array if the user is disconnected.
 */
export async function listContactGroups(creds: OAuthCreds): Promise<{ id: string; name: string }[]> {
  const accessToken = await refreshAccessToken(creds.refresh_token);
  if (!accessToken) return [];

  const res = await fetch(`${PEOPLE_API_BASE}/contactGroups?pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    contactGroups?: { resourceName: string; name: string; groupType?: string }[];
  };

  return (json.contactGroups ?? [])
    .filter(g => g.groupType !== 'SYSTEM_CONTACT_GROUP' || g.name === 'myContacts')
    .map(g => ({
      id: g.resourceName.replace('contactGroups/', ''),
      name: g.name,
    }));
}

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
  business_id: string;
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
  custom_fields: Record<string, string> | null;
  google_resource_name: string | null;
}

// A secondary person attached to a client (foreman, project manager, etc).
// Synced to Google as a separate contact with the parent client's company
// as the organization, so the user can recognize "this is the guy who calls
// from Acme Co" by either looking up the client OR seeing it in Google.
export interface ClientContactRow {
  id: string;
  business_id: string;
  client_id: string;
  name: string;          // single text field — split on first space for given/family
  role: string | null;   // job title, e.g. "Encargado"
  phone: string | null;
  email: string | null;
  notes: string | null;
  google_resource_name: string | null;
}

// Subset of the parent client row we need to enrich the contact's Google
// record (organization name, biography reference).
export interface ParentClientRef {
  first_name: string;
  last_name: string;
  company: string | null;
}

export interface OAuthCreds {
  user_id: string;
  // Which business this credential belongs to. Per-business sync (migration
  // 031): a user with three businesses has three independent connections,
  // each with its own refresh token / contact group.
  business_id: string;
  refresh_token: string;
  // The client_id that issued this refresh_token. Refresh tokens are bound
  // to the OAuth client that issued them — we can't refresh an iOS-issued
  // token using Web client credentials. Null = legacy row (pre-iOS direct
  // OAuth) — treated as the Web client for backwards compatibility.
  client_id: string | null;
  enabled: boolean;
  contact_group_id: string | null;
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * The Web client (with secret) is configured via GOOGLE_OAUTH_CLIENT_ID /
 * GOOGLE_OAUTH_CLIENT_SECRET. Public clients (iOS, Android — issued via
 * PKCE) just send their client_id with no secret. We figure out which kind
 * of credential we have by comparing the stored client_id against the
 * configured Web client.
 *
 * Returns null on failure (revoked token, network error, etc.) so callers
 * can flag the credential as needing reconnection.
 */
async function refreshAccessToken(
  refreshToken: string,
  storedClientId: string | null,
): Promise<string | null> {
  const webClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const webClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!webClientId || !webClientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET not set');
  }

  // Default to the Web client when no client_id was recorded — that's the
  // pre-iOS state, before migration 029.
  const clientId = storedClientId ?? webClientId;
  const isWebClient = clientId === webClientId;

  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (isWebClient) {
    params.set('client_secret', webClientSecret);
  }

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
 * Look up the human-readable labels for a business's client custom field
 * templates. Returns a Map<field_key, field_label> we pass into
 * buildContactPayload so Google sees "Cumpleaños: 2024-08-15" instead of
 * "birthday: 2024-08-15". Empty map on lookup failure — falls back to keys.
 */
async function loadClientFieldLabels(businessId: string): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const { data } = await supabase
    .from('client_field_templates')
    .select('field_key, field_label')
    .eq('business_id', businessId);
  for (const t of ((data ?? []) as Array<{ field_key: string; field_label: string }>)) {
    labels.set(t.field_key, t.field_label);
  }
  return labels;
}

/**
 * Build the People API contact payload from a client row. Mirrors the
 * structure used in the user's old Apps Script (names, emails, phones,
 * addresses, organizations, biographies, userDefined, memberships) and adds
 * every custom field as a userDefined entry keyed by its template label.
 *
 * People API allows up to 100 userDefined entries per contact, which is
 * comfortably more than any realistic custom field count.
 */
function buildContactPayload(
  client: ClientRow,
  contactGroupId: string | null,
  customLabels: Map<string, string>,
) {
  const fullAddress = [client.address, client.address_line2, client.city, client.state, client.zip_code]
    .filter(Boolean)
    .join(', ');

  // Build userDefined: IDnumber first (used for dedup on backfill), then one
  // entry per custom field with the template label as the user-visible key.
  const userDefined: Array<{ key: string; value: string }> = [
    { key: 'IDnumber', value: client.id },
  ];
  if (client.custom_fields) {
    for (const [fieldKey, rawValue] of Object.entries(client.custom_fields)) {
      if (rawValue == null || rawValue === '') continue;
      const value = String(rawValue);
      const label = customLabels.get(fieldKey) ?? fieldKey;
      userDefined.push({ key: label, value });
    }
  }

  const payload: Record<string, unknown> = {
    names: [{ givenName: client.first_name, familyName: client.last_name }],
    userDefined,
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
  // Always include an "Amixos" source tag in the biography so the user can
  // tell at a glance which Google contacts came from this app. The client's
  // own notes follow on a new paragraph if present.
  const clientBio = client.notes ? `Amixos: ${client.notes}` : 'Amixos';
  payload.biographies = [{ value: clientBio }];

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

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  const labels = await loadClientFieldLabels(client.business_id);
  const payload = buildContactPayload(client, creds.contact_group_id, labels);
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
 * Build the People API payload for a client contact (secondary person on a
 * client). The parent client's company name becomes the organization so
 * Google shows "Encargado at Acme Co" — and the biography records the
 * lineage as "Employee of Jeff Liden" so it's clear where the person came
 * from in Amixos.
 *
 * Name parsing: client_contacts.name is a single text field. Split on the
 * first whitespace — first token = givenName, rest = familyName. If there's
 * no whitespace it all goes into givenName.
 */
function buildClientContactPayload(
  contact: ClientContactRow,
  parent: ParentClientRef,
  contactGroupId: string | null,
): Record<string, unknown> {
  const parts = (contact.name ?? '').trim().split(/\s+/);
  const givenName = parts[0] ?? contact.name;
  const familyName = parts.slice(1).join(' ');

  // Organization: prefer the client's company name. Falls back to the
  // client's first+last so the contact still has a recognizable parent.
  const parentName = `${parent.first_name} ${parent.last_name}`.trim();
  const orgName = parent.company?.trim() || parentName;

  // Biography: lead with "Amixos:" source tag and the parent-client link
  // ("Employee of {client name}"), then the contact's own notes on a new
  // paragraph if present. Matches the clients format so every Google
  // contact synced from Amixos is recognizable at a glance.
  const biographyLines = [`Amixos: Employee of ${parentName}`];
  if (contact.notes) biographyLines.push(contact.notes);
  const biographyValue = biographyLines.join('\n\n');

  const payload: Record<string, unknown> = {
    names: [{ givenName, familyName }],
    organizations: [
      { name: orgName, title: contact.role ?? undefined },
    ],
    biographies: [{ value: biographyValue }],
    // userDefined identifies this row across reconnect cycles for dedup.
    // ParentClientId lets a future feature surface contacts under their
    // parent client when listing Google contacts.
    userDefined: [
      { key: 'IDnumber', value: contact.id },
      { key: 'AmixosType', value: 'client_contact' },
      { key: 'ParentClientId', value: contact.client_id },
    ],
  };

  if (contact.email) {
    payload.emailAddresses = [{ type: 'work', value: contact.email }];
  }
  if (contact.phone) {
    payload.phoneNumbers = [{ type: 'mobile', value: contact.phone }];
  }
  if (contactGroupId) {
    payload.memberships = [{
      contactGroupMembership: { contactGroupResourceName: `contactGroups/${contactGroupId}` },
    }];
  }

  return payload;
}

export async function createClientContactGoogleContact(
  contact: ClientContactRow,
  parent: ParentClientRef,
  creds: OAuthCreds,
): Promise<{ resourceName: string } | { error: string }> {
  if (contact.google_resource_name) {
    return { resourceName: contact.google_resource_name };
  }
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  const payload = buildClientContactPayload(contact, parent, creds.contact_group_id);
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
    await recordSyncError(creds.user_id, `People API (contact) ${res.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${res.status}` };
  }

  const json = (await res.json()) as { resourceName?: string };
  if (!json.resourceName) {
    return { error: 'no_resource_name' };
  }

  await supabase
    .from('client_contacts')
    .update({ google_resource_name: json.resourceName })
    .eq('id', contact.id);

  await recordSyncSuccess(creds.user_id);
  return { resourceName: json.resourceName };
}

export async function updateClientContactGoogleContact(
  contact: ClientContactRow,
  parent: ParentClientRef,
  creds: OAuthCreds,
): Promise<{ resourceName: string } | { error: string }> {
  if (!contact.google_resource_name) {
    // Never synced — fall through to create.
    return createClientContactGoogleContact(contact, parent, creds);
  }
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  // Fetch current etag.
  const getRes = await fetch(
    `${PEOPLE_API_BASE}/${contact.google_resource_name}?personFields=metadata`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (getRes.status === 404) {
    await supabase
      .from('client_contacts')
      .update({ google_resource_name: null })
      .eq('id', contact.id);
    const fresh = { ...contact, google_resource_name: null };
    return createClientContactGoogleContact(fresh, parent, creds);
  }
  if (getRes.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API get ${getRes.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${getRes.status}` };
  }
  const current = (await getRes.json()) as { etag?: string };
  if (!current.etag) return { error: 'no_etag' };

  const payload = {
    ...buildClientContactPayload(contact, parent, creds.contact_group_id),
    etag: current.etag,
  };
  const updateRes = await fetch(
    `${PEOPLE_API_BASE}/${contact.google_resource_name}:updateContact?updatePersonFields=${encodeURIComponent(UPDATE_PERSON_FIELDS)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (updateRes.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!updateRes.ok) {
    const text = await updateRes.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API update ${updateRes.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${updateRes.status}` };
  }
  const updated = (await updateRes.json()) as { resourceName?: string };
  await recordSyncSuccess(creds.user_id);
  return { resourceName: updated.resourceName ?? contact.google_resource_name };
}

export async function deleteClientContactGoogleContact(
  contact: ClientContactRow,
  creds: OAuthCreds,
): Promise<{ ok: true } | { error: string }> {
  if (!contact.google_resource_name) return { ok: true };
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  const res = await fetch(
    `${PEOPLE_API_BASE}/${contact.google_resource_name}:deleteContact`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API delete ${res.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${res.status}` };
  }
  await recordSyncSuccess(creds.user_id);
  return { ok: true };
}

/**
 * Update an existing Google contact to mirror the current `clients` row.
 * Idempotency: if the client doesn't have a `google_resource_name`, this
 * falls through to createGoogleContact instead (treats it as a sync from
 * scratch — useful if Google contact was manually deleted).
 *
 * People API requires the current `etag` for optimistic concurrency. We
 * fetch it via people.get before sending the PATCH.
 */
const UPDATE_PERSON_FIELDS = [
  'names',
  'emailAddresses',
  'phoneNumbers',
  'addresses',
  'organizations',
  'biographies',
  'memberships',
  'userDefined',
].join(',');

export async function updateGoogleContact(
  client: ClientRow,
  creds: OAuthCreds,
): Promise<{ resourceName: string } | { error: string }> {
  if (!client.google_resource_name) {
    // Nothing to update — fall through to create instead so subsequent edits
    // start syncing.
    return createGoogleContact(client, creds);
  }
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  // 1. Fetch current etag. Without it the update is rejected.
  const getRes = await fetch(
    `${PEOPLE_API_BASE}/${client.google_resource_name}?personFields=metadata`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (getRes.status === 404) {
    // Contact was deleted on Google's side. Wipe our reference so the next
    // sync action re-creates it instead of erroring forever.
    await supabase
      .from('clients')
      .update({ google_resource_name: null })
      .eq('id', client.id);
    // Recreate so the user's update flows through immediately.
    const fresh: ClientRow = { ...client, google_resource_name: null };
    return createGoogleContact(fresh, creds);
  }
  if (getRes.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API get ${getRes.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${getRes.status}` };
  }

  const current = (await getRes.json()) as { etag?: string };
  if (!current.etag) {
    return { error: 'no_etag' };
  }

  // 2. PATCH with the new payload + etag.
  const labels = await loadClientFieldLabels(client.business_id);
  const payload = { ...buildContactPayload(client, creds.contact_group_id, labels), etag: current.etag };
  const updateRes = await fetch(
    `${PEOPLE_API_BASE}/${client.google_resource_name}:updateContact?updatePersonFields=${encodeURIComponent(UPDATE_PERSON_FIELDS)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (updateRes.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  if (!updateRes.ok) {
    const text = await updateRes.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API update ${updateRes.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${updateRes.status}` };
  }

  const updated = (await updateRes.json()) as { resourceName?: string };
  await recordSyncSuccess(creds.user_id);
  return { resourceName: updated.resourceName ?? client.google_resource_name };
}

/**
 * Delete a Google contact. Best-effort: a 404 (already gone) is treated as
 * success. Clears the local google_resource_name regardless so future
 * actions on this client behave correctly.
 */
export async function deleteGoogleContact(
  client: ClientRow,
  creds: OAuthCreds,
): Promise<{ ok: true } | { error: string }> {
  if (!client.google_resource_name) {
    // Never synced — nothing to delete.
    return { ok: true };
  }
  if (!creds.enabled) return { error: 'sync_disabled' };

  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }

  const res = await fetch(
    `${PEOPLE_API_BASE}/${client.google_resource_name}:deleteContact`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (res.status === 401) {
    await markReconnectNeeded(creds.user_id, 'Token revoked, reconnect required');
    return { error: 'reconnect_required' };
  }
  // 404 = the contact was already gone in Google. Treat as success — our DB
  // is about to lose the row anyway. Anything else 4xx/5xx is a real error.
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    await recordSyncError(creds.user_id, `People API delete ${res.status}: ${text.slice(0, 200)}`);
    return { error: `people_api_error:${res.status}` };
  }

  await recordSyncSuccess(creds.user_id);
  return { ok: true };
}

/**
 * Look up the user's Google Contact Groups (for the optional dropdown in
 * Ajustes). Returns an empty array if the user is disconnected.
 */
export async function listContactGroups(creds: OAuthCreds): Promise<{ id: string; name: string }[]> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
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

/**
 * Pull every contact in a specific contact group, building a map of the
 * Amixos IDnumber userDefined value → resourceName. Used by backfill to
 * detect "this client was synced before (maybe disconnected + reconnected)
 * and the Google contact still exists" — we link instead of recreating.
 *
 * Paginates through all pages. People API caps pageSize at 1000.
 */
export async function listGroupContactsByIdNumber(
  creds: OAuthCreds,
  contactGroupId: string,
): Promise<Map<string, string>> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  const idMap = new Map<string, string>();
  if (!accessToken) return idMap;

  let pageToken: string | undefined;
  // Hard cap on pagination so a misbehaving response can't infinite-loop us.
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({
      resourceName: `contactGroups/${contactGroupId}`,
      maxMembers: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    // 1. Get member resource names for this group page.
    const groupRes = await fetch(
      `${PEOPLE_API_BASE}/contactGroups/${encodeURIComponent(contactGroupId)}?maxMembers=1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!groupRes.ok) return idMap;
    const groupJson = (await groupRes.json()) as {
      memberResourceNames?: string[];
    };
    const memberResources = groupJson.memberResourceNames ?? [];
    if (memberResources.length === 0) break;

    // 2. Batch-get the actual people records with userDefined to read IDnumber.
    // batchGet accepts up to 200 resourceNames at a time.
    for (let j = 0; j < memberResources.length; j += 200) {
      const chunk = memberResources.slice(j, j + 200);
      const qs = new URLSearchParams({
        personFields: 'userDefined',
      });
      for (const rn of chunk) qs.append('resourceNames', rn);
      const batchRes = await fetch(`${PEOPLE_API_BASE}/people:batchGet?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!batchRes.ok) continue;
      const batchJson = (await batchRes.json()) as {
        responses?: Array<{
          person?: {
            resourceName?: string;
            userDefined?: Array<{ key?: string; value?: string }>;
          };
        }>;
      };
      for (const r of batchJson.responses ?? []) {
        const rn = r.person?.resourceName;
        const idEntry = (r.person?.userDefined ?? []).find(u => u.key === 'IDnumber');
        if (rn && idEntry?.value) {
          idMap.set(idEntry.value, rn);
        }
      }
    }

    // contactGroups.get doesn't paginate members the same way — if there
    // are more than 1000 they're truncated. For 99% of users 1000 is plenty.
    // (If you have over 1000 contacts in a single label we'll just miss
    // dedup for the tail; not a correctness issue.)
    break;
  }
  return idMap;
}

/**
 * Search Google contacts by an arbitrary query string (free text against
 * names, emails, phones, etc.). Returns up to 30 matching resource names
 * (People API's limit per searchContacts call). Used by backfill to find
 * an existing Google contact that matches our client by email or phone.
 */
export async function searchGoogleContacts(
  creds: OAuthCreds,
  query: string,
): Promise<Array<{ resourceName: string; emails: string[]; phones: string[] }>> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken || !query.trim()) return [];

  const params = new URLSearchParams({
    query,
    readMask: 'emailAddresses,phoneNumbers',
    pageSize: '30',
  });
  const res = await fetch(`${PEOPLE_API_BASE}/people:searchContacts?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<{
      person?: {
        resourceName?: string;
        emailAddresses?: Array<{ value?: string }>;
        phoneNumbers?: Array<{ value?: string; canonicalForm?: string }>;
      };
    }>;
  };
  return (json.results ?? [])
    .map(r => ({
      resourceName: r.person?.resourceName ?? '',
      emails: (r.person?.emailAddresses ?? [])
        .map(e => e.value?.toLowerCase().trim())
        .filter((v): v is string => !!v),
      phones: (r.person?.phoneNumbers ?? [])
        .map(p => p.canonicalForm ?? p.value ?? '')
        .filter(Boolean),
    }))
    .filter(r => r.resourceName);
}

/**
 * Bulk-delete Google contacts in batches of 200 (the People API limit per
 * batchDeleteContacts call). Best-effort: each batch is independent, and a
 * 404 on a single contact (already deleted manually) doesn't fail the whole
 * call. Returns the count of resourceNames actually submitted.
 */
export async function batchDeleteGoogleContacts(
  creds: OAuthCreds,
  resourceNames: string[],
): Promise<{ deleted: number; errors: number }> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) return { deleted: 0, errors: resourceNames.length };

  let deleted = 0;
  let errors = 0;
  // Chunk to 200 per batch.
  for (let i = 0; i < resourceNames.length; i += 200) {
    const chunk = resourceNames.slice(i, i + 200);
    try {
      const res = await fetch(`${PEOPLE_API_BASE}/people:batchDeleteContacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resourceNames: chunk }),
      });
      if (res.ok || res.status === 200) {
        deleted += chunk.length;
      } else {
        // eslint-disable-next-line no-console
        console.warn('[google-sync] batchDelete failed status', res.status);
        errors += chunk.length;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[google-sync] batchDelete threw', e);
      errors += chunk.length;
    }
  }
  return { deleted, errors };
}

/**
 * Delete a Google contact group (label). Best-effort: a 404 or any other
 * non-fatal error is logged and swallowed since group deletion is a
 * cleanup step on disconnect, not the disconnect itself. Used to clean up
 * the auto-created "Amixos" label when the user picks "Also remove from
 * Google" during disconnect.
 *
 * Note: We pass `deleteContacts=false` because the contacts have already
 * been deleted via batchDeleteGoogleContacts before this is called. The
 * group is empty at this point.
 */
export async function deleteContactGroup(
  creds: OAuthCreds,
  groupId: string,
): Promise<void> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) return;
  try {
    await fetch(
      `${PEOPLE_API_BASE}/contactGroups/${encodeURIComponent(groupId)}?deleteContacts=false`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[google-sync] deleteContactGroup failed (continuing):', e);
  }
}

/**
 * Find a user-created contact group by name, or create it if it doesn't exist.
 * Used to ensure an "Amixos" label exists on the user's Google account so
 * synced contacts are visually tagged with their origin.
 *
 * Returns the group id (without the "contactGroups/" prefix) on success,
 * or null on any failure (network, token revoked, name collision with a
 * system group).
 */
export async function findOrCreateContactGroup(
  creds: OAuthCreds,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const accessToken = await refreshAccessToken(creds.refresh_token, creds.client_id);
  if (!accessToken) return null;

  // 1. Look for an existing group with this name (case-insensitive match).
  const listRes = await fetch(`${PEOPLE_API_BASE}/contactGroups?pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const listJson = (await listRes.json()) as {
      contactGroups?: { resourceName: string; name: string; groupType?: string }[];
    };
    const existing = (listJson.contactGroups ?? []).find(
      g => g.name?.toLowerCase() === name.toLowerCase()
        && g.groupType !== 'SYSTEM_CONTACT_GROUP',
    );
    if (existing) {
      return { id: existing.resourceName.replace('contactGroups/', ''), name: existing.name };
    }
  }

  // 2. Not found — create it.
  const createRes = await fetch(`${PEOPLE_API_BASE}/contactGroups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ contactGroup: { name } }),
  });
  if (!createRes.ok) return null;

  const created = (await createRes.json()) as { resourceName?: string; name?: string };
  if (!created.resourceName) return null;
  return {
    id: created.resourceName.replace('contactGroups/', ''),
    name: created.name ?? name,
  };
}

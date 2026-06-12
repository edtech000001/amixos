import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import {
  createGoogleContact,
  updateGoogleContact,
  deleteGoogleContact,
  deleteGoogleContactByResource,
  createClientContactGoogleContact,
  updateClientContactGoogleContact,
  deleteClientContactGoogleContact,
  listContactGroups,
  findOrCreateContactGroup,
  batchDeleteGoogleContacts,
  deleteContactGroup,
  listGroupContactsByIdNumber,
  searchGoogleContacts,
  type ClientRow,
  type ClientContactRow,
  type ParentClientRef,
  type OAuthCreds,
} from '../lib/googleSync';
import { fetchAll } from '../lib/supabaseFetch';

// Default contact group name Amixos creates / uses on the user's Google
// account if they haven't picked one explicitly. Keeps synced contacts
// visually labeled so the user knows where they came from.
const DEFAULT_GROUP_NAME = 'Amixos';

export const googleSyncRouter = Router();
googleSyncRouter.use(authenticate);

// Helper: load credentials for the current user IN A SPECIFIC BUSINESS.
// Migration 031 made the PK composite (user_id, business_id), so loading a
// row now always requires both. Caller must pass the active workspace's
// business_id — most endpoints accept it as a body/query param; the
// per-row sync endpoints (/contact, /client-contact) derive it from the
// affected row itself.
async function loadCreds(userId: string, businessId: string): Promise<OAuthCreds | null> {
  const { data } = await supabase
    .from('user_oauth_credentials')
    .select('user_id, business_id, refresh_token, client_id, enabled, contact_group_id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as OAuthCreds | null) ?? null;
}

/**
 * POST /api/v1/google-sync/exchange-code
 * Body: { business_id: string, code: string, redirect_uri: string }
 *
 * Server-side authorization-code exchange for the WEB OAuth flow. Web
 * cannot do PKCE without leaking the client_secret to the browser, so we
 * keep the secret here and do the exchange on the server.
 *
 * Flow:
 *   1. Browser kicks off Google's OAuth screen with our Web client_id and
 *      redirect_uri = `${origin}/auth/google-callback`.
 *   2. Google redirects back to that callback with ?code=...&state=...
 *   3. Callback page POSTs { code, business_id, redirect_uri } here.
 *   4. We swap the code for tokens at Google's token endpoint, write the
 *      refresh_token into user_oauth_credentials (scoped to business_id),
 *      and auto-create the Amixos group as the default sync target.
 *
 * The redirect_uri sent here must MATCH exactly what was sent to Google
 * in step 1 — that's an OAuth security requirement.
 */
googleSyncRouter.post('/exchange-code', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, code, redirect_uri } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, message: 'code required' });
  }
  if (!redirect_uri || typeof redirect_uri !== 'string') {
    return res.status(400).json({ success: false, message: 'redirect_uri required' });
  }

  // Membership check — same as /connect.
  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', business_id)
    .maybeSingle();
  if (!membership) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      success: false,
      message: 'GOOGLE_OAUTH_CLIENT_ID/SECRET not configured',
    });
  }

  // Exchange code → tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    return res.status(400).json({
      success: false,
      message: 'token_exchange_failed',
      details: errText.slice(0, 500),
    });
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokens.refresh_token) {
    // Google omits refresh_token when the user has previously granted
    // access and we didn't request a fresh consent. The browser flow sets
    // prompt=consent so this shouldn't happen — but guard anyway.
    return res.status(400).json({ success: false, message: 'no_refresh_token' });
  }

  // Store the credential, same shape as /connect would.
  const { error } = await supabase
    .from('user_oauth_credentials')
    .upsert({
      user_id: userId,
      business_id,
      provider: 'google',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      scopes: tokens.scope?.split(' ') ?? [],
      enabled: true,
      contact_group_id: null,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  // Auto-create / find the Amixos label as the default sync target.
  let resolvedGroupId: string | null = null;
  let resolvedGroupName: string | null = null;
  const creds = await loadCreds(userId, business_id);
  if (creds) {
    const group = await findOrCreateContactGroup(creds, DEFAULT_GROUP_NAME);
    if (group) {
      resolvedGroupId = group.id;
      resolvedGroupName = group.name;
      await supabase
        .from('user_oauth_credentials')
        .update({
          contact_group_id: group.id,
          contact_group_name: group.name,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('business_id', business_id);
    }
  }

  return res.json({
    success: true,
    status: 'connected',
    contactGroupId: resolvedGroupId,
    contactGroupName: resolvedGroupName,
  });
});

/**
 * POST /api/v1/google-sync/connect
 * Body: { business_id: string, refresh_token: string, scopes: string[], client_id: string, contact_group_id?: string }
 * Stores the refresh token, scoped to one business. Called by client after
 * successful OAuth link flow.
 */
googleSyncRouter.post('/connect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, refresh_token, scopes, contact_group_id, client_id } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({ success: false, message: 'refresh_token required' });
  }

  // Verify the caller is a member of this business before storing creds
  // against it. Service-role client bypasses RLS so we have to check
  // manually.
  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', business_id)
    .maybeSingle();
  if (!membership) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const { error } = await supabase
    .from('user_oauth_credentials')
    .upsert({
      user_id: userId,
      business_id,
      provider: 'google',
      refresh_token,
      client_id: typeof client_id === 'string' ? client_id : null,
      scopes: Array.isArray(scopes) ? scopes : [],
      enabled: true,
      contact_group_id: typeof contact_group_id === 'string' ? contact_group_id : null,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  // Auto-create (or find) the "Amixos" group as the default sync target.
  let resolvedGroupId: string | null = typeof contact_group_id === 'string' ? contact_group_id : null;
  let resolvedGroupName: string | null = null;
  if (!resolvedGroupId) {
    const creds = await loadCreds(userId, business_id);
    if (creds) {
      const group = await findOrCreateContactGroup(creds, DEFAULT_GROUP_NAME);
      if (group) {
        resolvedGroupId = group.id;
        resolvedGroupName = group.name;
        await supabase
          .from('user_oauth_credentials')
          .update({
            contact_group_id: group.id,
            contact_group_name: group.name,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('business_id', business_id);
      }
    }
  }

  return res.json({
    success: true,
    status: 'connected',
    contactGroupId: resolvedGroupId,
    contactGroupName: resolvedGroupName,
  });
});

/**
 * GET /api/v1/google-sync/status
 * Returns whether the current user has Google sync connected and metadata.
 */
googleSyncRouter.get('/status', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  const { data } = await supabase
    .from('user_oauth_credentials')
    .select('enabled, contact_group_id, contact_group_name, last_sync_at, last_sync_error')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!data) {
    return res.json({ success: true, data: { connected: false } });
  }

  return res.json({
    success: true,
    data: {
      connected: true,
      enabled: data.enabled,
      contactGroupId: data.contact_group_id,
      contactGroupName: data.contact_group_name,
      lastSyncAt: data.last_sync_at,
      lastSyncError: data.last_sync_error,
    },
  });
});

/**
 * GET /api/v1/google-sync/synced-count
 * Returns how many of the caller's clients have been pushed to Google. Used
 * by the disconnect dialog so the user sees the exact impact of the
 * "Also remove from Google" choice.
 *
 * Filtered by business_id query param (so each workspace's count is correct
 * once per-business sync lands). Falls back to all clients across all
 * businesses the user belongs to if no business_id provided.
 */
googleSyncRouter.get('/synced-count', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  // Count BOTH clients AND client_contacts in this business that have been
  // pushed to Google — both will be removed if the user picks "Also remove
  // from Google" on disconnect, so the count reflects the full impact.
  const [{ count: clientCount }, { count: contactCount }] = await Promise.all([
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .not('google_resource_name', 'is', null)
      .eq('business_id', businessId),
    supabase
      .from('client_contacts')
      .select('id', { count: 'exact', head: true })
      .not('google_resource_name', 'is', null)
      .eq('business_id', businessId),
  ]);
  return res.json({ success: true, data: { count: (clientCount ?? 0) + (contactCount ?? 0) } });
});

/**
 * GET /api/v1/google-sync/unsynced-count
 * Counts clients NOT yet synced to Google (google_resource_name IS NULL).
 * Used right after connect to ask the user "you have N existing clients,
 * sync them now?".
 */
googleSyncRouter.get('/unsynced-count', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  const [{ count: clientCount }, { count: contactCount }] = await Promise.all([
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .is('google_resource_name', null)
      .eq('business_id', businessId),
    supabase
      .from('client_contacts')
      .select('id', { count: 'exact', head: true })
      .is('google_resource_name', null)
      .eq('business_id', businessId),
  ]);
  return res.json({ success: true, data: { count: (clientCount ?? 0) + (contactCount ?? 0) } });
});

/**
 * POST /api/v1/google-sync/backfill
 * Body: { business_id?: string }
 *
 * Pushes every un-synced client (google_resource_name IS NULL) to Google.
 * Dedup logic:
 *   1. Build a Map<IDnumber, resourceName> from contacts already in the
 *      user's Amixos label. Catches the "disconnected then reconnected"
 *      case — we relink instead of creating a duplicate.
 *   2. For each unsynced client: if IDnumber match exists, write the
 *      existing resourceName back to clients.google_resource_name. Else
 *      try to find by email_office / phone_cell via searchContacts. Else
 *      create a new contact.
 *
 * Runs synchronously — caller awaits the full response. For very large
 * client lists this can take minutes; UI should show a spinner with the
 * "Syncing..." label and the count of clients being processed.
 */
googleSyncRouter.post('/backfill', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = (req.body ?? {}).business_id as string | undefined;
  if (!businessId) {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  const creds = await loadCreds(userId, businessId);
  if (!creds || !creds.enabled) {
    return res.status(400).json({ success: false, message: 'not_connected' });
  }

  // Load every client in THIS business without a google_resource_name.
  // Paginated because a backfill must include every unsynced row — the
  // 1000-row PostgREST cap would leave the tail unsynced forever.
  const clients = await fetchAll<ClientRow>((from, to) =>
    supabase
      .from('clients')
      .select('id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name, google_etag')
      .is('google_resource_name', null)
      .eq('business_id', businessId)
      .range(from, to));

  // Build the IDnumber map once. If the user has no contact_group_id set
  // we skip this step — there's nothing to dedup against.
  const idMap = creds.contact_group_id
    ? await listGroupContactsByIdNumber(creds, creds.contact_group_id)
    : new Map<string, { resourceName: string; etag: string | null }>();

  let created = 0;
  let linked = 0;
  let failed = 0;
  const errors: Array<{ client_id: string; reason: string }> = [];

  for (const client of clients) {
    // 1. IDnumber match — the contact still exists in Google from a
    // previous sync. Persist BOTH resourceName and etag so the very
    // first update afterward takes the hot path (no GET-for-etag).
    const existing = idMap.get(client.id);
    if (existing) {
      await supabase
        .from('clients')
        .update({ google_resource_name: existing.resourceName, google_etag: existing.etag })
        .eq('id', client.id);
      linked++;
      continue;
    }

    // 2. Search by email or phone — catches clients the user manually
    // added to Google before connecting Amixos. Best-effort: a single
    // searchContacts call with whichever identifier is most unique.
    let matched: { resourceName: string; etag: string | null } | null = null;
    const searchQuery = client.email_office ?? client.email_home ?? client.phone_cell ?? client.phone_office;
    if (searchQuery) {
      const results = await searchGoogleContacts(creds, searchQuery);
      const needle = searchQuery.toLowerCase().trim();
      for (const r of results) {
        if (r.emails.some(e => e === needle) || r.phones.some(p => p.includes(searchQuery))) {
          matched = { resourceName: r.resourceName, etag: r.etag };
          break;
        }
      }
    }
    if (matched) {
      await supabase
        .from('clients')
        .update({ google_resource_name: matched.resourceName, google_etag: matched.etag })
        .eq('id', client.id);
      linked++;
      continue;
    }

    // 3. No existing contact — create a new one. createGoogleContact also
    // writes the resourceName back to clients.
    const result = await createGoogleContact(client, creds);
    if ('resourceName' in result) {
      created++;
    } else {
      failed++;
      errors.push({ client_id: client.id, reason: result.error });
    }
  }

  // ─── Backfill client_contacts ─────────────────────────────────────────
  // After all clients are synced (so we can resolve parent organization
  // names cleanly), walk every unsynced client_contact and push it to
  // Google as its own contact. Dedup uses the same IDnumber map plus
  // searchContacts by email/phone. Paginated for the same reason as the
  // clients backfill above. Pull the FULL parent client row (not just
  // name/company) so the notes-template renderer has every field +
  // custom_fields available — same enrichment as the client itself.
  type ContactWithClient = ClientContactRow & {
    clients: ClientRow | null;
  };
  const contacts = await fetchAll<ContactWithClient>((from, to) =>
    supabase
      .from('client_contacts')
      .select(`
        id, business_id, client_id, name, role, phone, email, notes, google_resource_name,
        clients:client_id(id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name, google_etag)
      `)
      .is('google_resource_name', null)
      .eq('business_id', businessId)
      .range(from, to) as unknown as PromiseLike<{ data: ContactWithClient[] | null; error: { message: string } | null }>);

  for (const c of contacts) {
    if (!c.clients) {
      failed++;
      errors.push({ client_id: c.id, reason: 'parent_client_missing' });
      continue;
    }
    const parent: ClientRow = c.clients;

    // IDnumber match — relink existing contact in Google.
    const existing = idMap.get(c.id);
    if (existing) {
      await supabase
        .from('client_contacts')
        .update({ google_resource_name: existing })
        .eq('id', c.id);
      linked++;
      continue;
    }

    // Email/phone match against existing Google contacts.
    let matched: string | null = null;
    const needle = c.email ?? c.phone;
    if (needle) {
      const results = await searchGoogleContacts(creds, needle);
      const lc = needle.toLowerCase().trim();
      for (const r of results) {
        if (r.emails.some(e => e === lc) || r.phones.some(p => p.includes(needle))) {
          matched = r.resourceName;
          break;
        }
      }
    }
    if (matched) {
      await supabase
        .from('client_contacts')
        .update({ google_resource_name: matched })
        .eq('id', c.id);
      linked++;
      continue;
    }

    const result = await createClientContactGoogleContact(c, parent, creds);
    if ('resourceName' in result) {
      created++;
    } else {
      failed++;
      errors.push({ client_id: c.id, reason: result.error });
    }
  }

  return res.json({
    success: true,
    data: {
      total: clients.length + contacts.length,
      created,
      linked,
      failed,
      errors: errors.slice(0, 20), // cap for response size
    },
  });
});

/**
 * POST /api/v1/google-sync/disconnect
 * Body: { delete_contacts?: boolean, business_id?: string }
 *
 * Default behavior (delete_contacts=false): just revokes the refresh token
 * at Google and removes our credentials row. Synced contacts stay in
 * Google — they're the user's data.
 *
 * Optional behavior (delete_contacts=true): also deletes every contact
 * Amixos created (those with a stored google_resource_name) via the People
 * API batch-delete endpoint, then clears google_resource_name from our
 * clients table. Destructive — invoked only when the user explicitly
 * chooses "Also remove from Google" in the disconnect dialog.
 *
 * Revoking matters: without it, Google still considers the app authorized
 * and will not re-issue a refresh token on the next connect (it only issues
 * one on a fresh consent). Best-effort — even if the revoke fails we still
 * delete the local row so the user is "disconnected" from their POV.
 */
googleSyncRouter.post('/disconnect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { delete_contacts, business_id } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  // Load the full creds so we can both revoke and (optionally) delete
  // contacts before tearing down the row.
  const creds = await loadCreds(userId, business_id);

  let deletedCount = 0;
  if (delete_contacts === true && creds) {
    // Fetch BOTH clients and client_contacts in this business that were
    // previously synced to Google. Paginated because the disconnect path
    // must wipe EVERY synced row — silently capping at 1000 would leave
    // orphaned google_resource_name pointers behind that reconnect can't
    // resolve.
    type SyncedRow = { id: string; google_resource_name: string };
    const [syncedClients, syncedContacts] = await Promise.all([
      fetchAll<SyncedRow>((from, to) =>
        supabase
          .from('clients')
          .select('id, google_resource_name, business_id')
          .not('google_resource_name', 'is', null)
          .eq('business_id', business_id)
          .range(from, to)),
      fetchAll<SyncedRow>((from, to) =>
        supabase
          .from('client_contacts')
          .select('id, google_resource_name, business_id')
          .not('google_resource_name', 'is', null)
          .eq('business_id', business_id)
          .range(from, to)),
    ]);

    const allResourceNames = [
      ...syncedClients.map(c => c.google_resource_name),
      ...syncedContacts.map(c => c.google_resource_name),
    ];

    if (allResourceNames.length > 0) {
      const result = await batchDeleteGoogleContacts(creds, allResourceNames);
      deletedCount = result.deleted;

      // Wipe the local references on both tables so a reconnect re-creates.
      // Chunked because PostgREST URLs are length-limited; ~200 UUIDs per
      // `.in()` keeps the URL well under the 8 KB ceiling.
      const wipeIn = async (table: 'clients' | 'client_contacts', ids: string[]) => {
        const chunkSize = 200;
        for (let i = 0; i < ids.length; i += chunkSize) {
          await supabase
            .from(table)
            .update({ google_resource_name: null })
            .in('id', ids.slice(i, i + chunkSize));
        }
      };
      if (syncedClients.length > 0)  await wipeIn('clients',         syncedClients.map(c => c.id));
      if (syncedContacts.length > 0) await wipeIn('client_contacts', syncedContacts.map(c => c.id));
    }

    // Now that all the synced contacts are gone, the Amixos label is empty
    // and just clutter in the user's Google account. Delete it too.
    if (creds.contact_group_id) {
      await deleteContactGroup(creds, creds.contact_group_id);
    }
  }

  if (creds?.refresh_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.refresh_token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[google-sync] revoke failed (continuing):', e);
    }
  }

  // Only delete THIS business's credential row — other businesses owned by
  // the same user keep their connections.
  await supabase
    .from('user_oauth_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('business_id', business_id);
  return res.json({ success: true, data: { deletedCount } });
});

/**
 * GET /api/v1/google-sync/contact-groups
 * Lists user's Google contact groups for the optional sync-target dropdown.
 */
googleSyncRouter.get('/contact-groups', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  const creds = await loadCreds(userId, businessId);
  if (!creds) return res.json({ success: true, data: [] });

  const groups = await listContactGroups(creds);
  return res.json({ success: true, data: groups });
});

/**
 * PATCH /api/v1/google-sync/contact-group
 * Body: { contact_group_id: string | null, contact_group_name?: string }
 * Updates the user's selected contact group for future syncs.
 */
googleSyncRouter.patch('/contact-group', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, contact_group_id, contact_group_name } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  await supabase
    .from('user_oauth_credentials')
    .update({
      contact_group_id: typeof contact_group_id === 'string' ? contact_group_id : null,
      contact_group_name: typeof contact_group_name === 'string' ? contact_group_name : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('business_id', business_id);

  return res.json({ success: true });
});

/**
 * POST /api/v1/google-sync/contact
 * Body: { action: 'create' | 'update' | 'delete', clientId: string }
 *
 * Mirror a single client mutation to Google. Called by the shared
 * triggerGoogleSync helper on every client write. Sync is opportunistic —
 * if the user isn't connected, we return success-with-skipped so the
 * caller doesn't have to know about Google state.
 *
 * On update, the client's synced contact people are re-pushed too — their
 * Google contacts inherit the parent's address, company and notes template,
 * so a parent edit must cascade. Batch callers (template reapply) enqueue
 * contacts separately and pass skipContactCascade to avoid double pushes.
 */
googleSyncRouter.post('/contact', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { action, clientId, skipContactCascade } = req.body ?? {};
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ success: false, message: 'clientId required' });
  }
  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    return res.status(400).json({ success: false, message: `invalid action: ${action}` });
  }

  // Fetch the client first — its business_id tells us which credential row
  // to load. The row must still exist at this point (callers run /contact
  // BEFORE the local delete for the delete action).
  const { data: client } = await supabase
    .from('clients')
    .select('id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name, google_etag')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) {
    return res.status(404).json({ success: false, message: 'client not found' });
  }
  const clientRow = client as ClientRow;

  // Per-business sync: load the creds for the business this client belongs
  // to. If that business isn't connected, silently skip.
  const creds = await loadCreds(userId, clientRow.business_id);
  if (!creds || !creds.enabled) {
    return res.json({ success: true, data: { skipped: 'sync_disabled' } });
  }

  if (action === 'create') {
    const result = await createGoogleContact(clientRow, creds);
    return res.json({ success: true, data: result });
  }
  if (action === 'update') {
    const result = await updateGoogleContact(clientRow, creds);
    let cascadedContacts = 0;
    if (skipContactCascade !== true) {
      const contacts = await fetchAll<ClientContactRow>((from, to) =>
        supabase
          .from('client_contacts')
          .select('id, business_id, client_id, name, role, phone, email, notes, google_resource_name')
          .eq('client_id', clientRow.id)
          .not('google_resource_name', 'is', null)
          .range(from, to),
      ).catch(() => [] as ClientContactRow[]);
      // Sequential on purpose — keeps the People API write rate gentle.
      // Best-effort: a failed contact push never fails the client update.
      for (const contact of contacts) {
        const r = await updateClientContactGoogleContact(contact, clientRow, creds);
        if (!('error' in r)) cascadedContacts++;
      }
    }
    return res.json({ success: true, data: { ...result, cascadedContacts } });
  }
  // action === 'delete'
  const result = await deleteGoogleContact(clientRow, creds);
  return res.json({ success: true, data: result });
});

/**
 * POST /api/v1/google-sync/contact/delete-orphan
 * Body: { businessId: string, resourceName: string }
 *
 * Delete a Google contact whose local Amixos row is already gone. Used
 * by the bulk-delete flow: the client pre-fetches resource_names from
 * the soon-to-be-deleted rows, deletes the local rows immediately, then
 * walks the resource_names through this endpoint at the People-API
 * quota rate. No DB lookup is needed here since the caller provides
 * the resource_name directly.
 */
googleSyncRouter.post('/contact/delete-orphan', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { businessId, resourceName } = req.body ?? {};
  if (!businessId || typeof businessId !== 'string') {
    return res.status(400).json({ success: false, message: 'businessId required' });
  }
  if (!resourceName || typeof resourceName !== 'string') {
    return res.status(400).json({ success: false, message: 'resourceName required' });
  }

  // Membership gate — caller must belong to this business, otherwise
  // someone could probe arbitrary resource_names with their own token.
  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (!membership) {
    return res.status(403).json({ success: false, message: 'not a member of this business' });
  }

  const creds = await loadCreds(userId, businessId);
  if (!creds || !creds.enabled) {
    return res.json({ success: true, data: { skipped: 'sync_disabled' } });
  }

  const result = await deleteGoogleContactByResource(resourceName, creds);
  return res.json({ success: true, data: result });
});

/**
 * POST /api/v1/google-sync/client-contact
 * Body: { action: 'create' | 'update' | 'delete', contactId: string }
 *
 * Mirrors a client_contacts mutation to Google. Each client_contact becomes
 * a separate Google contact whose organization is the parent client's
 * company and whose biography says "Employee of {client name}".
 */
googleSyncRouter.post('/client-contact', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { action, contactId } = req.body ?? {};
  if (!contactId || typeof contactId !== 'string') {
    return res.status(400).json({ success: false, message: 'contactId required' });
  }
  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    return res.status(400).json({ success: false, message: `invalid action: ${action}` });
  }

  // Pull the contact row + its parent client. business_id on the row tells
  // us which credential set to load for this sync.
  const { data: contactRow } = await supabase
    .from('client_contacts')
    .select(`
      id, business_id, client_id, name, role, phone, email, notes, google_resource_name,
      clients:client_id(id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name, google_etag)
    `)
    .eq('id', contactId)
    .maybeSingle();

  if (!contactRow) {
    return res.status(404).json({ success: false, message: 'client_contact not found' });
  }

  // Full parent ClientRow so the notes-template renderer has every field
  // (including custom_fields) available — same enrichment as the client.
  const row = contactRow as unknown as ClientContactRow & {
    clients: ClientRow | null;
  };
  if (!row.clients) {
    return res.status(404).json({ success: false, message: 'parent client not found' });
  }
  const parent: ClientRow = row.clients;

  // Per-business sync: load the creds for THIS contact's business.
  const creds = await loadCreds(userId, row.business_id);
  if (!creds || !creds.enabled) {
    return res.json({ success: true, data: { skipped: 'sync_disabled' } });
  }

  if (action === 'create') {
    const result = await createClientContactGoogleContact(row, parent, creds);
    return res.json({ success: true, data: result });
  }
  if (action === 'update') {
    const result = await updateClientContactGoogleContact(row, parent, creds);
    return res.json({ success: true, data: result });
  }
  // action === 'delete'
  const result = await deleteClientContactGoogleContact(row, creds);
  return res.json({ success: true, data: result });
});

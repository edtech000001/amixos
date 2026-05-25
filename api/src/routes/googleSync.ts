import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import {
  createGoogleContact,
  updateGoogleContact,
  deleteGoogleContact,
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
  const { data: rows } = await supabase
    .from('clients')
    .select('id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name')
    .is('google_resource_name', null)
    .eq('business_id', businessId);
  const clients = (rows ?? []) as ClientRow[];

  // Build the IDnumber map once. If the user has no contact_group_id set
  // we skip this step — there's nothing to dedup against.
  const idMap = creds.contact_group_id
    ? await listGroupContactsByIdNumber(creds, creds.contact_group_id)
    : new Map<string, string>();

  let created = 0;
  let linked = 0;
  let failed = 0;
  const errors: Array<{ client_id: string; reason: string }> = [];

  for (const client of clients) {
    // 1. IDnumber match — the contact still exists in Google from a
    // previous sync. Just link.
    const existingResource = idMap.get(client.id);
    if (existingResource) {
      await supabase
        .from('clients')
        .update({ google_resource_name: existingResource })
        .eq('id', client.id);
      linked++;
      continue;
    }

    // 2. Search by email or phone — catches clients the user manually
    // added to Google before connecting Amixos. Best-effort: a single
    // searchContacts call with whichever identifier is most unique.
    let matched: string | null = null;
    const searchQuery = client.email_office ?? client.email_home ?? client.phone_cell ?? client.phone_office;
    if (searchQuery) {
      const results = await searchGoogleContacts(creds, searchQuery);
      const needle = searchQuery.toLowerCase().trim();
      for (const r of results) {
        if (r.emails.some(e => e === needle) || r.phones.some(p => p.includes(searchQuery))) {
          matched = r.resourceName;
          break;
        }
      }
    }
    if (matched) {
      await supabase
        .from('clients')
        .update({ google_resource_name: matched })
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
  // searchContacts by email/phone.
  let cqContacts = supabase
    .from('client_contacts')
    .select(`
      id, business_id, client_id, name, role, phone, email, notes, google_resource_name,
      clients:client_id(first_name, last_name, company)
    `)
    .is('google_resource_name', null);
  if (businessId) cqContacts = cqContacts.eq('business_id', businessId);
  const { data: contactRows } = await cqContacts;
  const contacts = ((contactRows ?? []) as unknown) as Array<
    ClientContactRow & {
      clients: { first_name: string; last_name: string; company: string | null } | null;
    }
  >;

  for (const c of contacts) {
    const parent: ParentClientRef = {
      first_name: c.clients?.first_name ?? '',
      last_name: c.clients?.last_name ?? '',
      company: c.clients?.company ?? null,
    };

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
    // previously synced to Google.
    const [{ data: clientRows }, { data: contactRows }] = await Promise.all([
      supabase
        .from('clients')
        .select('id, google_resource_name, business_id')
        .not('google_resource_name', 'is', null)
        .eq('business_id', business_id),
      supabase
        .from('client_contacts')
        .select('id, google_resource_name, business_id')
        .not('google_resource_name', 'is', null)
        .eq('business_id', business_id),
    ]);
    const syncedClients = (clientRows ?? []) as Array<{ id: string; google_resource_name: string }>;
    const syncedContacts = (contactRows ?? []) as Array<{ id: string; google_resource_name: string }>;

    const allResourceNames = [
      ...syncedClients.map(c => c.google_resource_name),
      ...syncedContacts.map(c => c.google_resource_name),
    ];

    if (allResourceNames.length > 0) {
      const result = await batchDeleteGoogleContacts(creds, allResourceNames);
      deletedCount = result.deleted;

      // Wipe the local references on both tables so a reconnect re-creates.
      if (syncedClients.length > 0) {
        await supabase
          .from('clients')
          .update({ google_resource_name: null })
          .in('id', syncedClients.map(c => c.id));
      }
      if (syncedContacts.length > 0) {
        await supabase
          .from('client_contacts')
          .update({ google_resource_name: null })
          .in('id', syncedContacts.map(c => c.id));
      }
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
 */
googleSyncRouter.post('/contact', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { action, clientId } = req.body ?? {};
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
    .select('id, business_id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, custom_fields, google_resource_name')
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
    return res.json({ success: true, data: result });
  }
  // action === 'delete'
  const result = await deleteGoogleContact(clientRow, creds);
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
      clients:client_id(first_name, last_name, company)
    `)
    .eq('id', contactId)
    .maybeSingle();

  if (!contactRow) {
    return res.status(404).json({ success: false, message: 'client_contact not found' });
  }

  // Supabase nested select shape — flatten parent ref.
  const row = contactRow as unknown as ClientContactRow & {
    clients: { first_name: string; last_name: string; company: string | null } | null;
  };
  const parent: ParentClientRef = {
    first_name: row.clients?.first_name ?? '',
    last_name: row.clients?.last_name ?? '',
    company: row.clients?.company ?? null,
  };

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

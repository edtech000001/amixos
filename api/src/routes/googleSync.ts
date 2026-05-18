import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import {
  createGoogleContact,
  listContactGroups,
  type ClientRow,
  type OAuthCreds,
} from '../lib/googleSync';

export const googleSyncRouter = Router();
googleSyncRouter.use(authenticate);

// Helper: load credentials for the current user (or null if not connected).
async function loadCreds(userId: string): Promise<OAuthCreds | null> {
  const { data } = await supabase
    .from('user_oauth_credentials')
    .select('user_id, refresh_token, enabled, contact_group_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as OAuthCreds | null) ?? null;
}

/**
 * POST /api/v1/google-sync/connect
 * Body: { refresh_token: string, scopes: string[], contact_group_id?: string }
 * Stores the refresh token. Called by client after successful link flow.
 */
googleSyncRouter.post('/connect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { refresh_token, scopes, contact_group_id } = req.body ?? {};
  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({ success: false, message: 'refresh_token required' });
  }

  const { error } = await supabase
    .from('user_oauth_credentials')
    .upsert({
      user_id: userId,
      provider: 'google',
      refresh_token,
      scopes: Array.isArray(scopes) ? scopes : [],
      enabled: true,
      contact_group_id: typeof contact_group_id === 'string' ? contact_group_id : null,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
  return res.json({ success: true, status: 'connected' });
});

/**
 * GET /api/v1/google-sync/status
 * Returns whether the current user has Google sync connected and metadata.
 */
googleSyncRouter.get('/status', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { data } = await supabase
    .from('user_oauth_credentials')
    .select('enabled, contact_group_id, contact_group_name, last_sync_at, last_sync_error')
    .eq('user_id', userId)
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
 * POST /api/v1/google-sync/disconnect
 * Removes the credentials row. Future client mutations skip Google sync.
 */
googleSyncRouter.post('/disconnect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  await supabase.from('user_oauth_credentials').delete().eq('user_id', userId);
  return res.json({ success: true });
});

/**
 * GET /api/v1/google-sync/contact-groups
 * Lists user's Google contact groups for the optional sync-target dropdown.
 */
googleSyncRouter.get('/contact-groups', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const creds = await loadCreds(userId);
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

  const { contact_group_id, contact_group_name } = req.body ?? {};
  await supabase
    .from('user_oauth_credentials')
    .update({
      contact_group_id: typeof contact_group_id === 'string' ? contact_group_id : null,
      contact_group_name: typeof contact_group_name === 'string' ? contact_group_name : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return res.json({ success: true });
});

/**
 * POST /api/v1/google-sync/contact
 * Body: { action: 'create' | 'update' | 'delete', clientId: string }
 * Phase 1 only handles create. Update/delete return 501 until Phase 2.
 */
googleSyncRouter.post('/contact', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { action, clientId } = req.body ?? {};
  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ success: false, message: 'clientId required' });
  }

  if (action !== 'create') {
    return res.status(501).json({ success: false, message: `action ${action} not implemented yet` });
  }

  const creds = await loadCreds(userId);
  if (!creds || !creds.enabled) {
    return res.json({ success: true, data: { skipped: 'sync_disabled' } });
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, address_line2, city, state, zip_code, notes, google_resource_name')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) {
    return res.status(404).json({ success: false, message: 'client not found' });
  }

  const result = await createGoogleContact(client as ClientRow, creds);
  return res.json({ success: true, data: result });
});

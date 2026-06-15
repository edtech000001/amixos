// Messaging (SMS) module API. Holds provider credentials server-side in
// public.business_integrations (RLS-locked, service-role only) and exposes:
//   GET  /status      — redacted connection status for the module UI
//   POST /connect     — save + verify provider credentials (writers only)
//   POST /disconnect  — remove the integration (writers only)
//   POST /send        — send an SMS, log it to client_communications (members)
//
// Auth: standard Supabase-JWT middleware. Every handler re-checks business
// membership (and role, for config) before touching the service-role client.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import {
  isSmsProvider,
  hasRequiredCreds,
  maskedKey,
  verifyCreds,
  sendSms,
  type SmsProvider,
} from '../lib/smsProviders';

export const smsRouter = Router();
smsRouter.use(authenticate);

// Each /send sends a real, billable SMS via the business's provider. Cap it
// per authenticated user to blunt toll-fraud / spam loops. This is a per-route
// backstop on top of the global limiter; pair it with a per-business daily cap
// once usage data exists. Keyed by user id (falls back to IP if unset).
const sendLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => req.user?.id ?? req.ip ?? 'anon',
});

const WRITER_ROLES = ['owner', 'admin', 'manager', 'office'];

async function memberRole(userId: string, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from('business_members')
    .select('role')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

interface IntegrationRow {
  provider: SmsProvider;
  from_number: string | null;
  credentials: Record<string, unknown>;
  enabled: boolean;
  last_error: string | null;
}

async function loadIntegration(businessId: string): Promise<IntegrationRow | null> {
  const { data } = await supabase
    .from('business_integrations')
    .select('provider, from_number, credentials, enabled, last_error')
    .eq('business_id', businessId)
    .eq('kind', 'sms')
    .maybeSingle();
  return (data as IntegrationRow | null) ?? null;
}

// ── GET /status ──────────────────────────────────────────────────────────────
smsRouter.get('/status', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  const businessId = String(req.query.business_id ?? '');
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });
  if (!(await memberRole(userId, businessId))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const row = await loadIntegration(businessId);
  const connected = !!row && row.enabled && hasRequiredCreds(row.provider, row.credentials);
  return res.json({
    success: true,
    data: {
      connected,
      provider: row?.provider ?? null,
      fromNumber: row?.from_number ?? null,
      maskedKey: row ? maskedKey(row.provider, row.credentials) : null,
      lastError: row?.last_error ?? null,
    },
  });
});

// ── POST /connect ────────────────────────────────────────────────────────────
smsRouter.post('/connect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, provider, from_number, credentials } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!isSmsProvider(provider)) {
    return res.status(400).json({ success: false, message: 'unknown_provider' });
  }
  const creds = (credentials ?? {}) as Record<string, unknown>;
  if (!hasRequiredCreds(provider, creds)) {
    return res.status(400).json({ success: false, message: 'missing_credentials' });
  }

  const role = await memberRole(userId, business_id);
  if (!role || !WRITER_ROLES.includes(role)) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  // Verify the credentials actually authenticate before saving.
  const verifyError = await verifyCreds(provider, creds);
  if (verifyError) {
    return res.status(400).json({ success: false, message: verifyError });
  }

  const { error } = await supabase.from('business_integrations').upsert(
    {
      business_id,
      kind: 'sms',
      provider,
      from_number: from_number ?? null,
      credentials: creds,
      enabled: true,
      last_error: null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,kind,provider' },
  );
  if (error) return res.status(500).json({ success: false, message: error.message });

  return res.json({
    success: true,
    data: { connected: true, provider, fromNumber: from_number ?? null, maskedKey: maskedKey(provider, creds) },
  });
});

// ── POST /disconnect ─────────────────────────────────────────────────────────
smsRouter.post('/disconnect', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  const { business_id } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  const role = await memberRole(userId, business_id);
  if (!role || !WRITER_ROLES.includes(role)) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }
  const { error } = await supabase
    .from('business_integrations')
    .delete()
    .eq('business_id', business_id)
    .eq('kind', 'sms');
  if (error) return res.status(500).json({ success: false, message: error.message });
  return res.json({ success: true });
});

// ── POST /send ───────────────────────────────────────────────────────────────
smsRouter.post('/send', sendLimiter, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, to, body, client_id, client_contact_id } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!to || typeof to !== 'string') return res.status(400).json({ success: false, message: 'to required' });
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ success: false, message: 'body required' });
  }
  if (!(await memberRole(userId, business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const row = await loadIntegration(business_id);
  if (!row || !row.enabled || !hasRequiredCreds(row.provider, row.credentials)) {
    return res.status(400).json({ success: false, message: 'not_configured' });
  }

  try {
    const result = await sendSms(row.provider, row.credentials, row.from_number ?? '', to.trim(), body.trim());

    // Log into the existing client communications timeline (best-effort).
    if (client_id && typeof client_id === 'string') {
      await supabase.from('client_communications').insert({
        business_id,
        client_id,
        client_contact_id: client_contact_id ?? null,
        type: 'sms',
        direction: 'outbound',
        outcome: 'sent',
        contact_method: to.trim(),
        note: body.trim(),
        occurred_at: new Date().toISOString(),
        created_by: userId,
      });
    }
    return res.json({ success: true, data: { id: result.id } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'send_failed';
    // Surface the last error on the integration row for the UI.
    await supabase
      .from('business_integrations')
      .update({ last_error: message })
      .eq('business_id', business_id)
      .eq('kind', 'sms');
    return res.status(400).json({ success: false, message });
  }
});

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';

// Push dispatcher (migrations 269/270). Called by the database itself (pg_net)
// right after notification rows are inserted, plus a pg_cron retry every 10
// min. Authenticates with the shared CRON_SECRET in x-cron-secret.
// The time-based checks run in SQL (notifications_hourly via pg_cron).
export const notificationsRouter = Router();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 500;          // rows claimed per run
const EXPO_CHUNK = 100;     // Expo's max messages per request
const STALE_MS = 24 * 3600_000; // never push something a day old

function cronOk(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) { res.status(500).json({ success: false, message: 'CRON_SECRET not configured' }); return false; }
  const got = req.headers['x-cron-secret'];
  const gotBuf = Buffer.from(typeof got === 'string' ? got : '');
  const expectedBuf = Buffer.from(expected);
  if (gotBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(gotBuf, expectedBuf)) {
    res.status(401).json({ success: false, message: 'invalid cron secret' });
    return false;
  }
  return true;
}

interface QueuedRow {
  id: string;
  business_id: string;
  user_id: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

interface ExpoTicket { status: 'ok' | 'error'; details?: { error?: string } }

notificationsRouter.post('/dispatch', async (req, res) => {
  if (!cronOk(req, res)) return;

  const { data: queued, error } = await supabase
    .from('notifications')
    .select('id, business_id, user_id, title, body, entity_type, entity_id, created_at')
    .is('push_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return res.status(500).json({ success: false, message: error.message });
  if (!queued?.length) return res.json({ success: true, data: { claimed: 0, sent: 0 } });

  // Claim first (at-most-once): an overlapping run can't send the same rows,
  // and a failed send still leaves the notification in the in-app bell.
  const { data: claimedRows, error: claimErr } = await supabase
    .from('notifications')
    .update({ push_sent_at: new Date().toISOString() })
    .in('id', queued.map(r => r.id))
    .is('push_sent_at', null)
    .select('id');
  if (claimErr) return res.status(500).json({ success: false, message: claimErr.message });
  const claimed = new Set((claimedRows ?? []).map(r => r.id as string));
  const now = Date.now();
  const rows = (queued as QueuedRow[]).filter(
    r => claimed.has(r.id) && now - new Date(r.created_at).getTime() < STALE_MS,
  );
  if (!rows.length) return res.json({ success: true, data: { claimed: claimed.size, sent: 0 } });

  const userIds = [...new Set(rows.map(r => r.user_id))];
  const [{ data: tokens, error: tokErr }, { data: prefs, error: prefErr }] = await Promise.all([
    supabase.from('push_tokens').select('token, user_id').in('user_id', userIds),
    supabase.from('notification_prefs').select('user_id, business_id, push_enabled')
      .in('user_id', userIds).eq('push_enabled', false),
  ]);
  if (tokErr || prefErr) {
    return res.status(500).json({ success: false, message: (tokErr ?? prefErr)!.message });
  }
  const pushOff = new Set((prefs ?? []).map(p => `${p.user_id}:${p.business_id}`));
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id as string) ?? [];
    list.push(t.token as string);
    tokensByUser.set(t.user_id as string, list);
  }

  const messages = rows.flatMap(r =>
    pushOff.has(`${r.user_id}:${r.business_id}`)
      ? []
      : (tokensByUser.get(r.user_id) ?? []).map(to => ({
          to,
          title: r.title,
          body: r.body,
          sound: 'default',
          data: { notificationId: r.id, businessId: r.business_id, entityType: r.entity_type, entityId: r.entity_id },
        })),
  );

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  let sent = 0;
  const deadTokens: string[] = [];
  const failures: string[] = [];
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    try {
      const resp = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(chunk) });
      const json = (await resp.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: unknown } | null;
      if (!resp.ok || !Array.isArray(json?.data)) { failures.push(`HTTP ${resp.status}`); continue; }
      json!.data!.forEach((ticket, k) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(chunk[k].to);
        else failures.push(ticket.details?.error ?? 'error');
      });
    } catch (e) {
      failures.push(e instanceof Error ? e.message : 'fetch failed');
    }
  }
  if (deadTokens.length) await supabase.from('push_tokens').delete().in('token', deadTokens);
  if (failures.length) console.warn('[notifications] push failures', failures.slice(0, 10));

  return res.json({ success: true, data: { claimed: claimed.size, messages: messages.length, sent, removedTokens: deadTokens.length, failures: failures.length } });
});

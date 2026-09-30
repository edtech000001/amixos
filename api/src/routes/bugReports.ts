// Bug-report digest — the scheduled half of shake-to-report.
//
// Reports go into bug_reports (migration 241) and nothing announced them, so
// they sat in a table nobody had a reason to open. This is deliberately a
// digest rather than a per-report alert: one email a day is something you
// read, and a stream of them is something you filter away.
//
// Authenticated with the same CRON_SECRET + x-cron-secret header as
// /account/purge-due and the weather sweep, NOT a user token — nothing a
// logged-in client sends should be able to make us send mail.

import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { sendEmail } from '../lib/email';
import { buildBugDigest, type BugDigestRow } from '../lib/emails/bugDigest';

export const bugReportsRouter = Router();

/** Where the digest goes. An alias is better than a person: it survives
 *  someone leaving, and it can be filtered away from real support mail. */
const DIGEST_TO = process.env.BUG_DIGEST_TO ?? 'bugs@amixos.com';

const WINDOW_HOURS = 24;

// POST /api/v1/bug-reports/digest
bugReportsRouter.post('/digest', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ success: false, message: 'CRON_SECRET not configured' });
  // Constant-time compare — a plain !== leaks the secret through response
  // timing, one byte at a time.
  const got = req.headers['x-cron-secret'];
  const gotBuf = Buffer.from(typeof got === 'string' ? got : '');
  const expectedBuf = Buffer.from(expected);
  if (gotBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(gotBuf, expectedBuf)) {
    return res.status(401).json({ success: false, message: 'invalid cron secret' });
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();

  // Service role, so RLS does not apply — bug_reports is insert-only for
  // users and readable by nobody but us.
  const { data, error } = await supabase
    .from('bug_reports')
    .select('created_at, message, route, platform, app_version, business_id, user_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ success: false, message: error.message });

  type Row = {
    created_at: string; message: string;
    route: string | null; platform: string | null; app_version: string | null;
    business_id: string | null; user_id: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  // Nothing to say. Sending "0 reports" daily trains you to ignore the email,
  // which defeats the point of having one.
  if (rows.length === 0) return res.json({ success: true, sent: false, count: 0 });

  // Resolve names separately rather than with embedded selects: a report whose
  // business was deleted still matters (business_id is ON DELETE SET NULL for
  // exactly that reason), and a join would be the wrong shape for it.
  const bizIds = [...new Set(rows.map(r => r.business_id).filter(Boolean))] as string[];
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];

  const bizNames = new Map<string, string>();
  if (bizIds.length) {
    const { data: biz } = await supabase.from('businesses').select('id, name').in('id', bizIds);
    for (const b of biz ?? []) bizNames.set(b.id as string, b.name as string);
  }

  const emails = new Map<string, string>();
  for (const id of userIds) {
    const { data: u } = await supabase.auth.admin.getUserById(id);
    if (u?.user?.email) emails.set(id, u.user.email);
  }

  const digestRows: BugDigestRow[] = rows.map(r => ({
    created_at: r.created_at,
    message: r.message,
    route: r.route,
    platform: r.platform,
    app_version: r.app_version,
    business_name: r.business_id ? bizNames.get(r.business_id) ?? null : null,
    user_email: r.user_id ? emails.get(r.user_id) ?? null : null,
  }));

  const { subject, html, text } = buildBugDigest(digestRows, WINDOW_HOURS);
  const result = await sendEmail({ to: DIGEST_TO, subject, html, text });

  // sendEmail never throws; report what happened rather than pretending.
  return res.json({
    success: result.ok,
    sent: result.ok,
    count: rows.length,
    ...(result.ok ? {} : { reason: result.reason, detail: result.detail }),
  });
});

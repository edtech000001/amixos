// Account + business deletion (App Store guideline 5.1.1(v): an app offering
// account creation must let the user delete that account from inside the app).
//
// Shape of the feature — see migration 230:
//   • Requesting a deletion writes a row with a 30-day `purge_after`. Nothing
//     is destroyed yet, the subscription is cancelled immediately, and the app
//     shows a restore screen instead of the dashboard while the row exists.
//   • A hard delete happens only when /purge-due runs after that date.
//
// Why the request path refuses some accounts: businesses.owner_id cascades on
// user delete, so deleting an owner takes their whole business — clients,
// jobs, invoices — with it, including data their TEAM depends on. An account
// request is therefore refused while the caller still owns a business with
// other members; the answer is to hand that business to another admin, or to
// delete the business outright (its own endpoint below, which is the owner's
// decision to make and does not need everyone else's consent).
//
// Writes live here rather than in the client because the deciding facts —
// "does this business have other members", "is the caller really the owner" —
// must not be assertable by the app.

import { Router } from 'express';
import Stripe from 'stripe';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

export const accountRouter = Router();

const STORAGE_BUCKET = 'business-assets';

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;

interface OwnedBusiness {
  id: string;
  name: string | null;
  stripe_subscription_id: string | null;
  otherMembers: number;
}

/** Businesses the caller OWNS, each with a count of the OTHER members in it. */
async function ownedBusinesses(userId: string): Promise<OwnedBusiness[]> {
  // businesses.owner_id is the authority on ownership — it is what cascades on
  // user delete. A stale 'owner' row in business_members must not let someone
  // schedule a business that isn't theirs.
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, name, stripe_subscription_id')
    .eq('owner_id', userId);
  const rows = (owned ?? []) as { id: string; name: string | null; stripe_subscription_id: string | null }[];
  const out: OwnedBusiness[] = [];
  for (const b of rows) {
    const { count } = await supabase
      .from('business_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('business_id', b.id)
      .neq('user_id', userId);
    out.push({ ...b, otherMembers: count ?? 0 });
  }
  return out;
}

async function cancelSubscription(subscriptionId: string | null) {
  if (!subscriptionId || !stripe) return;
  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch {
    // A already-cancelled / unknown subscription must not block the deletion
    // the user asked for. Billing state is reconciled by the webhook anyway.
  }
}

// GET /api/v1/account/status — what the Account screen needs to render:
// the caller's pending deletion (if any), the businesses that BLOCK an account
// deletion, and any business already scheduled for deletion.
accountRouter.get('/status', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const [{ data: pending }, owned] = await Promise.all([
    supabase.from('account_deletions').select('purge_after, requested_at').eq('user_id', userId).maybeSingle(),
    ownedBusinesses(userId),
  ]);
  const { data: bizPending } = await supabase
    .from('business_deletions')
    .select('business_id, purge_after')
    .in('business_id', owned.map(b => b.id).length ? owned.map(b => b.id) : ['00000000-0000-0000-0000-000000000000']);

  res.json({
    success: true,
    pendingDeletion: pending ? { purgeAfter: pending.purge_after, requestedAt: pending.requested_at } : null,
    // Businesses that would take other people's data down with them.
    blockers: owned
      .filter(b => b.otherMembers > 0)
      .map(b => ({ businessId: b.id, name: b.name, otherMembers: b.otherMembers })),
    ownedBusinesses: owned.map(b => ({ businessId: b.id, name: b.name, otherMembers: b.otherMembers })),
    pendingBusinessDeletions: ((bizPending ?? []) as { business_id: string; purge_after: string }[])
      .map(r => ({ businessId: r.business_id, purgeAfter: r.purge_after })),
  });
});

// POST /api/v1/account/delete — schedule the caller's own deletion.
accountRouter.post('/delete', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;

  const owned = await ownedBusinesses(userId);
  const blockers = owned.filter(b => b.otherMembers > 0);
  if (blockers.length > 0) {
    return res.status(409).json({
      success: false,
      code: 'owns_business_with_members',
      message: 'Transfer or delete these businesses first.',
      blockers: blockers.map(b => ({ businessId: b.id, name: b.name, otherMembers: b.otherMembers })),
    });
  }

  const { error } = await supabase
    .from('account_deletions')
    .upsert({ user_id: userId, reason }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ success: false, message: 'could_not_schedule' });

  // Stop the billing clock now, not in 30 days — nobody should pay through a
  // window they asked to end in.
  for (const b of owned) await cancelSubscription(b.stripe_subscription_id);

  const { data: row } = await supabase
    .from('account_deletions').select('purge_after').eq('user_id', userId).maybeSingle();
  res.json({ success: true, purgeAfter: row?.purge_after ?? null });
});

// POST /api/v1/account/restore — cancel a pending deletion (inside the window).
accountRouter.post('/restore', authenticate, async (req: AuthRequest, res) => {
  const { error } = await supabase.from('account_deletions').delete().eq('user_id', req.user!.id);
  if (error) return res.status(500).json({ success: false, message: 'could_not_restore' });
  // The subscription is NOT resurrected: it was cancelled at Stripe and has to
  // be bought again. Say so in the UI rather than implying a full undo.
  res.json({ success: true });
});

// POST /api/v1/account/business/delete — close a whole business. Owner only.
// Allowed WITH other members: the company's data is the owner's to end. Their
// logins survive; they simply lose this business.
accountRouter.post('/business/delete', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
  if (!businessId) return res.status(400).json({ success: false, message: 'missing_business_id' });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, owner_id, stripe_subscription_id')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) return res.status(404).json({ success: false, message: 'not_found' });
  if (biz.owner_id !== userId) return res.status(403).json({ success: false, message: 'not_owner' });

  const { error } = await supabase
    .from('business_deletions')
    .upsert({ business_id: businessId, requested_by: userId, reason }, { onConflict: 'business_id' });
  if (error) return res.status(500).json({ success: false, message: 'could_not_schedule' });

  await cancelSubscription(biz.stripe_subscription_id as string | null);

  const { data: row } = await supabase
    .from('business_deletions').select('purge_after').eq('business_id', businessId).maybeSingle();
  res.json({ success: true, purgeAfter: row?.purge_after ?? null });
});

// POST /api/v1/account/business/restore — owner cancels a business deletion.
accountRouter.post('/business/restore', authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId : '';
  if (!businessId) return res.status(400).json({ success: false, message: 'missing_business_id' });
  const { data: biz } = await supabase
    .from('businesses').select('owner_id').eq('id', businessId).maybeSingle();
  if (!biz) return res.status(404).json({ success: false, message: 'not_found' });
  if (biz.owner_id !== userId) return res.status(403).json({ success: false, message: 'not_owner' });
  const { error } = await supabase.from('business_deletions').delete().eq('business_id', businessId);
  if (error) return res.status(500).json({ success: false, message: 'could_not_restore' });
  res.json({ success: true });
});

// POST /api/v1/account/purge-due — the scheduled half. Authenticated by a
// shared secret, NOT a user token: it runs from cron, and nothing a logged-in
// client sends should be able to trigger other people's purges.
//
// Storage first: those objects are unreachable from SQL (the DB cascade cannot
// touch the bucket), so deleting the rows first would strand the files with no
// way left to find them.
accountRouter.post('/purge-due', async (req, res) => {
  const secret = process.env.PURGE_CRON_SECRET || '';
  const given = req.headers['x-purge-secret'];
  if (!secret || given !== secret) {
    return res.status(401).json({ success: false, message: 'unauthorized' });
  }

  // Businesses about to disappear: the ones scheduled directly, plus those
  // owned by an account whose window has closed.
  const nowIso = new Date().toISOString();
  const [{ data: dueBiz }, { data: dueAccounts }] = await Promise.all([
    supabase.from('business_deletions').select('business_id').lte('purge_after', nowIso),
    supabase.from('account_deletions').select('user_id').lte('purge_after', nowIso),
  ]);
  const bizIds = new Set(((dueBiz ?? []) as { business_id: string }[]).map(r => r.business_id));
  const userIds = ((dueAccounts ?? []) as { user_id: string }[]).map(r => r.user_id);
  if (userIds.length) {
    const { data: owned } = await supabase.from('businesses').select('id').in('owner_id', userIds);
    ((owned ?? []) as { id: string }[]).forEach(b => bizIds.add(b.id));
  }

  let filesRemoved = 0;
  for (const id of bizIds) {
    // Everything the app writes for a business lives under <businessId>/.
    const { data: listed } = await supabase.storage.from(STORAGE_BUCKET).list(id, { limit: 1000 });
    const paths: string[] = [];
    for (const entry of (listed ?? []) as { name: string; id?: string | null }[]) {
      if (entry.id) {
        paths.push(`${id}/${entry.name}`);
        continue;
      }
      // A folder: one level down covers the layout the app uses today.
      const { data: inner } = await supabase.storage.from(STORAGE_BUCKET).list(`${id}/${entry.name}`, { limit: 1000 });
      for (const f of (inner ?? []) as { name: string }[]) paths.push(`${id}/${entry.name}/${f.name}`);
    }
    if (paths.length) {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      if (!error) filesRemoved += paths.length;
    }
  }

  const [{ data: purgedBiz }, { data: purgedUsers }] = await Promise.all([
    supabase.rpc('purge_due_businesses'),
    supabase.rpc('purge_due_accounts'),
  ]);

  res.json({
    success: true,
    businessesPurged: ((purgedBiz ?? []) as unknown[]).length,
    accountsPurged: ((purgedUsers ?? []) as unknown[]).length,
    filesRemoved,
  });
});

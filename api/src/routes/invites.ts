import { Router } from 'express';
import { sendEmail } from '../lib/email';
import { teamInviteHtml, teamInviteSubject, teamInviteText } from '../lib/emails/teamInvite';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { inviteLimiter } from '../middleware/rateLimit';
import { wouldExceedMembers, memberLimit, type SubscriptionRow } from '../lib/planLimits';

/**
 * A human name for whoever sent the invite, so the email can say
 * "Edvin te invitó" instead of "alguien te invitó".
 *
 * Email/password signups store first_name / last_name; Google and Apple store
 * name or full_name. All of them can be absent, and the email address is a
 * poor last resort but still better than nothing — the template has its own
 * fallback for when even this returns null.
 */
async function inviterDisplayName(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const m = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const first = typeof m.first_name === 'string' ? m.first_name.trim() : '';
    const last = typeof m.last_name === 'string' ? m.last_name.trim() : '';
    const joined = [first, last].filter(Boolean).join(' ');
    if (joined) return joined;
    for (const key of ['full_name', 'name']) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return data?.user?.email ?? null;
  } catch {
    // Never fail an invite over a nicety.
    return null;
  }
}

/**
 * True when Supabase refused because the address already has an account.
 *
 * admin.inviteUserByEmail exists to CREATE a pending user, so a registered
 * address is not an error to retry — it is a different delivery path. Checked
 * by code first; the message is a fallback for GoTrue versions that answered
 * before the codes existed.
 */
function isAlreadyRegistered(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'email_exists' || err.code === 'user_already_exists') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('already been registered') || m.includes('already registered');
}

/**
 * Sends the invitation by whichever path can actually reach this person.
 *
 *  • New address → Supabase's inviteUserByEmail, which also creates the
 *    pending auth user that the signup flow needs.
 *  • Registered  → our own email through Resend. They do not need an
 *    invite-to-signup link; they need telling that they now have a second
 *    workspace, and the accept URL.
 *
 * That second path is the bug this fixes. inviteUserByEmail REFUSES a
 * registered address, so for anyone who had used Amixos before — a contractor
 * working for two businesses, someone re-added after removal, anyone who
 * signed up and never finished onboarding — the invite row was written and no
 * email was ever sent. Silently, and re-inviting failed identically.
 *
 * Returns whether anything was actually delivered, so the UI can offer the
 * copy-link fallback honestly rather than implying mail that never left.
 */
async function deliverInvite(args: {
  email: string;
  acceptUrl: string;
  inviteToken: string;
  businessId: string;
  businessName: string | null;
  inviterName: string | null;
  role?: string;
}): Promise<boolean> {
  const { email, acceptUrl, inviteToken, businessId, businessName, inviterName, role } = args;

  try {
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: acceptUrl,
      data: {
        invite_token: inviteToken,
        business_id: businessId,
        ...(role ? { role } : {}),
        business_name: businessName,
        inviter_name: inviterName,
      },
    });
    if (!error) return true;

    if (!isAlreadyRegistered(error)) {
      // eslint-disable-next-line no-console
      console.warn('[invites] inviteUserByEmail failed', error.message);
      return false;
    }

    const data = { businessName, inviterName, acceptUrl };
    const sent = await sendEmail({
      to: email,
      subject: teamInviteSubject(data),
      html: teamInviteHtml(data),
      text: teamInviteText(data),
    });
    if (!sent.ok) {
      // eslint-disable-next-line no-console
      console.warn('[invites] resend send failed', sent.reason, sent.detail ?? '');
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[invites] deliverInvite threw', e);
    return false;
  }
}

export const invitesRouter = Router();
invitesRouter.use(authenticate);

const ALLOWED_ROLES = ['admin', 'manager', 'office', 'field', 'viewer'] as const;
type InviteRole = typeof ALLOWED_ROLES[number];

// Verify the caller is an owner or admin of the given business.
async function assertAdmin(userId: string, businessId: string): Promise<boolean> {
  const { data } = await supabase
    .from('business_members')
    .select('role')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * POST /api/v1/invites
 * Body: { business_id, email, role }
 * Creates a business_invites row and sends an invite email. NEW addresses go
 * through Supabase Auth's inviteUserByEmail, which also creates the pending
 * user; addresses that ALREADY have an account go through Resend, because
 * inviteUserByEmail refuses them. Returns the
 * accept URL so the inviter can also copy/share it manually.
 */
invitesRouter.post('/', inviteLimiter, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, email, role } = req.body ?? {};
  if (!business_id || !email || !role) {
    return res.status(400).json({ success: false, message: 'business_id, email, role required' });
  }
  // Built-in invitable roles, or a custom role defined by this business
  // (business_roles with is_system=false, migration 179). The DB trigger
  // re-validates on insert, this just gives a clean 400.
  if (!ALLOWED_ROLES.includes(role as InviteRole)) {
    const { data: customRole } = await supabase
      .from('business_roles')
      .select('key')
      .eq('business_id', business_id)
      .eq('key', role)
      .eq('is_system', false)
      .maybeSingle();
    if (!customRole) {
      return res.status(400).json({ success: false, message: 'invalid role' });
    }
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (normalizedEmail === req.user?.email?.toLowerCase()) {
    return res.status(400).json({ success: false, code: 'invite_self' });
  }

  if (!(await assertAdmin(userId, business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  // If they're already a member, reject early.
  const { data: existingMember } = await supabase
    .from('business_members')
    .select('id, user_id, role, users:user_id(email)')
    .eq('business_id', business_id);
  const alreadyMember = (existingMember ?? []).some(
    (m: any) => (m.users?.email ?? '').toLowerCase() === normalizedEmail,
  );
  if (alreadyMember) {
    return res.status(409).json({ success: false, code: 'already_member' });
  }

  // If there's already a pending invite for this email + business, reject.
  const { data: pending } = await supabase
    .from('business_invites')
    .select('id')
    .eq('business_id', business_id)
    .ilike('email', normalizedEmail)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (pending) {
    return res.status(409).json({ success: false, code: 'already_invited' });
  }

  // Seat cap. Counts current members + every unaccepted, unexpired invite —
  // a pending invite is a seat already spoken for, or you could queue a
  // hundred of them under a 2-seat plan. Nobody already on the team is ever
  // removed; the cap only refuses to add someone new.
  const [{ data: bizRow }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('businesses')
      // name comes along for the invite email — the seat-cap query already
      // reads this row, so naming the business costs nothing extra.
      .select('name, plan, subscription_status, trial_ends_at')
      .eq('id', business_id)
      .maybeSingle(),
    supabase
      .from('business_invites')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString()),
  ]);
  if (bizRow) {
    const sub = bizRow as SubscriptionRow;
    const used = (existingMember ?? []).length + (pendingCount ?? 0);
    if (wouldExceedMembers(sub, used)) {
      return res.status(409).json({
        success: false,
        code: 'seat_limit',
        limit: memberLimit(sub),
        used,
      });
    }
  }

  // Create the invite row. Token is auto-generated by the DB default.
  const { data: invite, error: insertErr } = await supabase
    .from('business_invites')
    .insert({
      business_id,
      email: normalizedEmail,
      role,
      invited_by: userId,
    })
    .select('id, token, business_id, role, email, expires_at')
    .single();
  if (insertErr || !invite) {
    return res.status(500).json({ success: false, message: insertErr?.message ?? 'insert_failed' });
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const acceptUrl = `${frontendUrl.replace(/\/$/, '')}/invitacion/${invite.token}`;

  // Delivery is non-fatal — the invite row and its shareable link exist either
  // way, and the admin can hand the link over directly. deliverInvite picks
  // the path that can actually reach this address; see its docblock.
  const emailSent = await deliverInvite({
    email: normalizedEmail,
    acceptUrl,
    inviteToken: invite.token,
    businessId: business_id,
    businessName: (bizRow as { name?: string } | null)?.name ?? null,
    inviterName: await inviterDisplayName(userId),
    role,
  });

  // Audit log
  await supabase.from('audit_log').insert({
    business_id,
    user_id: userId,
    action: 'invite.sent',
    entity_type: 'invite',
    entity_id: invite.id,
    details: { email: normalizedEmail, role, email_sent: emailSent },
  });

  return res.json({
    success: true,
    data: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      acceptUrl,
      expiresAt: invite.expires_at,
      emailSent,
    },
  });
});

/**
 * DELETE /api/v1/invites/:id
 * Revoke a pending invite. Admin-only.
 */
invitesRouter.delete('/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { data: invite } = await supabase
    .from('business_invites')
    .select('id, business_id, email, role')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!invite) return res.status(404).json({ success: false, message: 'not_found' });

  if (!(await assertAdmin(userId, invite.business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  await supabase.from('business_invites').delete().eq('id', invite.id);

  await supabase.from('audit_log').insert({
    business_id: invite.business_id,
    user_id: userId,
    action: 'invite.revoked',
    entity_type: 'invite',
    entity_id: invite.id,
    details: { email: invite.email, role: invite.role },
  });

  return res.json({ success: true });
});

/**
 * POST /api/v1/invites/:id/resend
 * Resend the email for a pending invite (does not change the token).
 */
invitesRouter.post('/:id/resend', inviteLimiter, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { data: invite } = await supabase
    .from('business_invites')
    .select('id, business_id, email, token, expires_at, accepted_at')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!invite) return res.status(404).json({ success: false, message: 'not_found' });
  if (invite.accepted_at) return res.status(400).json({ success: false, message: 'already_accepted' });

  if (!(await assertAdmin(userId, invite.business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const acceptUrl = `${frontendUrl.replace(/\/$/, '')}/invitacion/${invite.token}`;

  const { data: bizRow } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', invite.business_id)
    .maybeSingle();

  const emailSent = await deliverInvite({
    email: invite.email,
    acceptUrl,
    inviteToken: invite.token,
    businessId: invite.business_id,
    businessName: (bizRow as { name?: string } | null)?.name ?? null,
    inviterName: await inviterDisplayName(userId),
  });

  return res.json({ success: true, data: { acceptUrl, emailSent } });
});

/**
 * GET /api/v1/invites?business_id=...
 * List pending invites for a business. Admin-only.
 */
invitesRouter.get('/', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });

  if (!(await assertAdmin(userId, businessId))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const { data } = await supabase
    .from('business_invites')
    .select('id, email, role, token, expires_at, accepted_at, created_at')
    .eq('business_id', businessId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const items = (data ?? []).map(i => ({
    ...i,
    acceptUrl: `${frontendUrl.replace(/\/$/, '')}/invitacion/${i.token}`,
  }));

  return res.json({ success: true, data: items });
});

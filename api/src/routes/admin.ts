import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest, getBusinessRole } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { mintImpersonationToken } from '../lib/impersonationToken';

// Admin-only operations. Currently: "Ver como" (login-as-member) — an owner or
// admin gets a short-lived token scoped to one of their team members so the app
// renders that member's real, RLS-filtered view. See impersonationToken.ts for
// why a minted token is sufficient and how RLS does the filtering for free.
export const adminRouter = Router();
adminRouter.use(authenticate);

// Impersonation mints a credential, so cap it harder than the global limit to
// blunt any abuse / token-farming if a caller's session is compromised.
const impersonateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

type Role = 'owner' | 'admin' | 'manager' | 'office' | 'field' | 'viewer';

/**
 * Whether `callerRole` is allowed to impersonate `targetRole`.
 * Locked policy: only owner/admin may impersonate at all; the owner is NEVER a
 * target; and an admin may not impersonate another admin (no lateral moves).
 * An owner may impersonate any non-owner.
 */
function canImpersonate(callerRole: Role, targetRole: Role): boolean {
  if (callerRole !== 'owner' && callerRole !== 'admin') return false;
  if (targetRole === 'owner') return false;
  if (callerRole === 'admin' && targetRole === 'admin') return false;
  return true;
}

/**
 * POST /api/v1/admin/impersonate
 * Body: { business_id, target_user_id }
 * Returns a short-lived token + the target's display context for the banner.
 */
adminRouter.post('/impersonate', impersonateLimiter, async (req: AuthRequest, res) => {
  const callerId = req.user?.id;
  if (!callerId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, target_user_id } = req.body ?? {};
  if (!business_id || !target_user_id) {
    return res.status(400).json({ success: false, message: 'business_id and target_user_id required' });
  }
  if (target_user_id === callerId) {
    return res.status(400).json({ success: false, code: 'impersonate_self' });
  }

  // Caller must be owner/admin of this business (read from business_members).
  const callerRole = (await getBusinessRole(callerId, business_id)) as Role | null;
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  // Target must be a member of the SAME business (this also proves app access —
  // a business_members row only exists for users who can log in).
  const { data: targetMember } = await supabase
    .from('business_members')
    .select('role')
    .eq('business_id', business_id)
    .eq('user_id', target_user_id)
    .maybeSingle();
  if (!targetMember) {
    return res.status(404).json({ success: false, code: 'not_a_member' });
  }

  const targetRole = targetMember.role as Role;
  if (!canImpersonate(callerRole, targetRole)) {
    return res.status(403).json({ success: false, code: 'role_not_allowed' });
  }

  // Resolve the target's display name/email for the banner.
  const { data: targetUser } = await supabase.auth.admin.getUserById(target_user_id);
  const email = targetUser?.user?.email ?? null;
  const name =
    (targetUser?.user?.user_metadata?.name as string | undefined) ??
    (targetUser?.user?.user_metadata?.full_name as string | undefined) ??
    null;

  let minted;
  try {
    minted = mintImpersonationToken(target_user_id);
  } catch (e: any) {
    // Almost always a missing SUPABASE_JWT_SECRET — surface clearly.
    return res.status(500).json({ success: false, message: e?.message ?? 'mint_failed' });
  }

  // Audit the start. Stop is logged by /impersonate/stop (best-effort) and the
  // token self-expires regardless.
  await supabase.from('audit_log').insert({
    business_id,
    user_id: callerId,
    action: 'impersonation.start',
    entity_type: 'member',
    entity_id: target_user_id,
    details: { target_role: targetRole, target_email: email, expires_at: minted.expiresAt },
  });

  return res.json({
    success: true,
    data: {
      token: minted.token,
      expiresAt: minted.expiresAt,
      target: { userId: target_user_id, role: targetRole, email, name },
    },
  });
});

/**
 * POST /api/v1/admin/impersonate/stop
 * Body: { business_id, target_user_id }
 * Best-effort audit marker when the admin exits impersonation. The minted token
 * is stateless (no server revocation needed) — this only completes the trail.
 */
adminRouter.post('/impersonate/stop', async (req: AuthRequest, res) => {
  const callerId = req.user?.id;
  if (!callerId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, target_user_id } = req.body ?? {};
  if (!business_id || !target_user_id) {
    return res.status(400).json({ success: false, message: 'business_id and target_user_id required' });
  }

  // Only owner/admin could have started it; verify before logging.
  const callerRole = await getBusinessRole(callerId, business_id);
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  await supabase.from('audit_log').insert({
    business_id,
    user_id: callerId,
    action: 'impersonation.stop',
    entity_type: 'member',
    entity_id: target_user_id,
    details: {},
  });

  return res.json({ success: true });
});

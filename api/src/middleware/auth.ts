import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    /** Version of the Ami AI-sharing consent the user gave (user_metadata.
     *  ai_consent.v), or null. The user's own choice about their own data —
     *  NOT an authorization claim, so reading user metadata is fine here. */
    aiConsentVersion: string | null;
  };
  /** The caller's verified Supabase JWT — used to build per-request
   *  RLS-scoped clients (lib/supabaseRls.ts) so queries run AS the user. */
  token?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    // Only the verified identity is trusted. Role and active business are
    // NOT read from user_metadata — that field is writable by the user
    // themselves (auth.updateUser), so it can never be an authorization
    // claim. Authorize per-request from business_members instead.
    const aiConsent = (user.user_metadata as { ai_consent?: { v?: unknown } | null } | undefined)?.ai_consent;
    req.user = {
      id: user.id,
      email: user.email!,
      aiConsentVersion: typeof aiConsent?.v === 'string' ? aiConsent.v : null,
    };
    req.token = token;

    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

/**
 * "Ver como" tokens (lib/impersonationToken.ts) are a full sign-in AS the
 * target, so they must never reach the target's own identity actions: account
 * deletion, Google connections, invites, admin. Reads the claim without
 * verifying — forging it only locks the forger out.
 */
export const rejectImpersonated = (req: Request, res: Response, next: NextFunction) => {
  const payload = req.headers.authorization?.split(' ')[1]?.split('.')[1];
  try {
    if (payload && JSON.parse(Buffer.from(payload, 'base64url').toString()).amixos_impersonated) {
      return res.status(403).json({ success: false, code: 'impersonation_not_allowed' });
    }
  } catch {
    /* malformed token — authenticate() rejects it */
  }
  next();
};

/**
 * The caller's REAL role in a business, read from business_members (the source
 * of truth) using the service-role client. Never trust user_metadata for this.
 */
export async function getBusinessRole(userId: string, businessId: string): Promise<string | null> {
  const { data } = await supabase
    .from('business_members')
    .select('role')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

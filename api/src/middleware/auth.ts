import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
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
    req.user = {
      id: user.id,
      email: user.email!,
    };
    req.token = token;

    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
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

/**
 * Authorize a request by the caller's membership role in the target business.
 * `business_id` must be supplied in the body or query. With no roles listed,
 * any member passes (membership check only); otherwise the member's role must
 * be in the allowed set. Authorization is derived from the DB, not the JWT.
 */
export const requireBusinessRole = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }
    const businessId = String(req.body?.business_id ?? req.query?.business_id ?? '');
    if (!businessId) {
      return res.status(400).json({ success: false, message: 'business_id required' });
    }
    const role = await getBusinessRole(userId, businessId);
    if (!role || (roles.length > 0 && !roles.includes(role))) {
      return res.status(403).json({ success: false, message: 'forbidden' });
    }
    next();
  };
};

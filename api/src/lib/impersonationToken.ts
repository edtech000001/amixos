// Mints short-lived Supabase-compatible access tokens for the "Ver como"
// (login-as-member) feature. A token signed with the project's legacy HS256
// JWT secret is accepted by PostgREST/GoTrue exactly like a real user session,
// so RLS resolves `auth.uid()` to the impersonated member and returns only
// their data — no per-table query changes needed.
//
// SECURITY: this can forge any user's identity. Only the server (API) ever
// holds the JWT secret; the minted token is short-lived, has no refresh token,
// and is only issued after the caller is verified as an authorized owner/admin.

import crypto from 'crypto';
import { supabaseJwtSecret } from '../config/supabase';

const base64url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export interface MintedToken {
  token: string;
  expiresAt: number; // unix seconds
}

/**
 * Mint an HS256 JWT whose subject is `userId`, with the `authenticated` role
 * so RLS policies (auth.uid()) treat it as that member. Defaults to a 15-minute
 * lifetime and intentionally omits a refresh token — impersonation is meant to
 * be a brief, re-authorized preview, not a durable session.
 */
export function mintImpersonationToken(userId: string, ttlSeconds = 15 * 60): MintedToken {
  if (!supabaseJwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured — cannot mint impersonation tokens.');
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat,
    exp,
    // Marks the token as an impersonation session so it can be recognized in
    // logs / future RLS hardening without affecting auth.uid().
    amixos_impersonated: true,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    crypto.createHmac('sha256', supabaseJwtSecret).update(signingInput).digest(),
  );

  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}

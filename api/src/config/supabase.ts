import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The project's legacy HS256 JWT secret (Dashboard → Settings → API → JWT
// Secret). Used ONLY to mint short-lived impersonation tokens for the
// "Ver como" / login-as-member feature. Server-only; like the service role
// key it can forge identities, so it must never reach client code.
export const supabaseUrlPublic = supabaseUrl;
export const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || '';

// Service role client — full DB access (API only, never expose to client)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

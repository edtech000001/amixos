import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrlPublic } from '../config/supabase';

// Per-request Supabase client scoped to the CALLER's own JWT. Unlike the
// service-role client (config/supabase.ts) this one goes through RLS, so
// every read/write is enforced by the same policies (member_res/member_view,
// migration 089) that govern the web/mobile apps. Used by the AI assistant's
// tool executors so the model can never see or touch anything the user
// couldn't reach themselves.
//
// Requires SUPABASE_ANON_KEY in the api env (the public anon key — safe to
// hold server-side; authority comes from the forwarded user JWT).
const anonKey = process.env.SUPABASE_ANON_KEY || '';

export function rlsClient(jwt: string): SupabaseClient {
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY not set');
  return createClient(supabaseUrlPublic, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

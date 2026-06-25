import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client — bypasses RLS. SERVER ONLY (the webhook handler
// writes subscription state to businesses on Stripe's behalf, where there's no
// user session). Never import this into client components.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

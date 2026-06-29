import { createBrowserClient } from '@supabase/ssr';
import { impersonatingFetch } from '@amixos/shared/lib/impersonation';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createSupabaseClient = () => {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // While "Ver como" is active, this rewrites the Authorization header on
      // data requests so RLS runs as the impersonated member. No-op otherwise.
      { global: { fetch: impersonatingFetch } }
    );
  }
  return browserClient;
};

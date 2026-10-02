import { createBrowserClient } from '@supabase/ssr';
import { impersonatingFetch } from '@amixos/shared/lib/impersonation';
import { withRequestTimeout } from '@amixos/shared/lib/fetchTimeout';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export const createSupabaseClient = () => {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // While "Ver como" is active, this rewrites the Authorization header on
      // data requests so RLS runs as the impersonated member. No-op otherwise.
      // Wrapped in a timeout so a hung request rejects instead of leaving a
      // screen loading forever with no error and no retry (see fetchTimeout.ts).
      { global: { fetch: withRequestTimeout(impersonatingFetch) } }
    );
  }
  return browserClient;
};

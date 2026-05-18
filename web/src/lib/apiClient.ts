import { createSupabaseClient } from './supabase';

/**
 * Resolves the URL of our Express API server.
 * Set NEXT_PUBLIC_API_URL in web/.env.local (e.g. http://localhost:3001 for
 * local dev, or the deployed URL for production).
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

/**
 * Returns the current Supabase JWT (access_token) for use as Bearer token
 * when calling our authenticated API endpoints. Returns empty string if
 * the user isn't logged in — callers should null-check.
 */
export async function getJwt(): Promise<string> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { impersonatingFetch } from '@amixos/shared/lib/impersonation';
import { SecureSessionStorage } from './secureSessionStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY env vars',
  );
}

// Platform-aware storage: web uses localStorage; native uses encrypted
// SecureStore (Keychain/Keystore) for the session, which holds the long-lived
// refresh token — plaintext AsyncStorage would expose it on a rooted device or
// in an unencrypted backup. SecureSessionStorage migrates any existing
// AsyncStorage session on first read so upgrading users stay signed in.
const PlatformStorage =
  Platform.OS === 'web'
    ? {
        getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        setItem: async (key: string, value: string) => {
          globalThis.localStorage?.setItem(key, value);
        },
        removeItem: async (key: string) => {
          globalThis.localStorage?.removeItem(key);
        },
      }
    : SecureSessionStorage;

let client: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (client) return client;
  client = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
    auth: {
      storage: PlatformStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // While "Ver como" is active, rewrites Authorization on data requests so
    // RLS runs as the impersonated member. No-op otherwise.
    global: { fetch: impersonatingFetch },
  });
  // Supabase's RN guidance: pause the auto-refresh timer while backgrounded
  // and resume on foreground. Without this, a refresh can fire mid-suspend
  // (RN freezes timers/requests), leaving the auth client stuck holding its
  // internal lock — after which EVERY Supabase call hangs forever. Symptom:
  // a long-resident app (field crew) "saves" into an endless spinner until
  // the app is killed/updated.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client!.auth.startAutoRefresh();
      else client!.auth.stopAutoRefresh();
    });
  }
  return client;
}

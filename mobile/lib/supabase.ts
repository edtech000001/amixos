import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { impersonatingFetch } from '@amixos/shared/lib/impersonation';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY env vars',
  );
}

// Platform-aware storage so the same supabase client works on web (where
// AsyncStorage hangs silently) and native (where localStorage doesn't exist).
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
    : {
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      };

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
  return client;
}

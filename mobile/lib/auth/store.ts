import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createSupabaseClient } from '../supabase';

// The auth state machine. Booleans hide intermediate states (logging in,
// hydrating from storage, awaiting INITIAL_SESSION) and cause flicker /
// infinite spinners. Use the enum.
export type AuthStatus =
  | 'unknown'        // before zustand hydration completes
  | 'loading'        // hydrated, awaiting Supabase INITIAL_SESSION
  | 'logging_in'     // user submitted login, awaiting response
  | 'signing_up'     // user submitted signup, awaiting response
  | 'authenticated'  // confirmed by onAuthStateChange
  | 'logged_out';    // confirmed no session

export interface AppUser {
  id: string;
  email: string;
}

export interface Business {
  id: string;
  name: string;
  logo_url: string | null;
  service_type: string;
  city: string;
  state: string;
  client_field_required: Record<string, boolean>;
  job_pipeline_disabled: Record<string, boolean>;
}

export type LoginResult =
  | { ok: true; needsOnboarding: boolean }
  | { ok: false; reason: 'email-not-confirmed' | 'invalid-credentials' | 'too-many-requests' | 'user-not-found' | 'generic' | 'connection-error' };

interface AuthStore {
  user: AppUser | null;
  business: Business | null;
  businessLoaded: boolean;
  status: AuthStatus;
  error: string | null;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetchBusiness: () => Promise<void>;

  _handleAuthEvent: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  _setHydrated: () => void;
}

const supabase = createSupabaseClient();

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      business: null,
      businessLoaded: false,
      status: 'unknown',
      error: null,

      // login() does NOT set authenticated. It only kicks off the API call
      // and sets transient state. The SIGNED_IN event from
      // onAuthStateChange is the only thing that flips status to authenticated.
      login: async (email, password) => {
        set({ status: 'logging_in', error: null });
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            const m = error.message;
            let reason: Extract<LoginResult, { ok: false }>['reason'] = 'generic';
            if (m.includes('Email not confirmed') || m.includes('email not confirmed')) reason = 'email-not-confirmed';
            else if (m.includes('Invalid login credentials') || m.includes('invalid_credentials')) reason = 'invalid-credentials';
            else if (m.includes('Too many requests')) reason = 'too-many-requests';
            else if (m.includes('User not found')) reason = 'user-not-found';
            set({ status: 'logged_out', error: m });
            return { ok: false, reason };
          }
          // Success — SIGNED_IN listener will set status: 'authenticated'.
          // Return needsOnboarding: false; the route gate handles the redirect
          // once business has been fetched.
          return { ok: true, needsOnboarding: false };
        } catch (err) {
          set({ status: 'logged_out', error: 'Connection error' });
          return { ok: false, reason: 'connection-error' };
        }
      },

      logout: async () => {
        await supabase.auth.signOut();
        // SIGNED_OUT event will clear user/business and set status: 'logged_out'.
      },

      refetchBusiness: async () => {
        const u = get().user;
        if (!u) {
          set({ business: null, businessLoaded: true });
          return;
        }
        try {
          const { data } = await supabase
            .from('businesses')
            .select('id, name, logo_url, service_type, city, state, client_field_required, job_pipeline_disabled')
            .eq('owner_id', u.id)
            .limit(1)
            .maybeSingle();
          set({ business: (data as Business | null) ?? null, businessLoaded: true });
        } catch {
          set({ business: null, businessLoaded: true });
        }
      },

      _handleAuthEvent: async (event, session) => {
        switch (event) {
          case 'INITIAL_SESSION':
            if (session?.user) {
              set({
                user: { id: session.user.id, email: session.user.email ?? '' },
                status: 'authenticated',
                businessLoaded: false,
              });
              void get().refetchBusiness();
            } else {
              set({ user: null, business: null, businessLoaded: true, status: 'logged_out' });
            }
            break;
          case 'SIGNED_IN':
            if (session?.user) {
              set({
                user: { id: session.user.id, email: session.user.email ?? '' },
                status: 'authenticated',
                error: null,
                businessLoaded: false,
              });
              void get().refetchBusiness();
            }
            break;
          case 'SIGNED_OUT':
            set({ user: null, business: null, businessLoaded: false, status: 'logged_out', error: null });
            break;
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            if (session?.user) {
              set({ user: { id: session.user.id, email: session.user.email ?? '' } });
            }
            break;
          case 'PASSWORD_RECOVERY':
            break;
        }
      },

      _setHydrated: () => {
        // Only flip if INITIAL_SESSION hasn't already settled us. Otherwise
        // we'd overwrite an authenticated/logged_out status with 'loading'.
        if (get().status === 'unknown') {
          set({ status: 'loading' });
        }
      },
    }),
    {
      name: 'amixos-auth-storage',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist the user profile only — never status or businessLoaded. Auth
      // status must be derived from a live Supabase session check on every
      // launch, not from cached state. Persisting status causes "logged in"
      // flashes when the session is actually expired.
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => () => {
        setTimeout(() => useAuthStore.getState()._setHydrated(), 0);
      },
    },
  ),
);

// SINGLE module-level listener — fires once when this module is imported.
// Subscribing inside useEffect would create duplicate listeners on remount.
supabase.auth.onAuthStateChange((event, session) => {
  void useAuthStore.getState()._handleAuthEvent(event, session);
});

// Safety net: if INITIAL_SESSION never fires (network hung, AsyncStorage
// corruption, etc.), fall back to logged_out so the user isn't stuck on a
// spinner forever.
setTimeout(() => {
  const s = useAuthStore.getState().status;
  if (s === 'unknown' || s === 'loading') {
    useAuthStore.setState({ status: 'logged_out' });
  }
}, 15000);

// Backwards-compat hook for existing dashboard consumers reading `useApp()`.
// Uses individual selectors to avoid the object-selector rerender storm.
export function useApp() {
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const status = useAuthStore((s) => s.status);
  const refetchBusiness = useAuthStore((s) => s.refetchBusiness);
  const logout = useAuthStore((s) => s.logout);

  const loading = status === 'unknown' || status === 'loading';

  return { user, business, loading, refetchBusiness, signOut: logout };
}

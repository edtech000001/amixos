import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Role } from '@amixos/shared/lib/permissions';
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
  // All businesses the user is a member of. Loaded on every SIGNED_IN.
  businesses: Business[];
  // Which business is the "active workspace" — used to scope every dashboard
  // query. Persisted across sessions so the user lands back on the same one.
  activeBusinessId: string | null;
  // `business` is the currently active business — derived from
  // (businesses, activeBusinessId). Kept on the store so existing consumers
  // of useApp().business don't break.
  business: Business | null;
  // Map of business_id → caller's role in that business. Populated alongside
  // `businesses` on every SIGNED_IN / refetchBusiness.
  roles: Record<string, Role>;
  // Convenience: caller's role in the active business.
  currentRole: Role | null;
  businessLoaded: boolean;
  status: AuthStatus;
  error: string | null;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetchBusiness: () => Promise<void>;
  // Switch the active workspace. Re-derives `business` and writes the new
  // id to persistence so it survives reloads.
  setActiveBusiness: (businessId: string) => void;

  _handleAuthEvent: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  _setHydrated: () => void;
}

const supabase = createSupabaseClient();

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      businesses: [],
      activeBusinessId: null,
      business: null,
      roles: {},
      currentRole: null,
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
          set({ businesses: [], business: null, businessLoaded: true, activeBusinessId: null, roles: {}, currentRole: null });
          return;
        }
        try {
          // Fetch all businesses the user is a member of (RLS lets the join
          // through because the user is in business_members for each). The
          // member row also gives us this user's role per business.
          const [{ data: bizRows }, { data: memberRows }] = await Promise.all([
            supabase
              .from('businesses')
              .select('id, name, logo_url, service_type, city, state, client_field_required, job_pipeline_disabled'),
            supabase
              .from('business_members')
              .select('business_id, role')
              .eq('user_id', u.id),
          ]);
          const list = ((bizRows as Business[] | null) ?? []);
          const roleMap: Record<string, Role> = {};
          for (const m of (memberRows ?? []) as Array<{ business_id: string; role: string }>) {
            roleMap[m.business_id] = m.role as Role;
          }
          // Active business: prefer the persisted id if it's still in the
          // list; otherwise default to the first one.
          const stored = get().activeBusinessId;
          const activeId =
            stored && list.some((b) => b.id === stored) ? stored : list[0]?.id ?? null;
          const active = list.find((b) => b.id === activeId) ?? null;
          set({
            businesses: list,
            activeBusinessId: activeId,
            business: active,
            roles: roleMap,
            currentRole: activeId ? roleMap[activeId] ?? null : null,
            businessLoaded: true,
          });
        } catch {
          set({ businesses: [], business: null, businessLoaded: true });
        }
      },

      setActiveBusiness: (businessId) => {
        const list = get().businesses;
        const next = list.find((b) => b.id === businessId);
        if (!next) return;
        const roleMap = get().roles;
        set({
          activeBusinessId: businessId,
          business: next,
          currentRole: roleMap[businessId] ?? null,
        });
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
      partialize: (state) => ({
        user: state.user,
        activeBusinessId: state.activeBusinessId,
      }),
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
  const businesses = useAuthStore((s) => s.businesses);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  const currentRole = useAuthStore((s) => s.currentRole);
  const status = useAuthStore((s) => s.status);
  const refetchBusiness = useAuthStore((s) => s.refetchBusiness);
  const logout = useAuthStore((s) => s.logout);

  const loading = status === 'unknown' || status === 'loading';

  return {
    user,
    business,
    businesses,
    activeBusinessId,
    setActiveBusiness,
    currentRole,
    loading,
    refetchBusiness,
    signOut: logout,
  };
}

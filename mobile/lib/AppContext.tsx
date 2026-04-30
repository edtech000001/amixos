import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, useSegments } from 'expo-router';
import { createSupabaseClient } from './supabase';

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

export interface AppUser {
  id: string;
  email: string;
}

interface AppContextValue {
  user: AppUser | null;
  business: Business | null;
  loading: boolean;
  refetchBusiness: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue>({
  user: null,
  business: null,
  loading: true,
  refetchBusiness: async () => {},
  signOut: async () => {},
});

/**
 * Watches auth state + current route segment and redirects:
 * - authenticated user without business → /onboarding
 * - authenticated user on a public route → /dashboard
 * - unauthenticated user on a protected route → /auth/login
 */
function useProtectedRoute(
  user: AppUser | null,
  business: Business | null,
  loading: boolean,
) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    const inDashboard = segments[0] === 'dashboard';
    const onSplash = segments[0] === '(tabs)' || segments[0] === ('' as any);

    if (!user && (inDashboard || inOnboarding)) {
      router.replace('/auth/login');
      return;
    }
    if (user && !business && !inOnboarding && !inAuthGroup) {
      router.replace('/onboarding');
      return;
    }
    if (user && business && (inAuthGroup || onSplash)) {
      router.replace('/dashboard');
      return;
    }
  }, [user, business, loading, segments]);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createSupabaseClient();
  const [user, setUser] = useState<AppUser | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusiness = async (userId: string) => {
    const { data } = await supabase
      .from('businesses')
      .select(
        'id, name, logo_url, service_type, city, state, client_field_required, job_pipeline_disabled',
      )
      .eq('owner_id', userId)
      .limit(1)
      .single();
    setBusiness(data ?? null);
  };

  const refetchBusiness = async () => {
    if (user) await fetchBusiness(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBusiness(null);
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session) {
        setUser({ id: session.user.id, email: session.user.email ?? '' });
        await fetchBusiness(session.user.id);
      }
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setBusiness(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setUser({ id: session.user.id, email: session.user.email ?? '' });
          await fetchBusiness(session.user.id);
        }
      },
    );
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useProtectedRoute(user, business, loading);

  return (
    <AppContext.Provider
      value={{ user, business, loading, refetchBusiness, signOut }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

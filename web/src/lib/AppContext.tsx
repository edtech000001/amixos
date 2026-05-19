'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createSupabaseClient } from '@/lib/supabase';

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
  businesses: Business[];
  business: Business | null;
  activeBusinessId: string | null;
  loading: boolean;
  refetchBusiness: () => Promise<void>;
  setActiveBusiness: (businessId: string) => void;
}

const AppContext = createContext<AppContextValue>({
  user: null,
  businesses: [],
  business: null,
  activeBusinessId: null,
  loading: true,
  refetchBusiness: async () => {},
  setActiveBusiness: () => {},
});

// Cookie name for persisting the active business id across reloads.
const ACTIVE_BIZ_COOKIE = 'amixos-active-business';

function readActiveCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )amixos-active-business=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function writeActiveCookie(id: string | null) {
  if (typeof document === 'undefined') return;
  if (id) {
    document.cookie = `${ACTIVE_BIZ_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  } else {
    document.cookie = `${ACTIVE_BIZ_COOKIE}=; path=/; max-age=0`;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createSupabaseClient();
  const [user, setUser] = useState<AppUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Derived: the currently-active business object. Memoized via state to avoid
  // recomputing on every render.
  const business = businesses.find((b) => b.id === activeBusinessId) ?? null;

  const fetchBusinesses = async () => {
    const { data } = await supabase
      .from('businesses')
      .select('id, name, logo_url, service_type, city, state, client_field_required, job_pipeline_disabled');
    const list = (data as Business[] | null) ?? [];
    setBusinesses(list);

    const cookieId = readActiveCookie();
    const nextActive =
      cookieId && list.some((b) => b.id === cookieId) ? cookieId : list[0]?.id ?? null;
    setActiveBusinessIdState(nextActive);
    if (nextActive !== cookieId) writeActiveCookie(nextActive);
  };

  const refetchBusiness = async () => {
    if (user) await fetchBusinesses();
  };

  const setActiveBusiness = (id: string) => {
    if (!businesses.some((b) => b.id === id)) return;
    setActiveBusinessIdState(id);
    writeActiveCookie(id);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser({ id: session.user.id, email: session.user.email ?? '' });
        await fetchBusinesses();
      } else if (window.location.pathname.startsWith('/dashboard')) {
        window.location.href = '/auth/login';
        return;
      }
      setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setBusinesses([]);
          setActiveBusinessIdState(null);
          writeActiveCookie(null);
          window.location.href = '/auth/login';
        }
      },
    );
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        businesses,
        business,
        activeBusinessId,
        loading,
        refetchBusiness,
        setActiveBusiness,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

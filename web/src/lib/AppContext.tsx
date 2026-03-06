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
}

const AppContext = createContext<AppContextValue>({
  user: null,
  business: null,
  loading: true,
  refetchBusiness: async () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createSupabaseClient();
  const [user, setUser] = useState<AppUser | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusiness = async (userId: string) => {
    const { data } = await supabase
      .from('businesses')
      .select('id, name, logo_url, service_type, city, state')
      .eq('owner_id', userId)
      .limit(1)
      .single();
    if (data) setBusiness(data);
  };

  const refetchBusiness = async () => {
    if (user) await fetchBusiness(user.id);
  };

  useEffect(() => {
    const init = async () => {
      // Middleware refreshes the token via cookies on each request.
      // getSession() reads the cookie-stored session.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser({ id: session.user.id, email: session.user.email ?? '' });
        await fetchBusiness(session.user.id);
      } else if (window.location.pathname.startsWith('/dashboard')) {
        window.location.href = '/auth/login';
        return;
      }
      setLoading(false);
    };
    init();

    // Handle sign-out from other tabs or explicit sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setBusiness(null);
          window.location.href = '/auth/login';
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AppContext.Provider value={{ user, business, loading, refetchBusiness }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

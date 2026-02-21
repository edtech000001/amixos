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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/auth/login';
        return;
      }
      setUser({ id: session.user.id, email: session.user.email ?? '' });
      await fetchBusiness(session.user.id);
      setLoading(false);
    };
    init();
  }, []);

  return (
    <AppContext.Provider value={{ user, business, loading, refetchBusiness }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import type { Role } from '@amixos/shared/lib/permissions';

export interface Business {
  id: string;
  name: string;
  logo_url: string | null;
  service_type: string;
  city: string;
  state: string;
  client_field_required: Record<string, boolean>;
  client_field_order: string[] | null;
  employee_field_required: Record<string, boolean>;
  employee_field_order: string[] | null;
  job_field_required: Record<string, boolean>;
  job_field_order: string[] | null;
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
  roles: Record<string, Role>;
  currentRole: Role | null;
  loading: boolean;
  refetchBusiness: () => Promise<void>;
  setActiveBusiness: (businessId: string) => void;
}

const AppContext = createContext<AppContextValue>({
  user: null,
  businesses: [],
  business: null,
  activeBusinessId: null,
  roles: {},
  currentRole: null,
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
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(true);

  // Derived state — recomputed on every render, fine here since the maps are small.
  const business = businesses.find((b) => b.id === activeBusinessId) ?? null;
  const currentRole = activeBusinessId ? roles[activeBusinessId] ?? null : null;

  const fetchBusinesses = async (currentUserId: string) => {
    const [{ data: bizRows }, { data: memberRows }] = await Promise.all([
      supabase
        .from('businesses')
        .select('id, name, logo_url, service_type, city, state, client_field_required, client_field_order, employee_field_required, employee_field_order, job_field_required, job_field_order, job_pipeline_disabled'),
      supabase
        .from('business_members')
        .select('business_id, role')
        .eq('user_id', currentUserId),
    ]);
    const list = (bizRows as Business[] | null) ?? [];
    const roleMap: Record<string, Role> = {};
    for (const m of ((memberRows ?? []) as Array<{ business_id: string; role: string }>)) {
      roleMap[m.business_id] = m.role as Role;
    }
    setBusinesses(list);
    setRoles(roleMap);

    const cookieId = readActiveCookie();
    const nextActive =
      cookieId && list.some((b) => b.id === cookieId) ? cookieId : list[0]?.id ?? null;
    setActiveBusinessIdState(nextActive);
    if (nextActive !== cookieId) writeActiveCookie(nextActive);
  };

  const refetchBusiness = async () => {
    if (user) await fetchBusinesses(user.id);
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
        const u = { id: session.user.id, email: session.user.email ?? '' };
        setUser(u);
        await fetchBusinesses(u.id);
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
          setRoles({});
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
        roles,
        currentRole,
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

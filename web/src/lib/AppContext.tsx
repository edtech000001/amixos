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
  address: string | null;
  postal_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  tax_id: string | null;
  license_number: string | null;
  invoice_notes_default: string | null;
  invoice_due_days: number | null;
  invoice_field_required: Record<string, boolean>;
  invoice_field_order: string[] | null;
  // Default invoice template config (JSONB). See shared/src/lib/invoiceTemplate.
  invoice_template: Record<string, unknown> | null;
  client_field_required: Record<string, boolean>;
  client_field_order: string[] | null;
  employee_field_required: Record<string, boolean>;
  employee_field_order: string[] | null;
  job_field_required: Record<string, boolean>;
  job_field_order: string[] | null;
  job_pipeline_disabled: Record<string, boolean>;
  job_crew_mode: boolean;
  // Upcoming-job alert config (migration 046). Owner-configured tiers
  // surface a colored left border + chip on each job card. Shape:
  // see shared/src/lib/jobAlerts.ts.
  job_alert_thresholds: { enabled: boolean; levels: { days: number; color: string }[] };
  assignment_field_required: Record<string, boolean>;
  assignment_field_order: string[] | null;
  map_pin_config: MapPinConfig;
  // Per-business map view prefs (map type / clustering / pin size). Synced
  // across the owner's devices. Null = use client defaults. See migration 039.
  map_view_settings: MapViewSettings | null;
  // Weather alert config (alpha — only the gated business id sees this UI).
  // Shape: see shared/src/lib/weather.ts (WeatherConfig).
  weather_config: Record<string, unknown> | null;
  // Weekly operating hours (migration 041). Null = not configured yet — the
  // app skips out-of-hours job warnings until set. Shape: see
  // shared/src/lib/operatingHours.ts (OperatingHours).
  operating_hours: Record<string, { enabled: boolean; start: string; end: string }> | null;
  // Home dashboard widget layout (migration 049). Null = default layout.
  // Shape: see shared/src/lib/dashboardWidgets.ts (DashboardLayout).
  dashboard_layout: { order: string[]; hidden: string[]; sizes?: Record<string, 'sm' | 'md' | 'lg'> } | null;
}

// Map view prefs — synced via businesses.map_view_settings (migration 039).
// mapType is loosely typed: web uses 'roadmap', mobile uses 'standard', and
// the same JSONB is shared, so each platform normalizes on read.
export interface MapViewSettings {
  mapType: string;
  clustering: boolean;
  pinSize: 'small' | 'medium' | 'large';
  // Outreach-mode window (days) — optional for back-compat with rows saved
  // before the feature shipped; readers default to 1.
  outreachDays?: number;
}

// Map pin styling rules — synced via businesses.map_pin_config.
// Icon is one of the curated lucide names — see shared/lib/mapPinPresets.
export type MapPinIcon = string;

export interface MapPinRule {
  field_key?: string;     // per-rule field (each rule can target a different column)
  // See mobile/lib/auth/store.ts for full operator semantics.
  operator?: 'equals' | 'not_equals' | 'has_value' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;
  color: string;
  icon: MapPinIcon;
  icon_color?: string;
  hide?: boolean;
}

export interface MapPinLayerConfig {
  default_color: string;
  default_icon: MapPinIcon;
  default_icon_color?: string;
  field_key: string | null; // legacy — only used when rule.field_key is missing
  rules: MapPinRule[];
}

export interface MapPinConfig {
  clients?: MapPinLayerConfig;
  jobs?: MapPinLayerConfig;
  employees?: MapPinLayerConfig;
  // Weather pin styling — alpha-gated. Only the businesses in
  // WEATHER_ALPHA_BUSINESS_IDS see this in the settings UI.
  weather?: MapPinLayerConfig;
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
        .select('id, name, logo_url, service_type, city, state, address, postal_code, email, phone, website, tax_id, license_number, invoice_notes_default, invoice_due_days, invoice_field_required, invoice_field_order, invoice_template, client_field_required, client_field_order, employee_field_required, employee_field_order, job_field_required, job_field_order, job_pipeline_disabled, job_crew_mode, job_alert_thresholds, assignment_field_required, assignment_field_order, map_pin_config, map_view_settings, weather_config, operating_hours, dashboard_layout')
        // Deterministic order: the fallback "first business" must be the
        // same on web and mobile, or per-business state (e.g. the Google
        // connection) looks inconsistent across devices.
        .order('created_at', { ascending: true }),
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

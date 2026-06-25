import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  setActiveRolePermissions,
  mergeRolePermissions,
  permissionsForRole,
  type Role,
  type RolePermissions,
} from '@amixos/shared/lib/permissions';
import { displayNameFromUser } from '@amixos/shared/lib/userName';
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
  /** Display name from auth metadata (email local-part fallback). */
  name: string;
}

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
  // Starting invoice number for the sequential generator (migration 079).
  invoice_start_number: number;
  invoice_field_required: Record<string, boolean>;
  invoice_field_order: string[] | null;
  invoice_field_hidden: Record<string, boolean> | null;
  invoice_field_layout: { key: string; section: string }[] | null;
  // Default invoice template config (JSONB). See shared/src/lib/invoiceTemplate.
  invoice_template: Record<string, unknown> | null;
  client_field_required: Record<string, boolean>;
  client_field_order: string[] | null;
  client_field_hidden: Record<string, boolean> | null;
  client_field_layout: { key: string; section: string }[] | null;
  employee_field_required: Record<string, boolean>;
  employee_field_order: string[] | null;
  employee_field_hidden: Record<string, boolean> | null;
  employee_field_layout: { key: string; section: string }[] | null;
  job_field_required: Record<string, boolean>;
  job_field_order: string[] | null;
  job_pipeline_disabled: Record<string, boolean>;
  job_crew_mode: boolean;
  job_item_types_enabled: boolean;
  job_field_hidden: Record<string, boolean> | null;
  job_field_layout: { key: string; section: string }[] | null;
  payroll_frequency: string | null;
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
  // Per-business subscription (Stripe billing, migration 099).
  plan: string | null;
  subscription_status: string | null;
  billing_period: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

// Map view prefs — synced via businesses.map_view_settings (migration 039).
// mapType is loosely typed: mobile uses 'standard', web uses 'roadmap', and
// the same JSONB is shared, so each platform normalizes on read.
export interface MapViewSettings {
  mapType: string;
  clustering: boolean;
  pinSize: 'small' | 'medium' | 'large';
  // Outreach-mode window (days) — optional for back-compat with rows saved
  // before the feature shipped; readers default to 1.
  outreachDays?: number;
}

// ─── Map pin config (synced via businesses.map_pin_config) ─────────────
// Icon is one of the curated lucide names — see shared/lib/mapPinPresets.
// Stored as a string in jsonb so adding/removing icons doesn't require a
// schema change.
export type MapPinIcon = string;

export interface MapPinRule {
  // Per-rule field. Each rule can target a different field — e.g.
  // rule 1 colors by "Marca de Pivot", rule 2 by "Last Name", rule 3 by
  // "Tipo de Cliente". Optional only for back-compat with old rows that
  // shared a single layer-level field_key.
  field_key?: string;
  // Comparison operator. Default 'equals'.
  //   equals      — case-insensitive exact match
  //   not_equals  — case-sensitive (Supabase neq) — exact mismatch
  //   has_value   — field has any non-empty value (`value` ignored)
  //   contains    — case-insensitive substring match
  //   gt, gte, lt, lte — numeric if both sides parse as numbers, else
  //                     lexical string compare (case-insensitive)
  operator?: 'equals' | 'not_equals' | 'has_value' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;          // ignored when operator='has_value'
  color: string;          // pin (teardrop) hex color
  icon: MapPinIcon;
  // Icon foreground color (the lucide glyph inside the pin). Defaults
  // to white when unset — usually best contrast against most pin colors.
  // Override for cases where white-on-color reads poorly (e.g. yellow pin).
  icon_color?: string;
  // When true, matched rows are hidden from the map (color/icon ignored).
  hide?: boolean;
}

export interface MapPinLayerConfig {
  default_color: string;
  default_icon: MapPinIcon;
  // Icon foreground for the layer's default style. Defaults to white
  // when unset.
  default_icon_color?: string;
  // Legacy single-field selector. Pre-existing rows still use this as the
  // implicit field_key for every rule. New rules set their own field_key
  // and this stays null.
  field_key: string | null;
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
  // Per-business customized role permissions (business_roles) for the active
  // business, and the effective grid for the current user. Loaded alongside
  // the business; registered with permissions.ts so can.* is override-aware.
  roleOverrides: Partial<Record<Role, RolePermissions>>;
  permissions: RolePermissions | null;
  businessLoaded: boolean;
  // True when the business fetch FAILED (e.g. a not-yet-run migration left a
  // column the query references missing). Distinct from "loaded 0 businesses"
  // so the route gate can show a retry screen instead of dumping an existing
  // user into onboarding (which looks like their account was wiped).
  businessLoadError: boolean;
  status: AuthStatus;
  error: string | null;

  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetchBusiness: () => Promise<void>;
  // Switch the active workspace. Re-derives `business` and writes the new
  // id to persistence so it survives reloads.
  setActiveBusiness: (businessId: string) => void;

  // Load the active business's customized roles and register them so can.* is
  // override-aware. Null businessId clears to defaults.
  _loadRolePermissions: (businessId: string | null) => Promise<void>;
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
      roleOverrides: {},
      permissions: null,
      businessLoaded: false,
      businessLoadError: false,
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
          setActiveRolePermissions(null);
          set({ businesses: [], business: null, businessLoaded: true, activeBusinessId: null, roles: {}, currentRole: null, roleOverrides: {}, permissions: null });
          return;
        }
        try {
          // Fetch all businesses the user is a member of (RLS lets the join
          // through because the user is in business_members for each). The
          // member row also gives us this user's role per business.
          const [bizRes, memberRes] = await Promise.all([
            supabase
              .from('businesses')
              .select('id, name, logo_url, service_type, city, state, address, postal_code, email, phone, website, tax_id, license_number, invoice_notes_default, invoice_due_days, invoice_start_number, invoice_field_required, invoice_field_order, invoice_field_hidden, invoice_field_layout, invoice_template, client_field_required, client_field_order, client_field_hidden, client_field_layout, employee_field_required, employee_field_order, employee_field_hidden, employee_field_layout, job_field_required, job_field_order, job_pipeline_disabled, job_crew_mode, job_item_types_enabled, job_field_hidden, job_field_layout, payroll_frequency, job_alert_thresholds, assignment_field_required, assignment_field_order, map_pin_config, map_view_settings, weather_config, operating_hours, dashboard_layout, plan, subscription_status, billing_period, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id')
              // Deterministic order: the fallback "first business" must be
              // the same on web and mobile, or per-business state (e.g. the
              // Google connection) looks inconsistent across devices.
              .order('created_at', { ascending: true }),
            supabase
              .from('business_members')
              .select('business_id, role')
              .eq('user_id', u.id),
          ]);
          // A failed query (e.g. a column from a not-yet-run migration) is NOT
          // the same as "this user has no businesses". Flag the error and keep
          // the previous businesses; the gate shows a retry screen instead of
          // routing an existing user into onboarding.
          if (bizRes.error || memberRes.error) {
            // Offline (or transient) with a cached business list → keep showing
            // it instead of bouncing to the error screen. Only error out when we
            // have nothing cached to fall back on.
            if (get().businesses.length > 0) {
              set({ businessLoaded: true, businessLoadError: false });
              return;
            }
            set({ businessLoaded: true, businessLoadError: true });
            return;
          }
          const { data: bizRows } = bizRes;
          const { data: memberRows } = memberRes;
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
            businessLoadError: false,
          });
          // Load this business's customized role permissions (override-aware
          // can.*). Non-blocking for the rest of the dashboard.
          void get()._loadRolePermissions(activeId);
        } catch {
          // Network/transport failure (offline). Keep the cached businesses so
          // the dashboard stays usable; only show the retry screen when there's
          // nothing cached.
          if (get().businesses.length > 0) {
            set({ businessLoaded: true, businessLoadError: false });
          } else {
            set({ businessLoaded: true, businessLoadError: true });
          }
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
        void get()._loadRolePermissions(businessId);
      },

      _loadRolePermissions: async (businessId) => {
        if (!businessId) {
          setActiveRolePermissions(null);
          const role = get().currentRole;
          set({ roleOverrides: {}, permissions: role ? permissionsForRole(role) : null });
          return;
        }
        const { data } = await supabase
          .from('business_roles')
          .select('key, permissions')
          .eq('business_id', businessId);
        const map: Partial<Record<Role, RolePermissions>> = {};
        for (const row of (data ?? []) as Array<{ key: string; permissions: unknown }>) {
          map[row.key as Role] = mergeRolePermissions(row.key as Role, row.permissions);
        }
        setActiveRolePermissions(Object.keys(map).length ? map : null);
        const role = get().currentRole;
        set({
          roleOverrides: map,
          permissions: role ? map[role] ?? permissionsForRole(role) : null,
        });
      },

      _handleAuthEvent: async (event, session) => {
        switch (event) {
          case 'INITIAL_SESSION':
            if (session?.user) {
              set({
                user: { id: session.user.id, email: session.user.email ?? '', name: displayNameFromUser(session.user) },
                status: 'authenticated',
                businessLoaded: false,
                businessLoadError: false,
              });
              void get().refetchBusiness();
            } else {
              set({ user: null, business: null, businessLoaded: true, status: 'logged_out' });
            }
            break;
          case 'SIGNED_IN':
            if (session?.user) {
              set({
                user: { id: session.user.id, email: session.user.email ?? '', name: displayNameFromUser(session.user) },
                status: 'authenticated',
                error: null,
                businessLoaded: false,
                businessLoadError: false,
              });
              void get().refetchBusiness();
            }
            break;
          case 'SIGNED_OUT':
            setActiveRolePermissions(null);
            set({ user: null, business: null, businessLoaded: false, status: 'logged_out', error: null, roleOverrides: {}, permissions: null, roles: {}, currentRole: null });
            break;
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            if (session?.user) {
              set({ user: { id: session.user.id, email: session.user.email ?? '', name: displayNameFromUser(session.user) } });
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
      // Persist the user profile + the businesses/roles list so the dashboard
      // can render OFFLINE on a cold start (a field crew force-quits the app and
      // reopens it with no signal). We never persist `status`/`businessLoaded` —
      // auth status must come from a live session check each launch (persisting
      // it causes "logged in" flashes when the session is actually expired).
      partialize: (state) => ({
        user: state.user,
        activeBusinessId: state.activeBusinessId,
        businesses: state.businesses,
        roles: state.roles,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-derive the active business + role from the persisted list so the
          // dashboard is reachable offline before any network refetch runs.
          const list = state.businesses ?? [];
          const activeId =
            state.activeBusinessId && list.some((b) => b.id === state.activeBusinessId)
              ? state.activeBusinessId
              : list[0]?.id ?? null;
          state.activeBusinessId = activeId;
          state.business = list.find((b) => b.id === activeId) ?? null;
          state.currentRole = activeId ? state.roles?.[activeId] ?? null : null;
          // Having a cached business means the gate can show the dashboard
          // immediately; the background refetch still runs on INITIAL_SESSION.
          if (state.business) state.businessLoaded = true;
        }
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
  const permissions = useAuthStore((s) => s.permissions);
  const roleOverrides = useAuthStore((s) => s.roleOverrides);
  const status = useAuthStore((s) => s.status);
  const refetchBusiness = useAuthStore((s) => s.refetchBusiness);
  const loadRolePermissions = useAuthStore((s) => s._loadRolePermissions);
  const logout = useAuthStore((s) => s.logout);

  const loading = status === 'unknown' || status === 'loading';

  return {
    user,
    business,
    businesses,
    activeBusinessId,
    setActiveBusiness,
    currentRole,
    permissions,
    roleOverrides,
    loading,
    refetchBusiness,
    reloadPermissions: () => loadRolePermissions(useAuthStore.getState().activeBusinessId),
    signOut: logout,
  };
}

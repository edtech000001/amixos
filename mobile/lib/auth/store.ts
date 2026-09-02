import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  setActiveRolePermissions,
  setActiveCustomRoles,
  mergeRolePermissions,
  permissionsForRole,
  can,
  type Role,
  type RolePermissions,
} from '@amixos/shared/lib/permissions';
import { displayNameFromUser } from '@amixos/shared/lib/userName';
import { fetchLocations, fetchMyHomeLocation, type Location } from '@amixos/shared/lib/locations';
import { purgeSwrCache } from '@amixos/shared/lib/swrCache';
import {
  subscribeImpersonation,
  getImpersonation,
  startImpersonation as startImp,
  stopImpersonation as stopImp,
  requestImpersonationWithRetry,
  notifyStopImpersonation,
  type ImpersonationTarget,
} from '@amixos/shared/lib/impersonation';
import { createSupabaseClient } from '../supabase';
import { getApiBaseUrl, getJwt } from '../apiClient';
import { useSyncExternalStore } from 'react';

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
  invoice_tax_rate: number;
  invoice_qty_field: string | null;
  /** Ordered price-sheet section names (migration 215). */
  price_section_order: string[] | null;
  invoice_email_subject: string | null;
  invoice_email_body: string | null;
  /** How a sent invoice is delivered: 'pdf' (attach only, default), 'link', or 'both'. */
  invoice_email_delivery: string | null;
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
  crew_finder_enabled: boolean;
  job_private_on_invoice: boolean;
  job_field_hidden: Record<string, boolean> | null;
  job_field_layout: { key: string; section: string }[] | null;
  payroll_frequency: string | null;
  payroll_config: Record<string, unknown> | null;
  payroll_anchor_date: string | null;
  /** Days per period when payroll_frequency = 'custom' (migration 138). */
  payroll_custom_days: number | null;
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
  policy_agents: Record<string, { name?: string; email?: string }> | null;
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
  // Branches for the active business (empty = single-location mode, no picker).
  locations: Location[];
  // Active location filter for list views. Null = "All locations". Persisted
  // per business in activeLocationByBiz so each workspace restores its branch.
  activeLocationId: string | null;
  activeLocationByBiz: Record<string, string>;
  // The caller's OWN assigned (home/primary) branch, if any. Drives the default
  // branch on new records so data auto-files to where the user works.
  myHomeLocationId: string | null;
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
  // Set the active location filter (null = All). Persisted per business.
  setActiveLocation: (locationId: string | null) => void;
  // Load the active business's branches + restore its persisted active branch.
  _loadLocations: (businessId: string | null) => Promise<void>;

  // Load the active business's customized roles and register them so can.* is
  // override-aware. Null businessId clears to defaults.
  _loadRolePermissions: (businessId: string | null) => Promise<void>;
  _handleAuthEvent: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
  _setHydrated: () => void;
}

const supabase = createSupabaseClient();

// ─── Offline cold-start support ─────────────────────────────────────────────
// Access tokens live ~1 hour. Reopening the app OFFLINE with an expired token
// makes the refresh fail, Supabase reports "no session", and the user lands on
// a login screen they can't pass without signal — which defeats the whole
// offline cache. The pieces below let the launch flow distinguish "signed out"
// from "can't reach the server" and quietly restore the real session later.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/** ANY HTTP response (even an error status) proves the server is reachable —
 *  only a transport failure/timeout means offline. */
async function isSupabaseReachable(): Promise<boolean> {
  if (!SUPABASE_URL) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

// Retry loop while running on a cached identity: once the server is reachable,
// getSession() re-reads the stored refresh token and refreshes — success fires
// TOKEN_REFRESHED (back to a live session), a genuinely revoked token fires
// SIGNED_OUT (normal logout). Until then the app keeps working from cache.
let offlineRetry: ReturnType<typeof setInterval> | null = null;
function stopOfflineSessionRetry() {
  if (offlineRetry) { clearInterval(offlineRetry); offlineRetry = null; }
}
async function tryRestoreSession(): Promise<void> {
  if (!(await isSupabaseReachable())) return;
  const { data } = await supabase.auth.getSession();
  if (data.session || useAuthStore.getState().status !== 'authenticated') {
    stopOfflineSessionRetry();
  }
}
function startOfflineSessionRetry() {
  if (offlineRetry) return;
  offlineRetry = setInterval(() => { void tryRestoreSession(); }, 25000);
}

// INITIAL_SESSION can fire before zustand finishes rehydrating from
// AsyncStorage — the offline-hold decision needs the persisted user, so it
// awaits hydration (with a cap so a broken storage never hangs the launch).
let resolveHydration: (() => void) | null = null;
const hydrationDone = new Promise<void>((res) => { resolveHydration = res; });
function awaitHydration(): Promise<void> {
  return Promise.race([hydrationDone, new Promise<void>((res) => setTimeout(res, 3000))]);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      businesses: [],
      activeBusinessId: null,
      business: null,
      locations: [],
      activeLocationId: null,
      activeLocationByBiz: {},
      myHomeLocationId: null,
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
          setActiveCustomRoles(null);
          set({ businesses: [], business: null, businessLoaded: true, activeBusinessId: null, locations: [], activeLocationId: null, roles: {}, currentRole: null, roleOverrides: {}, permissions: null });
          return;
        }
        try {
          // Fetch all businesses the user is a member of (RLS lets the join
          // through because the user is in business_members for each). The
          // member row also gives us this user's role per business.
          const [bizRes, memberRes] = await Promise.all([
            supabase
              .from('businesses')
              .select('id, name, logo_url, service_type, city, state, address, postal_code, email, phone, website, tax_id, license_number, invoice_notes_default, invoice_due_days, invoice_start_number, invoice_tax_rate, invoice_qty_field, price_section_order, invoice_email_subject, invoice_email_body, invoice_email_delivery, invoice_field_required, invoice_field_order, invoice_field_hidden, invoice_field_layout, invoice_template, client_field_required, client_field_order, client_field_hidden, client_field_layout, employee_field_required, employee_field_order, employee_field_hidden, employee_field_layout, job_field_required, job_field_order, job_pipeline_disabled, job_crew_mode, job_item_types_enabled, crew_finder_enabled, job_private_on_invoice, job_field_hidden, job_field_layout, payroll_frequency, payroll_anchor_date, payroll_custom_days, payroll_config, job_alert_thresholds, assignment_field_required, assignment_field_order, map_pin_config, map_view_settings, weather_config, operating_hours, policy_agents, dashboard_layout, plan, subscription_status, billing_period, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id')
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
          void get()._loadLocations(activeId);
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
        void get()._loadLocations(businessId);
      },

      setActiveLocation: (locationId) => {
        const bizId = get().activeBusinessId;
        const map = { ...get().activeLocationByBiz };
        // Persist the explicit choice ('__all__' so "All" sticks instead of
        // re-defaulting to the home branch on the next load).
        if (bizId) map[bizId] = locationId ?? '__all__';
        set({ activeLocationId: locationId, activeLocationByBiz: map });
      },

      // A saved choice wins (including '__all__' = explicit All). With no saved
      // choice everyone — owners included — defaults to their own assigned home
      // branch when they have one (owners with none fall back to All). The home
      // branch is also exposed as myHomeLocationId so new records auto-file to it.
      _loadLocations: async (businessId) => {
        if (!businessId) {
          set({ locations: [], activeLocationId: null, myHomeLocationId: null });
          return;
        }
        try {
          const rows = await fetchLocations(supabase, businessId);
          // Under "Ver como", resolve the TARGET member's home branch and role —
          // queries already run under their JWT, so their employee row is the
          // one visible; the admin's saved branch choice doesn't apply.
          const imp = getImpersonation();
          const uid = imp?.target.userId ?? get().user?.id;
          const home = rows.length >= 2 && uid
            ? await fetchMyHomeLocation(supabase, businessId, uid)
            : null;
          const validHome = home && rows.some((l) => l.id === home) ? home : null;
          const saved = imp ? undefined : get().activeLocationByBiz[businessId];
          const roleForLock = imp ? imp.target.role : get().currentRole;
          const locked = rows.length >= 2 && !can.switchLocations(roleForLock);
          let active: string | null;
          if (saved !== undefined) {
            active = saved === '__all__' ? null : (rows.some((l) => l.id === saved) ? saved : null);
          } else if (rows.length < 2) {
            active = null;
          } else {
            // Unlocked roles (owner/admin/manager…) start on "All locations" —
            // untagged records only appear there, so defaulting to a home
            // branch made lists look incomplete. Locked roles pin to home.
            active = locked ? validHome : null;
          }
          // Enforce the per-role location lock: a role without switchLocations is
          // pinned to its own home branch (RLS enforces the same on reads).
          if (locked) {
            active = validHome;
          }
          set({ locations: rows, activeLocationId: active, myHomeLocationId: validHome });
        } catch {
          // Offline / transient — keep whatever was cached.
          set({ activeLocationId: get().activeLocationId });
        }
      },

      _loadRolePermissions: async (businessId) => {
        if (!businessId) {
          setActiveRolePermissions(null);
          setActiveCustomRoles(null);
          const role = get().currentRole;
          set({ roleOverrides: {}, permissions: role ? permissionsForRole(role) : null });
          return;
        }
        const { data } = await supabase
          .from('business_roles')
          .select('key, name, is_system, permissions')
          .eq('business_id', businessId);
        const rows = (data ?? []) as Array<{ key: string; name: string | null; is_system: boolean; permissions: unknown }>;
        const map: Partial<Record<Role, RolePermissions>> = {};
        for (const row of rows) {
          map[row.key as Role] = mergeRolePermissions(row.key as Role, row.permissions);
        }
        setActiveRolePermissions(Object.keys(map).length ? map : null);
        // Custom roles (is_system=false): register keys + display names for
        // pickers and labels.
        setActiveCustomRoles(
          rows.filter((r) => r.is_system === false).map((r) => ({ key: r.key, name: r.name ?? r.key })),
        );
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
              // No session at launch. An expired token that can't refresh
              // OFFLINE lands here too — that must not bounce a field worker
              // to a login screen they can't pass without signal. With a
              // persisted identity and an unreachable server, stay on the
              // cached data; the retry loop restores the real session when
              // the network returns (or signs out if it was truly revoked).
              await awaitHydration();
              const cachedUser = get().user;
              if (cachedUser && !(await isSupabaseReachable())) {
                set({
                  status: 'authenticated',
                  businessLoaded: true,
                  businessLoadError: get().businesses.length === 0,
                });
                startOfflineSessionRetry();
                break;
              }
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
            stopImp();
            setActiveRolePermissions(null);
            setActiveCustomRoles(null);
            // Wipe cached lists/dashboards so the next sign-in on this device
            // can never hydrate another account's data.
            void purgeSwrCache();
            set({ user: null, business: null, businessLoaded: false, status: 'logged_out', error: null, roleOverrides: {}, permissions: null, roles: {}, currentRole: null, locations: [], activeLocationId: null });
            break;
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            if (session?.user) {
              set({ user: { id: session.user.id, email: session.user.email ?? '', name: displayNameFromUser(session.user) } });
              // Coming back from an offline cold start with nothing cached —
              // now that the session is live again, load the real data.
              if (get().businessLoadError || !get().businessLoaded) void get().refetchBusiness();
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
        activeLocationByBiz: state.activeLocationByBiz,
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
          // Restore the persisted branch for this workspace ('__all__' = All;
          // validated against the live list once _loadLocations runs).
          const savedLoc = activeId ? state.activeLocationByBiz?.[activeId] : undefined;
          state.activeLocationId = savedLoc && savedLoc !== '__all__' ? savedLoc : null;
          // Having a cached business means the gate can show the dashboard
          // immediately; the background refetch still runs on INITIAL_SESSION.
          if (state.business) state.businessLoaded = true;
        }
        resolveHydration?.();
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

// Foreground nudge: while running on a cached identity (offline cold start),
// probe as soon as the app becomes active so the session restores the moment
// there's signal again, instead of waiting for the next interval tick.
AppState.addEventListener('change', (st) => {
  if (st === 'active' && offlineRetry) void tryRestoreSession();
});

// Re-resolve branches when "Ver como" starts/stops: the active + home branch
// must reflect the impersonated member (their JWT is now on data requests),
// and revert to the admin's own on exit.
subscribeImpersonation(() => {
  const bid = useAuthStore.getState().activeBusinessId;
  if (bid) void useAuthStore.getState()._loadLocations(bid);
});

// Safety net: if INITIAL_SESSION never fires (network hung, AsyncStorage
// corruption, etc.), fall back to logged_out so the user isn't stuck on a
// spinner forever.
setTimeout(() => {
  void (async () => {
    const st = useAuthStore.getState();
    if (st.status !== 'unknown' && st.status !== 'loading') return;
    if (st.user && !(await isSupabaseReachable())) {
      useAuthStore.setState({
        status: 'authenticated',
        businessLoaded: true,
        businessLoadError: st.businesses.length === 0,
      });
      startOfflineSessionRetry();
      return;
    }
    useAuthStore.setState({ status: 'logged_out' });
  })();
}, 15000);

// Backwards-compat hook for existing dashboard consumers reading `useApp()`.
// Uses individual selectors to avoid the object-selector rerender storm.
// ─── "Ver como" actions (login-as-member) ──────────────────────────────────
// Module-level so they can be called from useApp() without recreating each
// render. Mirror the web AppContext implementation exactly.
async function startImpersonationAction(targetUserId: string): Promise<void> {
  const businessId = useAuthStore.getState().activeBusinessId;
  if (!businessId) throw new Error('no_business');
  // Retry once through a forced session refresh — right after leaving a
  // previous "Ver como" the admin's token can be mid-rotation, which used to
  // fail the mint with a spurious "no se pudo iniciar" error.
  const grant = await requestImpersonationWithRetry({
    apiBaseUrl: getApiBaseUrl(),
    businessId,
    targetUserId,
    getJwt,
    refreshSession: () => supabase.auth.refreshSession(),
  });
  startImp({ token: grant.token, businessId, target: grant.target, expiresAt: grant.expiresAt });
}

async function stopImpersonationAction(): Promise<void> {
  const cur = getImpersonation();
  stopImp();
  if (cur) {
    try {
      const jwt = await getJwt();
      await notifyStopImpersonation({
        apiBaseUrl: getApiBaseUrl(),
        jwt,
        businessId: cur.businessId,
        targetUserId: cur.target.userId,
      });
    } catch {
      /* audit-only */
    }
  }
}

export function useApp() {
  const realUser = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const businesses = useAuthStore((s) => s.businesses);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const setActiveBusiness = useAuthStore((s) => s.setActiveBusiness);
  const locations = useAuthStore((s) => s.locations);
  const activeLocationId = useAuthStore((s) => s.activeLocationId);
  const myHomeLocationId = useAuthStore((s) => s.myHomeLocationId);
  const setActiveLocation = useAuthStore((s) => s.setActiveLocation);
  const baseRole = useAuthStore((s) => s.currentRole);
  const basePermissions = useAuthStore((s) => s.permissions);
  const roleOverrides = useAuthStore((s) => s.roleOverrides);
  const status = useAuthStore((s) => s.status);
  const refetchBusiness = useAuthStore((s) => s.refetchBusiness);
  const loadRolePermissions = useAuthStore((s) => s._loadRolePermissions);
  const logout = useAuthStore((s) => s.logout);

  // Active "Ver como" session. When set, identity-derived values reflect the
  // target member so the whole app renders as them; data RLS is handled by the
  // fetch wrapper in lib/supabase. See web AppContext for the rationale.
  const impersonation = useSyncExternalStore(subscribeImpersonation, getImpersonation, () => null);

  const currentRole = impersonation ? impersonation.target.role : baseRole;
  const user = impersonation
    ? {
        id: impersonation.target.userId,
        email: impersonation.target.email ?? '',
        name: impersonation.target.name ?? impersonation.target.email ?? '',
      }
    : realUser;
  const permissions = impersonation
    ? roleOverrides[impersonation.target.role] ?? permissionsForRole(impersonation.target.role)
    : basePermissions;

  const loading = status === 'unknown' || status === 'loading';

  return {
    user,
    business,
    businesses,
    activeBusinessId,
    setActiveBusiness,
    locations,
    activeLocationId,
    myHomeLocationId,
    setActiveLocation,
    refetchLocations: () => useAuthStore.getState()._loadLocations(useAuthStore.getState().activeBusinessId),
    currentRole,
    permissions,
    roleOverrides,
    loading,
    impersonating: (impersonation?.target ?? null) as ImpersonationTarget | null,
    readOnly: !!impersonation,
    startImpersonation: startImpersonationAction,
    stopImpersonation: stopImpersonationAction,
    refetchBusiness,
    reloadPermissions: () => loadRolePermissions(useAuthStore.getState().activeBusinessId),
    signOut: logout,
  };
}

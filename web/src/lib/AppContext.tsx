'use client';

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { withTimeout, recoverFromWedgedAuth } from '@/lib/authRecovery';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import {
  setActiveRolePermissions,
  setActiveCustomRoles,
  mergeRolePermissions,
  permissionsForRole,
  can,
  orderBusinessesForUser,
  type Role,
  type RolePermissions,
} from '@amixos/shared/lib/permissions';
import {
  subscribeImpersonation,
  getImpersonation,
  startImpersonation as startImp,
  stopImpersonation as stopImp,
  requestImpersonationWithRetry,
  notifyStopImpersonation,
  type ImpersonationTarget,
} from '@amixos/shared/lib/impersonation';
import { displayNameFromUser } from '@amixos/shared/lib/userName';
import { fetchLocations, fetchMyHomeLocation, type Location } from '@amixos/shared/lib/locations';
import { purgeSwrCache } from '@amixos/shared/lib/swrCache';
import { BUSINESS_FULL_COLUMNS, BUSINESS_LIGHT_COLUMNS, isFullBusiness, keepUnchanged } from '@amixos/shared/lib/businessColumns';
import { clearPersistedSearches } from '@amixos/shared/lib/usePersistedSearch';

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
  // Price-sheet generator style/order config (JSONB). See priceSheetTemplate.
  price_sheet_template: Record<string, unknown> | null;
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
  /** Display name from auth metadata (email local-part fallback). */
  name: string;
}

interface AppContextValue {
  user: AppUser | null;
  /** Apply a new switcher order locally (migration 217). */
  reorderBusinesses: (orderedIds: string[]) => void;
  businesses: Business[];
  business: Business | null;
  activeBusinessId: string | null;
  // Branches for the active business (empty = single-location mode, no picker).
  locations: Location[];
  // Active location filter for list views. Null = "All locations" (also the
  // value when a business has 0/1 locations). Reports always span all branches.
  activeLocationId: string | null;
  // The caller's OWN assigned (home/primary) branch, if any. Drives the default
  // branch on new records so data auto-files to where the user works.
  myHomeLocationId: string | null;
  setActiveLocation: (locationId: string | null) => void;
  // Reload the active business's branches (call after add/rename/archive).
  refetchLocations: () => Promise<void>;
  roles: Record<string, Role>;
  currentRole: Role | null;
  // Effective permission grid for the current user in the active business
  // (built-in default merged with any business_roles override). Null until a
  // role is known. UI gates read can.* (override-aware); this is for the role
  // editor + anything that wants the structured matrix directly.
  permissions: RolePermissions | null;
  // Per-role overrides for the active business (only customized roles present).
  // The role editor reads this; falls back to DEFAULT_ROLE_PERMISSIONS.
  roleOverrides: Partial<Record<Role, RolePermissions>>;
  loading: boolean;
  // "Ver como" (login-as-member). When set, `user`, `currentRole` and
  // `permissions` above reflect the impersonated member (not the admin), and
  // all data queries are RLS-filtered as that member. Null when not active.
  impersonating: ImpersonationTarget | null;
  // True while impersonating — the session is view-only (writes are blocked at
  // the transport layer; surfaces should also disable write controls).
  readOnly: boolean;
  startImpersonation: (targetUserId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  refetchBusiness: () => Promise<void>;
  reloadPermissions: () => Promise<void>;
  setActiveBusiness: (businessId: string) => void;
}

const AppContext = createContext<AppContextValue>({
  user: null,
  reorderBusinesses: () => {},
  businesses: [],
  business: null,
  activeBusinessId: null,
  locations: [],
  activeLocationId: null,
  myHomeLocationId: null,
  setActiveLocation: () => {},
  refetchLocations: async () => {},
  roles: {},
  currentRole: null,
  permissions: null,
  roleOverrides: {},
  loading: true,
  impersonating: null,
  readOnly: false,
  startImpersonation: async () => {},
  stopImpersonation: async () => {},
  refetchBusiness: async () => {},
  reloadPermissions: async () => {},
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

// Active location persists per business: keyed map so switching businesses
// restores the branch you last looked at in each.
const ACTIVE_LOC_COOKIE = 'amixos-active-location';
function readActiveLocCookie(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const m = document.cookie.match(/(?:^|; )amixos-active-location=([^;]+)/);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as Record<string, string>;
  } catch {
    return {};
  }
}
function writeActiveLocCookie(map: Record<string, string>) {
  if (typeof document === 'undefined') return;
  document.cookie = `${ACTIVE_LOC_COOKIE}=${encodeURIComponent(JSON.stringify(map))}; path=/; max-age=31536000; samesite=lax`;
}

// Start-up snapshot: the last session's businesses (active one in full, the
// rest light), roles and active id, per user. Restored right after the
// session check so screens start loading at once instead of waiting for the
// businesses round trip; the live fetch then refreshes it. The `amixos_cache_`
// prefix means purgeSwrCache() (sign-out) wipes it with the other caches.
type StartupSnapshot = { businesses: Business[]; roles: Record<string, Role>; activeId: string | null };
const SNAP_PREFIX = 'amixos_cache_appctx_';
function readStartupSnapshot(userId: string): StartupSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAP_PREFIX + userId);
    const snap = raw ? (JSON.parse(raw) as StartupSnapshot) : null;
    return snap && Array.isArray(snap.businesses) && snap.businesses.length ? snap : null;
  } catch {
    return null;
  }
}
function writeStartupSnapshot(userId: string, snap: StartupSnapshot) {
  try { window.localStorage.setItem(SNAP_PREFIX + userId, JSON.stringify(snap)); } catch { /* quota / private mode */ }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createSupabaseClient();
  // The admin's REAL authenticated identity. `user` exposed below may be the
  // impersonated member instead (see impersonation override).
  const [realUser, setRealUser] = useState<AppUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  /** Apply a new switcher order locally (migration 217). The membership rows
   *  are written separately; this stops the list snapping back mid-drag. */
  const reorderBusinesses = (orderedIds: string[]) => {
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    setBusinesses(prev => [...prev].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    ));
  };
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null);
  const [myHomeLocationId, setMyHomeLocationId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [roleOverrides, setRoleOverrides] = useState<Partial<Record<Role, RolePermissions>>>({});
  const [loading, setLoading] = useState(true);

  // Active "Ver como" session (subscribed module-level store). Drives the
  // identity/role overrides below so the whole app renders as the member.
  const impersonation = useSyncExternalStore(subscribeImpersonation, getImpersonation, () => null);

  // Derived state — recomputed on every render, fine here since the maps are small.
  const business = businesses.find((b) => b.id === activeBusinessId) ?? null;
  // When impersonating, every identity-derived value reflects the target member
  // instead of the admin — so the dashboard switches to their view (FieldHome,
  // gated buttons, etc.) and identity-keyed queries (e.g. FieldHome's employee
  // lookup) resolve to them. Data RLS is handled separately by the fetch wrapper.
  const baseRole = activeBusinessId ? roles[activeBusinessId] ?? null : null;
  const currentRole = impersonation ? impersonation.target.role : baseRole;
  const user = impersonation
    ? {
        id: impersonation.target.userId,
        email: impersonation.target.email ?? '',
        name: impersonation.target.name ?? impersonation.target.email ?? '',
      }
    : realUser;
  const permissions = currentRole ? roleOverrides[currentRole] ?? permissionsForRole(currentRole) : null;

  // Load the active business's customized roles (business_roles) and register
  // them so can.* resolves against overrides. Empty = pure defaults. Exposed
  // as reloadPermissions so the role editor can refresh after a save.
  const reloadPermissions = useCallback(async () => {
    if (!activeBusinessId) {
      setActiveRolePermissions(null);
      setActiveCustomRoles(null);
      setRoleOverrides({});
      return;
    }
    const { data } = await supabase
      .from('business_roles')
      .select('key, name, is_system, permissions')
      .eq('business_id', activeBusinessId);
    const rows = (data ?? []) as Array<{ key: string; name: string | null; is_system: boolean; permissions: unknown }>;
    const map: Partial<Record<Role, RolePermissions>> = {};
    for (const row of rows) {
      map[row.key as Role] = mergeRolePermissions(row.key as Role, row.permissions);
    }
    // Register before state-set so the re-render reads up-to-date overrides.
    setActiveRolePermissions(Object.keys(map).length ? map : null);
    // Custom roles (is_system=false): keys + display names for pickers/labels.
    setActiveCustomRoles(
      rows.filter((r) => r.is_system === false).map((r) => ({ key: r.key, name: r.name ?? r.key })),
    );
    setRoleOverrides(map);
  }, [activeBusinessId]);

  useEffect(() => { void reloadPermissions(); }, [reloadPermissions]);

  // Load the active business's branches and pick the active one. A saved choice
  // wins (including an explicit "All" = the '__all__' sentinel). With no saved
  // choice we DEFAULT: owners see all branches; everyone else defaults to their
  // own home branch (still switchable via the picker).
  const loadLocations = useCallback(async () => {
    if (!activeBusinessId) {
      setLocations([]);
      setActiveLocationIdState(null);
      setMyHomeLocationId(null);
      return;
    }
    // The caller's OWN home branch — used to auto-select a branch on new records
    // and as the default active filter. Under "Ver como" resolve the TARGET
    // member's home instead (their JWT is on data requests), and ignore the
    // admin's saved branch choice. Started ALONGSIDE the branch list (it was
    // a second round trip after it); only used when there are 2+ branches.
    const uid = impersonation?.target.userId ?? realUser?.id;
    const homeP = uid
      ? fetchMyHomeLocation(supabase, activeBusinessId, uid).catch(() => null)
      : Promise.resolve(null);
    const rows = await fetchLocations(supabase, activeBusinessId);
    setLocations(rows);
    const home = rows.length >= 2 ? await homeP : null;
    const validHome = home && rows.some((l) => l.id === home) ? home : null;
    setMyHomeLocationId(validHome);
    const saved = impersonation ? undefined : readActiveLocCookie()[activeBusinessId];
    if (saved !== undefined) {
      if (saved === '__all__') { setActiveLocationIdState(null); return; }
      setActiveLocationIdState(rows.some((l) => l.id === saved) ? saved : null);
      return;
    }
    if (rows.length < 2) { setActiveLocationIdState(null); return; }
    // Default to "All locations" — untagged records only appear there, so a
    // home-branch default made lists look incomplete for management roles.
    // Branch-LOCKED roles are pinned to their home branch by the lock effect
    // below (which re-runs once role overrides load).
    setActiveLocationIdState(null);
  }, [activeBusinessId, realUser?.id, impersonation]);

  useEffect(() => { void loadLocations(); }, [loadLocations]);

  // Enforce the per-role location lock: a role without the switchLocations
  // capability is pinned to its own home branch and can't view "All"/other
  // branches. RLS enforces the same on reads; this keeps the UI consistent.
  // Uses setActiveLocationIdState (not setActiveLocation) so the forced value
  // isn't persisted as an explicit choice. Re-runs when overrides load so a
  // lock configured in the role editor takes effect without a reload.
  useEffect(() => {
    if (locations.length < 2 || can.switchLocations(currentRole)) return;
    if (activeLocationId !== myHomeLocationId) setActiveLocationIdState(myHomeLocationId);
  }, [locations, currentRole, roleOverrides, myHomeLocationId, activeLocationId]);

  const setActiveLocation = useCallback((locationId: string | null) => {
    setActiveLocationIdState(locationId);
    if (!activeBusinessId) return;
    const map = readActiveLocCookie();
    // Persist the explicit choice — '__all__' so "All" sticks instead of
    // re-defaulting to the home branch on the next load.
    map[activeBusinessId] = locationId ?? '__all__';
    writeActiveLocCookie(map);
  }, [activeBusinessId]);

  const fetchBusinesses = async (currentUserId: string) => {
    // The active business (saved cookie) loads in FULL alongside the LIGHT
    // list of every business — the other businesses only ever need id, name,
    // city, state and subscription fields (businessColumns.ts).
    const cookieId = readActiveCookie();
    const [{ data: bizRows }, { data: memberRows }, fullRes] = await Promise.all([
      supabase
        .from('businesses')
        .select(BUSINESS_LIGHT_COLUMNS)
        // Deterministic order: the fallback "first business" must be the
        // same on web and mobile, or per-business state (e.g. the Google
        // connection) looks inconsistent across devices.
        .order('created_at', { ascending: true }),
      supabase
        .from('business_members')
        .select('business_id, role, sort_order')
        .eq('user_id', currentUserId),
      cookieId
        ? supabase.from('businesses').select(BUSINESS_FULL_COLUMNS).eq('id', cookieId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const roleMap: Record<string, Role> = {};
    const orderMap: Record<string, number | null> = {};
    for (const m of ((memberRows ?? []) as Array<{ business_id: string; role: string; sort_order: number | null }>)) {
      roleMap[m.business_id] = m.role as Role;
      orderMap[m.business_id] = m.sort_order;
    }
    // The query orders by created_at; this applies the user's own order on top
    // (migration 217), leaving created_at as the tiebreak.
    const list = orderBusinessesForUser((bizRows as Business[] | null) ?? [], orderMap);
    const nextActive =
      cookieId && list.some((b) => b.id === cookieId) ? cookieId : list[0]?.id ?? null;
    // No (valid) saved business → the full row wasn't prefetched; get it now.
    let full = (fullRes.data as Business | null)?.id === nextActive ? (fullRes.data as Business) : null;
    if (nextActive && !full) {
      const { data } = await supabase.from('businesses').select(BUSINESS_FULL_COLUMNS).eq('id', nextActive).maybeSingle();
      full = (data as Business | null) ?? null;
    }
    const merged = list.map((b) => (full && b.id === full.id ? full : b));
    // Unchanged rows keep their object (the snapshot already painted them),
    // so screens keyed on `business` don't reload a second time.
    setBusinesses((prev) => keepUnchanged(prev, merged));
    setRoles((prev) => (JSON.stringify(prev) === JSON.stringify(roleMap) ? prev : roleMap));
    setActiveBusinessIdState(nextActive);
    if (nextActive !== cookieId) writeActiveCookie(nextActive);
    // (The start-up snapshot is saved by the effect below.)
  };

  const refetchBusiness = async () => {
    // Always refetch the admin's own businesses/roles, even while impersonating.
    if (realUser) await fetchBusinesses(realUser.id);
  };

  // ─── "Ver como" actions ────────────────────────────────────────────────
  // Mint a token for a member and enter their view. The fetch wrapper + the
  // identity overrides above do the rest. Throws the server code on failure.
  const startImpersonation = useCallback(async (targetUserId: string) => {
    if (!activeBusinessId) throw new Error('no_business');
    // Retry once through a forced session refresh — right after leaving a
    // previous "Ver como" the admin's token can be mid-rotation, which used to
    // fail the mint with a spurious "no se pudo iniciar" error.
    const grant = await requestImpersonationWithRetry({
      apiBaseUrl: getApiBaseUrl(),
      businessId: activeBusinessId,
      targetUserId,
      getJwt,
      refreshSession: () => supabase.auth.refreshSession(),
    });
    startImp({
      token: grant.token,
      businessId: activeBusinessId,
      target: grant.target,
      expiresAt: grant.expiresAt,
    });
  }, [activeBusinessId]);

  const stopImpersonation = useCallback(async () => {
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
  }, []);

  const setActiveBusiness = (id: string) => {
    const target = businesses.find((b) => b.id === id);
    if (!target) return;
    // Saved search terms belong to the business they were typed in. Keeping
    // them across a switch left search boxes populated over unfiltered lists.
    void clearPersistedSearches();
    writeActiveCookie(id);
    if (isFullBusiness(target)) { setActiveBusinessIdState(id); return; }
    // The list only holds LIGHT rows for other businesses — load the full
    // settings before switching so screens never see a half-loaded business.
    void supabase.from('businesses').select(BUSINESS_FULL_COLUMNS).eq('id', id).maybeSingle()
      .then(({ data }: { data: Business | null }) => {
        if (data) setBusinesses((prev) => prev.map((b) => (b.id === id ? data : b)));
        setActiveBusinessIdState(id);
      });
  };

  // Keep the start-up snapshot current — after the live fetch AND after a
  // business switch (whose full row was just loaded), so the next reload
  // paints the business the user actually left on. Never while impersonating
  // (the snapshot is the admin's own view).
  useEffect(() => {
    if (!realUser || impersonation || !businesses.length || !activeBusinessId) return;
    writeStartupSnapshot(realUser.id, { businesses, roles, activeId: activeBusinessId });
  }, [realUser, impersonation, businesses, roles, activeBusinessId]);

  useEffect(() => {
    const init = async () => {
      try {
        // Ceiling on getSession(). Chunked auth cookies can end up
        // inconsistent (an orphaned .1 from a longer previous session, or an
        // apex/www split), and the auth client then hangs while initializing.
        // Without a timeout this await never settles, setLoading(false) below
        // never runs, and the dashboard renders skeletons forever — with no
        // way out but clearing site data by hand.
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(), 8000, 'get_session',
        );
        if (session) {
          const u = { id: session.user.id, email: session.user.email ?? '', name: displayNameFromUser(session.user) };
          setRealUser(u);
          // Paint the last session's businesses at once so screens start
          // loading now; fetchBusinesses below refreshes them in place.
          const snap = readStartupSnapshot(u.id);
          if (snap) {
            // Only when the snapshot holds the SAVED business in full —
            // otherwise painting it would flash a different business before
            // the live fetch corrects it; then just wait for that fetch.
            const cookieId = readActiveCookie();
            const act = cookieId ?? snap.activeId;
            if (act && snap.businesses.some((b) => b.id === act && isFullBusiness(b))) {
              setBusinesses(snap.businesses);
              setRoles(snap.roles ?? {});
              setActiveBusinessIdState(act);
              setLoading(false);
            }
          }
          await fetchBusinesses(u.id);
        } else if (window.location.pathname.startsWith('/dashboard')) {
          window.location.href = '/auth/login';
          return;
        }
      } catch (err) {
        console.error('Auth init failed', err);
        // Clear the wedged cookies and restart at login. Self-healing is the
        // only option that works for the person affected: the state is
        // unrecoverable from inside the app, and "clear your cookies" is not
        // advice a landscaper is going to act on.
        if (recoverFromWedgedAuth()) return;
        // Already tried once in this tab — stop looping, drop the loading
        // state and let the UI show a signed-out app rather than a spinner.
      } finally {
        // In a finally so a thrown or timed-out session lookup still ends the
        // loading state. This was the actual bug: only the happy path cleared
        // it.
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          stopImp();
          setRealUser(null);
          setBusinesses([]);
          setLocations([]);
          setActiveLocationIdState(null);
          setRoles({});
          setRoleOverrides({});
          setActiveRolePermissions(null);
          setActiveCustomRoles(null);
          // Wipe cached lists/dashboards so the next sign-in on this device
          // can never hydrate another account's data.
          void purgeSwrCache();
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
        reorderBusinesses,
        businesses,
        business,
        activeBusinessId,
        locations,
        activeLocationId,
        myHomeLocationId,
        setActiveLocation,
        refetchLocations: loadLocations,
        roles,
        currentRole,
        permissions,
        roleOverrides,
        loading,
        impersonating: impersonation?.target ?? null,
        readOnly: !!impersonation,
        startImpersonation,
        stopImpersonation,
        refetchBusiness,
        reloadPermissions,
        setActiveBusiness,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

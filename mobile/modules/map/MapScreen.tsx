// Map module — mobile. Fullscreen MapView with three pin layers:
// clients, jobs, and "employees today" (derived from job_assignments).
// The user toggles which layers are visible via three pill buttons in
// the top bar. Tapping a pin opens a small callout with "Open record".
//
// Geocoding: clients without coords don't render. If any exist, a thin
// banner appears at the bottom inviting the user to backfill them via
// the API. One-tap → backfill → reload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, Modal as RNModal, Linking, TextInput, ScrollView } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Users, Briefcase, UserCircle2, X, Settings as SettingsIcon,
  Phone, MessageSquare, Mail, MapPin as MapPinIconLucide, Calendar,
  ArrowRight, Search as SearchIcon, CloudLightning, ExternalLink, Crosshair,
  LocateFixed, EyeOff, CircleCheckBig, History,
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { DateRangeSheet } from '@amixos/shared/ui';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import type { MapPinIcon } from '@amixos/shared/lib/mapPinPresets';
import { resolvePinStyle } from '@amixos/shared/lib/mapPinResolve';
import {
  isWeatherFeatureEnabled,
  groupWeatherAlertsBySameCode,
  haversineMiles,
  normalizeWeatherConfig,
} from '@amixos/shared/lib/weather';
import { expandStateQuery, haystackMatchesWithStates } from '@amixos/shared/lib/usStates';
import { buildDateRangePresets } from '@amixos/shared/lib/dateRangePresets';
import { PinBadge } from '@/lib/mapPinIcons';
import { createSupabaseClient } from '@/lib/supabase';
import { formatRelativeLong, type RelativeTimeLabels } from '@amixos/shared/lib/format';
import { useContactOutcomePrompt, type FireContactArgs } from '@/lib/useContactOutcomePrompt';
import {
  MapSettingsSheet,
  type DeviceMapSettings,
} from './MapSettingsSheet';

const DEFAULT_DEVICE_SETTINGS: DeviceMapSettings = {
  mapType: 'standard',
  clustering: true,
  pinSize: 'medium',
  outreachDays: 1,
};

const PIN_SIZE_PX: Record<DeviceMapSettings['pinSize'], number> = {
  small: 18,
  medium: 26,
  large: 34,
};

type Layer = 'clients' | 'jobs' | 'employees';

// Weather alerts come from a separate endpoint (api.weather.gov via our API).
// Their pins live alongside the standard layers but use a fixed style — no
// per-business rules apply.
interface WeatherPin {
  id: string;
  type: 'weather';
  alert_id: string;
  event: string;
  severity: string | null;
  headline: string | null;
  description: string | null;
  area_desc: string | null;
  same_code: string;
  county: string | null;
  state: string | null;
  lat: number;
  lng: number;
  expires_at: string | null;
  effective_at: string | null;
  ends_at: string | null;
  sent_at: string | null;
  fetched_at: string | null;
  nws_url?: string | null;
}
// Local calendar day (yyyy-mm-dd) of an ISO timestamp. Uses local time, NOT
// `.slice(0,10)` (which takes the UTC date) — otherwise an alert ending at
// 8:15 PM EDT lands on the next UTC day and leaks past a date filter.
function localDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const WEATHER_LAYER_COLOR = '#DC2626'; // red-600 — visually loud + intent matches
// Per-event tinting (most-common NOAA events). Falls back to red.
const WEATHER_EVENT_COLOR: Record<string, string> = {
  'tornado warning':            '#7C2D12',
  'tornado watch':              '#B91C1C',
  'severe thunderstorm warning':'#DC2626',
  'severe thunderstorm watch':  '#EA580C',
  'high wind warning':          '#D97706',
  'high wind watch':            '#F59E0B',
  'flood warning':              '#1D4ED8',
  'flash flood warning':        '#1E40AF',
  'winter storm warning':       '#0EA5E9',
  'blizzard warning':           '#0369A1',
};
function weatherPinColor(event: string): string {
  return WEATHER_EVENT_COLOR[event.toLowerCase()] ?? WEATHER_LAYER_COLOR;
}

// True if the alert's expires_at is in the past. Alerts with no expires
// (rare for NOAA) are treated as active.
function isWeatherExpired(p: { expires_at?: string | null }): boolean {
  if (!p.expires_at) return false;
  return new Date(p.expires_at).getTime() < Date.now();
}

// Short, locale-aware relative-duration label. Returns "5m" / "3h" / "2d"
// style strings — fed into the {{n}} placeholder in dashboard i18n.
function formatRelativeAgo(
  fromIso: string,
  labels: { now: string; minutes: string; hours: string; days: string },
): string {
  const diffMs = Date.now() - new Date(fromIso).getTime();
  if (diffMs < 60_000) return labels.now;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return labels.minutes.replace('{{n}}', String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return labels.hours.replace('{{n}}', String(hrs));
  const days = Math.floor(hrs / 24);
  return labels.days.replace('{{n}}', String(days));
}

// Pin payload — includes all the raw rule-matchable fields so the client
// can apply pin-style rules locally via resolvePinStyle (no server-side
// color/icon stamping). Old API responses without these fields just
// fall back to the layer's default color/icon.
interface ClientPin {
  id: string;
  type: 'client';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  company: string | null;
  phone_cell?: string | null;
  phone_office?: string | null;
  email_office?: string | null;
  email_home?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  custom_fields?: Record<string, unknown> | null;
  // Most recent communication with this client (from v_client_last_contact).
  last_contacted_at?: string | null;
  // Legacy fields from the pre-refactor API — ignored when present, the
  // client always resolves locally now.
  color?: string;
  icon?: MapPinIcon;
}
interface JobPin {
  id: string;
  type: 'job';
  lat: number;
  lng: number;
  title: string;
  status: string;
  scheduled_date: string | null;
  client_name: string | null;
  description?: string | null;
  priority?: string;
  job_address?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  custom_fields?: Record<string, unknown> | null;
  color?: string;
  icon?: MapPinIcon;
}
interface EmployeePin {
  id: string;
  type: 'employee';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  job_id: string | null;
  job_title: string | null;
  role?: string | null;
  color?: string;
  icon?: MapPinIcon;
}
type AnyPin = ClientPin | JobPin | EmployeePin | WeatherPin;

interface GeocodeBreakdown {
  noAddress: number;
  unresolved: number;
  pending: number;
}

interface PinsResponse {
  clients: ClientPin[];
  jobs: JobPin[];
  employees: EmployeePin[];
  needsGeocoding: number;
  // Older API builds may not include this — UI guards with `?.`.
  geocodeBreakdown?: GeocodeBreakdown;
}

// Layer accent colors. Used both for the pill toggle (when active) and
// for the marker pin color.
const LAYER_COLORS: Record<Layer, string> = {
  clients:   '#0EA5E9', // sky blue
  jobs:      '#10B981', // emerald
  employees: '#F59E0B', // amber
};

// Substring search across every text field on a pin (standard cols +
// custom_fields values). Case-insensitive. Caller pre-lowercases the
// query; we just check inclusion.
function pinMatchesQuery(p: AnyPin, q: string): boolean {
  const fields: (string | null | undefined)[] = [];
  if (p.type === 'client') {
    fields.push(
      p.first_name, p.last_name, p.company,
      p.phone_cell, p.phone_office,
      p.email_office, p.email_home,
      p.address, p.city, p.state, p.zip_code,
    );
  } else if (p.type === 'job') {
    fields.push(
      p.title, p.description, p.status, p.priority, p.client_name,
      p.job_address, p.job_city, p.job_state,
    );
  } else if (p.type === 'employee') {
    fields.push(p.first_name, p.last_name, p.role, p.job_title);
  } else if (p.type === 'weather') {
    fields.push(p.event, p.headline, p.area_desc, p.county, p.state, p.severity);
  }
  // Custom fields — iterate values (key matching is rarely useful for
  // map search). Works for clients and jobs; employees don't carry them.
  const cf = (p as { custom_fields?: Record<string, unknown> | null }).custom_fields;
  if (cf && typeof cf === 'object') {
    for (const v of Object.values(cf)) {
      if (v != null) fields.push(String(v));
    }
  }
  // Expand state-name queries to also match abbreviations ("Nebraska" → "NE")
  // since addresses are stored abbreviated. Word-boundary matching on
  // 2-letter terms via haystackMatchesWithStates — keeps "ne" from
  // hitting "Stone" / "Larned" / etc.
  const stateTerms = expandStateQuery(q);
  for (const f of fields) {
    if (typeof f !== 'string') continue;
    if (haystackMatchesWithStates(f, q, stateTerms)) return true;
  }
  return false;
}

// Fallback when no pins exist — center on the continental US so the map
// at least shows context.
const DEFAULT_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 40,
  longitudeDelta: 60,
};

export default function MapScreen() {
  const router = useRouter();
  const { business, user } = useApp();
  const insets = useSafeAreaInsets();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  // Module name comes from the same shared dict as everything else so
  // the header label stays in sync if the module is ever renamed.
  const moduleName = full.dashboard.modules.list.map.name;

  const [pins, setPins] = useState<PinsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  // Live progress during the auto-loop: { done: X, total: Y } where Y is
  // captured at loop start so the denominator doesn't shift as rows get
  // marked unresolved.
  const [geocodeProgress, setGeocodeProgress] = useState<{ done: number; total: number } | null>(null);
  // Map view prefs (map type, clustering, pin size) come from the business
  // row (businesses.map_view_settings) so they sync across the owner's
  // devices, like map_pin_config. mapType is normalized: web persists
  // 'roadmap', react-native-maps wants 'standard'.
  const deviceSettings = useMemo<DeviceMapSettings>(() => {
    const s = business?.map_view_settings;
    if (!s) return DEFAULT_DEVICE_SETTINGS;
    const MOBILE_TYPES = ['standard', 'satellite', 'hybrid', 'terrain'] as const;
    const mapType: DeviceMapSettings['mapType'] =
      s.mapType === 'roadmap'
        ? 'standard'
        : (MOBILE_TYPES as readonly string[]).includes(s.mapType)
          ? (s.mapType as DeviceMapSettings['mapType'])
          : DEFAULT_DEVICE_SETTINGS.mapType;
    const pinSize = (['small', 'medium', 'large'] as readonly string[]).includes(s.pinSize)
      ? s.pinSize
      : DEFAULT_DEVICE_SETTINGS.pinSize;
    const rawDays = Number(s.outreachDays);
    const outreachDays = Number.isFinite(rawDays) && rawDays >= 1
      ? Math.min(365, Math.floor(rawDays))
      : DEFAULT_DEVICE_SETTINGS.outreachDays;
    return {
      mapType,
      clustering: typeof s.clustering === 'boolean' ? s.clustering : DEFAULT_DEVICE_SETTINGS.clustering,
      pinSize,
      outreachDays,
    };
  }, [business?.map_view_settings]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    clients: true,
    jobs: true,
    employees: true,
  });
  const [weatherLayerOn, setWeatherLayerOn] = useState(true);
  const [weatherPins, setWeatherPins] = useState<WeatherPin[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  // "Storm focus" mode — when on, hide every pin EXCEPT weather alerts
  // and non-weather pins within `proximity_radius_miles` of any alert.
  const [stormFocus, setStormFocus] = useState(false);
  // Weather date-range filter — hide alerts whose active window doesn't
  // overlap [from, to] (yyyy-mm-dd). null = open-ended on that side.
  const [weatherDateFrom, setWeatherDateFrom] = useState<string | null>(null);
  const [weatherDateTo, setWeatherDateTo] = useState<string | null>(null);
  const [weatherDateOpen, setWeatherDateOpen] = useState(false);
  const weatherDateActive = !!weatherDateFrom || !!weatherDateTo;
  // Outreach mode — when on, client pins contacted within
  // deviceSettings.outreachDays are dimmed + flagged with a green ✓ so the
  // user can see who's still left to call. The last-contact timestamp rides
  // along on each pin (pin.last_contacted_at, from v_client_last_contact via
  // the /pins endpoint).
  const [outreach, setOutreach] = useState(false);
  // Modal listing every client with missing lat/lng — opened from the
  // geocode banner so the user can see WHICH clients failed and jump
  // straight to their detail page to fix the address.
  const [unresolvedOpen, setUnresolvedOpen] = useState(false);
  // Hides the "X clients without coords" banner for this map view session
  // ("deal with these later" use case). Resets when the screen unmounts /
  // user returns to the map, so they get prompted again next visit.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [selected, setSelected] = useState<AnyPin | null>(null);
  // Free-text search across the pin's identifying fields. Filters
  // `visiblePins` and auto-fits the map to the matching subset.
  const [search, setSearch] = useState('');
  const mapRef = useRef<MapView | null>(null);

  const apiBaseUrl = getApiBaseUrl();
  const weatherEnabled = isWeatherFeatureEnabled(business?.id);

  const load = useCallback(async () => {
    if (!business || !apiBaseUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const jwt = await getJwt();
      const r = await fetch(`${apiBaseUrl}/api/v1/map/pins?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.ok) {
        const j = await r.json();
        setPins((j?.data ?? null) as PinsResponse | null);
      } else {
        setPins(null);
      }
    } catch {
      setPins(null);
    }
    setLoading(false);
  }, [business, apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  // Direct Supabase client for the last-contact view read (RLS scopes it
  // to the business — no API round-trip needed).
  const supabase = useMemo(() => createSupabaseClient(), []);

  // "Confirm outcome after" contact logging for the pin card's quick
  // actions. Logs a client_communications row when the user returns from
  // the dialer / SMS / mail app and confirms the outcome; refetches pins
  // so "Último contacto" updates.
  const { fireContact } = useContactOutcomePrompt({
    supabase,
    businessId: business?.id,
    createdBy: user?.id ?? null,
    labels: full.dashboard.clients.detail.commLog.prompt,
    onLogged: () => { void load(); },
  });

  // Weather alerts — only fetched when the alpha business gate is on.
  // Posts to /weather/refresh first (server skips the NWS call if cache
  // is fresh) then reads the cache.
  const loadWeather = useCallback(async () => {
    if (!business || !apiBaseUrl || !weatherEnabled) return;
    setWeatherLoading(true);
    try {
      const jwt = await getJwt();
      // Best-effort refresh; if disabled in config, the server returns
      // skipped=disabled and we'll just read whatever's cached (likely empty).
      await fetch(`${apiBaseUrl}/api/v1/weather/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ business_id: business.id }),
      });
      const r = await fetch(`${apiBaseUrl}/api/v1/weather/alerts?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.ok) {
        const j = await r.json();
        const alerts = (j?.data?.alerts ?? []) as Array<Omit<WeatherPin, 'type' | 'id'> & { id: string }>;
        setWeatherPins(alerts.map((a) => ({ ...a, type: 'weather' as const })));
      } else {
        setWeatherPins([]);
      }
    } catch {
      setWeatherPins([]);
    }
    setWeatherLoading(false);
  }, [business, apiBaseUrl, weatherEnabled]);

  useEffect(() => { void loadWeather(); }, [loadWeather]);

  // Derive an initial region that frames every visible pin. If there are
  // no pins yet, fall back to the continental US default so the map at
  // least shows something.
  const initialRegion = useMemo<Region>(() => {
    if (!pins) return DEFAULT_REGION;
    const all: AnyPin[] = [
      ...(layers.clients ? pins.clients : []),
      ...(layers.jobs ? pins.jobs : []),
      ...(layers.employees ? pins.employees : []),
    ];
    if (all.length === 0) return DEFAULT_REGION;
    const lats = all.map(p => p.lat);
    const lngs = all.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latDelta = Math.max((maxLat - minLat) * 1.3, 0.05);
    const lngDelta = Math.max((maxLng - minLng) * 1.3, 0.05);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
    // Recompute initial region only on the first data load — re-zooming
    // every time the user toggles a layer would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // Weather pins are grouped by SAME code so each county/state renders
  // exactly one marker (with a "+N" badge when there are sibling alerts
  // at the same location). The group's primary is the most-recently-sent
  // alert; siblings appear in the popup card's list.
  // Weather alerts after the date-range filter — keep an alert whose active
  // window [effective, ends/expires] overlaps [from, to]. Compare on the date
  // portion (yyyy-mm-dd) so timezones/times don't skew the edges. Shared by
  // BOTH the rendered alerts and storm focus, so a date-hidden alert can't
  // anchor the storm radius.
  const dateFilteredWeatherPins = useMemo(() => {
    if (!weatherDateFrom && !weatherDateTo) return weatherPins;
    return weatherPins.filter(a => {
      const s = localDay(a.effective_at ?? a.ends_at ?? a.expires_at);
      const e = localDay(a.ends_at ?? a.expires_at ?? a.effective_at);
      if (!s && !e) return false;
      const start = s || e;
      const end = e || s;
      if (weatherDateFrom && end < weatherDateFrom) return false;
      if (weatherDateTo && start > weatherDateTo) return false;
      return true;
    });
  }, [weatherPins, weatherDateFrom, weatherDateTo]);

  const weatherGroups = useMemo(() => {
    if (!weatherEnabled || !weatherLayerOn) return [];
    const groups = groupWeatherAlertsBySameCode(dateFilteredWeatherPins);
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    // Keep the group when ANY of its alerts matches the search, so
    // siblings are still discoverable via search.
    return groups.filter(g => g.all.some(a => pinMatchesQuery(a, q)));
  }, [weatherEnabled, weatherLayerOn, dateFilteredWeatherPins, search]);

  // O(1) lookup from a weather pin's id → its sibling list. Used when the
  // user taps a weather marker to pass siblings to the card.
  const siblingsByWeatherId = useMemo(() => {
    const map = new Map<string, WeatherPin[]>();
    for (const g of weatherGroups) {
      for (const a of g.all) {
        map.set(a.id, g.all.filter(s => s.id !== a.id));
      }
    }
    return map;
  }, [weatherGroups]);

  const visiblePins: AnyPin[] = useMemo(() => {
    if (!pins) return [];
    let nonWeather: AnyPin[] = [
      ...(layers.clients ? pins.clients : []),
      ...(layers.jobs ? pins.jobs : []),
      ...(layers.employees ? pins.employees : []),
    ];
    // Only the group primaries enter the flat list — the markers each get
    // one render, and siblings are reached via the popup.
    const weatherPrimaries: AnyPin[] = weatherGroups.map(g => g.primary);

    // Storm-focus mode: drop any non-weather pin that isn't within
    // `proximity_radius_miles` of an alert (haversine distance). Skipped
    // when there are no weather pins at all — otherwise focus would
    // hide everything.
    if (stormFocus && weatherEnabled && dateFilteredWeatherPins.length > 0) {
      const radius = normalizeWeatherConfig(business?.weather_config).proximity_radius_miles;
      // Use the date-filtered alerts for the radius check (not just primaries)
      // so every shown alert anchors a circle, even ones grouped behind a
      // sibling badge — but date-hidden alerts don't anchor anything.
      const anchors = dateFilteredWeatherPins.map(w => ({ lat: w.lat, lng: w.lng }));
      nonWeather = nonWeather.filter(p =>
        anchors.some(a => haversineMiles(a, { lat: p.lat, lng: p.lng }) <= radius),
      );
    }

    const all = [...nonWeather, ...weatherPrimaries];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    // Non-weather still gets the per-pin filter; weather already filtered
    // at the group level above.
    return [...nonWeather.filter(p => pinMatchesQuery(p, q)), ...weatherPrimaries];
  }, [pins, layers, search, weatherGroups, stormFocus, weatherEnabled, dateFilteredWeatherPins, business?.weather_config]);

  // When a search narrows the result set, fit the map to those pins so
  // the user lands on them without panning. Skip when no search (so the
  // user's manual pan/zoom isn't reset on layer toggles).
  useEffect(() => {
    if (!search.trim() || visiblePins.length === 0) return;
    const coords = visiblePins.map(p => ({ latitude: p.lat, longitude: p.lng }));
    if (coords.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: coords[0].latitude,
        longitude: coords[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 400);
    } else {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 120, left: 60 },
        animated: true,
      });
    }
  }, [search, visiblePins]);

  // Reset to the default view — re-frame every visible pin (the corner
  // button on the map). Falls back to the continental US default when
  // there's nothing to frame.
  const resetView = useCallback(() => {
    if (visiblePins.length === 0) {
      mapRef.current?.animateToRegion(DEFAULT_REGION, 400);
      return;
    }
    const coords = visiblePins.map(p => ({ latitude: p.lat, longitude: p.lng }));
    if (coords.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: coords[0].latitude,
        longitude: coords[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 400);
    } else {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 120, left: 60 },
        animated: true,
      });
    }
  }, [visiblePins]);

  const onGeocode = async () => {
    if (!business || !apiBaseUrl) return;
    setGeocoding(true);
    // Total = "pending" only (rows that can still be geocoded). The
    // breakdown counts unresolved + no-address separately; those don't
    // get retried this round, so they shouldn't inflate the denominator.
    const initialPending = pins?.geocodeBreakdown?.pending ?? pins?.needsGeocoding ?? 0;
    let totalGeocoded = 0;
    setGeocodeProgress({ done: 0, total: initialPending });

    try {
      const jwt = await getJwt();
      // Loop until no progress. Safety cap: 50 batches × 100 rows = 5000
      // clients per session — protects against an unforeseen bug where
      // the server returns nonzero attempted but zero failures forever.
      for (let i = 0; i < 50; i++) {
        const r = await fetch(`${apiBaseUrl}/api/v1/map/geocode-clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ business_id: business.id }),
        });
        if (!r.ok) break;
        const j = await r.json();
        const { attempted = 0, geocoded = 0 } = j?.data ?? {};
        totalGeocoded += geocoded;
        setGeocodeProgress({ done: totalGeocoded, total: initialPending });
        // Server returned 0 rows to try → we're done (everything was
        // either resolved, marked failed within the cooldown, or has
        // no address).
        if (attempted === 0) break;
      }
      Alert.alert('', t.geocodeDone.replace('{{count}}', String(totalGeocoded)));
      await load();
    } catch {
      // ignore
    }
    setGeocoding(false);
    setGeocodeProgress(null);
  };

  const openSelected = () => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    // ?from=map so the detail screen's back arrow returns here instead
    // of falling into the clientes/trabajos tab stack (expo-router
    // switches tab context when pushing to a sibling tab route).
    if (selected.type === 'client') {
      router.push(`/dashboard/clientes/${id}?from=map` as never);
    } else if (selected.type === 'job') {
      router.push(`/dashboard/trabajos/${id}?from=map` as never);
    } else if (selected.type === 'employee') {
      // Employees pin where the JOB is — opening goes to that job, not
      // an employee detail screen (we don't have one in core yet).
      const jobId = selected.job_id;
      if (jobId) router.push(`/dashboard/trabajos/${jobId}?from=map` as never);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 flex-1 text-lg font-semibold text-gray-900">{moduleName}</Text>
        {/* Storm focus toggle — only shown when the alpha business has
           weather enabled, since it's useless otherwise. */}
        {weatherEnabled ? (
          <Pressable
            onPress={() => setStormFocus(v => !v)}
            hitSlop={12}
            className={`p-2 mr-1 rounded-lg active:bg-gray-100 ${stormFocus ? 'bg-red-50' : ''}`}
          >
            <Crosshair size={20} color={stormFocus ? '#DC2626' : '#374151'} />
          </Pressable>
        ) : null}
        {weatherEnabled ? (
          <Pressable
            onPress={() => setWeatherDateOpen(v => !v)}
            hitSlop={12}
            accessibilityLabel={tdate.button}
            className={`p-2 mr-1 rounded-lg active:bg-gray-100 ${weatherDateActive ? 'bg-primary/10' : ''}`}
          >
            <Calendar size={20} color={weatherDateActive ? '#4F46E5' : '#374151'} />
          </Pressable>
        ) : null}
        {/* Outreach mode toggle — dims + ✓ clients contacted within the
           configured window. Available to every business (not weather-gated). */}
        <Pressable
          onPress={() => setOutreach(v => !v)}
          hitSlop={12}
          className={`p-2 mr-1 rounded-lg active:bg-gray-100 ${outreach ? 'bg-emerald-50' : ''}`}
        >
          <CircleCheckBig size={20} color={outreach ? '#16A34A' : '#374151'} />
        </Pressable>
        <Pressable
          onPress={() => setSettingsOpen(true)}
          hitSlop={12}
          className="p-2 -mr-2 rounded-lg active:bg-gray-100"
        >
          <SettingsIcon size={20} color="#374151" />
        </Pressable>
      </View>

      {/* Layer toggle pills — horizontal-scrollable so a 4th pill (weather)
         doesn't get clipped off the right edge on narrow phones. */}
      <View className="pb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          <LayerPill
            icon={Users}
            label={t.layers.clients}
            color={LAYER_COLORS.clients}
            active={layers.clients}
            count={pins?.clients.length ?? 0}
            onPress={() => setLayers(l => ({ ...l, clients: !l.clients }))}
          />
          <LayerPill
            icon={Briefcase}
            label={t.layers.jobs}
            color={LAYER_COLORS.jobs}
            active={layers.jobs}
            count={pins?.jobs.length ?? 0}
            onPress={() => setLayers(l => ({ ...l, jobs: !l.jobs }))}
          />
          <LayerPill
            icon={UserCircle2}
            label={t.layers.employees}
            color={LAYER_COLORS.employees}
            active={layers.employees}
            count={pins?.employees.length ?? 0}
            onPress={() => setLayers(l => ({ ...l, employees: !l.employees }))}
          />
          {weatherEnabled ? (
            <LayerPill
              icon={CloudLightning}
              label={t.weather.layerName}
              color={WEATHER_LAYER_COLOR}
              active={weatherLayerOn}
              count={weatherPins.length}
              onPress={() => setWeatherLayerOn(v => !v)}
            />
          ) : null}
        </ScrollView>
        {/* Tiny hint so users know the chips toggle visibility — wasn't
           obvious from styling alone. */}
        <Text className="text-[10px] text-gray-400 mt-1 px-4">
          {t.layerToggleHint}
        </Text>
      </View>

      {/* Search bar — filters visible pins across all text fields
         (name, company, city, state, custom fields, etc.). Map auto-fits
         to the matching subset so the user lands on the results. */}
      <View className="px-4 pb-3">
        <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white">
          <SearchIcon size={14} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-gray-900"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <>
              <Text className="text-[10px] text-gray-500">
                {t.searchResultsCount.replace('{{count}}', String(visiblePins.length))}
              </Text>
              <Pressable onPress={() => setSearch('')} hitSlop={6}>
                <X size={14} color="#9CA3AF" />
              </Pressable>
            </>
          ) : null}
        </View>
        {/* Weather date-range filter now lives in a bottom sheet (DateRangeSheet
           at the screen root) for one-hand reach. */}
        {/* Storm-focus active banner — sits right under the search bar so
           the context of "what's being filtered" lives in the same visual
           group as the other filter inputs. */}
        {stormFocus && weatherEnabled ? (
          <View className="flex-row items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100">
            <Crosshair size={12} color="#DC2626" />
            <Text className="text-[11px] font-semibold text-red-700 flex-1">
              {t.weather.focusModeBadge}
            </Text>
            <Pressable onPress={() => setStormFocus(false)} hitSlop={6}>
              <X size={12} color="#DC2626" />
            </Pressable>
          </View>
        ) : null}
        {/* Outreach-mode active banner — contacted clients are dimmed + ✓. */}
        {outreach ? (
          <View className="flex-row items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <CircleCheckBig size={12} color="#16A34A" />
            <Text className="text-[11px] font-semibold text-emerald-700 flex-1">
              {t.outreachModeBadge.replace('{{days}}', String(deviceSettings.outreachDays))}
            </Text>
            <Pressable onPress={() => setOutreach(false)} hitSlop={6}>
              <X size={12} color="#16A34A" />
            </Pressable>
          </View>
        ) : null}
        {/* Geocode banner — only when there are clients still missing
           coordinates. Tap-to-backfill saves a settings detour. Lives
           inline inside the same px-4 container as the search bar so
           horizontal alignment matches exactly; pushes the map down a
           bit when shown, which is fine since it's an action prompt. */}
        {!loading && pins && pins.needsGeocoding > 0 && !bannerDismissed ? (
          <Pressable
            // Tap opens the unresolved-clients list so the user can SEE
            // which clients are affected. The list has its own "Reintentar"
            // button for batch geocoding. Tapping the banner used to fire
            // geocoding blindly which gave the user no actionable info
            // when it returned "0 located".
            onPress={() => setUnresolvedOpen(true)}
            disabled={geocoding}
            className="mt-2 rounded-2xl bg-white border border-gray-200 px-4 py-3 flex-row items-center gap-3"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <View className="w-8 h-8 rounded-full bg-sky-100 items-center justify-center">
              <Users size={16} color="#0EA5E9" />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-gray-900">
                {geocoding && geocodeProgress
                  ? t.geocodeProgress
                      .replace('{{done}}', String(geocodeProgress.done))
                      .replace('{{total}}', String(geocodeProgress.total))
                  : geocoding
                    ? t.geocodeRunning
                    : t.geocodeMissing.replace('{{count}}', String(pins.needsGeocoding))}
              </Text>
              {!geocoding && pins.geocodeBreakdown ? (
                <Text className="text-xs text-gray-500 mt-0.5">
                  {t.geocodeBreakdown
                    .replace('{{noAddr}}', String(pins.geocodeBreakdown.noAddress))
                    .replace('{{unresolved}}', String(pins.geocodeBreakdown.unresolved))
                    .replace('{{pending}}', String(pins.geocodeBreakdown.pending))}
                </Text>
              ) : null}
            </View>
            {geocoding ? <ActivityIndicator size="small" color="#4F46E5" /> : null}
            {/* Dismiss for this session — banner re-shows when the user
               returns to the map. stopPropagation so the surrounding
               Pressable's onPress (open list) doesn't also fire. */}
            <Pressable
              onPress={(e) => { e.stopPropagation(); setBannerDismissed(true); }}
              hitSlop={10}
              className="p-1.5 rounded-lg active:bg-gray-100"
            >
              <X size={16} color="#9CA3AF" />
            </Pressable>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4F46E5" />
          </View>
        ) : (
          <ClusteredMapView
            // No `provider` prop → react-native-maps uses the platform
            // default: Apple Maps on iOS (free, no extra native SDK), Google
            // Maps on Android (its built-in default). The web map uses
            // Google for the recognizable look. Switching iOS to Google
            // would require manually installing the GoogleMaps iOS pod via
            // a config plugin or post-prebuild step — out of scope for v1.
            style={{ flex: 1 }}
            initialRegion={initialRegion}
            // Capture the underlying MapView ref so we can call
            // fitToCoordinates() when search narrows the result set.
            mapRef={(ref) => { mapRef.current = ref as unknown as MapView; }}
            mapType={deviceSettings.mapType}
            clusteringEnabled={deviceSettings.clustering}
            clusterColor="#4F46E5"
            clusterTextColor="#FFFFFF"
            // Off-by-default in the lib, but the lib's animation glitches
            // when used with a lot of markers — leave it off for now.
            animationEnabled={false}
          >
            {visiblePins.map(p => {
              // Resolve color + icon LOCALLY using the business's pin
              // config. Returns null when a hide rule matched — skip
              // those pins entirely so they don't render at all. Weather
              // pins use the same resolver so per-event rules (e.g.
              // event = 'Tornado Warning' → red tornado icon) apply.
              const layerKey =
                p.type === 'client'  ? 'clients'  as const :
                p.type === 'job'     ? 'jobs'     as const :
                p.type === 'weather' ? 'weather'  as const :
                                       'employees' as const;
              const layerCfg = business?.map_pin_config?.[layerKey];
              const style = resolvePinStyle(
                layerKey,
                layerCfg,
                p as unknown as Record<string, unknown>,
              );
              if (style === null) return null;
              // For weather primaries, look up how many siblings share
              // this location so the badge shows "+N".
              const siblingCount =
                p.type === 'weather' ? (siblingsByWeatherId.get(p.id)?.length ?? 0) : 0;
              // Outreach mode: dim + ✓ a client contacted within the window.
              // last_contacted_at rides along on the pin from the /pins endpoint.
              const contacted =
                outreach && p.type === 'client' &&
                !!p.last_contacted_at &&
                Date.now() - Date.parse(p.last_contacted_at) <= deviceSettings.outreachDays * 86_400_000;
              return (
                <Marker
                  // Outreach state is folded into the key so flipping the
                  // toggle remounts client markers — required because
                  // tracksViewChanges={false} otherwise won't repaint the
                  // ✓ badge / opacity on an existing marker snapshot.
                  key={`${p.type}-${p.id}${p.type === 'client' && outreach ? (contacted ? '-c' : '-n') : ''}`}
                  coordinate={{ latitude: p.lat, longitude: p.lng }}
                  onPress={() => setSelected(p)}
                  opacity={contacted ? 0.45 : 1}
                  // Anchor the pin tip (bottom-center of the PinBadge view)
                  // at the lat/lng. Without this the badge centers on the
                  // location and looks like it's floating above it.
                  anchor={{ x: 0.5, y: 1 }}
                  // Custom child node → native pin styling is bypassed.
                  // tracksViewChanges:false after first render is critical
                  // for perf at 200+ markers.
                  tracksViewChanges={false}
                >
                  <PinBadge
                    iconKey={style.icon}
                    color={style.color}
                    iconColor={style.iconColor}
                    size={PIN_SIZE_PX[deviceSettings.pinSize]}
                    countBadge={siblingCount > 0 ? siblingCount : undefined}
                    checkBadge={contacted}
                  />
                </Marker>
              );
            })}
          </ClusteredMapView>
        )}

        {/* Reset-view button — re-frames all pins (the "default view").
            Bottom-right, lifted above the AnimatedDock (BAR 50 + raised
            bubble ~22) plus the safe-area inset so it never hides behind it. */}
        {!loading ? (
          <Pressable
            onPress={resetView}
            accessibilityLabel={t.resetView}
            className="absolute right-4 w-10 h-10 rounded-full bg-white items-center justify-center border border-gray-200"
            style={{
              bottom: insets.bottom + 84,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <LocateFixed size={18} color="#374151" />
          </Pressable>
        ) : null}


        {/* Selected pin sheet — centered modal with a backdrop. Shows
           identifying info + quick-action buttons (call/text/email for
           clients) + a "Ver detalles" button that pushes to the full
           record. Back from there returns to the map automatically via
           expo-router's history stack. */}
        {selected ? (
          selected.type === 'weather' ? (
            <WeatherPinCard
              selected={selected}
              siblings={siblingsByWeatherId.get(selected.id) ?? []}
              onClose={() => setSelected(null)}
              labels={t.weather}
            />
          ) : (
            <SelectedPinCard
              selected={selected}
              onClose={() => setSelected(null)}
              onOpenRecord={openSelected}
              openRecordLabel={t.openRecord}
              assignedToLabel={t.assignedToJob}
              callsClient={full.dashboard.clients.detail}
              commLog={full.dashboard.clients.detail.commLog}
              fireContact={fireContact}
            />
          )
        ) : null}
      </View>

      {/* Settings sheet — gear icon in header triggers this. Pin rules +
         view prefs (map type/clustering/size) both save to the business row. */}
      <MapSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deviceSettings={deviceSettings}
        onPinConfigSaved={() => void load()}
        // Ignored-clients list inside the sheet pipes name-taps through
        // to the client detail page. Close the sheet first so the
        // navigation lands cleanly with no modal in the back-stack.
        onOpenClient={(id) => {
          setSettingsOpen(false);
          router.push(`/dashboard/clientes/${id}?from=map` as never);
        }}
      />

      {/* Unresolved-clients list — opened by tapping the geocode banner.
         Lets the user see WHICH clients are missing coordinates + why,
         and jump to a client's detail page to fix the address. */}
      {unresolvedOpen ? (
        <UnresolvedClientsModal
          onClose={() => setUnresolvedOpen(false)}
          onOpenClient={(id) => {
            setUnresolvedOpen(false);
            router.push(`/dashboard/clientes/${id}?from=map` as never);
          }}
          onRetry={async () => {
            setUnresolvedOpen(false);
            await onGeocode();
          }}
          retrying={geocoding}
          // Re-fetch pins so the banner count drops as soon as the user
          // ignores a row, even without closing the modal.
          onChanged={() => void load()}
        />
      ) : null}

      <DateRangeSheet
        open={weatherEnabled && weatherDateOpen}
        onClose={() => setWeatherDateOpen(false)}
        from={weatherDateFrom}
        to={weatherDateTo}
        onChange={({ from, to }) => { setWeatherDateFrom(from); setWeatherDateTo(to); }}
        title={tdate.title}
        fromLabel={tdate.from}
        toLabel={tdate.to}
        clearLabel={tdate.clear}
        applyLabel={tdate.apply}
        presets={buildDateRangePresets(tdate)}
      />
    </SafeAreaView>
  );
}

interface LayerPillProps {
  icon: typeof Users;
  label: string;
  color: string;
  active: boolean;
  count: number;
  onPress: () => void;
}

function LayerPill({ icon: Icon, label, color, active, count, onPress }: LayerPillProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full ${
        active ? '' : 'opacity-50'
      }`}
      style={{ backgroundColor: active ? `${color}20` : '#F3F4F6' }}
    >
      <Icon size={14} color={active ? color : '#6B7280'} />
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? color : '#6B7280' }}
      >
        {label}
      </Text>
      <View className="bg-white/70 rounded-full px-1.5 py-0.5 min-w-[20px] items-center">
        <Text
          className="text-[10px] font-bold"
          style={{ color: active ? color : '#6B7280' }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Selected-pin card ──────────────────────────────────────────────────
// Centered modal with backdrop. Tap a pin → card shows identifying info
// + quick contact actions (call/text/email for clients) + an "Open record"
// button that pushes to the full detail screen.
function SelectedPinCard({
  selected,
  onClose,
  onOpenRecord,
  openRecordLabel,
  assignedToLabel,
  callsClient,
  commLog,
  fireContact,
}: {
  selected: ClientPin | JobPin | EmployeePin;
  onClose: () => void;
  onOpenRecord: () => void;
  openRecordLabel: string;
  assignedToLabel: string;
  callsClient: { actionCall: string; actionText: string; actionEmail: string };
  commLog: {
    lastContacted: string;
    neverContacted: string;
    rel: RelativeTimeLabels;
  };
  fireContact: (args: FireContactArgs) => void;
}) {
  const layerColor =
    selected.type === 'client'
      ? LAYER_COLORS.clients
      : selected.type === 'job'
        ? LAYER_COLORS.jobs
        : LAYER_COLORS.employees;

  const displayName =
    selected.type === 'client'
      ? `${selected.first_name} ${selected.last_name}`
      : selected.type === 'job'
        ? selected.title
        : `${selected.first_name} ${selected.last_name}`;

  const subtitle =
    selected.type === 'client'
      ? selected.company
      : selected.type === 'job'
        ? selected.client_name
        : selected.job_title
          ? `${assignedToLabel}: ${selected.job_title}`
          : null;

  // Client-only: phone/email/address from the pin payload. Falls back
  // across the cell/office variants like the client detail page does.
  const phone =
    selected.type === 'client'
      ? selected.phone_cell ?? selected.phone_office ?? null
      : null;
  const email =
    selected.type === 'client'
      ? selected.email_office ?? selected.email_home ?? null
      : null;
  const addressLine =
    selected.type === 'client'
      ? [selected.address, selected.city, selected.state].filter(Boolean).join(', ')
      : selected.type === 'job'
        ? [selected.job_address, selected.job_city, selected.job_state].filter(Boolean).join(', ')
        : '';

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/40 items-center justify-center px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl w-full max-w-sm p-5"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {/* Header — icon + name + close */}
          <View className="flex-row items-start gap-3 mb-4">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: `${layerColor}15` }}
            >
              {selected.type === 'client' ? (
                <Users size={22} color={layerColor} />
              ) : selected.type === 'job' ? (
                <Briefcase size={22} color={layerColor} />
              ) : (
                <UserCircle2 size={22} color={layerColor} />
              )}
            </View>
            <View className="flex-1 min-w-0 pt-0.5">
              <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
                {displayName}
              </Text>
              {subtitle ? (
                <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 -mr-1 -mt-1">
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Info rows */}
          <View className="gap-2 mb-4">
            {phone ? (
              <InfoRow icon={<Phone size={14} color="#6B7280" />} text={fmtPhonePretty(phone)} />
            ) : null}
            {email ? (
              <InfoRow icon={<Mail size={14} color="#6B7280" />} text={email} />
            ) : null}
            {addressLine ? (
              <InfoRow icon={<MapPinIconLucide size={14} color="#6B7280" />} text={addressLine} />
            ) : null}
            {selected.type === 'job' && selected.scheduled_date ? (
              <InfoRow icon={<Calendar size={14} color="#6B7280" />} text={selected.scheduled_date} />
            ) : null}
            {selected.type === 'client' ? (
              <InfoRow
                icon={<History size={14} color="#6B7280" />}
                text={
                  selected.last_contacted_at
                    ? commLog.lastContacted.replace(
                        '{{rel}}',
                        formatRelativeLong(selected.last_contacted_at, commLog.rel),
                      )
                    : commLog.neverContacted
                }
              />
            ) : null}
          </View>

          {/* Quick contact actions — clients only, only if we have data */}
          {selected.type === 'client' && (phone || email) ? (
            <View className="flex-row gap-2 mb-3">
              {phone ? (
                <ActionButton
                  icon={<Phone size={16} color="#4F46E5" />}
                  label={callsClient.actionCall}
                  onPress={() => fireContact({
                    type: 'call',
                    target: `tel:${phone.replace(/\D/g, '')}`,
                    contactMethod: phone,
                    clientId: selected.id,
                  })}
                />
              ) : null}
              {phone ? (
                <ActionButton
                  icon={<MessageSquare size={16} color="#4F46E5" />}
                  label={callsClient.actionText}
                  onPress={() => fireContact({
                    type: 'sms',
                    target: `sms:${phone.replace(/\D/g, '')}`,
                    contactMethod: phone,
                    clientId: selected.id,
                  })}
                />
              ) : null}
              {email ? (
                <ActionButton
                  icon={<Mail size={16} color="#4F46E5" />}
                  label={callsClient.actionEmail}
                  onPress={() => fireContact({
                    type: 'email',
                    target: `mailto:${email}`,
                    contactMethod: email,
                    clientId: selected.id,
                  })}
                />
              ) : null}
            </View>
          ) : null}

          {/* Open record */}
          <Pressable
            onPress={onOpenRecord}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-white">{openRecordLabel}</Text>
            <ArrowRight size={14} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

// Two-column label/value row used in the weather alert detail card.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row py-1.5 border-b border-gray-50" style={{ gap: 16 }}>
      <Text
        style={{ width: 100 }}
        className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 pt-0.5"
      >
        {label}
      </Text>
      <Text className="flex-1 text-xs text-gray-800">{value}</Text>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-0.5">{icon}</View>
      <Text className="text-xs text-gray-700 flex-1" numberOfLines={2}>{text}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress }: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-primary/5 border border-primary/20 active:bg-primary/10"
    >
      {icon}
      <Text className="text-[11px] font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}

// ─── Weather-pin card ───────────────────────────────────────────────────
// Full NOAA alert detail. Shows every field the API stores so the user has
// complete context. When multiple alerts share the same county (passed in
// via `siblings`), a tappable list appears at the bottom so the user can
// switch between them without closing the card.
function WeatherPinCard({
  selected,
  siblings,
  onClose,
  labels,
}: {
  selected: WeatherPin;
  siblings: WeatherPin[];
  onClose: () => void;
  labels: {
    pinPopupExpires: string;
    pinPopupArea: string;
    pinPopupSeverity: string;
    pinPopupOpenNws: string;
    pinPopupHeadline: string;
    pinPopupEvent: string;
    pinPopupCity: string;
    pinPopupState: string;
    pinPopupStarts: string;
    pinPopupEnds: string;
    pinPopupSent: string;
    pinPopupAdded: string;
    pinPopupDescription: string;
    pinPopupOtherAlerts: string;
  };
}) {
  // Internal "current" alert — defaults to `selected` (the marker's
  // primary) but the user can switch by tapping a sibling row. Reset
  // when the parent passes a different `selected` (different marker tap).
  const [current, setCurrent] = useState<WeatherPin>(selected);
  useEffect(() => { setCurrent(selected); }, [selected.id]);

  // All alerts at this location = current + siblings (minus current),
  // sorted newest-first by sent_at. Used to render the switcher list.
  const allAtLocation = useMemo(() => {
    const others = siblings.filter(s => s.id !== current.id);
    const restored = current.id === selected.id ? siblings : [...siblings, selected].filter(s => s.id !== current.id);
    const list = [current, ...(current.id === selected.id ? others : restored)];
    return list.sort((a, b) => {
      const ta = new Date(a.sent_at ?? a.fetched_at ?? 0).getTime();
      const tb = new Date(b.sent_at ?? b.fetched_at ?? 0).getTime();
      return tb - ta;
    });
  }, [current, selected, siblings]);
  const otherAlerts = allAtLocation.filter(a => a.id !== current.id);

  const color = weatherPinColor(current.event);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);
  const nwsUrl = current.nws_url ?? (current.alert_id.startsWith('http') ? current.alert_id : null);
  // Prefer ends_at when present (the actual event-end time), otherwise expires_at.
  const endTime = fmt(current.ends_at ?? current.expires_at);
  const startTime = fmt(current.effective_at);
  const sentTime = fmt(current.sent_at);
  const addedTime = fmt(current.fetched_at);

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop and card are SIBLINGS, not parent/child. Wrapping the
         card in a Pressable (even with stopPropagation) hijacks vertical
         pan gestures on iOS and prevents the ScrollView inside from
         scrolling. Separating layers means the backdrop catches taps and
         the card's ScrollView gets touch events cleanly. */}
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View
          className="bg-white rounded-3xl w-full max-w-sm"
          style={{
            maxHeight: '85%',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {/* Header — sticky-feeling because it sits above the scroll body */}
          <View className="flex-row items-start gap-3 p-5 pb-3 border-b border-gray-100">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: `${color}15` }}
            >
              <CloudLightning size={22} color={color} />
            </View>
            <View className="flex-1 min-w-0 pt-0.5">
              <Text className="text-base font-bold text-gray-900" numberOfLines={2}>
                {current.event}
              </Text>
              {current.severity ? (
                <Text className="text-[10px] uppercase tracking-wide font-semibold mt-0.5" style={{ color }}>
                  {current.severity}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 -mr-1 -mt-1">
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Scrollable body — full alert detail + sibling switcher.
             `flexShrink: 1` is the key: the card itself sizes to content
             normally (so short alerts stay small), and when content
             exceeds the parent's `maxHeight: 85%`, the ScrollView shrinks
             to fit + starts scrolling instead of clipping. Using `flex-1`
             here collapses the card because flex-1 wants to FILL an
             un-sized parent, not shrink to fit it. */}
          <ScrollView
            className="px-5 py-4"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {current.headline ? (
              <DetailRow label={labels.pinPopupHeadline} value={current.headline} />
            ) : null}
            <DetailRow label={labels.pinPopupEvent} value={current.event} />
            {current.severity ? (
              <DetailRow label={labels.pinPopupSeverity} value={current.severity} />
            ) : null}
            {current.county ? (
              <DetailRow label={labels.pinPopupCity} value={current.county} />
            ) : null}
            {current.state ? (
              <DetailRow label={labels.pinPopupState} value={current.state} />
            ) : null}
            {current.area_desc ? (
              <DetailRow label={labels.pinPopupArea} value={current.area_desc} />
            ) : null}
            {startTime ? <DetailRow label={labels.pinPopupStarts} value={startTime} /> : null}
            {endTime ? <DetailRow label={labels.pinPopupEnds} value={endTime} /> : null}
            {sentTime ? <DetailRow label={labels.pinPopupSent} value={sentTime} /> : null}
            {addedTime ? <DetailRow label={labels.pinPopupAdded} value={addedTime} /> : null}
            {current.description ? (
              <View className="mt-2">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  {labels.pinPopupDescription}
                </Text>
                <Text className="text-xs text-gray-700 leading-5">{current.description}</Text>
              </View>
            ) : null}

            {/* Other alerts at the same county — tap to swap the detail view */}
            {otherAlerts.length > 0 ? (
              <View className="mt-4">
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {labels.pinPopupOtherAlerts}
                </Text>
                <View className="gap-1.5">
                  {otherAlerts.map((alt) => {
                    const altColor = weatherPinColor(alt.event);
                    const altWhen = fmt(alt.sent_at) ?? '—';
                    return (
                      <Pressable
                        key={alt.id}
                        onPress={() => setCurrent(alt)}
                        className="flex-row items-center gap-2 px-2 py-2 rounded-lg active:bg-gray-100"
                      >
                        <View
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: altColor }}
                        />
                        <View className="flex-1 min-w-0">
                          <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>
                            {alt.event}
                          </Text>
                          <Text className="text-[10px] text-gray-500" numberOfLines={1}>
                            {alt.severity ? `${alt.severity} · ` : ''}{altWhen}
                          </Text>
                        </View>
                        <ArrowRight size={12} color="#9CA3AF" />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {nwsUrl ? (
            <View className="p-5 pt-3 border-t border-gray-100">
              <Pressable
                onPress={() => Linking.openURL(nwsUrl).catch(() => {})}
                className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 active:opacity-80"
              >
                <Text className="text-sm font-semibold text-white">{labels.pinPopupOpenNws}</Text>
                <ExternalLink size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </RNModal>
  );
}

// ─── Unresolved-clients modal ───────────────────────────────────────────
// Lists every client with missing lat/lng so the user can see WHICH ones
// failed and tap to fix the address manually. Grouped by failure reason:
//   - no_address : client has no street/city/state at all
//   - not_found  : geocoder couldn't resolve the address
//   - pending    : never tried OR cooldown expired (eligible for retry)
function UnresolvedClientsModal({
  onClose,
  onOpenClient,
  onRetry,
  retrying,
  onChanged,
}: {
  onClose: () => void;
  onOpenClient: (id: string) => void;
  onRetry: () => void;
  retrying: boolean;
  // Fires after an ignore (or any future side-effect) so the parent can
  // re-fetch pins and the banner count drops without closing the modal.
  onChanged?: () => void;
}) {
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map;
  const supabase = createSupabaseClient();
  type Row = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    lat_lookup_attempted_at: string | null;
    lat_lookup_failed_reason: string | null;
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company, address, city, state, zip_code, lat_lookup_attempted_at, lat_lookup_failed_reason')
        .eq('business_id', business.id)
        // Hide rows the user has already silenced from the list (migration 047).
        .eq('geocoding_ignored', false)
        .is('lat', null)
        .order('first_name', { ascending: true });
      if (!cancelled) {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  const groups = useMemo(() => {
    const noAddress: Row[] = [];
    const notFound: Row[] = [];
    const pending: Row[] = [];
    for (const r of rows) {
      const hasAnyAddress = !!(r.address || r.city || r.state || r.zip_code);
      if (!hasAnyAddress || r.lat_lookup_failed_reason === 'no_address') {
        noAddress.push(r);
      } else if (r.lat_lookup_failed_reason && r.lat_lookup_failed_reason !== 'no_address') {
        notFound.push(r);
      } else {
        pending.push(r);
      }
    }
    return { noAddress, notFound, pending };
  }, [rows]);

  // Mark a client as permanently ignored. Drops it from the local list
  // immediately (optimistic), persists via UPDATE, then signals the
  // parent so the banner count + map data refresh.
  const ignoreRow = async (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase
      .from('clients')
      .update({ geocoding_ignored: true })
      .eq('id', id);
    if (error) {
      // Revert the optimistic removal so the user can retry.
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company, address, city, state, zip_code, lat_lookup_attempted_at, lat_lookup_failed_reason')
        .eq('id', id)
        .maybeSingle();
      if (data) setRows(prev => [...prev, data as Row].sort((a, b) =>
        (a.first_name ?? '').localeCompare(b.first_name ?? '')));
      return;
    }
    onChanged?.();
  };

  const renderRow = (r: Row, hint?: string) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || t.geocodeListUnnamed;
    const addr = [r.address, r.city, r.state, r.zip_code].filter(Boolean).join(', ');
    return (
      <View key={r.id} className="flex-row items-start border-b border-gray-100">
        <Pressable
          onPress={() => onOpenClient(r.id)}
          className="flex-1 px-4 py-3 active:bg-gray-50"
        >
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{name}</Text>
          {r.company ? (
            <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>{r.company}</Text>
          ) : null}
          <Text className="text-xs text-gray-400 mt-1" numberOfLines={2}>
            {addr || '—'}
          </Text>
          {hint ? (
            <Text className="text-[10px] text-gray-400 italic mt-1" numberOfLines={2}>{hint}</Text>
          ) : null}
        </Pressable>
        {/* Per-row "permanently ignore" — sets clients.geocoding_ignored=true
           so this client stops counting against the banner. Hits stay
           reversible via SQL or future settings UI. */}
        <Pressable
          onPress={() => void ignoreRow(r.id)}
          accessibilityLabel={t.geocodeIgnoreBtn}
          hitSlop={6}
          className="py-3 pr-4 pl-2 active:opacity-60"
        >
          <EyeOff size={16} color="#9CA3AF" />
        </Pressable>
      </View>
    );
  };

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
        <View
          className="bg-white rounded-3xl w-full max-w-sm"
          style={{
            maxHeight: '85%',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <View className="flex-row items-center gap-3 p-5 pb-3 border-b border-gray-100">
            <View className="w-10 h-10 rounded-2xl items-center justify-center bg-sky-100">
              <Users size={20} color="#0EA5E9" />
            </View>
            <Text className="flex-1 text-base font-bold text-gray-900">{t.geocodeListTitle}</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1">
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {loading ? (
              <View className="py-12 items-center">
                <ActivityIndicator size="small" color="#4F46E5" />
              </View>
            ) : rows.length === 0 ? (
              <Text className="text-xs text-gray-400 italic text-center py-8">
                {t.geocodeListEmpty}
              </Text>
            ) : (
              <>
                {groups.pending.length > 0 ? (
                  <View>
                    <Text className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      {t.geocodeListSectionPending} ({groups.pending.length})
                    </Text>
                    {groups.pending.map((r) => renderRow(r))}
                  </View>
                ) : null}
                {groups.notFound.length > 0 ? (
                  <View>
                    <Text className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      {t.geocodeListSectionUnresolved} ({groups.notFound.length})
                    </Text>
                    {groups.notFound.map((r) => renderRow(r, t.geocodeListUnresolvedHint))}
                  </View>
                ) : null}
                {groups.noAddress.length > 0 ? (
                  <View>
                    <Text className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      {t.geocodeListSectionNoAddress} ({groups.noAddress.length})
                    </Text>
                    {groups.noAddress.map((r) => renderRow(r, t.geocodeListNoAddressHint))}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {groups.pending.length > 0 ? (
            <View className="p-5 pt-3 border-t border-gray-100">
              <Pressable
                onPress={onRetry}
                disabled={retrying}
                className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 active:opacity-80"
              >
                {retrying ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text className="text-sm font-semibold text-white">{t.geocodeListRetryBtn}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </RNModal>
  );
}

function fmtPhonePretty(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

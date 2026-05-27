'use client';

// Map module — web. Counterpart to mobile/modules/map/MapScreen.tsx but
// uses @react-google-maps/api (the Google Maps JS API wrapper) instead of
// react-native-maps. Same data shape, same three pin layers, same Google
// Geocoding backfill flow.
//
// Lazy-loaded via next/dynamic from the module route stub — its chunk
// only downloads when the user visits /dashboard/modulos/map.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleMap,
  useJsApiLoader,
} from '@react-google-maps/api';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { Users, Briefcase, UserCircle2, X, Settings as SettingsIcon, Search as SearchIcon, CloudLightning, ExternalLink, MapPin as MapPinIcon, Calendar, Crosshair } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import type { MapPinIcon as MapPinIconKey } from '@amixos/shared/lib/mapPinPresets';
import { resolvePinStyle } from '@amixos/shared/lib/mapPinResolve';
import {
  isWeatherFeatureEnabled,
  groupWeatherAlertsBySameCode,
  haversineMiles,
  normalizeWeatherConfig,
} from '@amixos/shared/lib/weather';
import { expandStateQuery, haystackMatchesWithStates } from '@amixos/shared/lib/usStates';
import { pinBadgeToDataUrl } from './pinIcons';
import { MapSettingsPanel, type DeviceMapSettings } from './MapSettingsPanel';
import { Modal } from '@/components/ui/Modal';
import { createSupabaseClient } from '@/lib/supabase';

type Layer = 'clients' | 'jobs' | 'employees';

// Pin payload — raw rule-matchable fields included so the client can
// apply pin-style rules locally via resolvePinStyle. Legacy color/icon
// fields are ignored when present (old API responses).
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
  color?: string;
  icon?: MapPinIconKey;
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
  icon?: MapPinIconKey;
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
  icon?: MapPinIconKey;
}
// Weather alerts come from a separate endpoint (api.weather.gov via our API).
// Fixed style — no per-business rules.
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
const WEATHER_LAYER_COLOR = '#DC2626';
const WEATHER_EVENT_COLOR: Record<string, string> = {
  'tornado warning':             '#7C2D12',
  'tornado watch':               '#B91C1C',
  'severe thunderstorm warning': '#DC2626',
  'severe thunderstorm watch':   '#EA580C',
  'high wind warning':           '#D97706',
  'high wind watch':             '#F59E0B',
  'flood warning':               '#1D4ED8',
  'flash flood warning':         '#1E40AF',
  'winter storm warning':        '#0EA5E9',
  'blizzard warning':            '#0369A1',
};
function weatherPinColor(event: string): string {
  return WEATHER_EVENT_COLOR[event.toLowerCase()] ?? WEATHER_LAYER_COLOR;
}

function isWeatherExpired(p: { expires_at?: string | null }): boolean {
  if (!p.expires_at) return false;
  return new Date(p.expires_at).getTime() < Date.now();
}

// Short relative-duration label. Matches the mobile helper.
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
  geocodeBreakdown?: GeocodeBreakdown;
}

const LAYER_COLORS: Record<Layer, string> = {
  clients:   '#0EA5E9',
  jobs:      '#10B981',
  employees: '#F59E0B',
};

// Default center: continental US. Replaced by the centroid of visible
// pins once data loads.
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };

// Substring search across every text field on a pin (standard cols +
// custom_fields values). Case-insensitive. Caller pre-lowercases.
function pinMatchesQuery(p: AnyPin, q: string): boolean {
  const fields: (string | null | undefined)[] = [];
  if (p.type === 'client') {
    fields.push(p.first_name, p.last_name, p.company, p.phone_cell, p.phone_office,
                p.email_office, p.email_home, p.address, p.city, p.state, p.zip_code);
  } else if (p.type === 'job') {
    fields.push(p.title, p.description, p.status, p.priority, p.client_name,
                p.job_address, p.job_city, p.job_state);
  } else if (p.type === 'employee') {
    fields.push(p.first_name, p.last_name, p.role, p.job_title);
  } else if (p.type === 'weather') {
    fields.push(p.event, p.headline, p.area_desc, p.county, p.state, p.severity);
  }
  const cf = (p as { custom_fields?: Record<string, unknown> | null }).custom_fields;
  if (cf && typeof cf === 'object') {
    for (const v of Object.values(cf)) if (v != null) fields.push(String(v));
  }
  // Expand state-name queries to also match abbreviations ("Nebraska" → "NE")
  // with word-boundary matching on 2-letter terms — keeps "ne" from
  // matching "Stone" / "Larned" / etc.
  const stateTerms = expandStateQuery(q);
  for (const f of fields) {
    if (typeof f !== 'string') continue;
    if (haystackMatchesWithStates(f, q, stateTerms)) return true;
  }
  return false;
}

const DEVICE_SETTINGS_KEY = 'map_device_settings_v1';
const DEFAULT_DEVICE_SETTINGS: DeviceMapSettings = {
  mapType: 'roadmap',
  clustering: true,
  pinSize: 'medium',
};

// Pixel size for the marker icon at each pin-size preset. Larger sizes
// produce sharper icons since the SVG is re-rasterized by the browser.
const PIN_PX_BY_SIZE: Record<DeviceMapSettings['pinSize'], number> = {
  small: 22,
  medium: 32,
  large: 44,
};

export default function MapModule() {
  const router = useRouter();
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: 'amixos-map',
  });

  const [pins, setPins] = useState<PinsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{ done: number; total: number } | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    clients: true,
    jobs: true,
    employees: true,
  });
  const [weatherLayerOn, setWeatherLayerOn] = useState(true);
  // "Storm focus" mode — when on, hide every pin EXCEPT weather alerts
  // and non-weather pins within `proximity_radius_miles` of any alert.
  const [stormFocus, setStormFocus] = useState(false);
  // Modal listing every client with missing lat/lng — opened from the
  // geocode banner so the user can see WHICH clients failed.
  const [unresolvedOpen, setUnresolvedOpen] = useState(false);
  // Hides the geocode banner for this map view session ("deal with it
  // later"). Resets when the screen unmounts.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [weatherPins, setWeatherPins] = useState<WeatherPin[]>([]);
  const weatherEnabled = isWeatherFeatureEnabled(business?.id);
  const [selected, setSelected] = useState<AnyPin | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deviceSettings, setDeviceSettings] = useState<DeviceMapSettings>(DEFAULT_DEVICE_SETTINGS);
  // Holds the live google.maps.Map instance so we can attach markers +
  // clusterer imperatively (the @react-google-maps/api <Marker> doesn't
  // play well with @googlemaps/markerclusterer in newer versions).
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);

  const apiBaseUrl = getApiBaseUrl();

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

  // Weather alerts — only fetched when the alpha business gate is on.
  // POST /weather/refresh (server skips NWS call if cache is fresh) then
  // GET /weather/alerts.
  const loadWeather = useCallback(async () => {
    if (!business || !apiBaseUrl || !weatherEnabled) return;
    try {
      const jwt = await getJwt();
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
  }, [business, apiBaseUrl, weatherEnabled]);

  useEffect(() => { void loadWeather(); }, [loadWeather]);

  // Hydrate device settings on mount; persist on every change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(DEVICE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DeviceMapSettings>;
        setDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS, ...parsed });
      }
    } catch {
      // ignore
    }
  }, []);
  const updateDeviceSettings = (next: DeviceMapSettings) => {
    setDeviceSettings(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(next));
    }
  };

  // Compute initial center + zoom from visible pins, mirroring the
  // mobile region calculation. Only recomputed on first data load —
  // toggling layers re-renders without forcing a recenter.
  const initialCenter = useMemo(() => {
    if (!pins) return DEFAULT_CENTER;
    const all: AnyPin[] = [...pins.clients, ...pins.jobs, ...pins.employees];
    if (all.length === 0) return DEFAULT_CENTER;
    const lats = all.map(p => p.lat);
    const lngs = all.map(p => p.lng);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }, [pins]);

  // Weather alerts grouped by SAME code so each county/state renders one
  // marker with a "+N" badge when multiple alerts share the location.
  // Group filter keeps the group when ANY of its alerts matches the
  // current search query.
  const weatherGroups = useMemo(() => {
    if (!weatherEnabled || !weatherLayerOn) return [];
    const groups = groupWeatherAlertsBySameCode(weatherPins);
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.all.some(a => pinMatchesQuery(a, q)));
  }, [weatherEnabled, weatherLayerOn, weatherPins, search]);

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
    const weatherPrimaries: AnyPin[] = weatherGroups.map(g => g.primary);

    // Storm-focus mode: drop any non-weather pin that isn't within
    // `proximity_radius_miles` of an alert. Skipped when no alerts exist
    // so the user doesn't accidentally wipe the map.
    if (stormFocus && weatherEnabled && weatherPins.length > 0) {
      const radius = normalizeWeatherConfig(business?.weather_config).proximity_radius_miles;
      const anchors = weatherPins.map(w => ({ lat: w.lat, lng: w.lng }));
      nonWeather = nonWeather.filter(p =>
        anchors.some(a => haversineMiles(a, { lat: p.lat, lng: p.lng }) <= radius),
      );
    }

    const q = search.trim().toLowerCase();
    if (!q) return [...nonWeather, ...weatherPrimaries];
    return [...nonWeather.filter(p => pinMatchesQuery(p, q)), ...weatherPrimaries];
  }, [pins, layers, search, weatherGroups, stormFocus, weatherEnabled, weatherPins, business?.weather_config]);

  // Auto-fit the map to search results so the user lands on them.
  useEffect(() => {
    if (!search.trim() || !mapRef.current || visiblePins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    visiblePins.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(bounds);
    // For a single result, fitBounds zooms too far in — set a sane max.
    if (visiblePins.length === 1) {
      const listener = google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
        if (mapRef.current && (mapRef.current.getZoom() ?? 0) > 14) mapRef.current.setZoom(14);
      });
      // Cleanup if effect re-runs before idle fires.
      return () => google.maps.event.removeListener(listener);
    }
  }, [search, visiblePins]);

  // Imperative marker + clusterer wiring. Rebuilds when pins, clustering
  // toggle, or pin size changes. We intentionally rebuild rather than
  // diff — the marker count is bounded (few hundred) and the rebuild is
  // cheap; diffing would add a lot of bookkeeping for negligible gain.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    // Tear down previous round.
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const px = PIN_PX_BY_SIZE[deviceSettings.pinSize];
    const hpx = Math.round(px * 1.25);
    // Resolve styles per pin; null means a hide rule matched → skip it.
    const newMarkers: google.maps.Marker[] = [];
    for (const p of visiblePins) {
      // Weather pins run through the same resolver so per-event rules
      // (e.g. event = 'Tornado Warning' → red tornado icon) apply.
      const layerKey =
        p.type === 'client'  ? 'clients'  as const :
        p.type === 'job'     ? 'jobs'     as const :
        p.type === 'weather' ? 'weather'  as const :
                               'employees' as const;
      const layerCfg = business?.map_pin_config?.[layerKey];
      const style = resolvePinStyle(layerKey, layerCfg, p as unknown as Record<string, unknown>);
      if (style === null) continue;
      const siblingCount =
        p.type === 'weather' ? (siblingsByWeatherId.get(p.id)?.length ?? 0) : 0;
      const iconUrl = pinBadgeToDataUrl(
        style.icon,
        style.color,
        px,
        style.iconColor,
        siblingCount > 0 ? siblingCount : undefined,
      );
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(px, hpx),
          anchor: new google.maps.Point(px / 2, hpx),
        },
      });
      marker.addListener('click', () => setSelected(p));
      newMarkers.push(marker);
    }
    markersRef.current = newMarkers;

    if (deviceSettings.clustering) {
      clustererRef.current = new MarkerClusterer({ map, markers: newMarkers });
    } else {
      newMarkers.forEach(m => m.setMap(map));
    }
    // Cleanup on unmount happens via the next-render teardown path above.
    // Include map_pin_config so saving new rules in the settings panel
    // triggers a marker rebuild with the new colors/icons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, visiblePins, deviceSettings.clustering, deviceSettings.pinSize, JSON.stringify(business?.map_pin_config), siblingsByWeatherId]);

  const onGeocode = async () => {
    if (!business || !apiBaseUrl) return;
    setGeocoding(true);
    // Total = pending only (rows that can still be geocoded). Server
    // breakdown distinguishes "no address" + "unresolved" so the
    // denominator stays meaningful when those exist.
    const initialPending = pins?.geocodeBreakdown?.pending ?? pins?.needsGeocoding ?? 0;
    let totalGeocoded = 0;
    setGeocodeProgress({ done: 0, total: initialPending });
    try {
      const jwt = await getJwt();
      // Loop until server returns attempted=0. Safety cap = 50 batches.
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
        if (attempted === 0) break;
      }
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
    if (selected.type === 'client') {
      router.push(`/dashboard/clientes/${id}`);
    } else if (selected.type === 'job') {
      router.push(`/dashboard/trabajos/${id}`);
    } else if (selected.type === 'employee') {
      const jobId = selected.job_id;
      if (jobId) router.push(`/dashboard/trabajos/${jobId}`);
    }
    // Weather: no detail route; the weather card has its own NWS-link button.
  };

  if (!apiKey) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center max-w-md mx-auto">
          <p className="text-sm font-semibold text-red-600 mb-1">Missing API key</p>
          <p className="text-xs text-gray-500">
            Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>web/.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Layer pills + toggle hint + search. Pills scroll horizontally
         (4 pills can overflow narrow viewports); the gear stays pinned right. */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
            <LayerPill
              Icon={Users}
              label={t.layers.clients}
              color={LAYER_COLORS.clients}
              active={layers.clients}
              count={pins?.clients.length ?? 0}
              onClick={() => setLayers(l => ({ ...l, clients: !l.clients }))}
            />
            <LayerPill
              Icon={Briefcase}
              label={t.layers.jobs}
              color={LAYER_COLORS.jobs}
              active={layers.jobs}
              count={pins?.jobs.length ?? 0}
              onClick={() => setLayers(l => ({ ...l, jobs: !l.jobs }))}
            />
            <LayerPill
              Icon={UserCircle2}
              label={t.layers.employees}
              color={LAYER_COLORS.employees}
              active={layers.employees}
              count={pins?.employees.length ?? 0}
              onClick={() => setLayers(l => ({ ...l, employees: !l.employees }))}
            />
            {weatherEnabled ? (
              <LayerPill
                Icon={CloudLightning}
                label={t.weather.layerName}
                color={WEATHER_LAYER_COLOR}
                active={weatherLayerOn}
                count={weatherPins.length}
                onClick={() => setWeatherLayerOn(v => !v)}
              />
            ) : null}
          </div>
          {weatherEnabled ? (
            <button
              onClick={() => setStormFocus(v => !v)}
              className={`p-2 rounded-lg border ${stormFocus ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              aria-label={stormFocus ? t.weather.focusModeOff : t.weather.focusModeOn}
              title={stormFocus ? t.weather.focusModeOff : t.weather.focusModeOn}
            >
              <Crosshair size={18} className={stormFocus ? 'text-red-600' : 'text-gray-700'} />
            </button>
          ) : null}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            aria-label={t.settingsTitle}
          >
            <SettingsIcon size={18} />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1 ml-1">{t.layerToggleHint}</p>
      </div>

      {/* Search — filters pins across all text fields. Map auto-fits to results. */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white">
          <SearchIcon size={14} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
            autoCorrect="off"
            autoCapitalize="none"
          />
          {search && (
            <>
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {t.searchResultsCount.replace('{{count}}', String(visiblePins.length))}
              </span>
              <button onClick={() => setSearch('')} aria-label="Clear">
                <X size={14} className="text-gray-400" />
              </button>
            </>
          )}
        </div>
        {/* Storm-focus active banner — under the search bar so the
           "what's being filtered" context lives next to the filter inputs. */}
        {stormFocus && weatherEnabled ? (
          <div className="flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100">
            <Crosshair size={12} className="text-red-600 shrink-0" />
            <span className="text-[11px] font-semibold text-red-700 flex-1">
              {t.weather.focusModeBadge}
            </span>
            <button onClick={() => setStormFocus(false)} aria-label="Clear">
              <X size={12} className="text-red-600" />
            </button>
          </div>
        ) : null}
      </div>

      {/* The map itself — fills the rest of the viewport. */}
      <div className="relative flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-gray-100">
        {!isLoaded || loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={initialCenter}
            zoom={pins && visiblePins.length > 0 ? 10 : 4}
            mapTypeId={deviceSettings.mapType}
            onLoad={(m) => { mapRef.current = m; }}
            onUnmount={() => {
              if (clustererRef.current) clustererRef.current.clearMarkers();
              markersRef.current.forEach(mk => mk.setMap(null));
              clustererRef.current = null;
              markersRef.current = [];
              mapRef.current = null;
            }}
            options={{
              disableDefaultUI: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
            }}
          />
        )}

        {/* Geocode banner — tap opens the list of affected clients so the
           user can see which ones are missing coords + jump to fix. The X
           dismisses for this session (resets when leaving + returning). */}
        {!loading && pins && pins.needsGeocoding > 0 && !bannerDismissed ? (
          <button
            onClick={() => setUnresolvedOpen(true)}
            disabled={geocoding}
            className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md rounded-2xl bg-white border border-gray-200 shadow-md px-4 py-3 flex items-center gap-3 hover:bg-gray-50 disabled:opacity-60"
          >
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
              <Users size={16} className="text-sky-500" />
            </div>
            <div className="flex-1 text-left">
              <span className="block text-sm text-gray-900">
                {geocoding && geocodeProgress
                  ? t.geocodeProgress
                      .replace('{{done}}', String(geocodeProgress.done))
                      .replace('{{total}}', String(geocodeProgress.total))
                  : geocoding
                    ? t.geocodeRunning
                    : t.geocodeMissing.replace('{{count}}', String(pins.needsGeocoding))}
              </span>
              {!geocoding && pins.geocodeBreakdown ? (
                <span className="block text-xs text-gray-500 mt-0.5">
                  {t.geocodeBreakdown
                    .replace('{{noAddr}}', String(pins.geocodeBreakdown.noAddress))
                    .replace('{{unresolved}}', String(pins.geocodeBreakdown.unresolved))
                    .replace('{{pending}}', String(pins.geocodeBreakdown.pending))}
                </span>
              ) : null}
            </div>
            {/* Dismiss for this session. Rendered as a span (not button)
               so it stays inside the parent <button> without nested-button
               warnings; the click handler stops propagation so the parent's
               onClick (open list) doesn't also fire. */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setBannerDismissed(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  setBannerDismissed(true);
                }
              }}
              className="ml-auto p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              aria-label="Dismiss"
            >
              <X size={16} />
            </span>
          </button>
        ) : null}

        {/* Selected pin sheet — mirrors the mobile bottom-sheet pattern. */}
        {selected && selected.type === 'weather' ? (
          <WeatherPinCard
            selected={selected}
            siblings={siblingsByWeatherId.get(selected.id) ?? []}
            onClose={() => setSelected(null)}
            labels={t.weather}
          />
        ) : selected ? (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white rounded-2xl border border-gray-100 shadow-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: `${
                    selected.type === 'client'
                      ? LAYER_COLORS.clients
                      : selected.type === 'job'
                        ? LAYER_COLORS.jobs
                        : LAYER_COLORS.employees
                  }15`,
                }}
              >
                {selected.type === 'client' ? (
                  <Users size={20} color={LAYER_COLORS.clients} />
                ) : selected.type === 'job' ? (
                  <Briefcase size={20} color={LAYER_COLORS.jobs} />
                ) : (
                  <UserCircle2 size={20} color={LAYER_COLORS.employees} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-gray-900 truncate">
                  {selected.type === 'client'
                    ? `${selected.first_name} ${selected.last_name}`
                    : selected.type === 'job'
                      ? selected.title
                      : selected.type === 'employee'
                        ? `${selected.first_name} ${selected.last_name}`
                        : ''}
                </p>
                {selected.type === 'client' && selected.company ? (
                  <p className="text-xs text-gray-500 truncate">{selected.company}</p>
                ) : selected.type === 'job' && selected.client_name ? (
                  <p className="text-xs text-gray-500 truncate">{selected.client_name}</p>
                ) : selected.type === 'employee' && selected.job_title ? (
                  <p className="text-xs text-gray-500 truncate">
                    {t.assignedToJob}: {selected.job_title}
                  </p>
                ) : null}
              </div>
              <button onClick={() => setSelected(null)} className="p-1 -mr-1 text-gray-500 hover:text-gray-900">
                <X size={18} />
              </button>
            </div>
            <button
              onClick={openSelected}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {t.openRecord}
            </button>
          </div>
        ) : null}
      </div>

      {/* Settings panel — gear icon in the layer-pill row triggers this.
         Pin rules save to DB; map type/clustering/size persist locally. */}
      <MapSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deviceSettings={deviceSettings}
        onDeviceSettingsChange={updateDeviceSettings}
        onPinConfigSaved={() => void load()}
      />

      {/* Unresolved-clients list — opened by tapping the geocode banner. */}
      {unresolvedOpen ? (
        <UnresolvedClientsModal
          onClose={() => setUnresolvedOpen(false)}
          onOpenClient={(id) => {
            setUnresolvedOpen(false);
            router.push(`/dashboard/clientes/${id}`);
          }}
          onRetry={async () => {
            setUnresolvedOpen(false);
            await onGeocode();
          }}
          retrying={geocoding}
        />
      ) : null}
    </div>
  );
}

interface LayerPillProps {
  Icon: typeof Users;
  label: string;
  color: string;
  active: boolean;
  count: number;
  onClick: () => void;
}

// ─── Weather-pin card ───────────────────────────────────────────────────
// Multi-alert detail card. When `siblings` is non-empty the bottom of the
// card shows a tappable list of other alerts at the same county so the
// user can flip between them without closing the popup.
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
  const [current, setCurrent] = useState<WeatherPin>(selected);
  useEffect(() => { setCurrent(selected); }, [selected.id]);

  // All alerts at this location (current + siblings - self) sorted newest-first.
  const allAtLocation = useMemo(() => {
    const dedupe = new Map<string, WeatherPin>();
    dedupe.set(current.id, current);
    for (const s of siblings) dedupe.set(s.id, s);
    if (selected.id !== current.id) dedupe.set(selected.id, selected);
    return Array.from(dedupe.values()).sort((a, b) => {
      const ta = new Date(a.sent_at ?? a.fetched_at ?? 0).getTime();
      const tb = new Date(b.sent_at ?? b.fetched_at ?? 0).getTime();
      return tb - ta;
    });
  }, [current, selected, siblings]);
  const otherAlerts = allAtLocation.filter(a => a.id !== current.id);

  const color = weatherPinColor(current.event);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);
  const startTime = fmt(current.effective_at);
  const endTime = fmt(current.ends_at ?? current.expires_at);
  const sentTime = fmt(current.sent_at);
  const addedTime = fmt(current.fetched_at);
  const nwsUrl = current.nws_url ?? (current.alert_id.startsWith('http') ? current.alert_id : null);

  const rows: Array<[string, string]> = [];
  if (current.headline) rows.push([labels.pinPopupHeadline, current.headline]);
  rows.push([labels.pinPopupEvent, current.event]);
  if (current.severity) rows.push([labels.pinPopupSeverity, current.severity]);
  if (current.county) rows.push([labels.pinPopupCity, current.county]);
  if (current.state) rows.push([labels.pinPopupState, current.state]);
  if (current.area_desc) rows.push([labels.pinPopupArea, current.area_desc]);
  if (startTime) rows.push([labels.pinPopupStarts, startTime]);
  if (endTime) rows.push([labels.pinPopupEnds, endTime]);
  if (sentTime) rows.push([labels.pinPopupSent, sentTime]);
  if (addedTime) rows.push([labels.pinPopupAdded, addedTime]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white rounded-2xl border border-gray-100 shadow-xl flex flex-col" style={{ maxHeight: '85%' }}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3 border-b border-gray-100 shrink-0">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <CloudLightning size={22} color={color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-900 line-clamp-2">{current.event}</p>
          {current.severity ? (
            <p className="text-[10px] uppercase tracking-wide font-semibold mt-0.5" style={{ color }}>
              {current.severity}
            </p>
          ) : null}
        </div>
        <button onClick={onClose} className="p-1 -mr-1 text-gray-500 hover:text-gray-900">
          <X size={18} />
        </button>
      </div>

      {/* Scrollable detail body */}
      <div className="overflow-y-auto px-4 py-3">
        <dl className="divide-y divide-gray-50">
          {rows.map(([label, value]) => (
            <div key={label} className="flex py-1.5">
              <dt className="w-[42%] text-[10px] font-semibold uppercase tracking-wide text-gray-400 pt-0.5">
                {label}
              </dt>
              <dd className="flex-1 text-xs text-gray-800">{value}</dd>
            </div>
          ))}
        </dl>
        {current.description ? (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
              {labels.pinPopupDescription}
            </p>
            <p className="text-xs text-gray-700 whitespace-pre-line leading-5">
              {current.description}
            </p>
          </div>
        ) : null}

        {/* Other alerts at this same county — tap to swap detail view */}
        {otherAlerts.length > 0 ? (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {labels.pinPopupOtherAlerts}
            </p>
            <div className="space-y-1">
              {otherAlerts.map(alt => {
                const altColor = weatherPinColor(alt.event);
                const altWhen = fmt(alt.sent_at) ?? '—';
                return (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => setCurrent(alt)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: altColor }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-gray-800 truncate">{alt.event}</span>
                      <span className="block text-[10px] text-gray-500 truncate">
                        {alt.severity ? `${alt.severity} · ` : ''}{altWhen}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {nwsUrl ? (
        <div className="p-4 pt-3 border-t border-gray-100 shrink-0">
          <a
            href={nwsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {labels.pinPopupOpenNws}
            <ExternalLink size={14} />
          </a>
        </div>
      ) : null}
    </div>
  );
}

// ─── Unresolved-clients modal ───────────────────────────────────────────
function UnresolvedClientsModal({
  onClose,
  onOpenClient,
  onRetry,
  retrying,
}: {
  onClose: () => void;
  onOpenClient: (id: string) => void;
  onRetry: () => void;
  retrying: boolean;
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

  const renderRow = (r: Row, hint?: string) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || t.geocodeListUnnamed;
    const addr = [r.address, r.city, r.state, r.zip_code].filter(Boolean).join(', ');
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => onOpenClient(r.id)}
        className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
      >
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        {r.company ? <p className="text-xs text-gray-500 mt-0.5 truncate">{r.company}</p> : null}
        <p className="text-xs text-gray-400 mt-1 truncate">{addr || '—'}</p>
        {hint ? <p className="text-[10px] text-gray-400 italic mt-1">{hint}</p> : null}
      </button>
    );
  };

  return (
    <Modal open onClose={onClose} title={t.geocodeListTitle} size="sm">
      <div className="-mx-7 -my-6 flex flex-col" style={{ maxHeight: '70vh' }}>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-8">
              {t.geocodeListEmpty}
            </p>
          ) : (
            <>
              {groups.pending.length > 0 ? (
                <div>
                  <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {t.geocodeListSectionPending} ({groups.pending.length})
                  </p>
                  {groups.pending.map((r) => renderRow(r))}
                </div>
              ) : null}
              {groups.notFound.length > 0 ? (
                <div>
                  <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {t.geocodeListSectionUnresolved} ({groups.notFound.length})
                  </p>
                  {groups.notFound.map((r) => renderRow(r, t.geocodeListUnresolvedHint))}
                </div>
              ) : null}
              {groups.noAddress.length > 0 ? (
                <div>
                  <p className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {t.geocodeListSectionNoAddress} ({groups.noAddress.length})
                  </p>
                  {groups.noAddress.map((r) => renderRow(r, t.geocodeListNoAddressHint))}
                </div>
              ) : null}
            </>
          )}
        </div>
        {groups.pending.length > 0 ? (
          <div className="p-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {t.geocodeListRetryBtn}
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function LayerPill({ Icon, label, color, active, count, onClick }: LayerPillProps) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold transition-opacity whitespace-nowrap ${
        active ? '' : 'opacity-50'
      }`}
      style={{ backgroundColor: active ? `${color}20` : '#F3F4F6', color: active ? color : '#6B7280' }}
    >
      <Icon size={14} />
      {label}
      <span
        className="bg-white/70 rounded-full px-1.5 py-0.5 min-w-[20px] text-center text-[10px] font-bold"
        style={{ color: active ? color : '#6B7280' }}
      >
        {count}
      </span>
    </button>
  );
}

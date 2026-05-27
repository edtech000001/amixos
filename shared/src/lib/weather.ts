// Shared types + helpers for the weather alerts feature on the Map module.
// Data shape mirrors what's stored in `businesses.weather_config` (jsonb) and
// what the API returns from `/weather/alerts`.

// Hard alpha gate: only this business sees the weather UI / can hit the API.
// Once we promote past alpha, replace these checks with a feature_flags column.
export const WEATHER_ALPHA_BUSINESS_IDS: ReadonlyArray<string> = [
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae',
];

export function isWeatherFeatureEnabled(businessId: string | null | undefined): boolean {
  if (!businessId) return false;
  return WEATHER_ALPHA_BUSINESS_IDS.includes(businessId);
}

export interface WeatherEventFilter {
  event: string;             // NOAA `event` string e.g. 'Tornado Warning'
  min_wind_speed?: number | null; // optional mph threshold (parsed from description)
  // Per-row enable switch so the user can keep a preset list saved but
  // toggle individual entries on/off without deleting them. Defaults to
  // `true` for legacy rows where the field doesn't exist yet (treat
  // missing OR true as enabled; only explicit `false` skips).
  enabled?: boolean;
}

// Canonical NOAA NWS alert event names, grouped by category for the picker UI.
// Source: api.weather.gov/alerts/types (curated to the ~60 events users actually
// care about — full list is ~130, mostly marine/aviation/tsunami specialty types).
//
// Names must match NOAA's `event` field exactly (case-sensitive on NOAA's side,
// case-insensitive in our matcher). Update this list if NOAA adds new types.
export interface WeatherEventCategory {
  category: string; // i18n key, see dashboard.modules.map.weather.eventCategories
  events: string[];
}

export const NOAA_EVENT_CATEGORIES: WeatherEventCategory[] = [
  {
    category: 'severe',
    events: [
      'Tornado Warning',
      'Tornado Watch',
      'Severe Thunderstorm Warning',
      'Severe Thunderstorm Watch',
      'Severe Weather Statement',
      'Special Weather Statement',
      'Extreme Wind Warning',
    ],
  },
  {
    category: 'wind',
    events: [
      'High Wind Warning',
      'High Wind Watch',
      'Wind Advisory',
      'Dust Storm Warning',
      'Dust Advisory',
      'Blowing Dust Advisory',
    ],
  },
  {
    category: 'flood',
    events: [
      'Flash Flood Warning',
      'Flash Flood Watch',
      'Flash Flood Statement',
      'Flood Warning',
      'Flood Watch',
      'Flood Advisory',
      'Flood Statement',
      'Coastal Flood Warning',
      'Coastal Flood Watch',
      'Coastal Flood Advisory',
    ],
  },
  {
    category: 'winter',
    events: [
      'Blizzard Warning',
      'Winter Storm Warning',
      'Winter Storm Watch',
      'Winter Weather Advisory',
      'Ice Storm Warning',
      'Lake Effect Snow Warning',
      'Lake Effect Snow Watch',
      'Lake Effect Snow Advisory',
      'Snow Squall Warning',
    ],
  },
  {
    category: 'temperature',
    events: [
      'Excessive Heat Warning',
      'Excessive Heat Watch',
      'Heat Advisory',
      'Wind Chill Warning',
      'Wind Chill Watch',
      'Wind Chill Advisory',
      'Hard Freeze Warning',
      'Hard Freeze Watch',
      'Freeze Warning',
      'Freeze Watch',
      'Frost Advisory',
    ],
  },
  {
    category: 'tropical',
    events: [
      'Hurricane Warning',
      'Hurricane Watch',
      'Tropical Storm Warning',
      'Tropical Storm Watch',
      'Storm Surge Warning',
      'Storm Surge Watch',
      'Tropical Depression Local Statement',
    ],
  },
  {
    category: 'fire',
    events: [
      'Red Flag Warning',
      'Fire Weather Watch',
      'Air Quality Alert',
    ],
  },
  {
    category: 'tsunami',
    events: [
      'Tsunami Warning',
      'Tsunami Advisory',
      'Tsunami Watch',
    ],
  },
  {
    category: 'general',
    events: [
      'Hazardous Weather Outlook',
      'Dense Fog Advisory',
      'Dense Smoke Advisory',
      'Earthquake Warning',
      'Volcano Warning',
      'Civil Emergency Message',
    ],
  },
];

export const ALL_NOAA_EVENTS: ReadonlyArray<string> = NOAA_EVENT_CATEGORIES.flatMap(
  (c) => c.events,
);

export interface WeatherConfig {
  enabled: boolean;
  refresh_minutes: number;       // how often the API re-fetches NWS
  // How long expired/older alerts stay in the cache before being purged.
  // Active alerts are always kept; this only governs the trailing window
  // for already-expired or stale rows (useful for "alerts in the last N
  // days" review). Clamped to 1-90.
  retention_days: number;
  // Radius (miles) used by the map's "storm focus" toggle. When on, only
  // weather alerts + clients/jobs/employees within this radius of any
  // alert render. Clamped to 1-500.
  proximity_radius_miles: number;
  excluded_states: string[];     // 2-letter codes, e.g. ['AK','HI','CA']
  events: WeatherEventFilter[];
}

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  enabled: false,
  refresh_minutes: 10,
  retention_days: 15,
  proximity_radius_miles: 50,
  excluded_states: ['AK', 'HI', 'CA'],
  events: [
    { event: 'Tornado Warning', min_wind_speed: null },
    { event: 'Tornado Watch', min_wind_speed: null },
    { event: 'Severe Thunderstorm Warning', min_wind_speed: 60 },
    { event: 'High Wind Warning', min_wind_speed: 50 },
  ],
};

export function normalizeWeatherConfig(raw: unknown): WeatherConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEATHER_CONFIG };
  const r = raw as Partial<WeatherConfig>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : false,
    refresh_minutes:
      typeof r.refresh_minutes === 'number' && r.refresh_minutes >= 1
        ? Math.min(r.refresh_minutes, 240)
        : DEFAULT_WEATHER_CONFIG.refresh_minutes,
    retention_days:
      typeof r.retention_days === 'number' && r.retention_days >= 1
        ? Math.min(r.retention_days, 90)
        : DEFAULT_WEATHER_CONFIG.retention_days,
    proximity_radius_miles:
      typeof r.proximity_radius_miles === 'number' && r.proximity_radius_miles >= 1
        ? Math.min(r.proximity_radius_miles, 500)
        : DEFAULT_WEATHER_CONFIG.proximity_radius_miles,
    excluded_states: Array.isArray(r.excluded_states)
      ? r.excluded_states
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length > 0)
      : [],
    events: Array.isArray(r.events)
      ? r.events
          .filter((e): e is WeatherEventFilter => !!e && typeof (e as any).event === 'string')
          .map((e) => ({
            event: String(e.event).trim(),
            min_wind_speed:
              typeof e.min_wind_speed === 'number' && e.min_wind_speed > 0
                ? e.min_wind_speed
                : null,
            // Default to enabled when missing (legacy rows pre-enable flag).
            enabled: e.enabled === false ? false : true,
          }))
          .filter((e) => e.event.length > 0)
      : [],
  };
}

// Shape the API returns per pin.
export interface WeatherAlertPin {
  id: string;
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
  effective_at: string | null;
  expires_at: string | null;
  ends_at: string | null;
  sent_at: string | null;
  nws_url: string | null; // built from alert_id
}

// Parse a wind speed (mph) from a NOAA description or parameters.windGust array.
// Mirrors the user's existing Google Apps Script logic.
const WIND_PATTERNS: RegExp[] = [
  /wind\s+gust(?:s)?\s+(?:up\s+to\s+)?(\d{2,3})\s*mph/i,
  /gust(?:s)?\s+(?:up\s+to\s+)?(\d{2,3})\s*mph/i,
  /(\d{2,3})\s*mph\s+gust/i,
  /winds?\s+(?:up\s+to\s+)?(\d{2,3})\s*mph/i,
];

export function parseMaxWindMph(description: string | null | undefined): number | null {
  if (!description) return null;
  let best: number | null = null;
  for (const re of WIND_PATTERNS) {
    const m = description.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && (best === null || n > best)) best = n;
    }
  }
  return best;
}

// Great-circle distance (miles) between two lat/lng points. Used by the
// "storm focus" map filter to find clients/jobs/employees within X miles
// of any active weather alert.
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R_MI = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(x));
}

// Group alerts by SAME code (= unique county/state location). Each group's
// `primary` is the most-recently-sent alert (so a fresh event "wins" the
// pin), and `siblings` is everything else at that location. The map renders
// one marker per group; the popup card can switch between siblings.
export function groupWeatherAlertsBySameCode<
  T extends { same_code: string; sent_at?: string | null; fetched_at?: string | null }
>(alerts: T[]): Array<{ primary: T; siblings: T[]; all: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const a of alerts) {
    const key = a.same_code;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  return Array.from(buckets.values()).map((bucket) => {
    // Newest first — sent_at if present, else fetched_at, else 0.
    bucket.sort((a, b) => {
      const ta = new Date(a.sent_at ?? a.fetched_at ?? 0).getTime();
      const tb = new Date(b.sent_at ?? b.fetched_at ?? 0).getTime();
      return tb - ta;
    });
    return { primary: bucket[0], siblings: bucket.slice(1), all: bucket };
  });
}

// Returns true if an alert (event + parsed max wind) matches the config.
export function alertMatchesConfig(
  alert: { event: string; maxWind?: number | null },
  config: WeatherConfig,
): boolean {
  if (!config.enabled) return false;
  const filter = config.events.find(
    (e) => e.event.toLowerCase() === alert.event.toLowerCase(),
  );
  if (!filter) return false;
  if (filter.min_wind_speed && filter.min_wind_speed > 0) {
    if (alert.maxWind == null) return false;
    if (alert.maxWind < filter.min_wind_speed) return false;
  }
  return true;
}

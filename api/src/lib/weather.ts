// Local copy of shared/src/lib/weather.ts since the API package is isolated
// from @amixos/shared (rootDir scoped to ./src). Keep this in sync with
// shared/src/lib/weather.ts when the shape evolves.

export const WEATHER_ALPHA_BUSINESS_IDS: ReadonlyArray<string> = [
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae',
];

export function isWeatherFeatureEnabled(businessId: string | null | undefined): boolean {
  if (!businessId) return false;
  return WEATHER_ALPHA_BUSINESS_IDS.includes(businessId);
}

export interface WeatherEventFilter {
  event: string;
  min_wind_speed?: number | null;
  // Default true if missing; explicit `false` skips this filter at refresh.
  enabled?: boolean;
}

export interface WeatherConfig {
  enabled: boolean;
  refresh_minutes: number;
  retention_days: number;
  excluded_states: string[];
  events: WeatherEventFilter[];
}

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  enabled: false,
  refresh_minutes: 10,
  retention_days: 15,
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
    excluded_states: Array.isArray(r.excluded_states)
      ? r.excluded_states
          .filter((s: unknown): s is string => typeof s === 'string')
          .map((s: string) => s.trim().toUpperCase())
          .filter((s: string) => s.length > 0)
      : [],
    events: Array.isArray(r.events)
      ? r.events
          .filter((e: any): e is WeatherEventFilter => !!e && typeof e.event === 'string')
          .map((e: WeatherEventFilter) => ({
            event: String(e.event).trim(),
            min_wind_speed:
              typeof e.min_wind_speed === 'number' && e.min_wind_speed > 0
                ? e.min_wind_speed
                : null,
            enabled: e.enabled === false ? false : true,
          }))
          .filter((e: WeatherEventFilter) => e.event.length > 0)
      : [],
  };
}

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

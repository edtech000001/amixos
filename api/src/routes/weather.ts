// Weather alerts route — pulls active NOAA api.weather.gov alerts, filters by
// the business's weather_config, resolves SAME codes → city/state, lazily
// geocodes to lat/lng, caches in public.weather_alerts.
//
// Feature is alpha-gated via WEATHER_ALPHA_BUSINESS_IDS (api/src/lib/weather.ts)
// in addition to the standard business-membership check.

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { geocodeAddress } from '../lib/geocoding';
import {
  isWeatherFeatureEnabled,
  normalizeWeatherConfig,
  parseMaxWindMph,
  WeatherConfig,
  WEATHER_ALPHA_BUSINESS_IDS,
} from '../lib/weather';

export const weatherRouter = Router();
// Cron paths authenticate via X-Cron-Secret header inside the handler
// instead of a user JWT. Skip the JWT middleware for them; every other
// path still runs through `authenticate`.
weatherRouter.use((req, res, next) => {
  if (req.path.startsWith('/cron/')) return next();
  return authenticate(req as AuthRequest, res, next);
});

const NWS_ENDPOINT = 'https://api.weather.gov/alerts/active';
const USER_AGENT = 'Amixos/1.0 (support@amixos.app)';

interface NoaaAlertFeature {
  id?: string;
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    headline?: string;
    description?: string;
    areaDesc?: string;
    effective?: string;
    expires?: string;
    ends?: string;
    sent?: string;
    geocode?: { SAME?: string[] };
    parameters?: Record<string, unknown>;
  };
}

interface NoaaAlertsResponse {
  features?: NoaaAlertFeature[];
}

async function assertMember(userId: string, businessId: string): Promise<boolean> {
  const { data } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  return !!data;
}

async function loadConfig(businessId: string): Promise<WeatherConfig | null> {
  const { data } = await supabase
    .from('businesses')
    .select('weather_config')
    .eq('id', businessId)
    .maybeSingle();
  if (!data) return null;
  return normalizeWeatherConfig(data.weather_config);
}

// Outcome of one refresh attempt. Helper returns this instead of writing
// to res so it can be called from both /refresh (with auth) and the
// /cron/refresh-all loop.
type RefreshOutcome =
  | { status: 'ok'; inserted: number; fetched_at: string; candidates: number }
  | { status: 'skipped'; reason: 'disabled' | 'fresh' | 'no_matches'; age_seconds?: number }
  | { status: 'error'; httpStatus: number; message: string };

async function refreshBusinessAlerts(
  businessId: string,
  opts: { force?: boolean } = {},
): Promise<RefreshOutcome> {
  const config = await loadConfig(businessId);
  if (!config || !config.enabled) {
    return { status: 'skipped', reason: 'disabled' };
  }

  // Freshness check: skip the NWS call if the cache is younger than refresh_minutes.
  if (!opts.force) {
    const { data: last } = await supabase
      .from('weather_alerts')
      .select('fetched_at')
      .eq('business_id', businessId)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.fetched_at) {
      const ageMs = Date.now() - new Date(last.fetched_at).getTime();
      if (ageMs < config.refresh_minutes * 60_000) {
        return { status: 'skipped', reason: 'fresh', age_seconds: Math.floor(ageMs / 1000) };
      }
    }
  }

  // Fetch NWS.
  let noaa: NoaaAlertsResponse;
  try {
    const r = await fetch(NWS_ENDPOINT, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' } });
    if (!r.ok) return { status: 'error', httpStatus: 502, message: `NWS HTTP ${r.status}` };
    noaa = (await r.json()) as NoaaAlertsResponse;
  } catch (e) {
    return { status: 'error', httpStatus: 502, message: `NWS fetch failed: ${String(e)}` };
  }

  const features = noaa.features ?? [];
  // Only consider enabled rows. Missing `enabled` treated as enabled (legacy).
  const activeEvents = config.events.filter((e) => e.enabled !== false);
  const eventNamesLc = new Set(activeEvents.map((e) => e.event.toLowerCase()));
  const minWindByEvent = new Map<string, number | null>();
  for (const e of activeEvents) minWindByEvent.set(e.event.toLowerCase(), e.min_wind_speed ?? null);
  const excludedStates = new Set(config.excluded_states.map((s) => s.toUpperCase()));

  // Collect (alert, same_code) pairs that pass the event + wind filter.
  const candidatePairs: Array<{ feature: NoaaAlertFeature; sameCode: string; maxWind: number | null }> = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const event = props.event ?? '';
    if (!eventNamesLc.has(event.toLowerCase())) continue;
    const maxWind = parseMaxWindMph(props.description ?? null);
    const minWind = minWindByEvent.get(event.toLowerCase()) ?? null;
    // Only filter when the alert actually reports a parseable wind speed —
    // setting a minimum on an event type whose description doesn't include
    // an mph number (e.g. Tornado Warning) shouldn't silently drop every
    // matching alert. Front-end hides the input on those events too, but
    // this guard catches custom event names + any future NOAA shape change.
    if (minWind && maxWind != null && maxWind < minWind) continue;
    const sames = props.geocode?.SAME ?? [];
    for (const sameCode of sames) {
      if (typeof sameCode !== 'string') continue;
      candidatePairs.push({ feature: f, sameCode, maxWind });
    }
  }

  // Retention prune — drop rows older than retention_days regardless of
  // whether NOAA returned anything this round. Active alerts get a fresh
  // fetched_at via the upsert below; truly stale ones age out.
  const retentionCutoff = new Date(Date.now() - config.retention_days * 86_400_000).toISOString();
  await supabase
    .from('weather_alerts')
    .delete()
    .eq('business_id', businessId)
    .lt('fetched_at', retentionCutoff);

  if (candidatePairs.length === 0) {
    return { status: 'skipped', reason: 'no_matches' };
  }

  // Look up same_codes for every candidate SAME at once.
  const uniqueSames = Array.from(new Set(candidatePairs.map((p) => p.sameCode)));
  const { data: sameRows } = await supabase
    .from('same_codes')
    .select('code, county, state, lat, lng')
    .in('code', uniqueSames);
  const sameMap = new Map<string, { county: string; state: string; lat: number | null; lng: number | null }>();
  for (const r of sameRows ?? []) {
    sameMap.set(r.code, { county: r.county, state: r.state, lat: r.lat, lng: r.lng });
  }

  // Lazy-geocode any SAME row missing lat/lng (county + state level).
  for (const code of uniqueSames) {
    const row = sameMap.get(code);
    if (!row) continue;
    if (excludedStates.has(row.state)) continue;
    if (row.lat != null && row.lng != null) continue;
    const addr = `${row.county} County, ${row.state}, USA`;
    const result = await geocodeAddress(addr);
    if (result.ok) {
      row.lat = result.lat;
      row.lng = result.lng;
      await supabase
        .from('same_codes')
        .update({ lat: result.lat, lng: result.lng, geocoded_at: new Date().toISOString() })
        .eq('code', code);
    }
  }

  // Build upsert rows.
  const fetchedAt = new Date().toISOString();
  const inserts = [] as Array<Record<string, unknown>>;
  const seenKeys = new Set<string>();
  for (const { feature, sameCode } of candidatePairs) {
    const row = sameMap.get(sameCode);
    if (!row) continue;
    if (excludedStates.has(row.state)) continue;
    if (row.lat == null || row.lng == null) continue;
    const props = feature.properties ?? {};
    const alertId = props.id ?? feature.id ?? '';
    if (!alertId) continue;
    const key = `${alertId}::${sameCode}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    inserts.push({
      business_id: businessId,
      alert_id: alertId,
      event: props.event ?? '',
      severity: props.severity ?? null,
      headline: props.headline ?? null,
      description: props.description ?? null,
      area_desc: props.areaDesc ?? null,
      same_code: sameCode,
      county: row.county,
      state: row.state,
      lat: row.lat,
      lng: row.lng,
      effective_at: props.effective ?? null,
      expires_at: props.expires ?? null,
      ends_at: props.ends ?? null,
      sent_at: props.sent ?? null,
      fetched_at: fetchedAt,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase
      .from('weather_alerts')
      .upsert(inserts, { onConflict: 'business_id,alert_id,same_code' });
    if (error) return { status: 'error', httpStatus: 500, message: error.message };
  }

  return { status: 'ok', inserted: inserts.length, fetched_at: fetchedAt, candidates: candidatePairs.length };
}

/**
 * GET /api/v1/weather/config?business_id=...
 * Returns the normalized weather_config so clients always read a consistent shape.
 */
weatherRouter.get('/config', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });
  if (!isWeatherFeatureEnabled(businessId)) {
    return res.status(403).json({ success: false, message: 'weather feature not enabled for this business' });
  }
  if (!(await assertMember(userId, businessId))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const config = await loadConfig(businessId);
  return res.json({ success: true, data: { config } });
});

/**
 * PUT /api/v1/weather/config
 * Body: { business_id, config: WeatherConfig }
 */
weatherRouter.put('/config', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, config } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!isWeatherFeatureEnabled(business_id)) {
    return res.status(403).json({ success: false, message: 'weather feature not enabled for this business' });
  }
  if (!(await assertMember(userId, business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const normalized = normalizeWeatherConfig(config);
  const { error } = await supabase
    .from('businesses')
    .update({ weather_config: normalized })
    .eq('id', business_id);
  if (error) return res.status(500).json({ success: false, message: error.message });

  return res.json({ success: true, data: { config: normalized } });
});

/**
 * GET /api/v1/weather/alerts?business_id=...
 * Returns the cached weather_alerts rows for the business. Does NOT refresh.
 */
weatherRouter.get('/alerts', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });
  if (!isWeatherFeatureEnabled(businessId)) {
    return res.status(403).json({ success: false, message: 'weather feature not enabled for this business' });
  }
  if (!(await assertMember(userId, businessId))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const { data, error } = await supabase
    .from('weather_alerts')
    .select('id, alert_id, event, severity, headline, description, area_desc, same_code, county, state, lat, lng, effective_at, expires_at, ends_at, sent_at, fetched_at')
    .eq('business_id', businessId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('fetched_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });

  // Return ALL cached alerts within the retention window — expired ones
  // included. The map paints them at reduced opacity + flags them as
  // expired in the popup so a user who skips a day still sees what hit
  // their area. The retention-prune in /refresh handles the time bound;
  // here we only filter out rows whose expires_at is so far in the past
  // they're below the configured retention (defensive — prune should
  // already have dropped them, but the cache may be stale between runs).
  const rows = data ?? [];

  // Most recent fetched_at across remaining rows (or null if none).
  const lastFetched = rows.length > 0 ? rows[0].fetched_at : null;

  const pins = rows.map((a) => ({
    ...a,
    nws_url: a.alert_id?.startsWith('http') ? a.alert_id : null,
  }));

  return res.json({ success: true, data: { alerts: pins, fetched_at: lastFetched } });
});

/**
 * POST /api/v1/weather/refresh
 * Body: { business_id, force? = false }
 *
 * Pulls api.weather.gov/alerts/active once, filters by the business's
 * weather_config, replaces the business's weather_alerts rows.
 *
 * If `force` is false and the cache is fresher than refresh_minutes, this is
 * a no-op (returns the existing rows). The Map UI calls this on open.
 */
weatherRouter.post('/refresh', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, force } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }
  if (!isWeatherFeatureEnabled(business_id)) {
    return res.status(403).json({ success: false, message: 'weather feature not enabled for this business' });
  }
  if (!(await assertMember(userId, business_id))) {
    return res.status(403).json({ success: false, message: 'forbidden' });
  }

  const outcome = await refreshBusinessAlerts(business_id, { force: !!force });
  if (outcome.status === 'error') {
    return res.status(outcome.httpStatus).json({ success: false, message: outcome.message });
  }
  if (outcome.status === 'skipped') {
    return res.json({ success: true, data: { skipped: outcome.reason, age_seconds: outcome.age_seconds, inserted: 0 } });
  }
  return res.json({ success: true, data: outcome });
});

/**
 * POST /api/v1/weather/cron/refresh-all
 *
 * Server-side cron endpoint. Auth is a shared-secret header (no JWT) so a
 * scheduler (Cloud Scheduler / cron-job.org / GitHub Actions) can hit it
 * without a user session. The endpoint iterates every alpha-gated business,
 * runs the same refresh logic the /refresh route does, and returns a
 * per-business outcome summary.
 *
 * Set CRON_SECRET in cloudrun.env.yaml. Scheduler must send the same value
 * in the `X-Cron-Secret` header.
 */
weatherRouter.post('/cron/refresh-all', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const got = req.headers['x-cron-secret'];
  if (!expected) return res.status(500).json({ success: false, message: 'CRON_SECRET not configured' });
  if (got !== expected) return res.status(401).json({ success: false, message: 'invalid cron secret' });

  // Loop over every alpha-gated business + run the refresh.
  // refreshBusinessAlerts skips when weather_config.enabled = false, so we
  // don't need to pre-filter here.
  const results: Record<string, RefreshOutcome> = {};
  for (const businessId of WEATHER_ALPHA_BUSINESS_IDS) {
    results[businessId] = await refreshBusinessAlerts(businessId, { force: true });
  }
  return res.json({ success: true, data: results });
});


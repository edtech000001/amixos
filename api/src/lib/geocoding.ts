// Server-side geocoding via Google's Geocoding API. Lives on the API
// (not the client) so the API key isn't exposed and so we can rate-limit
// + cache results in one place.
//
// Cost: $5 per 1000 requests (after the $200/mo free credit). The Map
// module calls this lazily — only when a client's row has a NULL lat/lng
// — and writes the result back to clients.lat / clients.lng so we don't
// re-geocode on every page load.

import { supabase } from '../config/supabase';

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

interface GeocodeResult {
  ok: true;
  lat: number;
  lng: number;
}
interface GeocodeFailure {
  ok: false;
  reason: 'no_key' | 'no_address' | 'not_found' | 'http_error' | 'parse_error';
  details?: string;
}
export type GeocodeOutcome = GeocodeResult | GeocodeFailure;

/**
 * Geocode a single freeform address string. Concatenate address line +
 * city + state + zip BEFORE calling this — the API works best with a
 * single combined string, not separate fields.
 */
export async function geocodeAddress(addressLine: string): Promise<GeocodeOutcome> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };
  if (!addressLine.trim()) return { ok: false, reason: 'no_address' };

  const url = new URL(GEOCODE_BASE);
  url.searchParams.set('address', addressLine);
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    return { ok: false, reason: 'http_error', details: String(e) };
  }
  if (!res.ok) return { ok: false, reason: 'http_error', details: `HTTP ${res.status}` };

  const json = (await res.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    error_message?: string;
  };

  if (json.status !== 'OK' || !json.results?.length) {
    return {
      ok: false,
      reason: 'not_found',
      details: json.error_message ?? json.status ?? 'unknown',
    };
  }

  const loc = json.results[0].geometry?.location;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    return { ok: false, reason: 'parse_error' };
  }
  return { ok: true, lat: loc.lat, lng: loc.lng };
}

export interface GeocodePlace {
  lat: number;
  lng: number;
  /** Google's own formatted name ("Wichita, KS, USA") — shown back to the
   *  user so they can tell a wrong match from a right one. */
  label: string;
  /** Google's suggested viewport. Lets the client frame a whole state or a
   *  single street correctly instead of guessing a zoom delta. */
  bounds: { north: number; south: number; east: number; west: number } | null;
}

/**
 * Geocode a freeform place query typed into the map's search box ("Wichita
 * KS", "78701", "Texas"). Separate from geocodeAddress() because the map
 * needs the viewport for zoom and a label to display, not just a point.
 *
 * Results are memoized for the process lifetime: place searches repeat
 * constantly ("Wichita" as someone types and retypes) and every miss is a
 * billable Google call.
 */
const placeCache = new Map<string, GeocodePlace | null>();
const PLACE_CACHE_MAX = 500;

export async function geocodePlace(
  query: string,
): Promise<{ ok: true; place: GeocodePlace } | GeocodeFailure> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };
  const q = query.trim();
  if (!q) return { ok: false, reason: 'no_address' };

  const cacheKey = q.toLowerCase();
  if (placeCache.has(cacheKey)) {
    const hit = placeCache.get(cacheKey) ?? null;
    return hit ? { ok: true, place: hit } : { ok: false, reason: 'not_found' };
  }

  const url = new URL(GEOCODE_BASE);
  url.searchParams.set('address', q);
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    return { ok: false, reason: 'http_error', details: String(e) };
  }
  if (!res.ok) return { ok: false, reason: 'http_error', details: `HTTP ${res.status}` };

  const json = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: {
        location?: { lat?: number; lng?: number };
        viewport?: {
          northeast?: { lat?: number; lng?: number };
          southwest?: { lat?: number; lng?: number };
        };
      };
    }>;
    error_message?: string;
  };

  // ZERO_RESULTS is a legitimate answer, not an error — cache it so a typo
  // typed repeatedly doesn't bill on every keystroke.
  if (json.status === 'ZERO_RESULTS') {
    rememberPlace(cacheKey, null);
    return { ok: false, reason: 'not_found' };
  }
  if (json.status !== 'OK' || !json.results?.length) {
    return { ok: false, reason: 'not_found', details: json.error_message ?? json.status ?? 'unknown' };
  }

  const top = json.results[0];
  const loc = top.geometry?.location;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    return { ok: false, reason: 'parse_error' };
  }

  const ne = top.geometry?.viewport?.northeast;
  const sw = top.geometry?.viewport?.southwest;
  const bounds =
    typeof ne?.lat === 'number' && typeof ne?.lng === 'number' &&
    typeof sw?.lat === 'number' && typeof sw?.lng === 'number'
      ? { north: ne.lat, east: ne.lng, south: sw.lat, west: sw.lng }
      : null;

  const place: GeocodePlace = {
    lat: loc.lat,
    lng: loc.lng,
    label: top.formatted_address ?? q,
    bounds,
  };
  rememberPlace(cacheKey, place);
  return { ok: true, place };
}

function rememberPlace(key: string, value: GeocodePlace | null): void {
  // Crude cap — drop the oldest insertion once full. Map preserves insertion
  // order, so the first key is the oldest.
  if (placeCache.size >= PLACE_CACHE_MAX) {
    const oldest = placeCache.keys().next().value;
    if (oldest !== undefined) placeCache.delete(oldest);
  }
  placeCache.set(key, value);
}

interface AddressFields {
  id: string;
  address: string | null;
  address_line2?: string | null; // employees/jobs have no line 2 — optional
  city: string | null;
  state: string | null;
  zip_code?: string | null; // jobs have no zip — optional
}

/**
 * Build a single freeform address line from a row's address fields.
 * Returns empty string if there's nothing useful to geocode.
 */
function buildAddressLine(c: AddressFields): string {
  return [c.address, c.address_line2, c.city, c.state, c.zip_code]
    .filter(s => !!s && String(s).trim())
    .join(', ');
}

/**
 * Backfill lat/lng for every client in a business that's missing them.
 * Returns counts so the UI can show a useful summary. Caps at maxRows
 * per call so a runaway business with 10k clients doesn't blow the API
 * budget in a single click — caller can run multiple times to finish.
 *
 * Failures get a 30-day cooldown via clients.lat_lookup_attempted_at so
 * a row Google can never resolve doesn't burn quota on every refresh.
 * Address-fix edits should clear that timestamp if you want immediate
 * retry — currently we rely on the 30-day window.
 */
const RETRY_COOLDOWN_DAYS = 30;

export async function geocodeMissingClients(
  businessId: string,
  maxRows: number = 100,
): Promise<{ attempted: number; geocoded: number; failed: number }> {
  // Eligible rows = missing coords AND (never attempted OR last attempt
  // was older than the cooldown). We pick a cutoff as ISO timestamp so
  // Postgres can compare directly.
  const cutoff = new Date(Date.now() - RETRY_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from('clients')
    .select('id, address, address_line2, city, state, zip_code')
    .eq('business_id', businessId)
    // Skip rows the user explicitly told us to ignore (migration 047) —
    // otherwise every Reintentar would re-burn quota on them.
    .eq('geocoding_ignored', false)
    .is('lat', null)
    .or(`lat_lookup_attempted_at.is.null,lat_lookup_attempted_at.lt.${cutoff}`)
    .limit(maxRows);

  const rows = (data ?? []) as AddressFields[];
  let geocoded = 0;
  let failed = 0;

  for (const c of rows) {
    const line = buildAddressLine(c);
    const nowIso = new Date().toISOString();
    if (!line) {
      failed++;
      await supabase
        .from('clients')
        .update({
          lat_lookup_attempted_at: nowIso,
          lat_lookup_failed_reason: 'no_address',
        })
        .eq('id', c.id);
      continue;
    }
    const result = await geocodeAddress(line);
    if (!result.ok) {
      failed++;
      await supabase
        .from('clients')
        .update({
          lat_lookup_attempted_at: nowIso,
          lat_lookup_failed_reason: result.reason,
        })
        .eq('id', c.id);
      continue;
    }
    await supabase
      .from('clients')
      .update({
        lat: result.lat,
        lng: result.lng,
        lat_lookup_attempted_at: null,
        lat_lookup_failed_reason: null,
      })
      .eq('id', c.id);
    geocoded++;
  }

  return { attempted: rows.length, geocoded, failed };
}

/**
 * Backfill lat/lng for a business's ACTIVE employees that are missing them —
 * the Crew Finder's fallback location (home address) when a worker has no
 * current job to derive their position from. Same cooldown / cap / write-back
 * semantics as geocodeMissingClients. Employees have no address_line2.
 */
/**
 * Backfill job_lat/job_lng for a business's jobs that have an address but no
 * coordinates — so typed-in and CSV-imported addresses get a Map pin without
 * the user pasting coordinates. Same cooldown / cap / write-back semantics as
 * geocodeMissingClients. Jobs with no address fields at all are excluded by
 * the query (most jobs have no address — don't burn rows/attempts on them).
 * Requires migration 109 (lat_lookup columns on jobs).
 */
export async function geocodeMissingJobs(
  businessId: string,
  maxRows: number = 100,
): Promise<{ attempted: number; geocoded: number; failed: number }> {
  const cutoff = new Date(Date.now() - RETRY_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from('jobs')
    .select('id, address:job_address, city:job_city, state:job_state')
    .eq('business_id', businessId)
    .eq('geocoding_ignored', false)
    .is('job_lat', null)
    // At least one address part present (multiple .or() calls AND together).
    .or('job_address.not.is.null,job_city.not.is.null,job_state.not.is.null')
    .or(`lat_lookup_attempted_at.is.null,lat_lookup_attempted_at.lt.${cutoff}`)
    .limit(maxRows);

  const rows = (data ?? []) as unknown as AddressFields[];
  let geocoded = 0;
  let failed = 0;

  for (const j of rows) {
    const line = buildAddressLine(j);
    const nowIso = new Date().toISOString();
    if (!line) {
      failed++;
      await supabase
        .from('jobs')
        .update({ lat_lookup_attempted_at: nowIso, lat_lookup_failed_reason: 'no_address' })
        .eq('id', j.id);
      continue;
    }
    const result = await geocodeAddress(line);
    if (!result.ok) {
      failed++;
      await supabase
        .from('jobs')
        .update({ lat_lookup_attempted_at: nowIso, lat_lookup_failed_reason: result.reason })
        .eq('id', j.id);
      continue;
    }
    await supabase
      .from('jobs')
      .update({ job_lat: result.lat, job_lng: result.lng, lat_lookup_attempted_at: null, lat_lookup_failed_reason: null })
      .eq('id', j.id);
    geocoded++;
  }

  return { attempted: rows.length, geocoded, failed };
}

export async function geocodeMissingEmployees(
  businessId: string,
  maxRows: number = 100,
): Promise<{ attempted: number; geocoded: number; failed: number }> {
  const cutoff = new Date(Date.now() - RETRY_COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from('employees')
    .select('id, address, city, state, zip_code')
    .eq('business_id', businessId)
    .eq('active', true)
    .eq('geocoding_ignored', false)
    .is('lat', null)
    .or(`lat_lookup_attempted_at.is.null,lat_lookup_attempted_at.lt.${cutoff}`)
    .limit(maxRows);

  const rows = (data ?? []) as AddressFields[];
  let geocoded = 0;
  let failed = 0;

  for (const e of rows) {
    const line = buildAddressLine(e);
    const nowIso = new Date().toISOString();
    if (!line) {
      failed++;
      await supabase
        .from('employees')
        .update({ lat_lookup_attempted_at: nowIso, lat_lookup_failed_reason: 'no_address' })
        .eq('id', e.id);
      continue;
    }
    const result = await geocodeAddress(line);
    if (!result.ok) {
      failed++;
      await supabase
        .from('employees')
        .update({ lat_lookup_attempted_at: nowIso, lat_lookup_failed_reason: result.reason })
        .eq('id', e.id);
      continue;
    }
    await supabase
      .from('employees')
      .update({ lat: result.lat, lng: result.lng, lat_lookup_attempted_at: null, lat_lookup_failed_reason: null })
      .eq('id', e.id);
    geocoded++;
  }

  return { attempted: rows.length, geocoded, failed };
}

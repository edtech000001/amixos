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

interface ClientToGeocode {
  id: string;
  address: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

/**
 * Build a single freeform address line from a client's address fields.
 * Returns empty string if there's nothing useful to geocode.
 */
function buildAddressLine(c: ClientToGeocode): string {
  return [c.address, c.address_line2, c.city, c.state, c.zip_code]
    .filter(s => !!s && String(s).trim())
    .join(', ');
}

/**
 * Backfill lat/lng for every client in a business that's missing them.
 * Returns counts so the UI can show a useful summary. Caps at maxRows
 * per call so a runaway business with 10k clients doesn't blow the API
 * budget in a single click — caller can run multiple times to finish.
 */
export async function geocodeMissingClients(
  businessId: string,
  maxRows: number = 100,
): Promise<{ attempted: number; geocoded: number; failed: number }> {
  const { data } = await supabase
    .from('clients')
    .select('id, address, address_line2, city, state, zip_code')
    .eq('business_id', businessId)
    .is('lat', null)
    .limit(maxRows);

  const rows = (data ?? []) as ClientToGeocode[];
  let geocoded = 0;
  let failed = 0;

  for (const c of rows) {
    const line = buildAddressLine(c);
    if (!line) {
      failed++;
      continue;
    }
    const result = await geocodeAddress(line);
    if (!result.ok) {
      failed++;
      continue;
    }
    await supabase
      .from('clients')
      .update({ lat: result.lat, lng: result.lng })
      .eq('id', c.id);
    geocoded++;
  }

  return { attempted: rows.length, geocoded, failed };
}

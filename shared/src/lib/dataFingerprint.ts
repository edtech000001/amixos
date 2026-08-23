// Client half of the data_fingerprint probe (migration 208).
//
// Pass the result to useSwr's `fingerprint` option and that screen stops
// refetching when nothing changed:
//
//   const fp = useDataFingerprint(supabase, business?.id, ['employees', 'timesheets']);
//   const q  = useSwr(key, fetcher, { cacheKey, resetKey, fingerprint: fp });
//
// The probe is one small RPC (a count + max(updated_at) per domain over an
// indexed business_id) standing in for a screen's whole payload. Because it
// asks the SERVER, it notices edits made anywhere — another device, a
// teammate, an outbox flush — which purely local invalidation cannot.

import { useCallback } from 'react';

/** Domains understood by the RPC. Anything else stamps 'unknown' server-side. */
export type FingerprintDomain =
  | 'jobs'
  | 'invoices'
  | 'clients'
  | 'employees'
  | 'timesheets'
  | 'price_sheets'
  | 'inventory'
  | 'files'
  | 'templates'
  | 'business';

interface SupabaseLike {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** Short window in which repeat calls reuse one in-flight RPC. A screen often
 *  runs several useSwr hooks over the same domains; without this they would
 *  each probe separately on the same open. */
const DEDUPE_MS = 2000;

const cache = new Map<string, { at: number; value: Promise<string | null> }>();

async function probe(
  supabase: SupabaseLike,
  businessId: string,
  domains: FingerprintDomain[],
): Promise<string | null> {
  const { data, error } = await supabase.rpc('data_fingerprint', {
    p_business_id: businessId,
    p_domains: domains,
  });
  // Null on any failure: the caller treats that as "can't tell", and falls back
  // to a normal refetch. A broken probe must never freeze a stale cache.
  if (error || data == null || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const parts = domains.map((d) => `${d}=${String(row[d] ?? '?')}`);
  // Any 'unknown' means the server didn't recognise a domain — usually a typo
  // or a migration that hasn't run. Refuse to vouch for the cache.
  if (parts.some((p) => p.endsWith('=unknown') || p.endsWith('=?'))) return null;
  return parts.join('|');
}

export function fingerprintFor(
  supabase: SupabaseLike,
  businessId: string,
  domains: FingerprintDomain[],
): Promise<string | null> {
  const key = `${businessId}:${[...domains].sort().join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DEDUPE_MS) return hit.value;
  const value = probe(supabase, businessId, domains).catch(() => null);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Stable `fingerprint` callback for useSwr. Returns undefined (probe disabled,
 *  so useSwr keeps its always-revalidate behaviour) until the business is
 *  known. */
export function useDataFingerprint(
  supabase: SupabaseLike,
  businessId: string | null | undefined,
  domains: FingerprintDomain[],
): (() => Promise<string | null>) | undefined {
  const key = [...domains].sort().join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fn = useCallback(
    () => (businessId ? fingerprintFor(supabase, businessId, key.split(',') as FingerprintDomain[]) : Promise.resolve(null)),
    [supabase, businessId, key],
  );
  return businessId ? fn : undefined;
}

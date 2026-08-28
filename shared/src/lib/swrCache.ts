// Stale-while-revalidate data loading — the app's "instant open" layer.
//
// The old pattern (loadCached in mobile/lib/offline/cache.ts) is FETCH-first:
// it awaits the network and only serves the cached copy when the fetch throws,
// so online users stare at a spinner for the full round trip. This layer flips
// that: cached data renders immediately, the fetch runs in the background, and
// fresh rows swap in without ever blanking the screen.
//
// Storage is the cross-platform kvStore (AsyncStorage native / localStorage
// web) using the SAME key format as mobile/lib/offline/cache.ts
// (`amixos_cache_<key>` + `__ts` sibling) — so the offline outbox's
// writeCached/prependCached/patchCached optimistic updates remain visible to
// SWR reads with zero changes.
//
// Usage:
//   const { data, loading, refreshing, refresh, mutate } = useSwr(
//     ready ? `jobs_${params}` : null,            // fetchKey: identifies THIS query
//     () => fetchPage(...),                       // must THROW on error
//     { cacheKey: isDefaultView ? `jobs_list_v2_${biz}_${loc}` : null,
//       resetKey: `${biz}_${loc}` },              // data clears when this changes
//   );
//
// Semantics:
// - fetchKey null → disabled (nothing fetches; e.g. business not settled yet).
// - fetchKey change → fetch (deduped across mounted hooks); previous data STAYS
//   on screen while `refreshing` (filter changes never blank the list).
// - resetKey change → data cleared first (a business/branch switch must never
//   flash the previous tenant's rows).
// - cacheKey set → hydrate from disk on mount + persist fresh results
//   (optionally trimmed via cacheTrim to respect storage budgets).
// - refresh() → revalidate, throttled (focusThrottleMs, default 15s) so focus
//   listeners don't hammer the network; refresh({ force: true }) bypasses.
// - fingerprint set → the hook first asks for a cheap stamp of the underlying
//   data (see migration 208's data_fingerprint RPC). Stamp unchanged since the
//   cached payload was written → the heavy fetch is SKIPPED and the cache is
//   served as-is. Stamp moved → refetch immediately. This is what lets rarely
//   changing screens (Empleados, Archivos, Precios, Ajustes) open instantly
//   without going stale, and it catches edits from other devices and
//   teammates — not just mutations this client made.

import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet, kvRemove, kvRemoveMany, kvKeys } from './kvStore';

const PREFIX = 'amixos_cache_';
const TS_SUFFIX = '__ts';
// Per-entry persisted cap — Android's AsyncStorage has a ~6MB TOTAL budget.
// Caps only the on-disk copy; the caller always gets full fresh data.
const MAX_ENTRY_BYTES = 1_000_000;

/** Serialize, trimming an over-cap ARRAY to the items that fit (lists are
 *  newest-first so the relevant rows survive). Null = too big to cache. */
function serializeWithinCap(value: unknown): string | null {
  let json = JSON.stringify(value);
  if (json == null) return null;
  if (json.length <= MAX_ENTRY_BYTES) return json;
  if (Array.isArray(value)) {
    let arr = value as unknown[];
    while (arr.length > 0 && json.length > MAX_ENTRY_BYTES) {
      arr = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.85)));
      json = JSON.stringify(arr);
      if (arr.length === 1 && json.length > MAX_ENTRY_BYTES) return null;
    }
    return arr.length > 0 ? json : null;
  }
  return null;
}

export async function swrRead<T>(key: string): Promise<{ data: T; cachedAt: number | null } | null> {
  const raw = await kvGet(PREFIX + key);
  if (raw == null) return null;
  try {
    const data = JSON.parse(raw) as T;
    const ts = await kvGet(PREFIX + key + TS_SUFFIX);
    return { data, cachedAt: ts ? Number(ts) || null : null };
  } catch {
    return null; // corrupt entry — treat as miss
  }
}

const FP_SUFFIX = '__fp';

/** The stamp the cached payload under `key` was built from, if any. */
export async function swrReadFingerprint(key: string): Promise<string | null> {
  return kvGet(PREFIX + key + FP_SUFFIX);
}

export async function swrWriteFingerprint(key: string, fp: string | null): Promise<void> {
  if (fp == null) await kvRemove(PREFIX + key + FP_SUFFIX);
  else await kvSet(PREFIX + key + FP_SUFFIX, fp);
}

export async function swrWrite(key: string, data: unknown): Promise<void> {
  const json = serializeWithinCap(data);
  if (json == null) {
    await kvRemove(PREFIX + key);
    await kvRemove(PREFIX + key + TS_SUFFIX);
    // Drop the stamp too — a stamp with no payload behind it is a trap.
    await kvRemove(PREFIX + key + FP_SUFFIX);
    return;
  }
  await kvSet(PREFIX + key, json);
  await kvSet(PREFIX + key + TS_SUFFIX, String(Date.now()));
}

/** Wipe every SWR/offline cache entry — called on sign-out so the next account
 *  on this device can never hydrate another tenant's data. */
export async function purgeSwrCache(): Promise<void> {
  const keys = await kvKeys(PREFIX);
  // One batched delete, not one call per key. Each cache entry is three keys
  // (payload + __ts + __fp), so Promise.all over them used to fire 500+
  // simultaneous AsyncStorage callbacks on sign-out and trip RN's
  // "Excessive number of pending callbacks" warning.
  await kvRemoveMany(keys);
}

/** Persist a payload together with the stamp the fetch STARTED from.
 *
 *  The stamp must be captured BEFORE the fetch, never after. Say the payload
 *  reflects server state S and someone writes while our query is in flight:
 *  a stamp read afterwards records the newer state, so the next open compares
 *  equal and happily serves a payload that is missing that write. Reading it
 *  first can only err the safe way — the stamp lags the payload, the next open
 *  sees a mismatch, and we refetch needlessly instead of serving stale data. */
export async function writeCacheAndStamp(
  cacheKey: string,
  data: unknown,
  stampBeforeFetch: string | null,
): Promise<void> {
  await swrWrite(cacheKey, data);
  await swrWriteFingerprint(cacheKey, stampBeforeFetch);
}

/** Cache-first load for screens that own their own state (so useSwr doesn't
 *  fit): paint the cached payload, then ask the cheap probe whether anything
 *  moved. Unchanged → done, no heavy query. Changed, missing, or probe
 *  unavailable → fetch and re-stamp.
 *
 *  `apply` receives fromCache=true for the instant paint and false for fresh
 *  data, so callers can distinguish "showing saved" from "confirmed". */
export async function loadCachedThenFresh<T>(opts: {
  cacheKey: string | null;
  fetcher: () => Promise<T>;
  apply: (data: T, fromCache: boolean) => void;
  fingerprint?: (() => Promise<string | null>) | null;
  /** Bail out if the screen moved on (unmounted, business switched). */
  cancelled?: () => boolean;
}): Promise<void> {
  const { cacheKey, fetcher, apply, fingerprint, cancelled } = opts;
  const alive = () => !cancelled?.();

  let painted = false;
  if (cacheKey) {
    const hit = await swrRead<T>(cacheKey);
    if (hit && alive()) {
      apply(hit.data, true);
      painted = true;
    }
  }

  // Probed before the fetch, and reused as the stamp we persist — see
  // writeCacheAndStamp for why the order is load-bearing.
  let stamp: string | null = null;
  if (cacheKey && fingerprint) {
    try {
      stamp = await fingerprint();
    } catch {
      stamp = null;
    }
    if (!alive()) return;
    if (painted && stamp != null) {
      const saved = await swrReadFingerprint(cacheKey);
      // Only a positive match short-circuits. Anything else — null stamp,
      // probe error, first run — falls through to the fetch, so a broken
      // probe can never be the reason a screen shows stale data.
      if (saved != null && saved === stamp) return;
    }
  }

  const fresh = await fetcher();
  if (!alive()) return;
  apply(fresh, false);
  if (cacheKey) await writeCacheAndStamp(cacheKey, fresh, stamp);
}

// ── In-flight dedupe + focus throttle (module-level, shared across mounts) ──
const inflight = new Map<string, Promise<unknown>>();
const lastFetchedAt = new Map<string, number>();

export interface UseSwrOptions<T> {
  /** Persist + hydrate under this key. Null/omitted = no persistence (the hook
   *  still keeps previous rows on screen across fetchKey changes). */
  cacheKey?: string | null;
  /** Data is CLEARED when this changes (tenant boundary: business/branch).
   *  Defaults to cacheKey ?? '' — pass explicitly for non-cached queries. */
  resetKey?: string;
  /** refresh() no-ops within this window unless forced. Default 15s. */
  focusThrottleMs?: number;
  /** Trim before persisting (e.g. keep only the first page). */
  cacheTrim?: (data: T) => unknown;
  /** Cheap "has anything changed?" probe. Resolve a stable string for the
   *  current server state (or null when it can't be determined — the hook then
   *  falls back to always revalidating, which is the old behaviour). Requires
   *  cacheKey: the stamp is stored alongside the cached payload. */
  fingerprint?: () => Promise<string | null>;
}

export interface UseSwrResult<T> {
  data: T | null;
  /** No data yet and a load is underway → show a skeleton. */
  loading: boolean;
  /** Background revalidation in flight while data is on screen. */
  refreshing: boolean;
  /** Data came from cache and no fresh fetch has landed for this key yet. */
  stale: boolean;
  /** A fingerprint probe confirmed the cached payload is current, so no fetch
   *  was needed. Useful for a "showing saved data" affordance. */
  verified: boolean;
  cachedAt: number | null;
  error: unknown;
  refresh: (opts?: { force?: boolean }) => void;
  mutate: (updater: (prev: T | null) => T | null) => void;
}

export function useSwr<T>(
  fetchKey: string | null,
  fetcher: () => Promise<T>,
  opts?: UseSwrOptions<T>,
): UseSwrResult<T> {
  const cacheKey = opts?.cacheKey ?? null;
  const resetKey = opts?.resetKey ?? cacheKey ?? '';
  const throttleMs = opts?.focusThrottleMs ?? 15_000;

  const [data, setData] = useState<T | null>(null);
  const [fetching, setFetching] = useState(false);
  const [stale, setStale] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Latest values for async callbacks (avoids stale closures without re-running
  // effects on every render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const trimRef = useRef(opts?.cacheTrim);
  trimRef.current = opts?.cacheTrim;
  const fingerprintRef = useRef(opts?.fingerprint);
  fingerprintRef.current = opts?.fingerprint;
  const fetchKeyRef = useRef(fetchKey);
  fetchKeyRef.current = fetchKey;
  const resetKeyRef = useRef(resetKey);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;
  // Which fetchKey the data currently in state belongs to. "Is there data?" is
  // not the same question as "is it THIS query's data?" — filters change the
  // key while the previous result is deliberately left on screen, and without
  // this the hook mistook that leftover for an already-satisfied load.
  const dataKeyRef = useRef<string | null>(null);

  const applyFresh = useCallback((key: string, fresh: T, stampBeforeFetch: Promise<string | null> | null) => {
    if (fetchKeyRef.current !== key) return; // params moved on — drop
    setData(fresh);
    dataRef.current = fresh;
    dataKeyRef.current = key;
    setStale(false);
    setCachedAt(Date.now());
    setError(null);
    const ck = cacheKeyRef.current;
    if (ck) {
      const trimmed = trimRef.current ? trimRef.current(fresh) : fresh;
      void swrWrite(ck, trimmed);
      // The stamp was captured before the fetch started (see
      // writeCacheAndStamp) — a stamp read afterwards could swallow a write
      // that landed mid-flight.
      if (stampBeforeFetch) void stampBeforeFetch.then((v) => swrWriteFingerprint(ck, v));
    }
  }, []);

  const doFetch = useCallback((key: string, force: boolean) => {
    const last = lastFetchedAt.get(key);
    if (!force && last != null && Date.now() - last < throttleMs) return;
    lastFetchedAt.set(key, Date.now());
    // Probe first so the stamp we persist can only lag the payload, never lead
    // it. Errors resolve to null = "don't vouch for this cache".
    const fpFn = fingerprintRef.current;
    const stampP = fpFn ? fpFn().catch(() => null) : null;
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fetcherRef.current();
      inflight.set(key, p as Promise<unknown>);
      // Cleanup via then(ok, err) — a .finally() chain would itself reject on
      // fetch failure and fire "unhandled promise rejection" warnings.
      const cleanup = () => {
        if (inflight.get(key) === p) inflight.delete(key);
      };
      void p.then(cleanup, cleanup);
    }
    setFetching(true);
    p.then(
      (fresh) => {
        applyFresh(key, fresh, stampP);
        if (fetchKeyRef.current === key) setFetching(false);
      },
      (err) => {
        if (fetchKeyRef.current !== key) return;
        setError(err);
        setFetching(false);
        lastFetchedAt.delete(key); // a failed load shouldn't throttle the retry
      },
    );
  }, [applyFresh, throttleMs]);

  useEffect(() => {
    // Tenant boundary: clear before anything else so another business/branch's
    // rows never linger on screen.
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setData(null);
      dataRef.current = null;
      dataKeyRef.current = null;
      setStale(false);
      setCachedAt(null);
      setError(null);
    }
    if (!fetchKey) return;

    setVerified(false);
    const probe = opts?.fingerprint;

    // Hydrate from disk (only fills the gap — never clobbers fresher state).
    if (cacheKey) {
      void swrRead<T>(cacheKey).then(async (hit) => {
        if (!hit) {
          // Nothing cached — nothing for the probe to validate.
          if (probe) doFetch(fetchKey, true);
          return;
        }
        if (fetchKeyRef.current !== fetchKey) return;
        // Apply the cached payload when nothing is on screen OR when what IS on
        // screen belongs to a different query. Guarding on "data === null"
        // alone left the previous filter's rows in place: the probe below would
        // then match (stamps cover the tables, not the filter) and short-circuit
        // the fetch, so switching range appeared to do nothing.
        if (dataRef.current === null || dataKeyRef.current !== fetchKey) {
          setData(hit.data);
          dataRef.current = hit.data;
          dataKeyRef.current = fetchKey;
          setStale(true);
          setCachedAt(hit.cachedAt);
        }
        if (!probe) return;
        // Cache hit + a probe: ask only for the stamp. Matching means the
        // payload is provably current, so the expensive fetch is skipped
        // entirely. Any failure falls through to a normal refetch — a probe
        // must never be the reason data goes stale.
        try {
          const [current, saved] = await Promise.all([probe(), swrReadFingerprint(cacheKey)]);
          if (fetchKeyRef.current !== fetchKey) return;
          if (current != null && saved != null && current === saved) {
            setStale(false);
            setVerified(true);
            return;
          }
        } catch {
          // fall through to the refetch below — a failing probe must never be
          // the reason a screen keeps showing stale data.
        }
        if (fetchKeyRef.current === fetchKey) doFetch(fetchKey, true);
      });
    }

    // Without a cacheKey there is nothing to validate, so revalidate as before.
    // With a probe the fetch is deferred into the branch above, which decides
    // whether it's needed at all.
    if (!cacheKey || !probe) doFetch(fetchKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, resetKey, cacheKey]);

  const refresh = useCallback((o?: { force?: boolean }) => {
    const key = fetchKeyRef.current;
    if (key) doFetch(key, o?.force ?? false);
  }, [doFetch]);

  const mutate = useCallback((updater: (prev: T | null) => T | null) => {
    setData((prev) => {
      const next = updater(prev);
      dataRef.current = next;
      const ck = cacheKeyRef.current;
      if (ck && next !== null) {
        const trimmed = trimRef.current ? trimRef.current(next) : next;
        void swrWrite(ck, trimmed);
      }
      return next;
    });
  }, []);

  return {
    data,
    verified,
    loading: fetching && data === null,
    refreshing: fetching && data !== null,
    stale,
    cachedAt,
    error,
    refresh,
    mutate,
  };
}

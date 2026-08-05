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

import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet, kvRemove, kvKeys } from './kvStore';

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

export async function swrWrite(key: string, data: unknown): Promise<void> {
  const json = serializeWithinCap(data);
  if (json == null) {
    await kvRemove(PREFIX + key);
    await kvRemove(PREFIX + key + TS_SUFFIX);
    return;
  }
  await kvSet(PREFIX + key, json);
  await kvSet(PREFIX + key + TS_SUFFIX, String(Date.now()));
}

/** Wipe every SWR/offline cache entry — called on sign-out so the next account
 *  on this device can never hydrate another tenant's data. */
export async function purgeSwrCache(): Promise<void> {
  const keys = await kvKeys(PREFIX);
  await Promise.all(keys.map((k) => kvRemove(k)));
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
}

export interface UseSwrResult<T> {
  data: T | null;
  /** No data yet and a load is underway → show a skeleton. */
  loading: boolean;
  /** Background revalidation in flight while data is on screen. */
  refreshing: boolean;
  /** Data came from cache and no fresh fetch has landed for this key yet. */
  stale: boolean;
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
  const fetchKeyRef = useRef(fetchKey);
  fetchKeyRef.current = fetchKey;
  const resetKeyRef = useRef(resetKey);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;

  const applyFresh = useCallback((key: string, fresh: T) => {
    if (fetchKeyRef.current !== key) return; // params moved on — drop
    setData(fresh);
    dataRef.current = fresh;
    setStale(false);
    setCachedAt(Date.now());
    setError(null);
    const ck = cacheKeyRef.current;
    if (ck) {
      const trimmed = trimRef.current ? trimRef.current(fresh) : fresh;
      void swrWrite(ck, trimmed);
    }
  }, []);

  const doFetch = useCallback((key: string, force: boolean) => {
    const last = lastFetchedAt.get(key);
    if (!force && last != null && Date.now() - last < throttleMs) return;
    lastFetchedAt.set(key, Date.now());
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
        applyFresh(key, fresh);
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
      setStale(false);
      setCachedAt(null);
      setError(null);
    }
    if (!fetchKey) return;

    // Hydrate from disk (only fills the gap — never clobbers fresher state).
    if (cacheKey) {
      void swrRead<T>(cacheKey).then((hit) => {
        if (!hit) return;
        if (fetchKeyRef.current !== fetchKey) return;
        if (dataRef.current !== null) return; // fetch already landed
        setData(hit.data);
        dataRef.current = hit.data;
        setStale(true);
        setCachedAt(hit.cachedAt);
      });
    }

    // New params always revalidate immediately — the hook holds no per-key
    // memory, so skipping here could leave another key's rows on screen. The
    // throttle only guards refresh() (rapid focus events); concurrent effect
    // runs for the same key collapse via the in-flight dedupe map.
    doFetch(fetchKey, true);
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
    loading: fetching && data === null,
    refreshing: fetching && data !== null,
    stale,
    cachedAt,
    error,
    refresh,
    mutate,
  };
}

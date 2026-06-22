// Read-through cache for offline viewing.
//
// Field crews need to OPEN their jobs offline to act on them (mark complete,
// log actuals). Screens normally fetch fresh from Supabase on mount, which
// fails with no signal. `loadCached` persists the last successful fetch to
// AsyncStorage and serves it when the network is down.
//
// The `fetcher` MUST throw on failure — supabase-js returns `{ data, error }`
// without throwing, so wrap your query: `const { data, error } = await q; if
// (error) throw error; return data;`. Then a transport failure (offline) falls
// back to the cached copy.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PREFIX = 'amixos_cache_';

// Per-entry persisted size cap. Android's AsyncStorage defaults to a ~6 MB
// TOTAL budget, so we keep each cache entry well under that (≤5 entries × 1 MB
// ≈ 5 MB, with headroom for the outbox). iOS has no practical limit, so it gets
// a generous cap. Caps only what's WRITTEN to disk — callers still receive the
// full freshly-fetched data; only the offline copy is trimmed.
const MAX_ENTRY_BYTES = Platform.OS === 'android' ? 1_000_000 : 4_000_000;

/** Serialize `value`, trimming an over-cap array down to the first N items that
 *  fit (lists are newest-first, so the most relevant rows are kept). Returns
 *  null when even a single object is too big to cache. */
function serializeWithinCap(value: unknown): string | null {
  let json = JSON.stringify(value);
  if (json.length <= MAX_ENTRY_BYTES) return json;
  if (Array.isArray(value)) {
    let arr = value as unknown[];
    // Drop ~15% per pass until it fits — fast and good enough (exactness here
    // doesn't matter, only staying under the budget).
    while (arr.length > 0 && json.length > MAX_ENTRY_BYTES) {
      arr = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.85)));
      json = JSON.stringify(arr);
      if (arr.length === 1 && json.length > MAX_ENTRY_BYTES) return null;
    }
    return arr.length > 0 ? json : null;
  }
  return null;
}

/** Size-capped AsyncStorage write. Drops the entry entirely if it can't fit
 *  (better a missing offline copy than blowing the storage budget). */
async function safeSet(full: string, value: unknown): Promise<void> {
  const json = serializeWithinCap(value);
  if (json == null) {
    await AsyncStorage.removeItem(full).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(full, json).catch(() => {});
}

export interface CachedResult<T> {
  data: T | null;
  /** True when the value came from cache (the live fetch failed / offline). */
  fromCache: boolean;
}

export async function loadCached<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const full = PREFIX + key;
  try {
    const data = await fetcher();
    // Persist for offline reuse (fire-and-forget, size-capped). The caller gets
    // the FULL data; only the on-disk copy is trimmed if it's over the cap.
    void safeSet(full, data);
    return { data, fromCache: false };
  } catch {
    const raw = await AsyncStorage.getItem(full).catch(() => null);
    if (raw != null) {
      try {
        return { data: JSON.parse(raw) as T, fromCache: true };
      } catch {
        /* corrupt cache — fall through */
      }
    }
    return { data: null, fromCache: false };
  }
}

/** Overwrite a cache entry (fire-and-forget). For optimistic updates to a
 *  cached collection after an offline write. */
export async function writeCached<T>(key: string, value: T): Promise<void> {
  await safeSet(PREFIX + key, value);
}

/** Prepend an item to a cached array (creates the array if absent). Used to make
 *  an offline-created row appear in a cached list before it syncs. */
export async function prependCached<T>(key: string, item: T): Promise<void> {
  const full = PREFIX + key;
  const raw = await AsyncStorage.getItem(full).catch(() => null);
  let arr: T[] = [];
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed as T[];
    } catch {
      /* corrupt cache — start fresh */
    }
  }
  await safeSet(full, [item, ...arr]);
}

/** Shallow-merge a patch into a cached object (no-op if not cached). Used after
 *  an optimistic offline write so the cached copy matches what the user sees
 *  until the change syncs. */
export async function patchCached<T extends object>(key: string, patch: Partial<T>): Promise<void> {
  const full = PREFIX + key;
  const raw = await AsyncStorage.getItem(full).catch(() => null);
  if (raw == null) return;
  try {
    const obj = JSON.parse(raw) as T;
    await safeSet(full, { ...obj, ...patch });
  } catch {
    /* corrupt cache — leave it */
  }
}

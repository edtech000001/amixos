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

const PREFIX = 'amixos_cache_';

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
    // Persist for offline reuse (fire-and-forget; a cache write failing is
    // never worth surfacing).
    AsyncStorage.setItem(full, JSON.stringify(data)).catch(() => {});
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
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
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
  await AsyncStorage.setItem(full, JSON.stringify([item, ...arr])).catch(() => {});
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
    await AsyncStorage.setItem(full, JSON.stringify({ ...obj, ...patch }));
  } catch {
    /* corrupt cache — leave it */
  }
}

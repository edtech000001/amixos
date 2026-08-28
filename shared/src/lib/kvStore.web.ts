// Tiny cross-platform key/value store (web variant — localStorage). Mirrors
// kvStore.ts's async interface so shared hooks are platform-agnostic.

export async function kvGet(key: string): Promise<string | null> {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota exceeded — ignore */
  }
}

export async function kvRemove(key: string): Promise<void> {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Delete many keys. localStorage has no batch API, but it's synchronous —
 *  there's no bridge and nothing to queue, so a loop is already optimal.
 *  Mirrors the native signature (see kvStore.ts for why that one batches). */
export async function kvRemoveMany(keys: string[]): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** All stored keys starting with `prefix` (for cache purges). */
export async function kvKeys(prefix: string): Promise<string[]> {
  try {
    if (typeof window === 'undefined') return [];
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

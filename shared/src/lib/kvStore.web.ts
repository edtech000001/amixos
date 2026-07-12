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

// Tiny cross-platform key/value store (native variant — AsyncStorage).
// The web variant (kvStore.web.ts) uses localStorage. Both expose the same
// async interface so shared hooks (e.g. usePersistedSearch) are identical
// across platforms. Base .ts = React Native, per the repo's .web convention.

import AsyncStorage from '@react-native-async-storage/async-storage';

export async function kvGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

export async function kvRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** All stored keys starting with `prefix` (for cache purges). */
export async function kvKeys(prefix: string): Promise<string[]> {
  try {
    const all = await AsyncStorage.getAllKeys();
    return all.filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}

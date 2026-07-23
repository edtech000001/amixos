import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Encrypted (Keychain / Keystore) storage adapter for the Supabase auth
// session, replacing plaintext AsyncStorage — the session holds the long-lived
// refresh token, which must not sit unencrypted on disk.
//
// Two wrinkles this handles:
//  * SecureStore warns/refuses past ~2KB per item; a Supabase session JSON is
//    larger, so values are chunked across `${key}.0`, `${key}.1`, … with a
//    `${key}.n` count. (SecureStore keys allow [A-Za-z0-9._-], so "." is a
//    safe separator.)
//  * One-time migration: on first read, an existing AsyncStorage session is
//    copied into SecureStore and removed, so upgrading users aren't logged out.

const CHUNK = 1800; // conservative byte budget under SecureStore's ~2KB cap

async function writeChunked(key: string, value: string): Promise<void> {
  // Clear any previous representation first.
  await removeChunked(key);
  if (value.length <= CHUNK) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  const parts = Math.ceil(value.length / CHUNK);
  await SecureStore.setItemAsync(`${key}.n`, String(parts));
  for (let i = 0; i < parts; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
}

async function readChunked(key: string): Promise<string | null> {
  const meta = await SecureStore.getItemAsync(`${key}.n`);
  if (meta != null) {
    const parts = parseInt(meta, 10) || 0;
    let out = '';
    for (let i = 0; i < parts; i++) {
      out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
    }
    return out;
  }
  return SecureStore.getItemAsync(key);
}

async function removeChunked(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(`${key}.n`);
  if (meta != null) {
    const parts = parseInt(meta, 10) || 0;
    for (let i = 0; i < parts; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  }
  await SecureStore.deleteItemAsync(key);
}

export const SecureSessionStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const secure = await readChunked(key);
      if (secure != null) return secure;
      // One-time migration from the old plaintext store.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await writeChunked(key, legacy);
        await AsyncStorage.removeItem(key);
        return legacy;
      }
      return null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await writeChunked(key, value);
    } catch {
      /* keychain unavailable — fail closed (no plaintext fallback) */
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await removeChunked(key);
    } catch {
      /* ignore */
    }
    // Also clear any legacy copy so sign-out is complete.
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

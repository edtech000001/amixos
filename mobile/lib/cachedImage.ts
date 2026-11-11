import { requireOptionalNativeModule } from 'expo';

// expo-image caches photos on disk by a stable key. Signed URLs carry a new
// token every time they're minted (every screen mount / 48-min refresh), so
// RN's <Image> re-downloaded every photo each time. Keyed by the URL minus its
// query string (= bucket + storage path) the cached copy survives re-signing.
//
// NATIVE module: builds made before it was added don't have it, so it's
// optional and callers fall back to RN <Image> (same pattern as photoThumbs).
// The iOS disk cache drops entries after a week; clearImageCache() runs on sign-out.

type ExpoImageMod = typeof import('expo-image');
let mod: ExpoImageMod | null | undefined;

export function expoImage(): ExpoImageMod | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = requireOptionalNativeModule('ExpoImage') ? (require('expo-image') as ExpoImageMod) : null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Cache key for a (signed) URL: the same photo keeps its key across re-signs. */
export function imageCacheKey(uri: string): string {
  return uri.split('?')[0];
}

/** Drop cached photos — on sign-out, so another account never sees them. */
export async function clearImageCache(): Promise<void> {
  const m = expoImage();
  if (!m) return;
  try {
    await Promise.all([m.Image.clearDiskCache(), m.Image.clearMemoryCache()]);
  } catch {
    /* best-effort */
  }
}

import { Image } from 'react-native';
import { JOB_PHOTO_MAX_EDGE, JOB_PHOTO_QUALITY } from '@amixos/shared/lib/jobPhotos';
import { THUMB_EDGE, THUMB_QUALITY, thumbPath } from '@amixos/shared/lib/photoThumbs';

// Mobile side of gallery photos: downscale the full photo (same 1600px / 0.7 as
// web — the picker alone kept full 12 MP resolution, ~1 MB) and write the
// `_thumb.jpg` grids show. expo-image-manipulator is a NATIVE module: builds
// made before it was added don't have it, so it's lazy-required and every step
// degrades to "upload the original, no thumbnail" (grids then fall back to the
// full photo).

type Manipulator = typeof import('expo-image-manipulator');
let mod: Manipulator | null | undefined;
function load(): Manipulator | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-image-manipulator') as Manipulator;
  } catch {
    mod = null;
  }
  return mod;
}

/** Tables whose rows are gallery photos (get a resize + thumbnail). */
export const GALLERY_PHOTO_TABLES = new Set(['job_photos', 'equipment_photos', 'rental_property_photos']);

const imageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject));

/** JPEG copy of `uri` with its longest side ≤ edge (never upscales); null if unavailable. */
async function resized(uri: string, edge: number, quality: number): Promise<string | null> {
  const M = load();
  if (!M) return null;
  try {
    const { width, height } = await imageSize(uri);
    const longest = Math.max(width, height);
    const actions = longest > edge
      ? [{ resize: width >= height ? { width: edge } : { height: edge } }]
      : [];
    const out = await M.manipulateAsync(uri, actions, { compress: quality, format: M.SaveFormat.JPEG });
    return out.uri;
  } catch {
    return null;
  }
}

async function bytes(uri: string): Promise<ArrayBuffer> {
  const blob = await (await fetch(uri)).blob();
  return new Response(blob).arrayBuffer();
}

type SupabaseLike = { storage: { from: (b: string) => { upload: (...a: any[]) => Promise<{ error: unknown }> } } };

/**
 * Upload a gallery photo: the downscaled full image to `path`, then its
 * thumbnail (best-effort — a failure only means the grid shows the full
 * photo). Resolves the FULL upload's error, like storage.upload().
 */
export async function uploadGalleryPhoto(
  supabase: SupabaseLike,
  bucket: string,
  path: string,
  localUri: string,
  upsert = false,
): Promise<{ error: unknown }> {
  const fullUri = (await resized(localUri, JOB_PHOTO_MAX_EDGE, JOB_PHOTO_QUALITY)) ?? localUri;
  const { error } = await supabase.storage.from(bucket).upload(path, await bytes(fullUri), { upsert, contentType: 'image/jpeg' });
  if (error) return { error };
  try {
    const thumbUri = await resized(fullUri, THUMB_EDGE, THUMB_QUALITY);
    if (thumbUri) {
      await supabase.storage.from(bucket).upload(thumbPath(path), await bytes(thumbUri), { upsert: true, contentType: 'image/jpeg' });
    }
  } catch {
    /* grid falls back to the full photo */
  }
  return { error: null };
}

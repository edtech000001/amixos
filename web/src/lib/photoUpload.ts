'use client';

import { THUMB_EDGE, THUMB_QUALITY, thumbPath } from '@amixos/shared/lib/photoThumbs';

type SupabaseLike = { storage: { from: (b: string) => { upload: (...a: any[]) => Promise<{ error: unknown }> } } };

/** Downscale an image to `edge` px on its longest side (never upscales) and
 *  re-encode as JPEG. Null if the browser can't decode it. */
export async function resizeToJpeg(file: Blob, edge: number, quality: number): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > edge ? edge / longest : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  } catch {
    return null;
  }
}

/** Write the gallery thumbnail for a photo just uploaded to `path`.
 *  Best-effort: a failure only means the grid shows the full photo. */
export async function uploadThumb(supabase: SupabaseLike, bucket: string, path: string, source: Blob): Promise<void> {
  try {
    const thumb = await resizeToJpeg(source, THUMB_EDGE, THUMB_QUALITY);
    if (!thumb) return;
    await supabase.storage.from(bucket).upload(thumbPath(path), thumb, { upsert: true, contentType: 'image/jpeg' });
  } catch {
    /* grid falls back to the full photo */
  }
}

// One attempt per photo per page session.
const healed = new Set<string>();

/** Older photos have no thumbnail. When a grid had to fall back to the full
 *  photo, build the missing thumbnail from it in the background, so the next
 *  load is fast. Uploads are RLS-checked; for someone without write access
 *  it fails quietly and nothing changes. */
export function healThumb(supabase: SupabaseLike, bucket: string, path: string, fullUrl: string | undefined): void {
  if (!fullUrl || healed.has(path)) return;
  healed.add(path);
  void (async () => {
    try {
      const blob = await (await fetch(fullUrl)).blob();
      await uploadThumb(supabase, bucket, path, blob);
    } catch {
      /* try again next session */
    }
  })();
}

// Gallery thumbnails. Every job / equipment / rental photo upload also writes
// a small JPEG next to the full file: `<path minus extension>_thumb.jpg`.
// Grids and cards show the thumbnail (≈20–40 KB); the full-screen viewer
// shows the full photo. Photos uploaded before thumbnails existed have none —
// display code falls back to the full file, so nothing breaks.

/** Longest edge (px) + JPEG quality for thumbnails — sharp on a 2× screen
 *  at the largest card size (~200 CSS px). */
export const THUMB_EDGE = 400;
export const THUMB_QUALITY = 0.7;

/** Storage path of a photo's thumbnail. */
export function thumbPath(path: string): string {
  return `${path.replace(/\.[^./]+$/, '')}_thumb.jpg`;
}

/** Paths to sign for a gallery: each photo plus its thumbnail. */
export function withThumbPaths(paths: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const p of paths) if (p) out.push(p, thumbPath(p));
  return out;
}

/** Best URL for a grid tile: the thumbnail when signed, else the full photo. */
export function thumbUrl(urls: Record<string, string>, path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return urls[thumbPath(path)] ?? urls[path];
}

// Shared types + helpers for the Files module (Google-Drive-style library).
//
// Structure: top-level folders (`file_categories`, which carry the Team/Office
// visibility default) contain arbitrarily-nested `file_folders`, with files
// (`file_entries`) living at any level. An entry is an uploaded file
// (storage_path) or an external link (url). See 053 + 054 migrations.
//
// Visibility: the top-level folder sets the default (crew_visible); a file may
// override its own (file_entries.crew_visible: null = inherit, true = Team,
// false = Office). Access control stays a single join to file_categories.
//
// Storage layout (same bucket as job/equipment photos + logos):
//   files/<business_id>/<uuid>/<filename>

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './supabaseFetch';

// Top-level folder. Still named `file_categories` in the DB; it's the
// visibility root of a tree.
export interface FileCategory {
  id: string;
  business_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  crew_visible: boolean;
  // Hand-picked cover (migration 214). Folders have nothing to render from,
  // so this is always a picture the user chose. Null = folder icon.
  cover_path: string | null;
  /** How that picture is framed in its box (migration 216). Null = default. */
  cover_transform: unknown;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Nestable folder inside a top-level folder. parent_folder_id null = a root
// folder directly under the category.
export interface FileFolder {
  id: string;
  business_id: string;
  category_id: string;
  parent_folder_id: string | null;
  name: string;
  /** Hand-picked cover (migration 214). Null = folder icon. */
  cover_path: string | null;
  /** How that picture is framed in its box (migration 216). Null = default. */
  cover_transform: unknown;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export type FileEntryKind = 'file' | 'link';

export interface FileEntry {
  id: string;
  business_id: string;
  category_id: string | null;
  folder_id: string | null; // null = at the category root (no subfolder)
  title: string;
  kind: FileEntryKind;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  url: string | null;
  // First-page preview (migration 212). Rendered once by api/ and cached — see
  // requestThumbnail(). null path + status tells the grid whether to wait or
  // fall back to a type icon.
  thumbnail_path: string | null;
  thumbnail_status: 'pending' | 'ready' | 'failed' | 'unsupported' | null;
  // True when a person uploaded the cover instead of it being rendered from
  // the file (migration 213). Links can only ever have a manual cover.
  thumbnail_manual: boolean | null;
  /** How a hand-picked cover is framed in its box (migration 216). */
  cover_transform: unknown;
  // null = inherit the category default; true = Team; false = Office.
  crew_visible: boolean | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

// Private bucket (migration 066). Reads go through signed URLs — see
// signedUrl()/useSignedUrl() in ./storageUrls. There is intentionally no
// public-URL helper here anymore: getPublicUrl on a private bucket is dead.
export const FILES_BUCKET = 'business-private';

export const FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export function fileStoragePath(businessId: string, folderId: string, filename: string): string {
  return `files/${businessId}/${folderId}/${filename}`;
}

export function fileUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Best-effort size/type label, e.g. "PDF · 1.2 MB" or the link label. */
export function fileMeta(entry: FileEntry, linkLabel: string): string {
  if (entry.kind === 'link') return linkLabel;
  const parts: string[] = [];
  const ext = entry.file_name?.split('.').pop();
  if (ext) parts.push(ext.toUpperCase());
  if (entry.file_size) {
    const mb = entry.file_size / (1024 * 1024);
    parts.push(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(entry.file_size / 1024))} KB`);
  }
  return parts.join(' · ');
}

/**
 * Effective Team-visibility of a file: its own override if set, else the
 * top-level folder's default. Used for the per-file lock badge.
 */
export function fileIsCrewVisible(entry: FileEntry, categoryCrewVisible: boolean): boolean {
  return entry.crew_visible == null ? categoryCrewVisible : entry.crew_visible;
}

export interface FilesTree {
  categories: FileCategory[];
  folders: FileFolder[];
  entries: FileEntry[];
}

/** Load the whole library for a business in three paginated reads. */
export async function fetchFilesTree(
  supabase: SupabaseClient,
  businessId: string,
): Promise<FilesTree> {
  const [categories, folders, entries] = await Promise.all([
    fetchAll<FileCategory>((from, to) =>
      supabase.from('file_categories').select('*')
        .eq('business_id', businessId).order('sort_order').order('name').range(from, to)),
    fetchAll<FileFolder>((from, to) =>
      supabase.from('file_folders').select('*')
        .eq('business_id', businessId).order('sort_order').order('name').range(from, to)),
    fetchAll<FileEntry>((from, to) =>
      supabase.from('file_entries').select('*')
        .eq('business_id', businessId).order('sort_order').order('created_at').range(from, to)),
  ]);
  return { categories, folders, entries };
}


/** Formats a thumbnail can exist for. Mirrors the api's isRenderable(), so the
 *  grid does not show a pending spinner for a .zip that will never render. */
export function canHaveThumbnail(entry: FileEntry): boolean {
  if (entry.kind !== 'file' || !entry.storage_path) return false;
  if (entry.mime_type === 'application/pdf') return true;
  return !!entry.file_name && entry.file_name.toLowerCase().endsWith('.pdf');
}

/**
 * Ask the API to render this file's first page. Fire-and-forget: the caller
 * does not await a thumbnail before showing the file, and a failure here must
 * never block an upload that already succeeded.
 *
 * Safe to call more than once — the endpoint returns the cached path if the
 * thumbnail already exists rather than re-rendering.
 */
export async function requestThumbnail(
  apiBaseUrl: string,
  jwt: string,
  entryId: string,
): Promise<{ status: string; path: string | null } | null> {
  try {
    const r = await fetch(`${apiBaseUrl}/api/v1/files/${entryId}/thumbnail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const body = await r.json() as { status?: string; path?: string | null };
    return { status: body.status ?? 'failed', path: body.path ?? null };
  } catch {
    return null; // offline / API not reachable — the file itself is fine
  }
}

/** Drain one batch of files that predate thumbnails. Returns how many are
 *  still queued so the caller can loop until it reaches zero. */
export async function backfillThumbnails(
  apiBaseUrl: string,
  jwt: string,
  businessId: string,
  limit = 10,
  /** Revisit rows a previous run marked `failed` (a transient download error,
   *  or a file that exceeded a size cap since raised). Off by default so one
   *  permanently broken file cannot stall the queue. */
  retryFailed = false,
): Promise<{ ready: number; remaining: number } | null> {
  try {
    const r = await fetch(`${apiBaseUrl}/api/v1/files/thumbnails/backfill`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, limit, retry_failed: retryFailed }),
    });
    if (!r.ok) return null;
    const body = await r.json() as { ready?: number; remaining?: number };
    return { ready: body.ready ?? 0, remaining: body.remaining ?? 0 };
  } catch {
    return null;
  }
}


/** Where a hand-picked cover lives. Beside the entry's own folder so the
 *  storage policies guarding the folder guard the cover too. Includes the
 *  entry id, so replacing a cover never collides with the previous one. */
export function coverStoragePath(businessId: string, entryId: string, ext: string): string {
  return `files/${businessId}/covers/${entryId}-${fileUid()}.${ext.replace(/^\./, '')}`;
}

/**
 * Downscale an image to a thumbnail-sized JPEG before upload (web only —
 * needs canvas). Manual covers are read on every grid view, so a 4 MB phone
 * photo would cost egress forever; this brings it in line with the ~480px
 * JPEGs the renderer produces.
 *
 * Returns the original blob unchanged if the browser cannot decode it, so a
 * failure here degrades to "bigger file" rather than "no cover".
 */
export async function downscaleImage(file: Blob, maxPx = 480, quality = 0.85): Promise<Blob> {
  try {
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    return out ?? file;
  } catch {
    return file;
  }
}


/** How a cover image is framed inside its fixed box (migration 216). */
export interface CoverTransform {
  /** Focal point, 0..1. Which part of the image stays centred when cropped. */
  x: number;
  y: number;
  /** Rotation in degrees; only right angles, so the box stays axis-aligned. */
  rot: 0 | 90 | 180 | 270;
}

/**
 * Read a stored transform, falling back to a sensible default per surface.
 * A document cover is framed from the TOP — the masthead is the useful part —
 * while a folder photo is framed from the middle.
 */
export function coverTransform(raw: unknown, kind: 'document' | 'photo' = 'photo'): CoverTransform {
  const d: CoverTransform = kind === 'document' ? { x: 0.5, y: 0, rot: 0 } : { x: 0.5, y: 0.5, rot: 0 };
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb;
  const rot = r.rot === 90 || r.rot === 180 || r.rot === 270 ? r.rot : 0;
  return { x: num(r.x, d.x), y: num(r.y, d.y), rot };
}

/** Next right angle, for a "rotate" button. */
export function rotateCover(t: CoverTransform): CoverTransform {
  const order: CoverTransform['rot'][] = [0, 90, 180, 270];
  return { ...t, rot: order[(order.indexOf(t.rot) + 1) % 4] };
}

/** True when the transform is just the default — lets a caller store NULL
 *  rather than a row of no-op numbers. */
export function isDefaultCoverTransform(t: CoverTransform, kind: 'document' | 'photo' = 'photo'): boolean {
  const d = coverTransform(null, kind);
  return t.x === d.x && t.y === d.y && t.rot === d.rot;
}

/**
 * Style for a cover image that fills a fixed box, framed by `t`.
 *
 * objectFit 'cover' already fills the box at 0°. Rotating 90/270 turns the
 * image's W×H footprint into H×W, which no longer covers a box of a different
 * aspect — so it is scaled by max(a, 1/a), the exact factor that restores
 * coverage for a box of aspect `boxAspect` (width / height).
 *
 * @param boxAspect width / height of the box, e.g. 1 for a square folder tile,
 *   0.75 for a 3:4 document cover.
 */
export function coverImageStyle(t: CoverTransform, boxAspect: number): {
  objectPosition: string;
  transform: string;
  scale: number;
  rotate: number;
} {
  const swap = t.rot === 90 || t.rot === 270;
  const a = boxAspect > 0 ? boxAspect : 1;
  const scale = swap ? Math.max(a, 1 / a) : 1;
  return {
    objectPosition: `${t.x * 100}% ${t.y * 100}%`,
    transform: `rotate(${t.rot}deg) scale(${scale})`,
    scale,
    rotate: t.rot,
  };
}

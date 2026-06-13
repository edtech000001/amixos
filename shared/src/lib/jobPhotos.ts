// Shared types + storage helpers for job photos.
//
// Storage layout (in the existing `business-assets` bucket, same one
// equipment photos and logos use):
//   jobs/<business_id>/<job_id>/<photo_uuid>.<ext>
// The first segment after the bucket lets the RLS policy in
// 057_job_photos.sql check business membership without joining the jobs
// table on every read.
//
// Deleting a job_photos row also removes its storage object — handled by
// the AFTER DELETE trigger in 057_job_photos.sql, so a single-photo
// delete and a whole-job cascade delete both clean up the bucket.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface JobPhoto {
  id: string;
  business_id: string;
  job_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  /** Display-only rotation in degrees (0/90/180/270), migration 059. */
  rotation: number;
  created_by: string | null;
  created_at: string;
}

/** Next 90° clockwise step, wrapping at 360. */
export function nextRotation(current: number): number {
  return (((current ?? 0) + 90) % 360 + 360) % 360;
}

export const JOB_PHOTOS_BUCKET = 'business-assets';

// Generous guardrail rather than a true limit — high enough that normal
// before/after documentation never hits it, low enough to stop a runaway
// upload from ballooning storage. Surfaced in the UI as a hint.
export const MAX_PHOTOS_PER_JOB = 50;

// Resize target applied before upload (longest edge, px) + JPEG quality.
// Keeps a full-frame phone/DSLR photo around 200–500 KB instead of
// several MB, which is the main lever on storage + egress cost.
export const JOB_PHOTO_MAX_EDGE = 1600;
export const JOB_PHOTO_QUALITY = 0.7;

/**
 * Storage path for a job photo. The first segment after the bucket name
 * is `jobs/<business_id>/...`, which the RLS policy in 057_job_photos.sql
 * parses to gate access.
 */
export function jobPhotoPath(
  businessId: string,
  jobId: string,
  filename: string,
): string {
  return `jobs/${businessId}/${jobId}/${filename}`;
}

/** Public URL for a job photo by its storage_path. */
export function jobPhotoUrl(
  supabase: SupabaseClient,
  storagePath: string,
): string {
  return supabase.storage.from(JOB_PHOTOS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/** A short unique filename stem, with a fallback for runtimes lacking crypto.randomUUID. */
export function jobPhotoFilename(ext = 'jpg'): string {
  const uid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${uid}.${ext}`;
}

-- 059_job_photo_rotation.sql
-- Per-photo display rotation (0 / 90 / 180 / 270 degrees) so users can
-- straighten sideways photos in the viewer. Stored as a value and applied
-- as a display transform — we don't re-encode the file, so it's free and
-- reversible (no image-manipulation native module needed).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

alter table public.job_photos
  add column if not exists rotation smallint not null default 0;

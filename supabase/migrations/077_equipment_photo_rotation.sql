-- 077_equipment_photo_rotation.sql
-- Display-only rotation for equipment photos, mirroring job_photos (migration
-- 059). Lets the detail-view full-screen viewer turn a sideways photo upright.
-- Stored as degrees (0 / 90 / 180 / 270); applied as a CSS/transform rotate on
-- render — the stored image bytes are untouched.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.equipment_photos
  add column if not exists rotation integer not null default 0;

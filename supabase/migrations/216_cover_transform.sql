-- 216 — Framing for cover images
--
-- A cover is displayed cropped to a fixed box, so a photo that is not already
-- the right shape loses whatever falls outside — and until now you had no say
-- in WHICH part was lost. This stores how to frame it.
--
--   { "x": 0.5, "y": 0.5, "rot": 0 }
--     x, y  focal point, 0..1 — which part of the image stays centred in the
--           box. 0.5/0.5 = middle, 0.5/0 = top edge, 1/1 = bottom-right.
--     rot   rotation in degrees, one of 0 / 90 / 180 / 270.
--
-- STORED, NOT BAKED. Cropping the pixels at upload would need a native image
-- module on mobile — a new dev-client build rather than an OTA — and would be
-- destructive: re-framing later would mean re-uploading the photo. Keeping the
-- original and describing the framing costs a little render logic and keeps the
-- adjustment reversible forever.
--
-- NULL means "no adjustment", which each surface reads as its own sensible
-- default (documents frame from the top, folders from the middle).

alter table public.file_entries
  add column if not exists cover_transform jsonb;

alter table public.file_categories
  add column if not exists cover_transform jsonb;

alter table public.file_folders
  add column if not exists cover_transform jsonb;

comment on column public.file_entries.cover_transform is
  'Framing for thumbnail_path: {"x":0..1,"y":0..1,"rot":0|90|180|270}. NULL = default framing.';
comment on column public.file_categories.cover_transform is
  'Framing for cover_path: {"x":0..1,"y":0..1,"rot":0|90|180|270}. NULL = default framing.';
comment on column public.file_folders.cover_transform is
  'Framing for cover_path: {"x":0..1,"y":0..1,"rot":0|90|180|270}. NULL = default framing.';

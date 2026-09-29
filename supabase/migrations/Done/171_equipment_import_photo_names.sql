-- Pending photo file names for equipment, mirroring jobs.import_photo_names
-- (migration 115). The equipment import's "Photos (file names)" column writes
-- the names here; the "Import equipment photos" step matches dropped files to
-- equipment by these names and uploads only the matches. Cleared as each name
-- is uploaded.
alter table public.equipment
  add column if not exists import_photo_names jsonb;

comment on column public.equipment.import_photo_names is
  'Photo file names from the import CSV, pending upload in the "Import equipment photos" step. Cleared per-name as files match + upload.';

-- Original source file name of an uploaded equipment photo (mirrors
-- job_photos.source_name) so the import can skip files already uploaded on a
-- re-run.
alter table public.equipment_photos
  add column if not exists source_name text;

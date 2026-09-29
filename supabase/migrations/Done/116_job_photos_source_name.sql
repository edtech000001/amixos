-- 116_job_photos_source_name.sql
-- Original file name for photos added by the bulk import step ("Subir
-- fotos"). Re-running the step — after a mid-upload refresh, or by simply
-- re-selecting the whole photo dump — skips any file whose name already
-- exists on that job instead of uploading a duplicate.
--
-- Null for photos added the normal way (job detail / creation form).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.job_photos
  add column if not exists source_name text;

comment on column public.job_photos.source_name is
  'Original file name from the bulk photo import — dedupes re-runs. Null for photos added in-app.';

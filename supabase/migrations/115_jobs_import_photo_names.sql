-- 115_jobs_import_photo_names.sql
-- Pending photo file names from the jobs CSV import ("Fotos (nombres de
-- archivo)" column). The "Subir fotos" import step matches bulk-selected
-- files against these names client-side, uploads ONLY the matches to the
-- job_photos flow, and removes each matched name (null when none remain).
-- Unmatched files are never uploaded, so no storage is wasted.
--
-- jsonb array of strings, e.g. ["Proyecto-001.Foto 1.jpg", "..."].
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists import_photo_names jsonb;

comment on column public.jobs.import_photo_names is
  'Pending photo file names from CSV import; cleared as the bulk photo upload step matches them.';

-- The photo step lists only jobs that still have pending names.
create index if not exists jobs_import_photo_names_idx
  on public.jobs (business_id)
  where import_photo_names is not null;

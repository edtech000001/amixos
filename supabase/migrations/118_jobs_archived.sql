-- 118_jobs_archived.sql
-- Archive for jobs that will never be invoiced (internal hours, warranty
-- work, dead projects). Archived jobs leave the default job lists and the
-- Completed tab — the second exit besides invoicing — but still count in
-- reports/hours and stay reachable under the "Archivados" filter. Reversible
-- (null = active).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists archived_at timestamptz;

comment on column public.jobs.archived_at is
  'When set, the job is archived: hidden from default lists/tabs, still counted in reports. Null = active.';

-- 085_timesheets_missing_columns.sql
-- Add the timesheet columns the app has always written but were never created.
--
-- The "Registrar horas" form (web + mobile) inserts `job_description` and
-- `status` into `timesheets`, but no migration ever added those columns — so
-- every timesheet insert failed at PostgREST with "Could not find the
-- 'job_description' column ... in the schema cache". The old code ignored the
-- insert error, so saves failed SILENTLY (that's why Payroll always showed 0h).
-- The offline write queue surfaced the real error.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.timesheets
  add column if not exists job_description text,
  add column if not exists status text not null default 'completed';

-- Refresh PostgREST's schema cache so the new columns are usable immediately
-- (otherwise the "schema cache" error can persist until the next reload).
notify pgrst, 'reload schema';

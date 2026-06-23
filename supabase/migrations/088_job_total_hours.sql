-- 088_job_total_hours.sql
-- Per-job "total hours" — the labour hours worked on a job. Used to credit each
-- assigned worker's hours in the Reports payroll (each assigned worker is
-- credited the job's total_hours, alongside their logged timesheets).
--
-- Set two ways on the job form: enter start + end time (the field auto-computes
-- and locks total_hours), OR leave the times blank and type the hours directly
-- (e.g. a field tech logging "9h" without exact clock times). Never both.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists total_hours numeric;

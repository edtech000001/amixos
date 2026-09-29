-- 074_job_status_timestamps.sql
-- ADD: work-phase status timestamps on jobs, so the pipeline/stepper can show
-- WHEN each step was reached. The proposal phase already has sent_at /
-- accepted_at / declined_at / cancelled_at (migrations 011/014); this adds the
-- work phase.
--
-- The app sets each column when the job transitions INTO that status. For
-- existing jobs we backfill the CURRENT status's timestamp from updated_at
-- (best-effort, so the current step shows a time immediately); earlier steps
-- stay null until/unless the job moves through them again.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists scheduled_at   timestamptz,
  add column if not exists in_progress_at timestamptz,
  add column if not exists completed_at   timestamptz,
  add column if not exists invoiced_at    timestamptz;

-- Best-effort backfill for the job's current step.
update public.jobs set scheduled_at   = updated_at
  where status = 'scheduled'   and scheduled_at   is null;
update public.jobs set in_progress_at = updated_at
  where status = 'in_progress' and in_progress_at is null;
update public.jobs set completed_at   = coalesce(completed_date::timestamptz, updated_at)
  where status in ('completed', 'invoiced') and completed_at is null;
update public.jobs set invoiced_at    = updated_at
  where status = 'invoiced'    and invoiced_at    is null;

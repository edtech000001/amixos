-- 089_job_driver.sql
-- Optional "driver" on a job: an employee paid extra hours for driving. Pairs
-- with total_hours (088) — the assigned crew are each credited the job's
-- total_hours; the driver is credited driver_hours. The driver need NOT be on
-- the crew: a driver-only person (drove but didn't work the job) gets ONLY
-- their driver_hours; a driver who is also crew gets total_hours + driver_hours.
--
--   driver_employee_ids → which employees are drivers (any employees; [] = none)
--   driver_hours        → extra hours credited to EACH listed driver
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists driver_employee_ids uuid[] not null default '{}',
  add column if not exists driver_hours numeric;

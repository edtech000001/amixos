-- 193_fix_utc_completed_dates.sql
-- jobs.completed_date was stamped from `new Date().toISOString()` — the UTC
-- date — so any job completed after ~7 PM Central carried TOMORROW's date
-- (field home showed a completed job as "Tomorrow"; payroll-period scoping by
-- completed_date shifted evening jobs into the wrong period). The app now
-- stamps the device-local date (todayLocalISO); this repairs existing rows.
--
-- Repair: re-derive the date from completed_at (exact timestamptz, unaffected
-- by the bug) in Central time — the crews' home timezone. Caveat: work
-- completed 11 PM–midnight EASTERN (Georgia branch) lands on the Central date,
-- i.e. potentially one day early; that window is far smaller than the 5-hour
-- window the bug corrupted. Rows without completed_at (imports that set only
-- the date) are untouched.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

update public.jobs
set completed_date = (completed_at at time zone 'America/Chicago')::date
where completed_at is not null
  and completed_date is distinct from (completed_at at time zone 'America/Chicago')::date;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select count(*) from public.jobs
--   where completed_at is not null
--     and completed_date is distinct from (completed_at at time zone 'America/Chicago')::date;
--   -- expect: 0

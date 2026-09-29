-- Multi-day project support + manual duration estimate on jobs, and a weekly
-- operating-hours schedule on businesses (used to flag jobs scheduled outside
-- business hours with a non-blocking note).
--
-- jobs.scheduled_date already exists (the project START). end_date is the
-- project FINISH; the span is shown as (end - start) days. estimated_hours is
-- a manual planning estimate, displayed broken into days/hours/minutes.
--
-- operating_hours JSONB shape (per weekday):
--   { "mon": {"enabled": true, "start": "08:00", "end": "17:00"}, ... "sun": {...} }
-- NULL means "not configured" — the app skips out-of-hours warnings until set.
--
-- All add-if-not-exists, safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.jobs
  add column if not exists end_date        date,
  add column if not exists estimated_hours numeric(7,2);

alter table public.businesses
  add column if not exists operating_hours jsonb;

-- New 'posible' job status: a recorded-but-not-scheduled lead/potential job
-- (NOT a cotización/proposal). Extend the status CHECK to allow it.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in (
    'posible',
    'proposal','sent','accepted','declined',
    'scheduled','in_progress','completed','cancelled','invoiced'
  ));

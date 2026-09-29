-- 046_job_alert_thresholds.sql
-- Configurable "upcoming job" alert levels surfaced on each job card.
-- The owner defines N tiers (e.g. "1 day before = red, 3 days before =
-- orange") in Ajustes → Trabajos, and the jobs list highlights any
-- scheduled job whose scheduled_date falls inside one of those tiers.
--
-- Shape (JSONB):
--   {
--     "enabled": boolean,
--     "levels":  [ { "days": int, "color": "red"|"orange"|... }, ... ]
--   }
-- Default: disabled, no levels. Levels are matched smallest-days-first so
-- the most urgent tier always wins for any given job. See
-- shared/src/lib/jobAlerts.ts for the matching logic.
--
-- Safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists job_alert_thresholds jsonb
    not null
    default '{"enabled": false, "levels": []}'::jsonb;

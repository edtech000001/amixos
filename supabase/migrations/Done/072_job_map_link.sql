-- 072_job_map_link.sql
-- Store the original pasted map link on a job, alongside the extracted
-- coordinates (job_lat / job_lng from migration 023). Coordinates still drive
-- the Map module + pins; the link preserves the exact place the user pasted so
-- "Abrir en Mapas" / share location / text-to-crew can redirect to their real
-- named pin instead of a bare coordinate.
--
-- NULL ⇒ no link saved (older jobs, or a job located only by coords/address).
--
-- No new RLS needed: this is an additive column on jobs, covered by the
-- existing jobs row policies.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

alter table public.jobs
  add column if not exists job_map_link text;

comment on column public.jobs.job_map_link is
  'Original map URL pasted by the user (Google/Apple/shortlink). Optional; coordinates live in job_lat/job_lng. Preferred for share/redirect when present.';

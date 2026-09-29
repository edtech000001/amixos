-- 109_jobs_geocoding.sql
-- Geocoding-attempt tracking for jobs, so the Map module can lazily backfill
-- job_lat/job_lng from the job's address (job_address/job_city/job_state) the
-- same way it does for clients (032/034/047) and employees (106).
--
-- job_lat / job_lng already exist; jobs previously only got coordinates from
-- the form (pasted coords or a coordinate-bearing map link). With this, any
-- job that has an address — typed or CSV-imported — gets a map pin via
-- /api/v1/map/geocode-jobs.
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.jobs
  add column if not exists lat_lookup_attempted_at timestamptz,
  add column if not exists lat_lookup_failed_reason text,
  add column if not exists geocoding_ignored boolean not null default false;

comment on column public.jobs.lat_lookup_attempted_at is
  'Last time we tried to geocode this job''s address. Set on failure so retries cooldown (30 days); cleared on success.';
comment on column public.jobs.lat_lookup_failed_reason is
  'Why the last geocode attempt failed. Mirrors api/src/lib/geocoding.ts GeocodeFailure.reason: no_address | not_found | http_error | parse_error.';

-- Fast fetch of only the geocoded rows.
create index if not exists idx_jobs_lat_lng
  on public.jobs(business_id, job_lat, job_lng)
  where job_lat is not null and job_lng is not null;

-- Find unresolved rows fast (for the cooldown query).
create index if not exists idx_jobs_lat_lookup_attempted_at
  on public.jobs(business_id, lat_lookup_attempted_at)
  where job_lat is null and lat_lookup_attempted_at is not null;

-- Only the "permanently skip" rows.
create index if not exists idx_jobs_geocoding_ignored
  on public.jobs (business_id)
  where geocoding_ignored = true;

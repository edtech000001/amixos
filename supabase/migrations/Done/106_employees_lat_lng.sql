-- 106_employees_lat_lng.sql
-- Coordinates + geocoding-attempt tracking for employees, so the Crew Finder
-- can rank crew by straight-line distance to a job. Mirrors the client
-- geocoding columns (migrations 032 / 034 / 047).
--
-- An employee's map/proximity location is normally derived from the job they're
-- currently assigned to; these columns are the FALLBACK — their geocoded home
-- address — used when they have no current job with coordinates. Populated once
-- (lazily) via /api/v1/map/geocode-employees and cached here so we don't
-- re-geocode on every Crew Finder open.
--
-- Idempotent / safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.employees
  add column if not exists lat numeric(10, 7),
  add column if not exists lng numeric(10, 7),
  add column if not exists lat_lookup_attempted_at timestamptz,
  add column if not exists lat_lookup_failed_reason text,
  add column if not exists geocoding_ignored boolean not null default false;

comment on column public.employees.lat is
  'Latitude (WGS-84) of the employee''s home address. Populated by the Crew Finder via Google Geocoding API; null = not yet geocoded.';
comment on column public.employees.lng is
  'Longitude (WGS-84) of the employee''s home address. Populated by the Crew Finder via Google Geocoding API; null = not yet geocoded.';
comment on column public.employees.lat_lookup_attempted_at is
  'Last time we tried to geocode this employee. Set on failure so retries cooldown (30 days); cleared on success.';
comment on column public.employees.lat_lookup_failed_reason is
  'Why the last geocode attempt failed. Mirrors api/src/lib/geocoding.ts GeocodeFailure.reason: no_address | not_found | http_error | parse_error.';

-- Fast fetch of only the geocoded rows.
create index if not exists idx_employees_lat_lng
  on public.employees(business_id, lat, lng)
  where lat is not null and lng is not null;

-- Find unresolved rows fast (for the "needs geocoding" cooldown query).
create index if not exists idx_employees_lat_lookup_attempted_at
  on public.employees(business_id, lat_lookup_attempted_at)
  where lat is null and lat_lookup_attempted_at is not null;

-- Only the "permanently skip" rows.
create index if not exists idx_employees_geocoding_ignored
  on public.employees (business_id)
  where geocoding_ignored = true;

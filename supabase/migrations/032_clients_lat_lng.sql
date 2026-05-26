-- 032_clients_lat_lng.sql
-- Add coordinates to the clients table so the Map module can pin them
-- without geocoding on every render. Address-only rows are geocoded once
-- (via /api/v1/map/geocode-clients) and the result cached here.
--
-- Jobs already have job_lat/job_lng (migration 023). Employees stay
-- address-only for now — their map pin is derived from the job they're
-- assigned to today, not their personal location.
--
-- Idempotent: safe to re-run.

alter table public.clients
  add column if not exists lat numeric(10, 7),
  add column if not exists lng numeric(10, 7);

comment on column public.clients.lat is
  'Latitude in WGS-84. Populated by the Map module via Google Geocoding API; null = not yet geocoded.';
comment on column public.clients.lng is
  'Longitude in WGS-84. Populated by the Map module via Google Geocoding API; null = not yet geocoded.';

-- Partial index so the map endpoint can quickly fetch only rows that have
-- coordinates without scanning the whole table. Useful once you have
-- hundreds of clients with mixed geocoding state.
create index if not exists idx_clients_lat_lng
  on public.clients(business_id, lat, lng)
  where lat is not null and lng is not null;

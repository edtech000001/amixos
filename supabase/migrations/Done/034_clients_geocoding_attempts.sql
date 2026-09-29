-- 034_clients_geocoding_attempts.sql
-- Track when geocoding was last attempted on a client so:
--   1. Unresolvable addresses don't burn Google quota on every refresh.
--   2. The Map banner can show a useful breakdown (no-address vs
--      unresolved vs not-yet-attempted) instead of a single opaque
--      "missing coordinates" count.
--
-- Rules:
--   - On a successful geocode, lat/lng are set + lat_lookup_attempted_at
--     and lat_lookup_failed_reason are cleared.
--   - On a failure (no_address / not_found / parse_error), lat stays
--     null but lat_lookup_attempted_at is stamped + reason is recorded.
--   - The "needs geocoding" pass skips rows whose attempt is within the
--     last 30 days (in case the address gets fixed later).
--
-- Idempotent: safe to re-run.

alter table public.clients
  add column if not exists lat_lookup_attempted_at timestamptz,
  add column if not exists lat_lookup_failed_reason text;

comment on column public.clients.lat_lookup_attempted_at is
  'Last time the Map module tried to geocode this row. Set on failure so we cooldown retries; cleared on success.';
comment on column public.clients.lat_lookup_failed_reason is
  'Why the last geocode attempt failed. Values mirror api/src/lib/geocoding.ts GeocodeFailure.reason: no_address | not_found | http_error | parse_error.';

-- Helps the breakdown queries on /pins — find unresolved rows fast.
create index if not exists idx_clients_lat_lookup_attempted_at
  on public.clients(business_id, lat_lookup_attempted_at)
  where lat is null and lat_lookup_attempted_at is not null;

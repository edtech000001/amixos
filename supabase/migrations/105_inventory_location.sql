-- 105_inventory_location.sql
-- Per-location inventory stock (follow-up to 104_locations.sql). Each inventory
-- item belongs to (at most) one branch, so a business that runs multiple
-- locations tracks separate stock per branch — the same physical item kept at
-- both Lexington and Georgia is two rows, one per location.
--
-- Nullable + no backfill: existing items stay location-less (visible in the
-- "All locations" view) and single-location businesses are unaffected. The
-- inventory module only shows a branch picker once ≥2 locations exist.
--
-- on delete set null so archiving/deleting a location leaves its items intact
-- (they fall back to the unassigned/all view), matching jobs.location_id (104).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.inventory_items
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists inventory_items_location_idx
  on public.inventory_items (location_id);

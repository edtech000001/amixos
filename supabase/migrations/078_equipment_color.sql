-- 078_equipment_color.sql
-- Adds a free-text body color to equipment (shown in the add/edit form and the
-- detail view). Nullable; no backfill needed.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.equipment
  add column if not exists color text;

-- 071_profiles_dock_apps.sql
-- Per-user mobile dock preference: which apps appear in the bottom nav bar.
-- Stored as a JSONB array of app keys (e.g. ["trabajos","clientes","facturas"]).
-- NULL ⇒ the user hasn't customized it ⇒ the app uses its default dock.
--
-- No new RLS needed: the existing `profiles` row policies (a user reads/updates
-- their own row) already cover this column.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.profiles
  add column if not exists dock_apps jsonb;

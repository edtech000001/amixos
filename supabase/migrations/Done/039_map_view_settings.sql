-- 039_map_view_settings.sql
-- Per-business map VIEW settings (map type, clustering, pin size). These
-- used to live in localStorage (web) / AsyncStorage (mobile) as per-device
-- prefs, but users expect them to follow them across devices, so they now
-- sync through the business row like map_pin_config (migration 035).
-- Example shape:
-- {
--   "mapType":   "roadmap",   -- roadmap | satellite | hybrid | terrain
--   "clustering": true,
--   "pinSize":   "medium"     -- small | medium | large
-- }
--
-- Nullable with no default: a null/absent value means "use client defaults"
-- so existing businesses keep the previous default view until they save.
--
-- Idempotent: safe to re-run.

alter table public.businesses
  add column if not exists map_view_settings jsonb;

comment on column public.businesses.map_view_settings is
  'Per-business map view prefs for the Map module (mapType|clustering|pinSize). Synced across devices. See migration 039 header for shape.';

-- 035_map_pin_config.sql
-- Per-business map pin customization config. Lets the user set:
--   - Default color + icon for each layer (clients, jobs, employees)
--   - Optional "color by field" rule: pick a field (custom or standard)
--     and map field values → custom colors + icons
-- Example shape:
-- {
--   "clients": {
--     "default_color": "#0EA5E9",
--     "default_icon":  "pin",
--     "field_key":     "marca_de_pivot",
--     "rules": [
--       { "value": "Valley", "color": "#3B82F6", "icon": "circle" },
--       { "value": "Reinke", "color": "#10B981", "icon": "square" }
--     ]
--   },
--   "jobs":      { ... same shape ... },
--   "employees": { ... same shape ... }
-- }
--
-- Stored as a single JSONB column so the shape can evolve without
-- migrations. Per-device map prefs (map type, clustering, pin size)
-- live in AsyncStorage/localStorage, NOT here.
--
-- Idempotent: safe to re-run.

alter table public.businesses
  add column if not exists map_pin_config jsonb not null default '{}'::jsonb;

comment on column public.businesses.map_pin_config is
  'Per-layer pin styling rules for the Map module. Keyed by layer (clients|jobs|employees). See migration 035 header for shape.';

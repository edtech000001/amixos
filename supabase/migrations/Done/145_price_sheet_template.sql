-- 145_price_sheet_template.sql
-- Style/layout config for the client-facing PRICE SHEET generator, stored per
-- business (mirrors invoice_template). JSON shape:
--   { accentColor: "#4F46E5", categoryOrder: ["Grain Bins", ...] }
--   - accentColor   → header / section-title color
--   - categoryOrder → the order sections appear (unlisted follow alphabetically)
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

alter table public.businesses
  add column if not exists price_sheet_template jsonb;

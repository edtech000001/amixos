-- 142_price_addons.sql
-- Price-sheet ADD-ONS (surcharges). A price item flagged is_addon = true is a
-- surcharge (e.g. "Boombacks" +$0.25/ft) that STACKS on top of the matched base
-- price during Autoprice — for every line whose text contains the add-on's
-- match terms. Its rate / state_rates / tier_rates / pricing_mode work exactly
-- like a normal item; it just adds instead of being the base.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

alter table public.price_sheet_items
  add column if not exists is_addon boolean not null default false;

comment on column public.price_sheet_items.is_addon is
  'true = a surcharge/add-on that stacks onto the matched base price during autoprice (e.g. Boombacks +$0.25/ft).';

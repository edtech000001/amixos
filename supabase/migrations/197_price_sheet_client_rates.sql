-- 197_price_sheet_client_rates.sql
-- =============================================================================
-- Per-CLIENT price overrides, replacing the price-tiers UX.
--
-- Tiers (140) required two disconnected steps — create a tier + price it on
-- items, THEN assign the tier on the client's edit page — and nothing in the
-- price modal explained the second step, so tiers ended up named after
-- individual clients and never linked. New model: the price item stores
-- client_rates jsonb { "<client_id>": rate } edited right in the price modal
-- via a client picker. Resolution becomes client > state > base.
--
-- Existing tier data auto-migrates where it can: for every item tier rate,
-- clients ASSIGNED to that tier get a client_rates entry. Tiers that were
-- never assigned to any client can't be mapped (that was the confusion) and
-- are left alone. price_tiers / tier_rates / clients.price_tier_id stay in
-- place but dormant — the app no longer reads or writes them.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run (the backfill only fills missing client keys).
-- =============================================================================

alter table public.price_sheet_items
  add column if not exists client_rates jsonb;

comment on column public.price_sheet_items.client_rates is
  'Per-client rate overrides: { "<client_id>": rate }. Beats state_rates.';

-- Backfill: tier rate → a client_rates entry for each client on that tier,
-- never overwriting a client key that already exists.
update public.price_sheet_items i
set client_rates = coalesce(i.client_rates, '{}'::jsonb) || m.mapped
from (
  select i2.id as item_id,
         jsonb_object_agg(c.id::text, i2.tier_rates -> t.id::text) as mapped
  from public.price_sheet_items i2
  join public.price_tiers t
    on t.business_id = i2.business_id
   and i2.tier_rates ? t.id::text
  join public.clients c
    on c.price_tier_id = t.id
  where i2.tier_rates is not null
    and not coalesce(i2.client_rates, '{}'::jsonb) ? c.id::text
  group by i2.id
) m
where m.item_id = i.id;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select name, client_rates from public.price_sheet_items
--   where client_rates is not null and client_rates <> '{}'::jsonb;

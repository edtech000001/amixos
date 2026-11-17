-- 278_price_client_rates_lowercase.sql
-- price_sheet_items.client_rates is keyed by client id. The apps used to load
-- it through the state-rate normalizer, which UPPERCASED the keys, and an edit
-- then saved them back that way. Uppercased ids never match clients.id::text,
-- so the price-sheet sync (migration 242) silently dropped those client prices.
-- This lowercases every key. Idempotent / safe to re-run.
--
-- Run manually in the Supabase SQL Editor.

update public.price_sheet_items i
set client_rates = (
  select jsonb_object_agg(lower(kv.key), kv.value)
  from jsonb_each(i.client_rates) kv
)
where jsonb_typeof(i.client_rates) = 'object'
  and exists (select 1 from jsonb_object_keys(i.client_rates) k where k <> lower(k));

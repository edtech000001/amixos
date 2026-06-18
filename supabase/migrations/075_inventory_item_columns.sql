-- 075_inventory_item_columns.sql
-- The inventory_items table (migration 001) predates the current inventory
-- MODULE. The app (web + mobile inventory module) reads/writes
--   unit · unit_cost · category · low_stock_threshold
-- which 001 never created (it had unit_price / low_stock_at). This adds the
-- columns the code actually uses and carries over any data from the originals,
-- so the Add/Edit item form saves correctly.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.inventory_items
  add column if not exists unit                text          not null default 'unidad',
  add column if not exists unit_cost           numeric(10,2) not null default 0,
  add column if not exists category            text,
  add column if not exists low_stock_threshold integer       not null default 0;

-- Carry over data from the original 001 columns, only if those columns still
-- exist (guarded so the migration never errors on a differently-shaped DB).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_items' and column_name = 'unit_price'
  ) then
    update public.inventory_items set unit_cost = unit_price
      where unit_price is not null and unit_cost = 0;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_items' and column_name = 'low_stock_at'
  ) then
    update public.inventory_items set low_stock_threshold = low_stock_at
      where low_stock_at is not null and low_stock_threshold = 0;
  end if;
end $$;

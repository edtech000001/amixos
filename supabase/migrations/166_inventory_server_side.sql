-- 166_inventory_server_side.sql
-- Supports the server-side (paginated) inventory list.
--
-- 1. A STORED generated column `is_low_stock` so the "low stock" segment can be
--    filtered in the DB with a plain `.eq('is_low_stock', true)` — PostgREST
--    can't compare two columns (quantity <= low_stock_threshold) in a filter,
--    and the list now pages rather than loading every row to compute it.
-- 2. `inventory_stats(business, location)` — the list's summary strip (item
--    count, total stock value, low-stock count) sums EVERY item in scope, which
--    a single page can't do once the list paginates. SECURITY INVOKER so it
--    respects the caller's RLS on inventory_items.
--
-- Both quantity and low_stock_threshold are NOT NULL (migration 075), so the
-- comparison is always defined. IMPORTANT: run manually in the Supabase SQL
-- Editor. Idempotent / safe to re-run.

alter table public.inventory_items
  add column if not exists is_low_stock boolean
    generated always as (quantity <= low_stock_threshold) stored;

create index if not exists inventory_items_low_stock_idx
  on public.inventory_items (business_id, is_low_stock);

-- Name index backs the keyset order (name, id) the list pages by.
create index if not exists inventory_items_name_idx
  on public.inventory_items (business_id, name, id);

create or replace function public.inventory_stats(
  p_business_id uuid,
  p_location_id uuid default null
)
returns table(total_count bigint, total_value numeric, low_stock_count bigint)
language sql stable security invoker as $$
  select
    count(*)                                             as total_count,
    coalesce(sum(quantity * unit_cost), 0)               as total_value,
    count(*) filter (where is_low_stock)                 as low_stock_count
  from public.inventory_items
  where business_id = p_business_id
    and (p_location_id is null or location_id = p_location_id);
$$;

-- ── Test in the SQL Editor (replace the uuid) ────────────────────────────────
--   select * from public.inventory_stats('<your-business-uuid>');

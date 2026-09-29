-- 139_price_sheet.sql
-- Price sheet: a per-business catalog of priced items used to AUTOPRICE job
-- line items. Industry-agnostic — the only per-industry differences are the
-- free-text `category` grouping and the `unit_label` (ft, cut, item, meal,
-- sq ft…). One shape covers pivots-per-foot, salon-per-cut, retail-per-item.
--
--   pricing_mode:
--     'per_unit' → amount = quantity × rate   (per foot / per cut / per item)
--     'flat'     → amount = rate              (corner, loading fee; qty forced 1)
--   state_rates: optional per-state overrides, { "NE": 3.75, "KS": 3.40 }.
--     Autoprice uses the JOB's state when present, else the base rate.
--
-- Also extends job_items so an autopriced line remembers which catalog entry
-- priced it (price_item_id) and the RAW measured quantity before a flat item
-- collapsed it to 1 (original_quantity) — e.g. a 205 ft corner billed flat.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.price_sheet_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,

  -- What we charge for ("New Pivot Assembly", "Men's Cut", "Burger").
  name          text not null,
  -- Free-text grouping shown as a section header ("New Pivots", "Repairs").
  category      text,

  pricing_mode  text not null default 'per_unit'
                  check (pricing_mode in ('per_unit', 'flat')),
  -- Display-only unit for per_unit items (ft, cut, item, sq ft, meal…).
  unit_label    text,

  rate          numeric not null default 0,
  -- Optional per-state overrides: jsonb { "<STATE>": <rate> }.
  state_rates   jsonb,

  sort_order    integer not null default 0,
  active        boolean not null default true,

  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists price_sheet_items_business_sort_idx
  on public.price_sheet_items (business_id, sort_order);

drop trigger if exists set_price_sheet_items_updated_at on public.price_sheet_items;
create trigger set_price_sheet_items_updated_at
  before update on public.price_sheet_items
  for each row execute function public.set_updated_at();

alter table public.price_sheet_items enable row level security;

-- Any member READS the sheet (field crew pick a price type when adding job
-- lines); office/manager+ manage it.
drop policy if exists "members read price_sheet_items" on public.price_sheet_items;
create policy "members read price_sheet_items" on public.price_sheet_items for select
  using (public.is_business_member(business_id));

drop policy if exists "writers insert price_sheet_items" on public.price_sheet_items;
create policy "writers insert price_sheet_items" on public.price_sheet_items for insert
  with check (public.can_write_business(business_id));

drop policy if exists "writers update price_sheet_items" on public.price_sheet_items;
create policy "writers update price_sheet_items" on public.price_sheet_items for update
  using (public.can_write_business(business_id));

drop policy if exists "writers delete price_sheet_items" on public.price_sheet_items;
create policy "writers delete price_sheet_items" on public.price_sheet_items for delete
  using (public.can_write_business(business_id));

-- ── job_items: remember the autoprice source + the raw measurement ──────────
alter table public.job_items
  add column if not exists price_item_id     uuid references public.price_sheet_items(id) on delete set null,
  add column if not exists original_quantity numeric;

comment on column public.job_items.price_item_id is
  'Price-sheet entry that autopriced this line (null = manual price).';
comment on column public.job_items.original_quantity is
  'Raw measured quantity before a flat item collapsed it to 1 (e.g. 205 ft corner). Null = quantity is the real quantity.';

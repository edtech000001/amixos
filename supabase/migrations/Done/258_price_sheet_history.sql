-- 258: Price sheet change history.
--
-- "It's been 2 years since I raised this price" / "what was it before?" —
-- every change to an item's PRICE (rate, flat vs per-unit, unit, per-state or
-- per-client rates) is recorded with who and when. Name / category / order /
-- active changes are not price changes and are not logged.
--
-- A trigger writes the rows, so every path is covered — the web and mobile
-- editors, sync_price_sheet (migration 242), imports — without trusting the
-- client. Nothing else can write: the table has a read policy only.
--
-- Existing items get one 'baseline' row (their price as of today), since what
-- they cost before is unknown; history is exact from here on.
--
-- Safe to re-run.

create table if not exists public.price_sheet_item_history (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  item_id          uuid not null references public.price_sheet_items(id) on delete cascade,
  -- 'created' (item added) | 'updated' (price changed) | 'baseline' (price
  -- when history tracking started — earlier history unknown)
  kind             text not null check (kind in ('created', 'updated', 'baseline')),
  changed_at       timestamptz not null default now(),
  changed_by       uuid references auth.users(id) on delete set null,
  -- Name at the time, so the entry still reads right after the user leaves.
  changed_by_name  text,
  -- Price fields before (null for created / baseline) and after the change.
  old_rate         numeric,
  new_rate         numeric,
  old_pricing_mode text,
  new_pricing_mode text,
  old_unit_label   text,
  new_unit_label   text,
  old_state_rates  jsonb,
  new_state_rates  jsonb,
  old_client_rates jsonb,
  new_client_rates jsonb
);

create index if not exists price_sheet_item_history_item_idx
  on public.price_sheet_item_history (item_id, changed_at desc);
create index if not exists price_sheet_item_history_business_idx
  on public.price_sheet_item_history (business_id);

alter table public.price_sheet_item_history enable row level security;

-- Same readers as the price sheet itself (initplan form, migration 257).
drop policy if exists "members read price_sheet_item_history" on public.price_sheet_item_history;
create policy "members read price_sheet_item_history" on public.price_sheet_item_history for select
  using (business_id in (select public.my_member_business_ids()));

-- ── Trigger ─────────────────────────────────────────────────────────────────
create or replace function public.price_sheet_items_log_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if tg_op = 'UPDATE'
     and new.rate is not distinct from old.rate
     and new.pricing_mode is not distinct from old.pricing_mode
     and new.unit_label is not distinct from old.unit_label
     and new.state_rates is not distinct from old.state_rates
     and new.client_rates is not distinct from old.client_rates then
    return new; -- not a price change (rename, reorder, (de)activate…)
  end if;

  if v_uid is not null then
    select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    nullif(u.raw_user_meta_data ->> 'name', ''),
                    u.email)
      into v_name
      from auth.users u where u.id = v_uid;
  end if;

  insert into public.price_sheet_item_history (
    business_id, item_id, kind, changed_by, changed_by_name,
    old_rate, new_rate, old_pricing_mode, new_pricing_mode,
    old_unit_label, new_unit_label, old_state_rates, new_state_rates,
    old_client_rates, new_client_rates
  ) values (
    new.business_id, new.id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    v_uid, v_name,
    case when tg_op = 'UPDATE' then old.rate end, new.rate,
    case when tg_op = 'UPDATE' then old.pricing_mode end, new.pricing_mode,
    case when tg_op = 'UPDATE' then old.unit_label end, new.unit_label,
    case when tg_op = 'UPDATE' then old.state_rates end, new.state_rates,
    case when tg_op = 'UPDATE' then old.client_rates end, new.client_rates
  );
  return new;
end;
$$;

-- Trigger functions are never called directly (security baseline).
revoke execute on function public.price_sheet_items_log_history() from public, anon, authenticated;

drop trigger if exists price_sheet_items_log_history on public.price_sheet_items;
create trigger price_sheet_items_log_history
  after insert or update on public.price_sheet_items
  for each row execute function public.price_sheet_items_log_history();

-- ── Baseline for existing items ─────────────────────────────────────────────
insert into public.price_sheet_item_history (
  business_id, item_id, kind, changed_at,
  new_rate, new_pricing_mode, new_unit_label, new_state_rates, new_client_rates
)
select i.business_id, i.id, 'baseline', now(),
       i.rate, i.pricing_mode, i.unit_label, i.state_rates, i.client_rates
  from public.price_sheet_items i
 where not exists (select 1 from public.price_sheet_item_history h where h.item_id = i.id);

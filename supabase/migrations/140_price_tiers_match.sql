-- 140_price_tiers_match.sql
-- Two extensions to the price sheet:
--
--   1. Client-based pricing via TIERS. A business defines a few named pricing
--      tiers ("Standard", "Far / high-travel", "Wholesale"); each price item
--      can hold an optional rate per tier (price_sheet_items.tier_rates jsonb,
--      keyed by tier id). A client is assigned a tier (clients.price_tier_id).
--      Applied-rate resolution, most-specific wins:
--          client tier override → job-state override → base rate.
--
--   2. Auto-price MATCH TERMS. Each price item can list alternate phrasings /
--      acronyms (price_sheet_items.match_terms, newline/comma separated) so the
--      job-side "Auto price" can guess the price type from a line's text
--      (name + custom fields + notes). Best-effort — the UI warns to verify.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.price_tiers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists price_tiers_business_idx
  on public.price_tiers (business_id, sort_order);

alter table public.price_tiers enable row level security;

drop policy if exists "members read price_tiers" on public.price_tiers;
create policy "members read price_tiers" on public.price_tiers for select
  using (public.is_business_member(business_id));

drop policy if exists "writers write price_tiers" on public.price_tiers;
create policy "writers write price_tiers" on public.price_tiers for all
  using (public.can_write_business(business_id))
  with check (public.can_write_business(business_id));

alter table public.clients
  add column if not exists price_tier_id uuid references public.price_tiers(id) on delete set null;

alter table public.price_sheet_items
  add column if not exists tier_rates  jsonb,
  add column if not exists match_terms text;

comment on column public.price_sheet_items.tier_rates is
  'Per-tier rate overrides { "<tier_id>": rate }. Beats state_rates for a client on that tier.';
comment on column public.price_sheet_items.match_terms is
  'Newline/comma-separated aliases for text auto-matching (acronyms, alt phrasings).';

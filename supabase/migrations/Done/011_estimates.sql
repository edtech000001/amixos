-- Migration 011: Estimates / Quotes module
-- Run in Supabase SQL Editor

-- ── 1. Estimates table ───────────────────────────────────────────────────────
create table if not exists public.estimates (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete set null,
  job_id           uuid references public.jobs(id) on delete set null,
  invoice_id       uuid references public.invoices(id) on delete set null,

  estimate_number  text not null,
  status           text not null default 'draft'
                     check (status in ('draft','sent','accepted','declined','expired','converted')),

  title            text not null,
  notes            text,
  internal_notes   text,

  issue_date       date not null default current_date,
  expiry_date      date,

  subtotal_amount  numeric(10,2) not null default 0,
  tax_rate         numeric(5,2) not null default 0,
  tax_amount       numeric(10,2) not null default 0,
  discount         numeric(10,2) not null default 0,
  total_amount     numeric(10,2) not null default 0,

  line_items       jsonb not null default '[]'::jsonb,

  sent_at          timestamptz,
  accepted_at      timestamptz,
  declined_at      timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS
alter table public.estimates enable row level security;

create policy "owner manage estimates"
  on public.estimates for all
  using (exists (
    select 1 from public.businesses
    where businesses.id = estimates.business_id
      and businesses.owner_id = auth.uid()
  ));

-- updated_at trigger
drop trigger if exists set_estimates_updated_at on public.estimates;
create trigger set_estimates_updated_at
  before update on public.estimates
  for each row execute procedure public.set_updated_at();

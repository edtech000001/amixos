-- Migration 005: Add employees table + update timesheets for manual tracking
-- Allows owners to manage workers without requiring them to have app accounts

create table if not exists public.employees (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  first_name text not null,
  last_name text not null default '',
  phone text,
  role text not null default 'worker',
  pay_type text not null default 'hourly', -- hourly | salary | daily
  pay_rate numeric(10,2) default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "Owner can manage employees"
  on public.employees for all
  using (
    exists (select 1 from public.businesses where businesses.id = employees.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = employees.business_id and businesses.owner_id = auth.uid())
  );

-- Add employee_id + worker_name to timesheets so entries can reference our employees table
alter table public.timesheets
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists worker_name text,
  add column if not exists hours_worked numeric(6,2),
  add column if not exists work_date date not null default current_date;

-- Allow null on user_id for manual entries
alter table public.timesheets alter column user_id drop not null;

-- Update timesheets RLS to allow business owner
drop policy if exists "Business members can manage their timesheets" on public.timesheets;
drop policy if exists "Members can manage timesheets" on public.timesheets;

create policy "Owner can manage timesheets"
  on public.timesheets for all
  using (
    exists (select 1 from public.businesses where businesses.id = timesheets.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = timesheets.business_id and businesses.owner_id = auth.uid())
  );
-- Migration 006: Replace business_members-dependent policies with owner-direct checks

-- ── CLIENTS ──────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage clients" on public.clients;

create policy "Owner can manage clients"
  on public.clients for all
  using (
    exists (select 1 from public.businesses where businesses.id = clients.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = clients.business_id and businesses.owner_id = auth.uid())
  );

-- ── INVOICES ─────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage invoices" on public.invoices;

create policy "Owner can manage invoices"
  on public.invoices for all
  using (
    exists (select 1 from public.businesses where businesses.id = invoices.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = invoices.business_id and businesses.owner_id = auth.uid())
  );

-- ── BUSINESS MODULES ─────────────────────────────────────────────────────────
drop policy if exists "Business members can view modules" on public.business_modules;
drop policy if exists "Owners can manage modules" on public.business_modules;

create policy "Owner can manage modules"
  on public.business_modules for all
  using (
    exists (select 1 from public.businesses where businesses.id = business_modules.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = business_modules.business_id and businesses.owner_id = auth.uid())
  );

-- ── CALENDAR EVENTS ──────────────────────────────────────────────────────────
drop policy if exists "Business members can manage calendar events" on public.calendar_events;

create policy "Owner can manage calendar events"
  on public.calendar_events for all
  using (
    exists (select 1 from public.businesses where businesses.id = calendar_events.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = calendar_events.business_id and businesses.owner_id = auth.uid())
  );

-- ── INVENTORY ────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage inventory" on public.inventory_items;

create policy "Owner can manage inventory"
  on public.inventory_items for all
  using (
    exists (select 1 from public.businesses where businesses.id = inventory_items.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = inventory_items.business_id and businesses.owner_id = auth.uid())
  );

-- ── TIMESHEETS ───────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage their timesheets" on public.timesheets;
drop policy if exists "Members can manage timesheets" on public.timesheets;
-- Migration 007: Add missing invoice columns
alter table public.invoices
  add column if not exists issue_date date default current_date,
  add column if not exists tax_rate numeric(5,2) default 0,
  add column if not exists subtotal_amount numeric(10,2) default 0,
  add column if not exists tax_amount numeric(10,2) default 0,
  add column if not exists total_amount numeric(10,2) default 0;

-- Copy existing data to new columns for consistency
update public.invoices set
  subtotal_amount = subtotal,
  tax_amount = tax,
  total_amount = total
where total_amount = 0;

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

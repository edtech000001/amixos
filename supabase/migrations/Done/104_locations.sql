-- 104_locations.sql
-- Multi-location support: a business can have multiple physical locations /
-- branches (e.g. "Lexington" and "Georgia"). Day-to-day data is separated per
-- location; reports still roll up across all of them.
--
-- Model:
--   * locations          — one row per branch, scoped to a business.
--   * jobs.location_id    — each job belongs to (at most) one location.
--   * employee_locations  — many-to-many worker <-> location, so a worker lent
--                           from one branch to another appears in both lists.
--                           is_primary marks the worker's home branch.
--
-- Clients stay shared business-wide (no location_id). Invoices / timesheets /
-- payroll inherit their location from the job. Inventory per-location stock is
-- a later pass.
--
-- Backfill is intentionally OMITTED: location_id is nullable and a business
-- with zero locations behaves exactly as before (single-location mode, no
-- picker). Multi-location only activates once locations are added in Ajustes.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- 1. Locations (branches).
create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  address      text,
  city         text,
  state        text,
  postal_code  text,
  country      text,
  is_default   boolean not null default false,  -- pre-selected when assigning new records
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists locations_business_idx
  on public.locations (business_id);

alter table public.locations enable row level security;

drop policy if exists "members read locations" on public.locations;
create policy "members read locations" on public.locations for select
  using (public.is_business_member(business_id));

drop policy if exists "admins insert locations" on public.locations;
create policy "admins insert locations" on public.locations for insert
  with check (public.is_business_admin(business_id));

drop policy if exists "admins update locations" on public.locations;
create policy "admins update locations" on public.locations for update
  using (public.is_business_admin(business_id));

drop policy if exists "admins delete locations" on public.locations;
create policy "admins delete locations" on public.locations for delete
  using (public.is_business_admin(business_id));

-- 2. Each job belongs to a location. on delete set null so deleting a location
--    leaves its jobs intact (they fall back to the unassigned/all view).
alter table public.jobs
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists jobs_location_idx
  on public.jobs (location_id);

-- 3. Worker <-> location assignments (home + borrowed). business_id is carried
--    for simple RLS + scoped queries.
create table if not exists public.employee_locations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  location_id  uuid not null references public.locations(id) on delete cascade,
  is_primary   boolean not null default false,  -- the worker's home branch
  created_at   timestamptz not null default now(),
  unique (employee_id, location_id)
);

create index if not exists employee_locations_business_idx
  on public.employee_locations (business_id);
create index if not exists employee_locations_location_idx
  on public.employee_locations (location_id);
create index if not exists employee_locations_employee_idx
  on public.employee_locations (employee_id);

alter table public.employee_locations enable row level security;

drop policy if exists "members read employee_locations" on public.employee_locations;
create policy "members read employee_locations" on public.employee_locations for select
  using (public.is_business_member(business_id));

drop policy if exists "admins insert employee_locations" on public.employee_locations;
create policy "admins insert employee_locations" on public.employee_locations for insert
  with check (public.is_business_admin(business_id));

drop policy if exists "admins update employee_locations" on public.employee_locations;
create policy "admins update employee_locations" on public.employee_locations for update
  using (public.is_business_admin(business_id));

drop policy if exists "admins delete employee_locations" on public.employee_locations;
create policy "admins delete employee_locations" on public.employee_locations for delete
  using (public.is_business_admin(business_id));

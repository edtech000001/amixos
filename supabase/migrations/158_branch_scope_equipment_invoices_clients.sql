-- 158_branch_scope_equipment_invoices_clients.sql
-- Extend branch (location) scoping to equipment, invoices, and clients so
-- multi-location businesses can file and filter these like jobs/inventory.
--
--   equipment.location_id  — single branch per item (like jobs/inventory).
--   invoices.location_id   — single branch; seeded from the job it's generated
--                            from, filterable directly.
--   client_locations       — MANY-to-many (like employee_locations): a client
--                            has a home branch and can be shared into others,
--                            so they never vanish from a branch where they have
--                            work. Clients stay shared-by-default (no link =
--                            shows everywhere) for backward compatibility.
--
-- Single-location businesses are unaffected (nothing filters on one branch).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── equipment ───────────────────────────────────────────────────────────────
alter table public.equipment
  add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists equipment_location_idx on public.equipment (location_id);

-- ── invoices ────────────────────────────────────────────────────────────────
alter table public.invoices
  add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists invoices_location_idx on public.invoices (location_id);

-- ── client_locations (many-to-many, mirrors employee_locations) ─────────────
create table if not exists public.client_locations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  location_id  uuid not null references public.locations(id) on delete cascade,
  is_primary   boolean not null default false,  -- the client's home branch
  created_at   timestamptz not null default now(),
  unique (client_id, location_id)
);

create index if not exists client_locations_business_idx on public.client_locations (business_id);
create index if not exists client_locations_location_idx on public.client_locations (location_id);
create index if not exists client_locations_client_idx   on public.client_locations (client_id);

alter table public.client_locations enable row level security;

-- Read = any member; write = office+ (can_write_business) since clients are
-- office-editable (unlike employees, which are admin-only).
drop policy if exists "members read client_locations" on public.client_locations;
create policy "members read client_locations" on public.client_locations for select
  using (public.is_business_member(business_id));

drop policy if exists "writers insert client_locations" on public.client_locations;
create policy "writers insert client_locations" on public.client_locations for insert
  with check (public.can_write_business(business_id));

drop policy if exists "writers update client_locations" on public.client_locations;
create policy "writers update client_locations" on public.client_locations for update
  using (public.can_write_business(business_id));

drop policy if exists "writers delete client_locations" on public.client_locations;
create policy "writers delete client_locations" on public.client_locations for delete
  using (public.can_write_business(business_id));

-- 160_location_lock_rls_perf.sql
-- PERFORMANCE FIX for the location-lock RLS added in 159.
--
-- 159's restrictive policies called a SECURITY DEFINER plpgsql helper with a
-- per-ROW business_id argument — member_can_see_location(business_id, location_id)
-- → member_location_locked(business_id) → member_role()/business_roles lookups.
-- Because business_id is a column (not a constant), Postgres re-evaluated the
-- helper for EVERY row. On a large table (thousands of imported jobs) that blew
-- past the statement timeout ("canceling statement due to statement timeout").
--
-- Fix: express the identical rule with NO-ARG set functions that depend only on
-- auth.uid(). An uncorrelated subquery is evaluated ONCE per statement (an
-- InitPlan Postgres caches), and the per-row work collapses to a cheap
-- set-membership test. For a NON-locked user (owners always; admins/managers by
-- default) member_locked_businesses() is empty, so `business_id NOT IN (…)` is
-- true for every row and the restrictive policy passes with a single function
-- evaluation for the whole query — no per-row cost at all.
--
-- Semantics are UNCHANGED from 159: unfiled rows / clients / workers with no
-- branch link stay visible; only 'field' is locked by default; owner never
-- locked; explicit switchLocations=false in business_roles overrides.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── No-arg helpers (depend only on auth.uid() → evaluated once per query) ─────
-- Businesses where the current user's role is location-locked.
create or replace function public.member_locked_businesses()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select bm.business_id
  from public.business_members bm
  where bm.user_id = auth.uid()
    and public.member_location_locked(bm.business_id);
$$;

-- For those locked businesses, the (business_id, location_id) pairs the user is
-- assigned to (via employee_locations) and may therefore see.
create or replace function public.member_location_grants()
returns table(business_id uuid, location_id uuid)
language sql stable security definer set search_path = public as $$
  select el.business_id, el.location_id
  from public.employee_locations el
  join public.employees e on e.id = el.employee_id
  where e.user_id = auth.uid()
    and el.business_id in (select public.member_locked_businesses());
$$;

-- ── Replace the 159 restrictive SELECT policies with set-based versions ───────
-- The leading `business_id NOT IN (locked set)` short-circuits (OR) for every
-- non-locked user, so the EXISTS clauses only ever run for locked users (whose
-- data set is small — field crew scoped to their branch).

-- location_id-bearing tables ------------------------------------------------
drop policy if exists "loc lock jobs" on public.jobs;
create policy "loc lock jobs" on public.jobs as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or location_id is null
    or (business_id, location_id) in (select business_id, location_id from public.member_location_grants())
  );

drop policy if exists "loc lock invoices" on public.invoices;
create policy "loc lock invoices" on public.invoices as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or location_id is null
    or (business_id, location_id) in (select business_id, location_id from public.member_location_grants())
  );

drop policy if exists "loc lock equipment" on public.equipment;
create policy "loc lock equipment" on public.equipment as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or location_id is null
    or (business_id, location_id) in (select business_id, location_id from public.member_location_grants())
  );

drop policy if exists "loc lock inventory" on public.inventory_items;
create policy "loc lock inventory" on public.inventory_items as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or location_id is null
    or (business_id, location_id) in (select business_id, location_id from public.member_location_grants())
  );

-- worker-linked tables (visible when the worker is visible to the user) ------
drop policy if exists "loc lock employees" on public.employees;
create policy "loc lock employees" on public.employees as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or user_id = auth.uid()
    or not exists (select 1 from public.employee_locations el where el.employee_id = employees.id)
    or exists (
      select 1 from public.employee_locations el
      join public.member_location_grants() g on g.business_id = el.business_id and g.location_id = el.location_id
      where el.employee_id = employees.id
    )
  );

drop policy if exists "loc lock timesheets" on public.timesheets;
create policy "loc lock timesheets" on public.timesheets as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or employee_id is null
    or exists (select 1 from public.employees e2 where e2.id = timesheets.employee_id and e2.user_id = auth.uid())
    or not exists (select 1 from public.employee_locations el where el.employee_id = timesheets.employee_id)
    or exists (
      select 1 from public.employee_locations el
      join public.member_location_grants() g on g.business_id = el.business_id and g.location_id = el.location_id
      where el.employee_id = timesheets.employee_id
    )
  );

drop policy if exists "loc lock payroll_payments" on public.payroll_payments;
create policy "loc lock payroll_payments" on public.payroll_payments as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or employee_id is null
    or exists (select 1 from public.employees e2 where e2.id = payroll_payments.employee_id and e2.user_id = auth.uid())
    or not exists (select 1 from public.employee_locations el where el.employee_id = payroll_payments.employee_id)
    or exists (
      select 1 from public.employee_locations el
      join public.member_location_grants() g on g.business_id = el.business_id and g.location_id = el.location_id
      where el.employee_id = payroll_payments.employee_id
    )
  );

drop policy if exists "loc lock employee_loans" on public.employee_loans;
create policy "loc lock employee_loans" on public.employee_loans as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or employee_id is null
    or exists (select 1 from public.employees e2 where e2.id = employee_loans.employee_id and e2.user_id = auth.uid())
    or not exists (select 1 from public.employee_locations el where el.employee_id = employee_loans.employee_id)
    or exists (
      select 1 from public.employee_locations el
      join public.member_location_grants() g on g.business_id = el.business_id and g.location_id = el.location_id
      where el.employee_id = employee_loans.employee_id
    )
  );

-- clients (M2M via client_locations; no link = shared everywhere) ------------
drop policy if exists "loc lock clients" on public.clients;
create policy "loc lock clients" on public.clients as restrictive for select
  using (
    business_id not in (select public.member_locked_businesses())
    or not exists (select 1 from public.client_locations cl where cl.client_id = clients.id)
    or exists (
      select 1 from public.client_locations cl
      join public.member_location_grants() g on g.business_id = cl.business_id and g.location_id = cl.location_id
      where cl.client_id = clients.id
    )
  );

-- ── Drop the now-unused 159 per-row helpers (policies no longer reference) ────
drop function if exists public.member_can_see_location(uuid, uuid);
drop function if exists public.member_can_see_employee(uuid, uuid);
drop function if exists public.member_can_see_client(uuid, uuid);
drop function if exists public.member_location_ids(uuid);

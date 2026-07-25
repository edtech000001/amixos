-- 159_location_lock_rls.sql
-- Per-role location lock (server enforcement).
--
-- A role may carry the `switchLocations` capability (see shared/src/lib/
-- permissions.ts). When FALSE, that role is "locked" to its own home branch:
-- across the whole app it may only READ rows that belong to a branch it's
-- assigned to (employee_locations). This migration enforces that in the
-- database so a locked user cannot read other branches' data even outside the
-- app UI (the client also hides the branch switcher for them).
--
-- Approach: additive RESTRICTIVE SELECT policies. A restrictive policy is
-- AND-combined with the existing permissive policies, so it can only ever
-- NARROW access — it never grants anything new, and non-locked users (the
-- common case) pass it unconditionally. This avoids touching / re-creating any
-- existing policy.
--
-- Defaults (mirrors permissions.ts): only 'field' is locked by default; every
-- other role can switch. Owner is never locked. An explicit switchLocations
-- value saved via the role editor (business_roles.permissions) overrides the
-- default. Unfiled rows (null location / worker or client with no branch link)
-- stay visible to everyone, matching the app's "no link = shared" convention.
--
-- Single-location businesses are unaffected: nothing is filed to a branch, so
-- every can_see_* check returns true.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- All helpers are SECURITY DEFINER so the subqueries they run bypass RLS on the
-- very tables the policies guard — without this the employees policy would
-- recurse on itself.

-- ── Is the current user locked to their home branch in this business? ─────────
create or replace function public.member_location_locked(b_id uuid)
returns boolean
language plpgsql security definer stable set search_path = public as $$
declare
  r text;
  p jsonb;
  v text;
begin
  r := public.member_role(b_id);
  if r is null then return false; end if;      -- not a member; other policies decide
  if r = 'owner' then return false; end if;     -- owner is never locked
  select permissions into p from public.business_roles
    where business_id = b_id and key = r;
  if p is not null then
    v := p #>> array['caps','switchLocations'];
  end if;
  -- No explicit value: default matches permissions.ts (only 'field' is locked).
  if v is null then
    return r = 'field';
  end if;
  return v = 'false';
end;
$$;

-- ── The branch ids the current user is assigned to (home + borrowed) ─────────
create or replace function public.member_location_ids(b_id uuid)
returns setof uuid
language sql security definer stable set search_path = public as $$
  select el.location_id
  from public.employee_locations el
  join public.employees e on e.id = el.employee_id
  where el.business_id = b_id and e.user_id = auth.uid();
$$;

-- ── Row-visibility predicates ────────────────────────────────────────────────
-- For tables with a direct location_id (jobs, invoices, equipment, inventory).
create or replace function public.member_can_see_location(b_id uuid, loc uuid)
returns boolean
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.member_location_locked(b_id) then return true; end if;
  if loc is null then return true; end if;                     -- unfiled = shared
  return loc in (select public.member_location_ids(b_id));
end;
$$;

-- For worker-linked tables (employees, timesheets, payroll_payments, loans).
-- Visible if it's the viewer themselves, the worker has no branch assignment
-- (unfiled = shared), or the worker shares a branch with the viewer.
create or replace function public.member_can_see_employee(b_id uuid, emp uuid)
returns boolean
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.member_location_locked(b_id) then return true; end if;
  if emp is null then return true; end if;
  return
    exists (select 1 from public.employees e where e.id = emp and e.user_id = auth.uid())
    or not exists (select 1 from public.employee_locations el where el.employee_id = emp)
    or exists (
      select 1 from public.employee_locations el
      where el.employee_id = emp
        and el.location_id in (select public.member_location_ids(b_id))
    );
end;
$$;

-- For clients (many-to-many via client_locations; no link = shared everywhere).
create or replace function public.member_can_see_client(b_id uuid, cli uuid)
returns boolean
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.member_location_locked(b_id) then return true; end if;
  if cli is null then return true; end if;
  return
    not exists (select 1 from public.client_locations cl where cl.client_id = cli)
    or exists (
      select 1 from public.client_locations cl
      where cl.client_id = cli
        and cl.location_id in (select public.member_location_ids(b_id))
    );
end;
$$;

-- ── Restrictive SELECT policies ──────────────────────────────────────────────
-- location_id-bearing tables
drop policy if exists "loc lock jobs" on public.jobs;
create policy "loc lock jobs" on public.jobs as restrictive for select
  using (public.member_can_see_location(business_id, location_id));

drop policy if exists "loc lock invoices" on public.invoices;
create policy "loc lock invoices" on public.invoices as restrictive for select
  using (public.member_can_see_location(business_id, location_id));

drop policy if exists "loc lock equipment" on public.equipment;
create policy "loc lock equipment" on public.equipment as restrictive for select
  using (public.member_can_see_location(business_id, location_id));

drop policy if exists "loc lock inventory" on public.inventory_items;
create policy "loc lock inventory" on public.inventory_items as restrictive for select
  using (public.member_can_see_location(business_id, location_id));

-- worker-linked tables
drop policy if exists "loc lock employees" on public.employees;
create policy "loc lock employees" on public.employees as restrictive for select
  using (public.member_can_see_employee(business_id, id));

drop policy if exists "loc lock timesheets" on public.timesheets;
create policy "loc lock timesheets" on public.timesheets as restrictive for select
  using (public.member_can_see_employee(business_id, employee_id));

drop policy if exists "loc lock payroll_payments" on public.payroll_payments;
create policy "loc lock payroll_payments" on public.payroll_payments as restrictive for select
  using (public.member_can_see_employee(business_id, employee_id));

drop policy if exists "loc lock employee_loans" on public.employee_loans;
create policy "loc lock employee_loans" on public.employee_loans as restrictive for select
  using (public.member_can_see_employee(business_id, employee_id));

-- clients (M2M)
drop policy if exists "loc lock clients" on public.clients;
create policy "loc lock clients" on public.clients as restrictive for select
  using (public.member_can_see_client(business_id, id));

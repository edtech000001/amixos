-- 178_employees_roster_view.sql
-- Names-only employee roster, readable by EVERY member of the business.
--
-- Problem: the crew / driver / lead pickers (job form), calendar lead filter,
-- equipment assignee picker and "created by" name resolution all read
-- public.employees, whose SELECT policy requires the Employees permission
-- (member_view = 'all'). So a Field worker could only staff a job if his role
-- was given full Employees access — which also exposes the Team screen with
-- everyone's pay rate, phone and address. All-or-nothing.
--
-- Fix: a SECURITY DEFINER view exposing ONLY non-sensitive roster columns
-- (names, role label, active/roster flags). No pay_rate/pay_type, no phone,
-- no address, no home lat/lng, no custom fields. Membership is checked in the
-- view's WHERE, and the migration-159/160 per-branch location lock is mirrored
-- so a location-locked role still only sees its own branch's roster.
--
-- Client read paths for pickers now use employees_roster; the Team screen,
-- payroll and reports keep reading employees (still gated by the Employees
-- permission). Unchecking Employees→View for Field hides the Team screen but
-- leaves crew/driver selection working.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace view public.employees_roster
with (security_invoker = off) as
select
  e.id,
  e.business_id,
  e.user_id,
  e.first_name,
  e.last_name,
  e.role,
  e.active,
  e.show_in_roster
from public.employees e
where
  -- Any member of the business may read the roster (names only) — including
  -- members holding custom roles (migration 179), hence no fixed role list.
  -- Initplan form (181): evaluated once per query, not per row.
  e.business_id in (select public.my_member_business_ids())
  -- Location lock (mirrors the 160 restrictive policy on employees): a
  -- location-locked member only sees employees of branches they belong to;
  -- their own row and branchless employees stay visible.
  and (
    e.business_id not in (select public.member_locked_businesses())
    or e.user_id = auth.uid()
    or not exists (
      select 1 from public.employee_locations el where el.employee_id = e.id
    )
    or exists (
      select 1
      from public.employee_locations el
      join public.member_location_grants() g
        on g.business_id = el.business_id and g.location_id = el.location_id
      where el.employee_id = e.id
    )
  );

comment on view public.employees_roster is
  'Names-only roster for pickers (crew/driver/lead, calendar, equipment). Readable by any business member; pay and contact data stay behind the Employees permission on public.employees.';

revoke all on public.employees_roster from anon;
grant select on public.employees_roster to authenticated;
grant select on public.employees_roster to service_role;

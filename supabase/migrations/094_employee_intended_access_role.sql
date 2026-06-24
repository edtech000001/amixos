-- 094_employee_intended_access_role.sql
-- The app-access role we PLAN to give a person once they're invited to sign in.
-- App access itself lives on a membership (business_members) that only exists
-- after the person accepts an invite — so this can't grant access on its own.
-- It's a staging value (set via team CSV import or by hand) that pre-selects the
-- role in the Invite dialog, so an admin just clicks Invite without re-picking.
-- Valid values mirror INVITABLE_ROLES: admin | manager | office | field | viewer.
--
-- Distinct from employees.role (a cosmetic 'worker' label) and from the actual
-- membership role granted at invite time.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.employees
  add column if not exists intended_access_role text;

comment on column public.employees.intended_access_role is
  'Planned app-access role (admin|manager|office|field|viewer) — pre-selects the Invite dialog. Not access itself.';

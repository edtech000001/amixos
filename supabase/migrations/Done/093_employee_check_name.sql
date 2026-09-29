-- 093_employee_check_name.sql
-- Legal name used on a paycheck. In Spanish-speaking culture a person often
-- goes by a different name than their legal one, but the check must use the
-- legal name. Stored separately from first/last (the display name) and shown
-- right under "last name" on the employee form by default.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.employees
  add column if not exists check_name text;

comment on column public.employees.check_name is
  'Full legal name for payroll/checks — may differ from the name the worker goes by.';

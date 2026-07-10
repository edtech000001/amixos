-- 128_employee_roster_flag.sql
-- "Aparece en cuadrillas": whether a team member is offered in job-form
-- rosters (lead / crew / driver pickers). Separate from `active` — an owner
-- or office admin is an ACTIVE member (payroll, app access, team list) who
-- simply shouldn't be pickable as field crew. Default true = current behavior.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.employees
  add column if not exists show_in_roster boolean not null default true;

comment on column public.employees.show_in_roster is
  'Offered in job crew/lead/driver pickers. False = office-only member (still active for payroll/app).';

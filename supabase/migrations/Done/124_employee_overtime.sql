-- 124_employee_overtime.sql
-- Per-worker overtime: the Nómina settings' overtime block is the master
-- switch + business-wide DEFAULTS (weekly threshold, multiplier). Each
-- hourly worker can then be opted in/out, and optionally override the
-- threshold/multiplier (null = inherit the business default).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.employees
  add column if not exists overtime_eligible boolean not null default true,
  add column if not exists overtime_threshold numeric,
  add column if not exists overtime_multiplier numeric;

comment on column public.employees.overtime_eligible is
  'Earns overtime when the business has it enabled (Nómina settings).';
comment on column public.employees.overtime_threshold is
  'Per-worker regular hours/week before OT; null = business default.';
comment on column public.employees.overtime_multiplier is
  'Per-worker OT multiplier; null = business default.';

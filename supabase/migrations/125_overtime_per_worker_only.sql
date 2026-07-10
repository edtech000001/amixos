-- 125_overtime_per_worker_only.sql
-- Overtime is now controlled ONLY per worker (employee form / Nómina worker
-- list) — the business-level "Pay overtime" master toggle is gone. The
-- Nómina settings keep the DEFAULT threshold/multiplier that workers
-- inherit. Default flips to false so overtime is opt-in per worker;
-- existing rows reset to false (enable each OT worker once, deliberately).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.employees
  alter column overtime_eligible set default false;

update public.employees set overtime_eligible = false where overtime_eligible = true;

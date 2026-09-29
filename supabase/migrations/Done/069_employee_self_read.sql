-- 069_employee_self_read.sql
-- ADD: let any business member read their OWN employee row.
--
-- Migration 022 made `public.employees` readable by manager+ only (owner /
-- admin / manager / viewer) so office staff and field crew can't browse
-- coworker payroll info. That's correct for the directory, but it also blocks
-- a field worker from seeing their *own* employee record — which the new
-- field-worker home needs in order to:
--   1. Link their timesheet rows to their employee_id when they clock in
--      (so manager timesheet/payroll views attribute the hours correctly),
--      and to satisfy the employee_id-based field timesheet policies in 022.
--   2. Recognize which job_assignments are theirs (the "Líder" badge / lead
--      detection on the field home reads job_assignments → employees.user_id).
--
-- This adds a narrow, additive SELECT policy scoped to the caller's own row
-- (user_id = auth.uid()). It exposes only the member's own employee record —
-- no coworker data — so it doesn't widen the payroll-privacy posture from 022.
-- Permissive policies are OR'd, so this simply unions with "manager+ read
-- employees"; managers keep full read, everyone else gains self-read only.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

drop policy if exists "self read own employee" on public.employees;
create policy "self read own employee" on public.employees for select
  using (user_id = auth.uid());

-- ── Verify (optional) ───────────────────────────────────────────────────────
--   select policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename='employees'
--     and policyname='self read own employee';

-- 070_field_quick_log.sql
-- ADD: let the "field" role log their own completed jobs (the field-home
-- "Registrar trabajo" quick-log) and read the client list to attach one.
--
-- Migration 022 scoped the field role to assigned-only: they can read clients
-- only via assigned jobs, can't INSERT jobs, and can't write job_assignments.
-- That blocks a crew member from recording ad-hoc work they did. This adds
-- three narrow, additive policies so a field member can:
--   1. read the business client list (to pick a client in the quick-log), and
--   2. INSERT a job in their business that is already 'completed', and
--   3. self-assign as lead on a job in their business (so the logged job shows
--      up in their field home + completed-this-month stat, which are scoped by
--      is_assigned_to_job).
--
-- Status is pinned to 'completed' on insert — field crew log finished work,
-- not pipeline jobs. Self-assignment requires the row to reference the
-- caller's own employees row (employees.user_id = auth.uid()).
--
-- NOTE on client visibility: this lets field crew read ALL clients in their
-- business (simplest UX for the picker; for this product the crew visits the
-- client on-site anyway). If you later want this owner-configurable, gate the
-- "field read all clients" policy behind a businesses flag and key the UI off
-- it — the other two policies can stay as-is.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run.

-- 1. Field crew can read the whole client list (for the quick-log picker).
drop policy if exists "field read all clients" on public.clients;
create policy "field read all clients" on public.clients for select
  using (public.member_role(business_id) = 'field');

-- 2. Field crew can log a completed job in their business.
drop policy if exists "field log jobs" on public.jobs;
create policy "field log jobs" on public.jobs for insert
  with check (
    public.member_role(business_id) = 'field'
    and status = 'completed'
  );

-- 3. Field crew can self-assign (as lead) on a job in their business — used to
--    attach the logger to the job they just created.
drop policy if exists "field self-assign jobs" on public.job_assignments;
create policy "field self-assign jobs" on public.job_assignments for insert
  with check (
    public.member_role(
      (select j.business_id from public.jobs j where j.id = job_assignments.job_id)
    ) = 'field'
    and exists (
      select 1 from public.employees e
      where e.id = job_assignments.employee_id and e.user_id = auth.uid()
    )
  );

-- ── Verify (optional) ───────────────────────────────────────────────────────
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public'
--     and policyname in ('field read all clients','field log jobs','field self-assign jobs');

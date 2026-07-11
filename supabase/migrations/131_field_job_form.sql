-- 131_field_job_form.sql
-- Field crew now use the FULL job form (the quick-log FAB was removed), but
-- the 070 policies only allowed status='completed' inserts and SELF-assign —
-- so saving a job with crew mates (or any richer data) failed under RLS.
--   1. Field can insert jobs they create (created_by = themselves), any status
--      the form allows.
--   2. Field can insert/delete job_assignments on jobs THEY created — so they
--      can list who worked with them (070's self-assign stays for the legacy
--      quick-log path).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "field log jobs" on public.jobs;
create policy "field log jobs" on public.jobs for insert
  with check (
    public.member_role(business_id) = 'field'
    and created_by = auth.uid()
  );

drop policy if exists "field assign own jobs" on public.job_assignments;
create policy "field assign own jobs" on public.job_assignments for insert
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_assignments.job_id
        and j.created_by = auth.uid()
        and public.member_role(j.business_id) = 'field'
    )
  );

-- Edit flow replaces assignments (delete + re-insert) on their own job.
drop policy if exists "field unassign own jobs" on public.job_assignments;
create policy "field unassign own jobs" on public.job_assignments for delete
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_assignments.job_id
        and j.created_by = auth.uid()
        and public.member_role(j.business_id) = 'field'
    )
  );

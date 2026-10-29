-- 254_job_assignments_rls_perf.sql
-- Jobs list field filters (253) were slow: every Lead / Crew filter checks
-- job_assignments once PER JOB (the list page, every tab count, the summary),
-- and that table's read policy (022) ran a correlated
--   exists (select 1 from jobs j where j.id = job_assignments.job_id
--           and is_business_member(j.business_id))
-- for EACH assignment row — a nested jobs lookup (with jobs' own RLS) plus a
-- SECURITY DEFINER call per row. The 161/181 initplan rule (CLAUDE.md) says
-- those helpers must never take a row column.
--
-- Rewrite to the set-based form, mirroring "jobs read" (181) exactly — an
-- assignment is readable iff its job is:
--   * jobs view = all  → every assignment in those businesses
--   * jobs view = assigned (field) → assignments on published jobs you're
--     assigned to
-- Each arm is a no-arg set function referenced via `in (select …)`, so it is
-- evaluated ONCE per query (initplan), not per row.
--
-- job_assignments.business_id has been stamped on insert + backfilled since
-- 181; re-backfilled here for safety (a NULL would now hide the row).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

update public.job_assignments ja
   set business_id = j.business_id
  from public.jobs j
 where j.id = ja.job_id and ja.business_id is null;

-- Published jobs the caller is assigned to, in businesses where their jobs
-- view is 'assigned' — the second arm of "jobs read", as one set.
create or replace function public.my_crew_visible_job_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select j.id
  from public.jobs j
  where j.published_to_crew = true
    and j.business_id in (select public.my_view_businesses('jobs', 'assigned'))
    and j.id in (select public.my_assigned_job_ids());
$$;

revoke all on function public.my_crew_visible_job_ids() from public, anon;
grant execute on function public.my_crew_visible_job_ids() to authenticated, service_role;

drop policy if exists "members read job_assignments" on public.job_assignments;
drop policy if exists "job_assignments read" on public.job_assignments;
create policy "job_assignments read" on public.job_assignments for select
  using (
    business_id in (select public.my_jobs_view_all_businesses())
    or job_id in (select public.my_crew_visible_job_ids())
  );

notify pgrst, 'reload schema';

-- ── Verify (optional) ───────────────────────────────────────────────────────
-- Exactly one SELECT policy should remain on job_assignments:
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'job_assignments' order by cmd;

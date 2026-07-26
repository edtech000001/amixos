-- 161_jobs_rls_perf.sql
-- Jobs list was timing out ("canceling statement due to statement timeout")
-- once a business grew to thousands of jobs. Two causes, both fixed here:
--
--   1. The base SELECT policies on jobs call member_view()/is_business_member()
--      with a per-ROW business_id argument, so those SECURITY DEFINER functions
--      re-run for every row (5000+). Same footgun 160 fixed for the location
--      lock. Rewritten to no-arg set functions keyed on auth.uid() → evaluated
--      ONCE per query (InitPlan), per-row cost becomes a cheap set lookup.
--   2. A safety-net higher statement_timeout for the authenticated role so a
--      large one-shot dashboard load has room while the app-side query is also
--      slimmed (dropping a redundant nested employees join).
--
-- Semantics are IDENTICAL to the originals (089 jobs read, 132 creator reads):
-- all-view roles see all jobs; assigned-only (field) see their assigned +
-- crew-published jobs; a job's creator always sees it.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── Safety net: give heavy dashboard reads headroom ──────────────────────────
-- Supabase's default is conservative (8s). The RLS + query fixes bring real
-- time far under this; the higher ceiling just prevents a hard failure on the
-- first big load. Applies to new connections.
alter role authenticated set statement_timeout = '20s';

-- ── No-arg helpers (depend only on auth.uid() → InitPlan-cacheable) ───────────
-- Businesses where the current user's role sees ALL jobs (view='all').
create or replace function public.my_jobs_view_all_businesses()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select bm.business_id
  from public.business_members bm
  where bm.user_id = auth.uid()
    and public.member_view(bm.business_id, 'jobs') = 'all';
$$;

-- Businesses the current user is a member of (for the creator policy).
create or replace function public.my_member_business_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.business_members where user_id = auth.uid();
$$;

-- ── Rewrite the two jobs SELECT policies to the set-based form ────────────────
drop policy if exists "jobs read" on public.jobs;
create policy "jobs read" on public.jobs for select
  using (
    business_id in (select public.my_jobs_view_all_businesses())
    or (
      -- assigned-only (field) path: unchanged, and only ever evaluated for the
      -- small set of rows a non-all-view user could reach.
      public.member_view(business_id, 'jobs') = 'assigned'
      and public.is_assigned_to_job(id)
      and published_to_crew = true
    )
  );

drop policy if exists "creator reads own jobs" on public.jobs;
create policy "creator reads own jobs" on public.jobs for select
  using (
    created_by = auth.uid()
    and business_id in (select public.my_member_business_ids())
  );

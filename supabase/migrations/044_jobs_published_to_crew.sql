-- 044_jobs_published_to_crew.sql
-- Replaces the original 044 (Projects layer) with a much simpler model:
-- a single visibility toggle on jobs/proposals. The owner can plan
-- privately in the scheduler and "publish" each job to release it to its
-- assigned crew. Crew never sees unpublished work, even if they happen
-- to be on the assignment list (avoids leaking the bigger plan when you
-- split a 20-pivot contract across multiple crews).
--
-- IMPORTANT — run manually in the Supabase SQL Editor.
--
-- Run each numbered block on its own (highlight just that block + Run).
-- That keeps each transaction short and avoids deadlocks with the running
-- app (the original single-shot version hit one — `DROP TABLE projects
-- CASCADE` wants ACCESS EXCLUSIVE on `jobs`, while the app's SELECTs hold
-- ACCESS SHARE on `jobs`). lock_timeout is set locally so any block that
-- can't acquire its lock fails fast instead of hanging.

-- ─── BLOCK 1 ───────────────────────────────────────────────────────────────
-- Quick wins: things that don't touch jobs/businesses lock-wise. Run this
-- first to clean out the Projects-side artifacts before we go near `jobs`.
begin;
set local lock_timeout = '5s';

drop view  if exists public.project_progress;

drop policy if exists "non-field read projects"                on public.projects;
drop policy if exists "field read published assigned projects" on public.projects;
drop policy if exists "office+ write projects"                 on public.projects;
drop policy if exists "office+ update projects"                on public.projects;
drop policy if exists "admin delete projects"                  on public.projects;

drop trigger  if exists projects_set_updated_at on public.projects;
drop function if exists public.set_updated_at_projects;

commit;

-- ─── BLOCK 2 ───────────────────────────────────────────────────────────────
-- Drop jobs.project_id FIRST so the FK from jobs → projects is gone before
-- we drop the projects table. That way the next block's DROP TABLE doesn't
-- need CASCADE and doesn't have to touch `jobs` at all.
begin;
set local lock_timeout = '5s';

alter table public.jobs
  drop column if exists project_id,
  drop column if exists unit_quantity;

commit;

-- ─── BLOCK 3 ───────────────────────────────────────────────────────────────
-- Drop the projects table itself + clear out the businesses-side config
-- columns. Neither touches `jobs` so the app's read traffic doesn't fight us.
begin;
set local lock_timeout = '5s';

drop table if exists public.projects;

alter table public.businesses
  drop column if exists project_field_required,
  drop column if exists project_field_order,
  drop column if exists project_pipeline_disabled;

commit;

-- ─── BLOCK 4 ───────────────────────────────────────────────────────────────
-- Add the publish-to-crew toggle on jobs. Default true so existing jobs
-- stay visible (no regression for jobs already assigned to crew). New jobs
-- default to "Privado" via the form — the client sets the initial state to
-- false on creation (see web/mobile nuevo.tsx).
begin;
set local lock_timeout = '5s';

alter table public.jobs
  add column if not exists published_to_crew boolean not null default true;

create index if not exists jobs_published_to_crew_idx
  on public.jobs (business_id, published_to_crew);

commit;

-- ─── BLOCK 5 ───────────────────────────────────────────────────────────────
-- Tighten the field-read RLS policy. Field workers already only saw jobs
-- they were assigned to (migration 022). Add the published_to_crew filter
-- so unpublished planning jobs stay hidden from assigned crew until the
-- owner explicitly releases them.
begin;
set local lock_timeout = '5s';

drop policy if exists "field read assigned jobs" on public.jobs;
create policy "field read assigned jobs" on public.jobs for select
  using (
    public.member_role(business_id) = 'field'
    and public.is_assigned_to_job(id)
    and published_to_crew = true
  );

commit;

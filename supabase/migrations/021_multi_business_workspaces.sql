-- 021_multi_business_workspaces.sql
-- Enable a single user to belong to multiple businesses and delegate jobs
-- between them. Activates the dormant business_members table; rewrites RLS
-- on every business-scoped table to use member-based access; adds
-- delegation lineage columns to jobs.
--
-- Idempotent: safe to re-run.

-- ─── Job delegation lineage ────────────────────────────────────────────────
alter table public.jobs
  add column if not exists delegated_to_business_id uuid references public.businesses(id),
  add column if not exists delegated_from_business_id uuid references public.businesses(id),
  add column if not exists delegated_at timestamptz;

create index if not exists idx_jobs_delegated_to
  on public.jobs(delegated_to_business_id)
  where delegated_to_business_id is not null;
create index if not exists idx_jobs_delegated_from
  on public.jobs(delegated_from_business_id)
  where delegated_from_business_id is not null;

-- ─── Backfill business_members from existing ownership ────────────────────
-- Every existing business owner becomes a member row with role='owner'.
-- This is what unblocks the new RLS policies for existing users.
insert into public.business_members (business_id, user_id, role)
select b.id, b.owner_id, 'owner'
from public.businesses b
where b.owner_id is not null
on conflict (business_id, user_id) do nothing;

-- ─── Helper: standard "is member" check ───────────────────────────────────
-- Used in every business-scoped RLS policy below. Returns true if auth.uid()
-- is a member of the given business.
create or replace function public.is_business_member(b_id uuid)
returns boolean
language sql security definer stable as $$
  select exists(
    select 1 from public.business_members
    where business_id = b_id and user_id = auth.uid()
  );
$$;

-- ─── Rewrite RLS on every business-scoped table ───────────────────────────
-- Pattern: drop owner-based policy, create members-based policy.
-- Direct business_id tables:

drop policy if exists "owner manage businesses" on public.businesses;
drop policy if exists "owners select own business" on public.businesses;
create policy "members access businesses" on public.businesses for all
  using (public.is_business_member(id));

drop policy if exists "owner manage business_members" on public.business_members;
create policy "members read business_members" on public.business_members for select
  using (public.is_business_member(business_id));
-- INSERT/UPDATE/DELETE on business_members happens via service role
-- (server-side endpoints) for now — keep it locked to prevent privilege
-- escalation by self-promotion.

drop policy if exists "owner manage clients" on public.clients;
create policy "members manage clients" on public.clients for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage jobs" on public.jobs;
create policy "members manage jobs" on public.jobs for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage invoices" on public.invoices;
create policy "members manage invoices" on public.invoices for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage employees" on public.employees;
create policy "members manage employees" on public.employees for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage timesheets" on public.timesheets;
create policy "members manage timesheets" on public.timesheets for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage calendar_events" on public.calendar_events;
create policy "members manage calendar_events" on public.calendar_events for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage inventory_items" on public.inventory_items;
create policy "members manage inventory_items" on public.inventory_items for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage business_modules" on public.business_modules;
create policy "members manage business_modules" on public.business_modules for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage client_contacts" on public.client_contacts;
create policy "members manage client_contacts" on public.client_contacts for all
  using (public.is_business_member(business_id));

drop policy if exists "owner manage client_field_templates" on public.client_field_templates;
create policy "members manage client_field_templates" on public.client_field_templates for all
  using (public.is_business_member(business_id));

-- Tables scoped via parent (job_id → jobs → business_id):
drop policy if exists "owner manage job_items" on public.job_items;
create policy "members manage job_items" on public.job_items for all
  using (exists (
    select 1 from public.jobs
    where jobs.id = job_items.job_id
      and public.is_business_member(jobs.business_id)
  ));

drop policy if exists "owner manage job_assignments" on public.job_assignments;
create policy "members manage job_assignments" on public.job_assignments for all
  using (exists (
    select 1 from public.jobs
    where jobs.id = job_assignments.job_id
      and public.is_business_member(jobs.business_id)
  ));

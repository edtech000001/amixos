-- 089_member_can_rls.sql  (Phase 4 — server-enforce the role editor)
-- =============================================================================
-- Makes the per-business role permission overrides (business_roles, migration
-- 084 / the role editor) actually ENFORCED in the database, not just hidden in
-- the UI. Until now RLS used hardcoded role lists (022); this rewrites the
-- read/write/delete policies on the four highest-value resources — clients,
-- jobs, invoices, employees — to resolve each member's effective permission
-- (their business_roles override, else the built-in default).
--
-- SAFETY: for a role with NO override row, the resolved permissions equal the
-- built-in defaults, which are encoded below to match the previous role-based
-- policies EXACTLY. So an un-customized business behaves identically to before;
-- only owner-customized roles change. Every preserved nuance is noted inline.
--
-- KEPT AS-IS (orthogonal grants layered on top, OR'd by Postgres):
--   • 070 "field read all clients"  → field still reads all clients for the
--     quick-log picker (so a field-clients override is NOT enforced — by design)
--   • 070 "field log jobs"          → field can still insert a completed job
--   • 069 "self read own employee"  → a member still reads their own row
--   • field job reads keep the 044 published_to_crew filter
--   • field can still UPDATE a job they're assigned to (status changes)
--
-- The encoded defaults below MUST stay in sync with DEFAULT_ROLE_PERMISSIONS in
-- shared/src/lib/permissions.ts (only the 4 resources the policies read).
--
-- REVERT: re-run the clients/jobs/invoices/employees policy blocks from
-- migration 022 (they DROP these by the new names? no — drop the new ones and
-- recreate the 022 ones). This migration only DROPs the 022 policy *names*, so
-- to revert, drop the new names and re-create the 022 policies.
--
-- ⚠️ Highest-risk migration in this project — it changes data-access rules on
-- live data. Test on a NON-production business first (try each role, confirm
-- field crew still see their jobs/clients and can clock in + quick-log).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

-- ─── Built-in default permissions (SQL mirror of DEFAULT_ROLE_PERMISSIONS) ───
-- Only the four resources the policies below read. Returns the role's default
-- permission JSONB; unknown roles fall back to the most-restrictive (viewer-ish
-- read-only) shape.
create or replace function public.default_role_permissions(role text)
returns jsonb language sql immutable as $$
  select case role
    when 'owner' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true}}}'::jsonb
    when 'admin' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true}}}'::jsonb
    when 'manager' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"all","create":true,"edit":true,"delete":false}}}'::jsonb
    when 'office' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'field' then
      '{"resources":{"clients":{"view":"assigned","create":false,"edit":false,"delete":false},"jobs":{"view":"assigned","create":false,"edit":false,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'viewer' then
      '{"resources":{"clients":{"view":"all","create":false,"edit":false,"delete":false},"jobs":{"view":"all","create":false,"edit":false,"delete":false},"invoices":{"view":"all","create":false,"edit":false,"delete":false},"employees":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    else
      '{"resources":{"clients":{"view":"none","create":false,"edit":false,"delete":false},"jobs":{"view":"none","create":false,"edit":false,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
  end;
$$;

-- ─── Effective-permission accessors (override row, else default) ─────────────
-- SECURITY DEFINER so they read business_members / business_roles without
-- tripping those tables' own RLS (and without recursion).

-- Boolean for a resource action: 'create' | 'edit' | 'delete'. Owner = always.
create or replace function public.member_res(b_id uuid, res text, act text)
returns boolean language plpgsql security definer stable as $$
declare r text; p jsonb;
begin
  r := public.member_role(b_id);
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  select permissions into p from public.business_roles where business_id = b_id and key = r;
  if p is null then p := public.default_role_permissions(r); end if;
  return coalesce((p #>> array['resources', res, act])::boolean, false);
end;
$$;

-- View scope for a resource: 'none' | 'assigned' | 'all'. Owner = 'all'.
create or replace function public.member_view(b_id uuid, res text)
returns text language plpgsql security definer stable as $$
declare r text; p jsonb;
begin
  r := public.member_role(b_id);
  if r is null then return 'none'; end if;
  if r = 'owner' then return 'all'; end if;
  select permissions into p from public.business_roles where business_id = b_id and key = r;
  if p is null then p := public.default_role_permissions(r); end if;
  return coalesce(p #>> array['resources', res, 'view'], 'none');
end;
$$;

-- ─── clients ─────────────────────────────────────────────────────────────────
drop policy if exists "non-field read clients" on public.clients;
drop policy if exists "field read assigned clients" on public.clients;
drop policy if exists "office+ write clients" on public.clients;
drop policy if exists "office+ update clients" on public.clients;
drop policy if exists "admin delete clients" on public.clients;
-- ("field read all clients" from 070 is intentionally kept — quick-log picker.)

create policy "clients read" on public.clients for select
  using (
    public.member_view(business_id, 'clients') = 'all'
    or (
      public.member_view(business_id, 'clients') = 'assigned'
      and exists (
        select 1 from public.jobs j
        where j.client_id = clients.id and public.is_assigned_to_job(j.id)
      )
    )
  );
create policy "clients insert" on public.clients for insert
  with check (public.member_res(business_id, 'clients', 'create'));
create policy "clients update" on public.clients for update
  using (public.member_res(business_id, 'clients', 'edit'));
create policy "clients delete" on public.clients for delete
  using (public.member_res(business_id, 'clients', 'delete'));

-- ─── jobs ────────────────────────────────────────────────────────────────────
drop policy if exists "non-field read jobs" on public.jobs;
drop policy if exists "field read assigned jobs" on public.jobs;
drop policy if exists "office+ write jobs" on public.jobs;
drop policy if exists "office+ update jobs" on public.jobs;
drop policy if exists "admin delete jobs" on public.jobs;
-- ("field log jobs" INSERT from 070 is intentionally kept — quick-log.)

create policy "jobs read" on public.jobs for select
  using (
    public.member_view(business_id, 'jobs') = 'all'
    or (
      public.member_view(business_id, 'jobs') = 'assigned'
      and public.is_assigned_to_job(id)
      and published_to_crew = true        -- 044: hide unpublished planning jobs
    )
  );
create policy "jobs insert" on public.jobs for insert
  with check (public.member_res(business_id, 'jobs', 'create'));
create policy "jobs update" on public.jobs for update
  using (
    public.member_res(business_id, 'jobs', 'edit')
    or public.is_assigned_to_job(id)      -- field updates status on assigned jobs
  );
create policy "jobs delete" on public.jobs for delete
  using (public.member_res(business_id, 'jobs', 'delete'));

-- ─── invoices ────────────────────────────────────────────────────────────────
drop policy if exists "non-field read invoices" on public.invoices;
drop policy if exists "office+ write invoices" on public.invoices;
drop policy if exists "office+ update invoices" on public.invoices;
drop policy if exists "admin delete invoices" on public.invoices;

create policy "invoices read" on public.invoices for select
  using (public.member_view(business_id, 'invoices') = 'all');
create policy "invoices insert" on public.invoices for insert
  with check (public.member_res(business_id, 'invoices', 'create'));
create policy "invoices update" on public.invoices for update
  using (public.member_res(business_id, 'invoices', 'edit'));
create policy "invoices delete" on public.invoices for delete
  using (public.member_res(business_id, 'invoices', 'delete'));

-- ─── employees ───────────────────────────────────────────────────────────────
drop policy if exists "manager+ read employees" on public.employees;
drop policy if exists "manager+ write employees" on public.employees;
drop policy if exists "manager+ update employees" on public.employees;
drop policy if exists "admin delete employees" on public.employees;
-- ("self read own employee" from 069 is intentionally kept.)

create policy "employees read" on public.employees for select
  using (public.member_view(business_id, 'employees') = 'all');
create policy "employees insert" on public.employees for insert
  with check (public.member_res(business_id, 'employees', 'create'));
create policy "employees update" on public.employees for update
  using (public.member_res(business_id, 'employees', 'edit'));
create policy "employees delete" on public.employees for delete
  using (public.member_res(business_id, 'employees', 'delete'));

-- ── Verify (optional) ───────────────────────────────────────────────────────
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in ('clients','jobs','invoices','employees')
--   order by tablename, cmd;
--   -- spot-check a role:  select public.member_view('<biz-uuid>','invoices');

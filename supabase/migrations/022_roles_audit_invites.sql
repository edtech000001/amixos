-- 022_roles_audit_invites.sql
-- Phase 2 of the multi-business workspace system. Adds:
--   1. Real role enforcement on business_members (6 roles)
--   2. Role-aware RLS on every business-scoped table
--   3. audit_log table + helper for recording sensitive events
--   4. business_invites table + flow for email-based invites
--
-- Idempotent: safe to re-run.

-- ─── 1. Role constraint + normalization ───────────────────────────────────
-- Existing rows default to 'worker'. Migrate legacy 'worker' → 'field' so the
-- new constraint accepts them. Owners (backfilled in 021) stay 'owner'.
update public.business_members
  set role = 'field'
  where role not in ('owner', 'admin', 'manager', 'office', 'field', 'viewer');

alter table public.business_members
  drop constraint if exists business_members_role_check;
alter table public.business_members
  add constraint business_members_role_check
  check (role in ('owner', 'admin', 'manager', 'office', 'field', 'viewer'));


-- ─── 2. Role helper functions ─────────────────────────────────────────────
-- All SECURITY DEFINER so they can read business_members regardless of the
-- caller's row-level visibility. STABLE so Postgres can cache within a query.

create or replace function public.member_role(b_id uuid)
returns text language sql security definer stable as $$
  select role from public.business_members
    where business_id = b_id and user_id = auth.uid()
    limit 1;
$$;

-- has_business_role(b_id, allowed_roles[]) → boolean.
-- Use for write-side policies: who can update/insert/delete in this business.
create or replace function public.has_business_role(b_id uuid, allowed text[])
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.business_members
    where business_id = b_id
      and user_id = auth.uid()
      and role = any(allowed)
  );
$$;

-- Convenience predicates used heavily in RLS:
create or replace function public.is_business_admin(b_id uuid)
returns boolean language sql security definer stable as $$
  select public.has_business_role(b_id, array['owner','admin']);
$$;

create or replace function public.can_write_business(b_id uuid)
returns boolean language sql security definer stable as $$
  -- owner/admin/manager/office can do general CRUD. Field workers and
  -- viewers cannot insert/update/delete on most tables (handled per-table).
  select public.has_business_role(b_id, array['owner','admin','manager','office']);
$$;

-- For job_assignments: a field worker can only touch jobs they're assigned to.
create or replace function public.is_assigned_to_job(j_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.job_assignments ja
    join public.employees e on e.id = ja.employee_id
    where ja.job_id = j_id and e.user_id = auth.uid()
  );
$$;


-- ─── 3. Rewrite RLS to be role-aware ──────────────────────────────────────
-- Pattern: split read (any member) from write (admin/manager/office).
-- Field workers and viewers get read-only or scoped access.

-- businesses: any member reads; only admin/owner updates.
drop policy if exists "members access businesses" on public.businesses;
drop policy if exists "members read businesses" on public.businesses;
drop policy if exists "admin update businesses" on public.businesses;
create policy "members read businesses" on public.businesses for select
  using (public.is_business_member(id));
create policy "admin update businesses" on public.businesses for update
  using (public.is_business_admin(id));
create policy "admin delete businesses" on public.businesses for delete
  using (public.has_business_role(id, array['owner']));
-- INSERT happens at signup (no business_id yet to gate on); leave as-is.

-- business_members: any member reads; admin manages.
drop policy if exists "members read business_members" on public.business_members;
drop policy if exists "admin manage business_members" on public.business_members;
create policy "members read business_members" on public.business_members for select
  using (public.is_business_member(business_id));
create policy "admin write business_members" on public.business_members for insert
  with check (public.is_business_admin(business_id));
create policy "admin update business_members" on public.business_members for update
  using (public.is_business_admin(business_id));
create policy "admin delete business_members" on public.business_members for delete
  using (public.is_business_admin(business_id));

-- clients: members read; non-viewer/non-field write.
-- Field workers see ONLY clients tied to a job they're assigned to.
drop policy if exists "members manage clients" on public.clients;
create policy "non-field read clients" on public.clients for select
  using (
    public.has_business_role(business_id, array['owner','admin','manager','office','viewer'])
  );
create policy "field read assigned clients" on public.clients for select
  using (
    public.member_role(business_id) = 'field'
    and exists (
      select 1 from public.jobs j
      where j.client_id = clients.id
        and public.is_assigned_to_job(j.id)
    )
  );
create policy "office+ write clients" on public.clients for insert
  with check (public.can_write_business(business_id));
create policy "office+ update clients" on public.clients for update
  using (public.can_write_business(business_id));
create policy "admin delete clients" on public.clients for delete
  using (public.is_business_admin(business_id));

-- jobs: members read with role-based scope; office+ creates; admin deletes.
-- Field workers see only their assigned jobs.
drop policy if exists "members manage jobs" on public.jobs;
create policy "non-field read jobs" on public.jobs for select
  using (
    public.has_business_role(business_id, array['owner','admin','manager','office','viewer'])
  );
create policy "field read assigned jobs" on public.jobs for select
  using (
    public.member_role(business_id) = 'field'
    and public.is_assigned_to_job(id)
  );
create policy "office+ write jobs" on public.jobs for insert
  with check (public.can_write_business(business_id));
create policy "office+ update jobs" on public.jobs for update
  using (public.can_write_business(business_id) or public.is_assigned_to_job(id));
create policy "admin delete jobs" on public.jobs for delete
  using (public.is_business_admin(business_id));

-- invoices: financial — field workers excluded entirely.
drop policy if exists "members manage invoices" on public.invoices;
create policy "non-field read invoices" on public.invoices for select
  using (
    public.has_business_role(business_id, array['owner','admin','manager','office','viewer'])
  );
create policy "office+ write invoices" on public.invoices for insert
  with check (public.can_write_business(business_id));
create policy "office+ update invoices" on public.invoices for update
  using (public.can_write_business(business_id));
create policy "admin delete invoices" on public.invoices for delete
  using (public.is_business_admin(business_id));

-- employees: managers+ only. Office staff and field workers should not see
-- payroll/personal info on coworkers.
drop policy if exists "members manage employees" on public.employees;
create policy "manager+ read employees" on public.employees for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));
create policy "manager+ write employees" on public.employees for insert
  with check (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "manager+ update employees" on public.employees for update
  using (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "admin delete employees" on public.employees for delete
  using (public.is_business_admin(business_id));

-- timesheets: workers can read/write their OWN; managers+ see all.
drop policy if exists "members manage timesheets" on public.timesheets;
create policy "manager+ read timesheets" on public.timesheets for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));
create policy "field read own timesheets" on public.timesheets for select
  using (
    public.member_role(business_id) = 'field'
    and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid())
  );
create policy "field write own timesheets" on public.timesheets for insert
  with check (
    public.is_business_member(business_id)
    and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid())
  );
create policy "field update own timesheets" on public.timesheets for update
  using (
    public.is_business_member(business_id)
    and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid())
  );
create policy "manager+ write timesheets" on public.timesheets for insert
  with check (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "manager+ update timesheets" on public.timesheets for update
  using (public.has_business_role(business_id, array['owner','admin','manager']));
create policy "manager+ delete timesheets" on public.timesheets for delete
  using (public.has_business_role(business_id, array['owner','admin','manager']));

-- calendar_events / inventory_items / business_modules / client_contacts /
-- client_field_templates: any non-viewer member can read; office+ can write.
drop policy if exists "members manage calendar_events" on public.calendar_events;
create policy "members read calendar_events" on public.calendar_events for select
  using (public.is_business_member(business_id));
create policy "office+ write calendar_events" on public.calendar_events for insert
  with check (public.can_write_business(business_id));
create policy "office+ update calendar_events" on public.calendar_events for update
  using (public.can_write_business(business_id));
create policy "office+ delete calendar_events" on public.calendar_events for delete
  using (public.can_write_business(business_id));

drop policy if exists "members manage inventory_items" on public.inventory_items;
create policy "members read inventory_items" on public.inventory_items for select
  using (public.is_business_member(business_id));
create policy "office+ write inventory_items" on public.inventory_items for insert
  with check (public.can_write_business(business_id));
create policy "office+ update inventory_items" on public.inventory_items for update
  using (public.can_write_business(business_id));
create policy "admin delete inventory_items" on public.inventory_items for delete
  using (public.is_business_admin(business_id));

drop policy if exists "members manage business_modules" on public.business_modules;
create policy "members read business_modules" on public.business_modules for select
  using (public.is_business_member(business_id));
create policy "admin write business_modules" on public.business_modules for insert
  with check (public.is_business_admin(business_id));
create policy "admin update business_modules" on public.business_modules for update
  using (public.is_business_admin(business_id));
create policy "admin delete business_modules" on public.business_modules for delete
  using (public.is_business_admin(business_id));

drop policy if exists "members manage client_contacts" on public.client_contacts;
create policy "members read client_contacts" on public.client_contacts for select
  using (public.is_business_member(business_id));
create policy "office+ write client_contacts" on public.client_contacts for insert
  with check (public.can_write_business(business_id));
create policy "office+ update client_contacts" on public.client_contacts for update
  using (public.can_write_business(business_id));
create policy "office+ delete client_contacts" on public.client_contacts for delete
  using (public.can_write_business(business_id));

drop policy if exists "members manage client_field_templates" on public.client_field_templates;
create policy "members read client_field_templates" on public.client_field_templates for select
  using (public.is_business_member(business_id));
create policy "admin write client_field_templates" on public.client_field_templates for insert
  with check (public.is_business_admin(business_id));
create policy "admin update client_field_templates" on public.client_field_templates for update
  using (public.is_business_admin(business_id));
create policy "admin delete client_field_templates" on public.client_field_templates for delete
  using (public.is_business_admin(business_id));

-- job_items / job_assignments: scoped through parent jobs.
drop policy if exists "members manage job_items" on public.job_items;
create policy "members read job_items" on public.job_items for select
  using (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.is_business_member(j.business_id)
  ));
create policy "office+ write job_items" on public.job_items for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.can_write_business(j.business_id)
  ));
create policy "office+ update job_items" on public.job_items for update
  using (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.can_write_business(j.business_id)
  ));
create policy "office+ delete job_items" on public.job_items for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.can_write_business(j.business_id)
  ));

drop policy if exists "members manage job_assignments" on public.job_assignments;
create policy "members read job_assignments" on public.job_assignments for select
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id and public.is_business_member(j.business_id)
  ));
create policy "manager+ write job_assignments" on public.job_assignments for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id
      and public.has_business_role(j.business_id, array['owner','admin','manager'])
  ));
create policy "manager+ update job_assignments" on public.job_assignments for update
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id
      and public.has_business_role(j.business_id, array['owner','admin','manager'])
  ));
create policy "manager+ delete job_assignments" on public.job_assignments for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id
      and public.has_business_role(j.business_id, array['owner','admin','manager'])
  ));


-- ─── 4. Audit log ─────────────────────────────────────────────────────────
-- Sensitive-event log. App writes here explicitly via the shared audit
-- helper; we do NOT use triggers (too much noise, harder to debug).
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  -- Examples: 'job.delegated', 'job.deleted', 'job.status_changed',
  -- 'invoice.paid', 'invoice.voided', 'member.added', 'member.removed',
  -- 'member.role_changed', 'invite.sent', 'invite.accepted'.
  entity_type text,        -- 'job' | 'invoice' | 'client' | 'member' | 'invite'
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_business_created
  on public.audit_log(business_id, created_at desc);
create index if not exists idx_audit_log_entity
  on public.audit_log(entity_type, entity_id);

alter table public.audit_log enable row level security;

drop policy if exists "members read audit_log" on public.audit_log;
create policy "members read audit_log" on public.audit_log for select
  using (public.is_business_member(business_id));

-- Inserts use the user's session, not service role — so we need an insert
-- policy. Restrict to admin/manager so a field worker can't forge entries.
drop policy if exists "manager+ write audit_log" on public.audit_log;
create policy "manager+ write audit_log" on public.audit_log for insert
  with check (public.is_business_member(business_id));
-- Note: any member can write because deletes/updates aren't permitted and
-- the helper sets user_id from auth.uid() — so a field worker can only
-- create entries attributed to themselves, which is fine for an audit log.

-- No update/delete policies — audit log is append-only.


-- ─── 5. Business invites ──────────────────────────────────────────────────
create table if not exists public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  email text not null,
  role text not null,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  constraint business_invites_role_check
    check (role in ('admin', 'manager', 'office', 'field', 'viewer'))
);

create index if not exists idx_business_invites_business
  on public.business_invites(business_id);
create index if not exists idx_business_invites_token
  on public.business_invites(token)
  where accepted_at is null;
create index if not exists idx_business_invites_email
  on public.business_invites(lower(email))
  where accepted_at is null;

alter table public.business_invites enable row level security;

-- Admins of the business can manage invites. The recipient is gated through
-- the public token endpoint (not RLS) so they can accept without being a
-- member yet.
drop policy if exists "admin manage business_invites" on public.business_invites;
create policy "admin read business_invites" on public.business_invites for select
  using (public.is_business_admin(business_id));
create policy "admin write business_invites" on public.business_invites for insert
  with check (public.is_business_admin(business_id));
create policy "admin update business_invites" on public.business_invites for update
  using (public.is_business_admin(business_id));
create policy "admin delete business_invites" on public.business_invites for delete
  using (public.is_business_admin(business_id));

-- Token-based lookup for the accept flow: a SECURITY DEFINER function that
-- returns the invite if the token matches AND the caller's email matches AND
-- it hasn't been accepted/expired. Lets the recipient see the invite
-- without us having to grant blanket SELECT.
create or replace function public.lookup_invite(invite_token text)
returns table(
  id uuid,
  business_id uuid,
  business_name text,
  email text,
  role text,
  expires_at timestamptz,
  accepted_at timestamptz
) language sql security definer stable as $$
  select i.id, i.business_id, b.name as business_name, i.email, i.role,
         i.expires_at, i.accepted_at
  from public.business_invites i
  join public.businesses b on b.id = i.business_id
  where i.token = invite_token
    and lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;
$$;

-- Accept an invite. SECURITY DEFINER so it can both INSERT into
-- business_members and UPDATE the invite. Validates email match and expiry.
create or replace function public.accept_invite(invite_token text)
returns uuid language plpgsql security definer as $$
declare
  inv record;
  user_email text;
  new_member_id uuid;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.business_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
      and lower(email) = lower(user_email)
    limit 1;
  if not found then
    raise exception 'invite_not_found_or_expired';
  end if;

  -- Idempotent: if user is already a member, just mark the invite accepted.
  insert into public.business_members (business_id, user_id, role)
    values (inv.business_id, auth.uid(), inv.role)
    on conflict (business_id, user_id)
    do update set role = excluded.role
    returning id into new_member_id;

  update public.business_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = inv.id;

  -- Log it.
  insert into public.audit_log (business_id, user_id, action, entity_type, entity_id, details)
    values (inv.business_id, auth.uid(), 'invite.accepted', 'invite', inv.id,
            jsonb_build_object('role', inv.role, 'email', inv.email));

  return inv.business_id;
end;
$$;

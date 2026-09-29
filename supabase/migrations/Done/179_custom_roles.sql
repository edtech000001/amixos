-- 179_custom_roles.sql
-- Custom roles: businesses can define their own roles beyond the built-in
-- owner/admin/manager/office/field/viewer. A custom role is a business_roles
-- row with is_system=false, a display `name`, and a COMPLETE permissions
-- snapshot (the role editor always writes full grids). The permission
-- resolvers (member_res / member_view / member_cap, migration 164) already
-- look up business_roles by any key and fail closed when a path is missing,
-- so custom roles work server-side once the role text is allowed to exist.
--
-- What this migration does:
--   1. Replaces the CHECK constraints pinning business_members.role and
--      business_invites.role to the 6 built-ins with trigger validation:
--      built-in keys OR a custom key defined in business_roles.
--   2. Blocks deleting a custom business_roles row while members or pending
--      invites still hold that key (they would silently become deny-all).
--   3. Adds `with check` to the business_roles UPDATE policy (an admin could
--      previously move a row to a business they don't admin).
--   4. Own-timesheet READ was hardcoded to role='field'; now any member can
--      read their own rows (writes were already member-wide). Adds a cap-based
--      "read all timesheets" policy so a custom manager-like role with
--      viewAllTimesheets can see the team's hours.
--   5. lookup_invite also returns the custom role's display name so the
--      invite-acceptance page can label it (the invitee isn't a member yet,
--      so they can't read business_roles).
--
-- Known v1 limits (documented, safe — custom roles are DENIED, never leaked):
--   payroll/loans/files/locations/price-sheet writes still use fixed built-in
--   role lists, and billing/impersonation are owner+admin only.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- ALSO re-run 178_employees_roster_view.sql if you ran it before this one —
-- it now uses is_business_member() so custom-role members can read the roster.

-- ─── 1. Role-key validation: built-ins OR a defined custom role ──────────────

create or replace function public.role_key_valid(b_id uuid, r text, allow_owner boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (r in ('admin', 'manager', 'office', 'field', 'viewer'))
    or (allow_owner and r = 'owner')
    or exists (
      select 1 from public.business_roles br
      where br.business_id = b_id and br.key = r and br.is_system = false
    );
$$;

create or replace function public.validate_business_member_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.role_key_valid(new.business_id, new.role, true) then
    raise exception 'invalid role key: %', new.role using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.validate_business_invite_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.role_key_valid(new.business_id, new.role, false) then
    raise exception 'invalid role key: %', new.role using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table public.business_members
  drop constraint if exists business_members_role_check;
alter table public.business_invites
  drop constraint if exists business_invites_role_check;

drop trigger if exists business_members_role_valid on public.business_members;
create trigger business_members_role_valid
  before insert or update of role on public.business_members
  for each row execute function public.validate_business_member_role();

drop trigger if exists business_invites_role_valid on public.business_invites;
create trigger business_invites_role_valid
  before insert or update of role on public.business_invites
  for each row execute function public.validate_business_invite_role();

-- ─── 2. Don't delete (or re-key) a custom role that's still in use ───────────

create or replace function public.protect_business_role_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- key + business are the identity members point at; never rewrite them.
    if new.key <> old.key or new.business_id <> old.business_id then
      raise exception 'business_roles key/business_id are immutable';
    end if;
    return new;
  end if;
  -- DELETE: system-role rows are just overrides (defaults take over), but a
  -- custom row IS the role — orphaning members would deny-all them silently.
  if old.is_system = false and (
    exists (select 1 from public.business_members m
            where m.business_id = old.business_id and m.role = old.key)
    or exists (select 1 from public.business_invites i
               where i.business_id = old.business_id and i.role = old.key
                 and i.accepted_at is null and i.expires_at > now())
  ) then
    raise exception 'role in use' using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists business_roles_protect on public.business_roles;
create trigger business_roles_protect
  before update or delete on public.business_roles
  for each row execute function public.protect_business_role_row();

-- ─── 3. business_roles UPDATE policy gets a with check ───────────────────────

drop policy if exists "admins update business_roles" on public.business_roles;
create policy "admins update business_roles" on public.business_roles for update
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

-- ─── 4. Timesheets: own-row read for ANY member + cap-based read-all ─────────
-- (022 hardcoded own-row reads to role='field'; own-row writes were already
-- member-wide. The manager+ fixed-list read policy stays — this is additive.)

drop policy if exists "field read own timesheets" on public.timesheets;
drop policy if exists "member read own timesheets" on public.timesheets;
create policy "member read own timesheets" on public.timesheets for select
  using (
    public.is_business_member(business_id)
    and exists (select 1 from public.employees e
                where e.id = timesheets.employee_id and e.user_id = auth.uid())
  );

drop policy if exists "cap read all timesheets" on public.timesheets;
create policy "cap read all timesheets" on public.timesheets for select
  using (public.member_cap(business_id, 'viewAllTimesheets'));

-- ─── 5. lookup_invite returns the role's display name ────────────────────────
-- Return type changes, so the old function must be dropped first.

drop function if exists public.lookup_invite(text);
create function public.lookup_invite(invite_token text)
returns table(
  id uuid,
  business_id uuid,
  business_name text,
  email text,
  role text,
  role_name text,
  expires_at timestamptz,
  accepted_at timestamptz
) language sql security definer stable as $$
  select i.id, i.business_id, b.name as business_name, i.email, i.role,
         br.name as role_name,
         i.expires_at, i.accepted_at
  from public.business_invites i
  join public.businesses b on b.id = i.business_id
  left join public.business_roles br
    on br.business_id = i.business_id and br.key = i.role and br.is_system = false
  where i.token = invite_token
    and lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;
$$;

-- ─── 6. Job staffing for custom "field-like" roles ───────────────────────────
-- 131 lets role='field' attach crew to jobs THEY created. Generalize: any
-- member who can CREATE jobs may manage assignments on their own jobs (custom
-- crew roles, and office — who could already create jobs but not staff them).

drop policy if exists "creator assign own jobs" on public.job_assignments;
create policy "creator assign own jobs" on public.job_assignments for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id
      and j.created_by = auth.uid()
      and public.member_res(j.business_id, 'jobs', 'create')
  ));

drop policy if exists "creator unassign own jobs" on public.job_assignments;
create policy "creator unassign own jobs" on public.job_assignments for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id
      and j.created_by = auth.uid()
      and public.member_res(j.business_id, 'jobs', 'create')
  ));

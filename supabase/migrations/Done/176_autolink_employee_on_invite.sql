-- 176_autolink_employee_on_invite.sql
-- Auto-link a worker record to its login when an invite is accepted, so branch
-- grants / crew visibility (member_location_grants, migration 160) resolve
-- immediately — no more "empty crew picker" from an unlinked field member
-- (the manual fix that migration 175 had to do for Nahun Jacome).
--
-- On accept: if the business has an employee whose personal email matches the
-- accepting user's email and that employee isn't linked yet, set its user_id.
-- Matching by email is safe (best-effort): no match → no link, admin can still
-- link by hand.
--
-- Full replacement of the accept_invite function from migration 022, with the
-- auto-link step added after the membership insert. SECURITY DEFINER unchanged.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

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

  -- Auto-link this login to its matching worker record (by personal email), so
  -- branch/crew visibility works right away. Only links an unlinked employee.
  update public.employees
    set user_id = auth.uid()
    where business_id = inv.business_id
      and user_id is null
      and email is not null
      and lower(email) = lower(user_email);

  -- Log it.
  insert into public.audit_log (business_id, user_id, action, entity_type, entity_id, details)
    values (inv.business_id, auth.uid(), 'invite.accepted', 'invite', inv.id,
            jsonb_build_object('role', inv.role, 'email', inv.email));

  return inv.business_id;
end;
$$;

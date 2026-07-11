-- 129_my_pending_invites.sql
-- Invite detection at onboarding: a user who created their account BEFORE the
-- owner sent the invite lands on "create your business" with no hint that an
-- invitation is waiting. This RPC lists the signed-in user's own pending
-- invites (by email) so onboarding can offer "join <business>" instead.
-- SECURITY DEFINER like lookup_invite — only ever returns rows whose email
-- matches the caller's auth email.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.my_pending_invites()
returns table(
  token text,
  business_id uuid,
  business_name text,
  role text,
  expires_at timestamptz
) language sql security definer stable as $$
  select i.token, i.business_id, b.name as business_name, i.role, i.expires_at
  from public.business_invites i
  join public.businesses b on b.id = i.business_id
  where lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc;
$$;

revoke execute on function public.my_pending_invites() from anon, public;
grant execute on function public.my_pending_invites() to authenticated;

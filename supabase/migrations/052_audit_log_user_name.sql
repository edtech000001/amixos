-- Migration 052: surface the acting user's display name in the activity log.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- list_audit_log only returned user_email, so the Activity screen could only
-- show an email — harder to recognize who did what. Add user_name, resolved
-- from auth.users.raw_user_meta_data the same way list_business_members does
-- (display_name → name → full_name). NULL when the user never set one, in
-- which case the client falls back to the email.
--
-- The RETURNS TABLE shape changes (new column), so the function must be
-- dropped and recreated — CREATE OR REPLACE can't alter the return type.

drop function if exists public.list_audit_log(uuid, int, timestamptz);

create or replace function public.list_audit_log(b_id uuid, page_size int default 50, before timestamptz default null)
returns table(
  id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz
) language sql security definer stable as $$
  select a.id, a.user_id, u.email as user_email,
         coalesce(
           u.raw_user_meta_data->>'display_name',
           u.raw_user_meta_data->>'name',
           u.raw_user_meta_data->>'full_name'
         ) as user_name,
         a.action, a.entity_type, a.entity_id, a.details, a.created_at
  from public.audit_log a
  left join auth.users u on u.id = a.user_id
  where a.business_id = b_id
    and public.is_business_member(b_id)
    and (before is null or a.created_at < before)
  order by a.created_at desc
  limit page_size;
$$;

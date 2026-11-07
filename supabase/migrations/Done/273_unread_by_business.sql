-- 273_unread_by_business.sql
-- Unread notification counts per business for the signed-in user — the badges
-- in the business switcher (an owner of 3 companies sees which one has news).
-- SECURITY INVOKER: notifications RLS (own rows only) still applies; the
-- grouping just avoids downloading every unread row to count them.

create or replace function public.my_unread_notification_counts()
returns table (business_id uuid, unread integer)
language sql stable security invoker set search_path = public as $$
  select n.business_id, count(*)::int
  from public.notifications n
  where n.user_id = auth.uid() and n.read_at is null
  group by n.business_id;
$$;

revoke execute on function public.my_unread_notification_counts() from public, anon;
grant execute on function public.my_unread_notification_counts() to authenticated;

-- 279_member_names_from_profile.sql
-- "Created by" lines showed the email ("thepivotbuilders.construction") for
-- owners with no employee record, because list_business_members (022) took
-- display_name from auth metadata only — the name saved in Settings → Account
-- lives in public.profiles, which other members can't read (own-row RLS).
-- Now display_name = profile first + last name, falling back to the auth
-- metadata as before. Same signature and gate; clients still prefer the
-- employee record (memberNameMap), matching notif_person_name (271).
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.list_business_members(b_id uuid)
returns table(
  id uuid,
  user_id uuid,
  role text,
  email text,
  display_name text,
  joined_at timestamptz
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select bm.id, bm.user_id, bm.role,
         u.email,
         coalesce(
           nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           u.raw_user_meta_data->>'display_name',
           u.raw_user_meta_data->>'name'
         ) as display_name,
         bm.created_at as joined_at
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  left join public.profiles p on p.id = bm.user_id
  where bm.business_id = b_id
    and public.is_business_member(b_id);
$$;

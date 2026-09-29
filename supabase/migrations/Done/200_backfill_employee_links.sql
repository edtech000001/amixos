-- 200_backfill_employee_links.sql
-- =============================================================================
-- Migration 199 resolves activity-log actor names roster-first, but only via
-- employees.user_id — and members who accepted their invite BEFORE migration
-- 176 (auto-link on accept) never got user_id set on their employee record,
-- so their rows still showed a bare email (e.g. Hector).
--
--   1. Backfill: link unlinked employee records to existing members of the
--      same business by personal-email match (same rule 176 applies on
--      accept). Also fixes crew visibility / self-assign for those members.
--   2. list_audit_log: additionally fall back to an email match, so even a
--      still-unlinked employee record names its actor.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

update public.employees e
  set user_id = u.id
  from auth.users u
  join public.business_members bm on bm.user_id = u.id
  where e.user_id is null
    and e.email is not null
    and lower(e.email) = lower(u.email)
    and bm.business_id = e.business_id;

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
           e.roster_name,
           u.raw_user_meta_data->>'display_name',
           u.raw_user_meta_data->>'name',
           u.raw_user_meta_data->>'full_name'
         ) as user_name,
         a.action, a.entity_type, a.entity_id, a.details, a.created_at
  from public.audit_log a
  left join auth.users u on u.id = a.user_id
  left join lateral (
    select nullif(trim(concat(emp.first_name, ' ', emp.last_name)), '') as roster_name
    from public.employees emp
    where emp.business_id = b_id
      and (emp.user_id = a.user_id
           or (emp.email is not null and u.email is not null
               and lower(emp.email) = lower(u.email)))
    order by (emp.user_id = a.user_id) desc, emp.active desc nulls last, emp.created_at asc
    limit 1
  ) e on true
  where a.business_id = b_id
    and public.is_business_member(b_id)
    and (before is null or a.created_at < before)
  order by a.created_at desc
  limit page_size;
$$;

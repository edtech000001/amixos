-- 199_audit_log_roster_names.sql
-- =============================================================================
-- Activity log showed just an email for members who never set a display name
-- on their ACCOUNT (auth.users metadata) — even though the business's employee
-- roster knows exactly who they are. Resolve the actor name from the roster
-- FIRST (the business-owned name, which the member can't change), then fall
-- back to account metadata, then email. Fixes existing rows retroactively
-- since names resolve at read time.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

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
    where emp.business_id = b_id and emp.user_id = a.user_id
    order by emp.active desc nulls last, emp.created_at asc
    limit 1
  ) e on true
  where a.business_id = b_id
    and public.is_business_member(b_id)
    and (before is null or a.created_at < before)
  order by a.created_at desc
  limit page_size;
$$;

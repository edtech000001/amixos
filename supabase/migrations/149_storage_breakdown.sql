-- 149_storage_breakdown.sql
-- Per-business storage usage BROKEN DOWN by area, so the Files screen's
-- storage meter can show what's actually eating the space:
--   jobs      → job photos (jobs/<biz>/…) + job documents (jobdocs/<biz>/…)
--   files     → the Files library (files/<biz>/…)
--   equipment → equipment photos (equipment/<biz>/…)
--   other     → anything else under the business's folder
-- Companion to 100's business_storage_bytes (which stays the total/quota
-- source); same SECURITY DEFINER + membership guard.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.business_storage_breakdown(p_business_id uuid)
returns jsonb
language sql
security definer
set search_path = public, storage
as $$
  select case
    when public.is_business_member(p_business_id) then
      coalesce((
        select jsonb_build_object(
          'total',     coalesce(sum(x.sz), 0),
          'jobs',      coalesce(sum(x.sz) filter (where x.prefix in ('jobs', 'jobdocs')), 0),
          'files',     coalesce(sum(x.sz) filter (where x.prefix = 'files'), 0),
          'equipment', coalesce(sum(x.sz) filter (where x.prefix = 'equipment'), 0),
          'other',     coalesce(sum(x.sz) filter (where x.prefix not in ('jobs', 'jobdocs', 'files', 'equipment')), 0)
        )
        from (
          select (o.metadata->>'size')::bigint as sz,
                 (storage.foldername(o.name))[1] as prefix
          from storage.objects o
          where (storage.foldername(o.name))[2] = p_business_id::text
        ) x
      ), '{}'::jsonb)
    else '{}'::jsonb
  end;
$$;

grant execute on function public.business_storage_breakdown(uuid) to authenticated;

-- 100_storage_usage.sql
-- Per-business storage usage (bytes), summed straight from storage.objects so it
-- covers EVERYTHING a business stores — files module, job photos, equipment
-- photos — regardless of which app table tracks size. All of those paths put the
-- business_id in the 2nd segment (files/<biz>/…, jobs/<biz>/…, equipment/<biz>/…),
-- so foldername[2] = business_id identifies a business's objects. (Logos live at
-- logos/<ts> and don't match — fine, they're tiny + public.)
--
-- SECURITY DEFINER so it can read storage.objects, but guarded by membership:
-- the caller only gets a number for a business they belong to.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.business_storage_bytes(p_business_id uuid)
returns bigint
language sql
security definer
set search_path = public, storage
as $$
  select case
    when public.is_business_member(p_business_id) then
      coalesce((
        select sum((o.metadata->>'size')::bigint)
        from storage.objects o
        where (storage.foldername(o.name))[2] = p_business_id::text
      ), 0)
    else 0
  end;
$$;

grant execute on function public.business_storage_bytes(uuid) to authenticated;

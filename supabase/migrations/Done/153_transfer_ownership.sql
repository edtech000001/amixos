-- 153_transfer_ownership.sql
-- Ownership transfer: the current owner hands the business to an existing
-- member. Single-owner model stays (billing, Stripe, delete-business are all
-- tied to one owner) — this is a TRANSFER, not co-ownership:
--   * businesses.owner_id moves to the new owner
--   * the new owner's member row becomes role 'owner'
--   * the outgoing owner's member row becomes role 'admin'
--
-- SECURITY DEFINER because 082 deliberately blocks direct owner-row edits
-- (admins can't touch the owner membership or promote to owner). The only
-- caller who gets through this function is the CURRENT owner themselves.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.transfer_business_ownership(
  b_id uuid,
  new_owner_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.businesses where id = b_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if new_owner_user_id = v_owner then
    return jsonb_build_object('ok', false, 'error', 'already_owner');
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = b_id and user_id = new_owner_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  update public.businesses
    set owner_id = new_owner_user_id
    where id = b_id;
  update public.business_members
    set role = 'owner'
    where business_id = b_id and user_id = new_owner_user_id;
  update public.business_members
    set role = 'admin'
    where business_id = b_id and user_id = v_owner;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.transfer_business_ownership(uuid, uuid) to authenticated;

-- 082_protect_owner_membership.sql
-- Owner-row protection for business_members.
--
-- Admins (owner + admin) already manage members — invite, change role, remove
-- (migration 022 + invites API). But the UPDATE/DELETE policies from 022 let an
-- admin modify or remove ANY member row, including the OWNER's. The app UI
-- hides the owner's controls, but RLS is the real lock and didn't enforce it —
-- an admin could demote/remove the owner (or mint a second owner by promoting
-- someone) straight through the API.
--
-- There is exactly one owner per business and ownership transfer isn't a
-- supported flow yet, so the owner row must be immutable through normal member
-- management. This tightens the two 022 policies so admins keep full control
-- over every NON-owner member while the owner row can't be edited, deleted, or
-- minted via these paths:
--   • UPDATE  using  role <> 'owner'  → can't target the owner row
--   • UPDATE  check  role <> 'owner'  → can't promote anyone TO owner
--   • DELETE  using  role <> 'owner'  → can't remove the owner
--
-- INSERT is intentionally left as-is: onboarding inserts the first owner row,
-- and invites never create owners (invites API ALLOWED_ROLES excludes 'owner').
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- Admins can update any non-owner member; the owner row is untouchable and no
-- update may result in a second owner.
drop policy if exists "admin update business_members" on public.business_members;
create policy "admin update business_members" on public.business_members for update
  using (public.is_business_admin(business_id) and role <> 'owner')
  with check (public.is_business_admin(business_id) and role <> 'owner');

-- Admins can remove any non-owner member; the owner row can't be deleted here.
drop policy if exists "admin delete business_members" on public.business_members;
create policy "admin delete business_members" on public.business_members for delete
  using (public.is_business_admin(business_id) and role <> 'owner');

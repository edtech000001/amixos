-- Migration 004: Drop old recursive business_members policy (correct name this time)
-- Migration 002 used wrong names — the actual policy from 001 is below

-- Drop the recursive policy (exact name from 001_initial_schema.sql)
drop policy if exists "Owners and managers can manage members" on public.business_members;

-- Also clean up any conflicting policies from migration 002 (in case they were created)
drop policy if exists "Owner can manage all members of their business" on public.business_members;
drop policy if exists "User can view their own memberships" on public.business_members;
drop policy if exists "Owner can view their businesses" on public.businesses;
drop policy if exists "Owner can manage their businesses" on public.businesses;

-- Re-create clean business policies (no business_members reference)
create policy "Owner can manage their businesses"
  on public.businesses for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Re-create clean business_members policies (no self-reference)
-- Owners can manage members of businesses they own
create policy "Owner can manage members"
  on public.business_members for all
  using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_members.business_id
        and businesses.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses
      where businesses.id = business_members.business_id
        and businesses.owner_id = auth.uid()
    )
  );

-- Users can view their own membership records
create policy "User can view own memberships"
  on public.business_members for select
  using (user_id = auth.uid());

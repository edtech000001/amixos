-- Migration 002: Fix infinite RLS recursion on business_members
-- Problem: business_members policy references itself, causing infinite recursion
-- Fix: rewrite policies to use direct owner_id checks on businesses table

-- ── Drop the recursive policies ──────────────────────────────────────────────

drop policy if exists "Owners and managers can manage members" on public.business_members;
drop policy if exists "Business members can view their own business" on public.businesses;
drop policy if exists "Owners can manage their business" on public.businesses;

-- ── Recreate businesses policies (no business_members reference) ─────────────

-- Anyone can read a business they own
create policy "Owner can view their businesses"
  on public.businesses for select using (
    owner_id = auth.uid()
  );

-- Only the owner can insert/update/delete their business
create policy "Owner can manage their businesses"
  on public.businesses for all using (
    owner_id = auth.uid()
  );

-- ── Recreate business_members policies (no self-reference) ───────────────────

-- Members can view all members in businesses they belong to
-- Uses businesses table (not business_members) to break recursion
create policy "Owner can manage all members of their business"
  on public.business_members for all using (
    exists (
      select 1 from public.businesses
      where businesses.id = business_members.business_id
      and businesses.owner_id = auth.uid()
    )
  );

-- Users can always view their own membership record
create policy "User can view their own memberships"
  on public.business_members for select using (
    user_id = auth.uid()
  );

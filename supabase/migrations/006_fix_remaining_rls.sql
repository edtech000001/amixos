-- Migration 006: Replace business_members-dependent policies with owner-direct checks

-- ── CLIENTS ──────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage clients" on public.clients;

create policy "Owner can manage clients"
  on public.clients for all
  using (
    exists (select 1 from public.businesses where businesses.id = clients.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = clients.business_id and businesses.owner_id = auth.uid())
  );

-- ── INVOICES ─────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage invoices" on public.invoices;

create policy "Owner can manage invoices"
  on public.invoices for all
  using (
    exists (select 1 from public.businesses where businesses.id = invoices.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = invoices.business_id and businesses.owner_id = auth.uid())
  );

-- ── BUSINESS MODULES ─────────────────────────────────────────────────────────
drop policy if exists "Business members can view modules" on public.business_modules;
drop policy if exists "Owners can manage modules" on public.business_modules;

create policy "Owner can manage modules"
  on public.business_modules for all
  using (
    exists (select 1 from public.businesses where businesses.id = business_modules.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = business_modules.business_id and businesses.owner_id = auth.uid())
  );

-- ── CALENDAR EVENTS ──────────────────────────────────────────────────────────
drop policy if exists "Business members can manage calendar events" on public.calendar_events;

create policy "Owner can manage calendar events"
  on public.calendar_events for all
  using (
    exists (select 1 from public.businesses where businesses.id = calendar_events.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = calendar_events.business_id and businesses.owner_id = auth.uid())
  );

-- ── INVENTORY ────────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage inventory" on public.inventory_items;

create policy "Owner can manage inventory"
  on public.inventory_items for all
  using (
    exists (select 1 from public.businesses where businesses.id = inventory_items.business_id and businesses.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.businesses where businesses.id = inventory_items.business_id and businesses.owner_id = auth.uid())
  );

-- ── TIMESHEETS ───────────────────────────────────────────────────────────────
drop policy if exists "Business members can manage their timesheets" on public.timesheets;
drop policy if exists "Members can manage timesheets" on public.timesheets;

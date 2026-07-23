-- 152_member_can_calendar_inventory.sql
-- Server enforcement for the role editor's CALENDAR and INVENTORY toggles,
-- and a security fix for field job deletes.
--
-- 1) default_role_permissions() now encodes ALL resource keys (clients, jobs,
--    invoices, employees, calendar, inventory, reports), synced to
--    DEFAULT_ROLE_PERMISSIONS in shared/src/lib/permissions.ts. Two changes
--    vs 103:
--      * calendar/inventory/reports keys added (were missing → RLS ignored
--        the role editor for those resources).
--      * field jobs delete: true → FALSE. 103 granted it, and the jobs
--        delete policy has no assignment scoping — so a field account could
--        delete ANY job via the API. The app default never intended that;
--        a business that wants field deletes can grant it in the role editor.
--
-- 2) calendar_events / inventory_items policies move from the fixed 022 role
--    lists to member_view/member_res, so role-editor customizations are
--    enforced by the database (matching clients/jobs/invoices/employees).
--    Notes:
--      * calendar events have no assignment concept — any view level except
--        'none' grants read.
--      * inventory delete was admin-only in 022; the matrix default grants
--        manager/office delete (the UI always offered it — the DB just
--        silently refused). This aligns DB with the matrix.
--
-- 3) REPORTS stays UI-level on purpose: there is no reports table — reports
--    aggregate jobs/invoices the role can already read, so the underlying
--    tables' RLS is the real boundary.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.default_role_permissions(role text)
returns jsonb language sql immutable as $$
  select case role
    when 'owner' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'admin' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'manager' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"all","create":true,"edit":true,"delete":false},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'office' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'field' then
      '{"resources":{"clients":{"view":"assigned","create":false,"edit":false,"delete":false},"jobs":{"view":"assigned","create":true,"edit":true,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"none","create":false,"edit":false,"delete":false},"inventory":{"view":"none","create":false,"edit":false,"delete":false},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'viewer' then
      '{"resources":{"clients":{"view":"all","create":false,"edit":false,"delete":false},"jobs":{"view":"all","create":false,"edit":false,"delete":false},"invoices":{"view":"all","create":false,"edit":false,"delete":false},"employees":{"view":"all","create":false,"edit":false,"delete":false},"calendar":{"view":"all","create":false,"edit":false,"delete":false},"inventory":{"view":"all","create":false,"edit":false,"delete":false},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    else
      '{"resources":{"clients":{"view":"none","create":false,"edit":false,"delete":false},"jobs":{"view":"none","create":false,"edit":false,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"none","create":false,"edit":false,"delete":false},"inventory":{"view":"none","create":false,"edit":false,"delete":false},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
  end;
$$;

-- ─── calendar_events ────────────────────────────────────────────────────────
drop policy if exists "members read calendar_events" on public.calendar_events;
drop policy if exists "office+ write calendar_events" on public.calendar_events;
drop policy if exists "office+ update calendar_events" on public.calendar_events;
drop policy if exists "office+ delete calendar_events" on public.calendar_events;

create policy "calendar read" on public.calendar_events for select
  using (public.member_view(business_id, 'calendar') <> 'none');
create policy "calendar insert" on public.calendar_events for insert
  with check (public.member_res(business_id, 'calendar', 'create'));
create policy "calendar update" on public.calendar_events for update
  using (public.member_res(business_id, 'calendar', 'edit'));
create policy "calendar delete" on public.calendar_events for delete
  using (public.member_res(business_id, 'calendar', 'delete'));

-- ─── inventory_items ────────────────────────────────────────────────────────
drop policy if exists "members read inventory_items" on public.inventory_items;
drop policy if exists "office+ write inventory_items" on public.inventory_items;
drop policy if exists "office+ update inventory_items" on public.inventory_items;
drop policy if exists "admin delete inventory_items" on public.inventory_items;

create policy "inventory read" on public.inventory_items for select
  using (public.member_view(business_id, 'inventory') <> 'none');
create policy "inventory insert" on public.inventory_items for insert
  with check (public.member_res(business_id, 'inventory', 'create'));
create policy "inventory update" on public.inventory_items for update
  using (public.member_res(business_id, 'inventory', 'edit'));
create policy "inventory delete" on public.inventory_items for delete
  using (public.member_res(business_id, 'inventory', 'delete'));

-- 164_member_can_satellites.sql  (Phase 5 — enforce the role editor on satellites)
-- =============================================================================
-- Migrations 089 + 152 made the role editor's per-business overrides ENFORCED in
-- RLS for six resources (clients, jobs, invoices, employees, calendar_events,
-- inventory_items) via member_res()/member_view(). But their SATELLITE tables
-- still used the old fixed role-list helpers (can_write_business = office+,
-- has_business_role manager+, is_business_admin), so a role-editor customization
-- to the parent resource was silently IGNORED on the child table:
--   • strip a role's clients.edit → it could still edit that client's CONTACTS
--   • strip invoices.edit         → it could still record invoice PAYMENTS
--   • the assignWorkers cap toggle → did nothing (job_assignments hardcoded mgr+)
--
-- This rewrites those child policies to resolve the SAME effective permission as
-- their parent resource, so the role editor is honored end-to-end.
--
-- SAFETY: for a role with NO override row the resolved permission equals the
-- built-in default, chosen below to match the previous fixed-list policy. So an
-- un-customized business is unchanged EXCEPT the two intentional alignments
-- called out inline (both mirror decisions already made in 152 for the parent):
--   1) job_items writes follow jobs.edit → field (jobs.edit=true since 152) gains
--      job_items write, matching that it can already create/edit its own jobs.
--   2) equipment delete follows inventory.delete → manager/office gain equipment
--      delete, exactly as 152 already did for inventory_items ("aligns DB with
--      the matrix; the UI always offered it").
--
-- default_role_permissions() (resources) is unchanged; this only adds a caps
-- accessor for the one cap RLS now consumes (assignWorkers).
--
-- ⚠️ Changes data-access rules on live data. Test each role on a NON-production
-- business first. IMPORTANT: run manually in the Supabase SQL Editor. Idempotent.
-- =============================================================================

-- ─── caps accessor (mirrors DEFAULT_ROLE_PERMISSIONS caps, role-editor aware) ──
-- Only assignWorkers is consumed by RLS today; others resolve false here (the UI
-- remains their enforcement point). Extend `default_role_cap` as more caps move
-- into the database. Keep in sync with the caps() defaults in permissions.ts.
create or replace function public.default_role_cap(role text, cap text)
returns boolean language sql immutable as $$
  select case
    when cap = 'assignWorkers' then role in ('owner', 'admin', 'manager')
    else false
  end;
$$;

-- SECURITY DEFINER so it reads business_members / business_roles without tripping
-- their own RLS (mirrors member_res/member_view from 089).
create or replace function public.member_cap(b_id uuid, cap text)
returns boolean language plpgsql security definer stable as $$
declare r text; p jsonb;
begin
  r := public.member_role(b_id);
  if r is null then return false; end if;
  select permissions into p from public.business_roles where business_id = b_id and key = r;
  if p is not null and (p #> array['caps', cap]) is not null then
    return coalesce((p #>> array['caps', cap])::boolean, false);
  end if;
  return public.default_role_cap(r, cap);
end;
$$;

-- ─── client_contacts → follows clients.edit ──────────────────────────────────
drop policy if exists "office+ write client_contacts" on public.client_contacts;
drop policy if exists "office+ update client_contacts" on public.client_contacts;
drop policy if exists "office+ delete client_contacts" on public.client_contacts;
create policy "client_contacts insert" on public.client_contacts for insert
  with check (public.member_res(business_id, 'clients', 'edit'));
create policy "client_contacts update" on public.client_contacts for update
  using (public.member_res(business_id, 'clients', 'edit'));
create policy "client_contacts delete" on public.client_contacts for delete
  using (public.member_res(business_id, 'clients', 'edit'));

-- ─── job_items → follows jobs.edit (scoped through parent job) ────────────────
-- NOTE: field (jobs.edit=true since 152) now gains job_items write — consistent
-- with it already creating/editing its own jobs.
drop policy if exists "office+ write job_items" on public.job_items;
drop policy if exists "office+ update job_items" on public.job_items;
drop policy if exists "office+ delete job_items" on public.job_items;
create policy "job_items insert" on public.job_items for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.member_res(j.business_id, 'jobs', 'edit')
  ));
create policy "job_items update" on public.job_items for update
  using (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.member_res(j.business_id, 'jobs', 'edit')
  ));
create policy "job_items delete" on public.job_items for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_items.job_id and public.member_res(j.business_id, 'jobs', 'edit')
  ));

-- ─── invoice_payments → follows invoices.edit ────────────────────────────────
-- Recording / removing a payment is an edit of the invoice's payment state.
drop policy if exists "office+ insert invoice_payments" on public.invoice_payments;
drop policy if exists "office+ delete invoice_payments" on public.invoice_payments;
create policy "invoice_payments insert" on public.invoice_payments for insert
  with check (public.member_res(business_id, 'invoices', 'edit'));
create policy "invoice_payments delete" on public.invoice_payments for delete
  using (public.member_res(business_id, 'invoices', 'edit'));

-- ─── equipment (+ photos) → follows inventory.{create,edit,delete} ────────────
-- NOTE: manager/office gain equipment DELETE, exactly as 152 did for inventory.
drop policy if exists "writers insert equipment" on public.equipment;
drop policy if exists "writers update equipment" on public.equipment;
drop policy if exists "admins delete equipment" on public.equipment;
create policy "equipment insert" on public.equipment for insert
  with check (public.member_res(business_id, 'inventory', 'create'));
create policy "equipment update" on public.equipment for update
  using (public.member_res(business_id, 'inventory', 'edit'));
create policy "equipment delete" on public.equipment for delete
  using (public.member_res(business_id, 'inventory', 'delete'));

drop policy if exists "writers insert equipment photos" on public.equipment_photos;
drop policy if exists "writers update equipment photos" on public.equipment_photos;
drop policy if exists "writers delete equipment photos" on public.equipment_photos;
create policy "equipment_photos insert" on public.equipment_photos for insert
  with check (public.member_res(business_id, 'inventory', 'edit'));
create policy "equipment_photos update" on public.equipment_photos for update
  using (public.member_res(business_id, 'inventory', 'edit'));
create policy "equipment_photos delete" on public.equipment_photos for delete
  using (public.member_res(business_id, 'inventory', 'edit'));

-- ─── job_assignments → follows the assignWorkers cap (scoped through job) ─────
-- Default assignWorkers = owner/admin/manager, so un-customized behavior equals
-- the previous "manager+" policy; now the role editor's toggle is enforced. The
-- 131 "field assign/unassign own jobs" policies remain (OR'd) so crew can still
-- self-assign to jobs they lead.
drop policy if exists "manager+ write job_assignments" on public.job_assignments;
drop policy if exists "manager+ update job_assignments" on public.job_assignments;
drop policy if exists "manager+ delete job_assignments" on public.job_assignments;
create policy "job_assignments insert" on public.job_assignments for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id and public.member_cap(j.business_id, 'assignWorkers')
  ));
create policy "job_assignments update" on public.job_assignments for update
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id and public.member_cap(j.business_id, 'assignWorkers')
  ));
create policy "job_assignments delete" on public.job_assignments for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_assignments.job_id and public.member_cap(j.business_id, 'assignWorkers')
  ));

-- ── Verify (optional) ────────────────────────────────────────────────────────
--   select tablename, policyname, cmd from pg_policies where schemaname='public'
--   and tablename in ('client_contacts','job_items','invoice_payments','equipment',
--   'equipment_photos','job_assignments') order by tablename, cmd;
--   -- spot-check a cap:  select public.member_cap('<biz-uuid>','assignWorkers');

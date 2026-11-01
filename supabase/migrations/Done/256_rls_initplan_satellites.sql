-- 256_rls_initplan_satellites.sql
-- Same fix as 254 (job_assignments), applied to the other read policies that
-- still call a SECURITY DEFINER helper with a ROW column — once per row read:
--   is_business_member(business_id), member_view(business_id, …),
--   member_cap(business_id, …), or a correlated jobs/employees lookup.
-- CLAUDE.md rule: such helpers must never take a row column; reference a
-- no-arg (or constant-arg) set function via `in (select …)` so Postgres
-- evaluates it ONCE per query (initplan).
--
-- Access is unchanged — each rewrite is an exact equivalent:
--   * is_business_member(b)         → b in my_member_business_ids()
--       (both = a business_members row for auth.uid())
--   * member_view(b, res) <> 'none' → b in my_view_any_businesses(res)
--       (member_view is 'none' without a business_members role, 089/181)
--   * member_cap(b, cap)            → b in my_cap_businesses(cap)
--       (member_cap is false without a business_members role, 181)
--   * job_items: the jobs subquery already applies jobs' own RLS, which
--       implies membership — the extra per-row is_business_member() is dropped.
--   * own timesheets: "my employee row" → employee_id in my_employee_ids().
-- Policy names and commands are kept, so nothing else references change.
--
-- Deliberately NOT touched: the 160 "loc lock …" RESTRICTIVE policies (they
-- short-circuit on the initplan arm for unlocked businesses), the public
-- shared-invoice read on clients (evaluated only for rows the main policy
-- didn't already allow), and early "Owner can manage …" policies whose
-- current existence can't be confirmed from the migrations.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- ── Set helpers (evaluated once per query) ──────────────────────────────────
create or replace function public.my_view_any_businesses(res text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select bm.business_id
  from public.business_members bm
  where bm.user_id = auth.uid()
    and public.member_view(bm.business_id, res) <> 'none';
$$;

create or replace function public.my_cap_businesses(cap text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select bm.business_id
  from public.business_members bm
  where bm.user_id = auth.uid()
    and public.member_cap(bm.business_id, cap);
$$;

create or replace function public.my_employee_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id from public.employees e where e.user_id = auth.uid();
$$;

revoke all on function public.my_view_any_businesses(text) from public, anon;
revoke all on function public.my_cap_businesses(text) from public, anon;
revoke all on function public.my_employee_ids() from public, anon;
grant execute on function public.my_view_any_businesses(text) to authenticated, service_role;
grant execute on function public.my_cap_businesses(text) to authenticated, service_role;
grant execute on function public.my_employee_ids() to authenticated, service_role;

-- ── job_items (was: correlated jobs lookup + is_business_member per row) ───
drop policy if exists "members read job_items" on public.job_items;
create policy "members read job_items" on public.job_items for select
  using (exists (select 1 from public.jobs j where j.id = job_items.job_id));

-- ── timesheets ─────────────────────────────────────────────────────────────
drop policy if exists "cap read all timesheets" on public.timesheets;
create policy "cap read all timesheets" on public.timesheets for select
  using (business_id in (select public.my_cap_businesses('viewAllTimesheets')));

drop policy if exists "member read own timesheets" on public.timesheets;
create policy "member read own timesheets" on public.timesheets for select
  using (
    business_id in (select public.my_member_business_ids())
    and employee_id in (select public.my_employee_ids())
  );

-- ── member_view(business_id, …) <> 'none' ──────────────────────────────────
drop policy if exists "calendar read" on public.calendar_events;
create policy "calendar read" on public.calendar_events for select
  using (business_id in (select public.my_view_any_businesses('calendar')));

drop policy if exists "equipment read" on public.equipment;
create policy "equipment read" on public.equipment for select
  using (business_id in (select public.my_view_any_businesses('equipment')));

drop policy if exists "equipment_photos read" on public.equipment_photos;
create policy "equipment_photos read" on public.equipment_photos for select
  using (business_id in (select public.my_view_any_businesses('equipment')));

drop policy if exists "inventory read" on public.inventory_items;
create policy "inventory read" on public.inventory_items for select
  using (business_id in (select public.my_view_any_businesses('inventory')));

-- ── is_business_member(business_id) ────────────────────────────────────────
drop policy if exists "members read client_contacts" on public.client_contacts;
create policy "members read client_contacts" on public.client_contacts for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read client_communications" on public.client_communications;
create policy "members read client_communications" on public.client_communications for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read job photos" on public.job_photos;
create policy "members read job photos" on public.job_photos for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read job documents" on public.job_documents;
create policy "members read job documents" on public.job_documents for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read audit_log" on public.audit_log;
create policy "members read audit_log" on public.audit_log for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read client_locations" on public.client_locations;
create policy "members read client_locations" on public.client_locations for select
  using (business_id in (select public.my_member_business_ids()));

drop policy if exists "members read price_sheet_items" on public.price_sheet_items;
create policy "members read price_sheet_items" on public.price_sheet_items for select
  using (business_id in (select public.my_member_business_ids()));

notify pgrst, 'reload schema';

-- ── Verify (optional) ───────────────────────────────────────────────────────
-- No read policy on these tables should still call a helper with a row column:
--   select tablename, policyname, qual from pg_policies
--   where schemaname = 'public' and cmd in ('SELECT', 'ALL')
--     and qual ~ '(is_business_member|member_view|member_cap)\(business_id'
--   order by tablename;

-- 257_rls_initplan_all.sql
-- The rest of the per-row RLS checks (follow-up to 254 + 256), including
-- INSERT / UPDATE / DELETE policies: every remaining policy that calls a
-- SECURITY DEFINER helper with a ROW column, or looks up the business owner
-- with a correlated subquery, is rewritten to the set-based form evaluated
-- ONCE per statement (initplan):
--   member_res(b, r, a)        → b in my_res_businesses(r, a)
--   can_write_business(b)      → b in my_write_businesses()
--   is_business_member(b)      → b in my_member_business_ids()
--   member_view(b, r) <> 'none'→ b in my_view_any_businesses(r)
--   member_cap(b, c)           → b in my_cap_businesses(c)
--   member_role(b) = 'x'       → b in my_role_businesses('x')
--   exists(businesses … owner_id = auth.uid()) → b in my_owned_business_ids()
--   exists(business_members … [role in (…)])  → b in my_member_business_ids()
--                                                / my_roles_businesses(array[…])
-- Each helper runs the SAME function as before, once per business the caller
-- belongs to instead of once per row — access is unchanged. (Every one of
-- those functions is false / 'none' without a business_members row, so
-- restricting the set to the caller's memberships is exact.)
--
-- Applied IN PLACE with ALTER POLICY (name, command, roles, permissive /
-- restrictive all kept), and only when a policy with that name exists AND
-- still uses the old per-row helpers — a policy that was dropped or already
-- rewritten is skipped, never recreated. Generated from the effective
-- policies reconstructed from migrations 001–256.
--
-- Left as-is: is_assigned_to_job(...) calls, member_location_grants() (no row
-- arg), the 160 "loc lock" RESTRICTIVE policies, the public shared-invoice
-- reads, and two single-row write checks on job_assignments (field self-assign,
-- lead update) whose row-specific joins have no set form.
--
-- Source policy bodies are comment-stripped before being flattened onto one
-- line (an inline `-- …` comment would otherwise swallow the rest of the
-- statement, as in the first attempt).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

create or replace function public.my_res_businesses(res text, act text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.business_id from public.business_members bm
  where bm.user_id = auth.uid() and public.member_res(bm.business_id, res, act);
$$;
create or replace function public.my_write_businesses()
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.business_id from public.business_members bm
  where bm.user_id = auth.uid() and public.can_write_business(bm.business_id);
$$;
create or replace function public.my_role_businesses(role_key text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.business_id from public.business_members bm
  where bm.user_id = auth.uid() and bm.role = role_key;
$$;
create or replace function public.my_owned_business_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.id from public.businesses b where b.owner_id = auth.uid();
$$;

revoke all on function public.my_res_businesses(text, text) from public, anon;
revoke all on function public.my_write_businesses() from public, anon;
revoke all on function public.my_role_businesses(text) from public, anon;
revoke all on function public.my_owned_business_ids() from public, anon;
grant execute on function public.my_res_businesses(text, text) to authenticated, service_role;
grant execute on function public.my_write_businesses() to authenticated, service_role;
grant execute on function public.my_role_businesses(text) to authenticated, service_role;
grant execute on function public.my_owned_business_ids() to authenticated, service_role;

create or replace function public.my_roles_businesses(role_keys text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select bm.business_id from public.business_members bm
  where bm.user_id = auth.uid() and bm.role = any(role_keys);
$$;
revoke all on function public.my_roles_businesses(text[]) from public, anon;
grant execute on function public.my_roles_businesses(text[]) to authenticated, service_role;

-- ── Policies (each guarded: exists + still on the old per-row helpers) ──────
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'member writes own audit_log'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "member writes own audit_log" on public.audit_log with check ((business_id in (select public.my_member_business_ids())) and user_id = auth.uid())$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'members read audit_log'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read audit_log" on public.audit_log using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_members' and policyname = 'Owner can manage members'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage members" on public.business_members using ( (business_members.business_id in (select public.my_owned_business_ids())) ) with check ( (business_members.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_members' and policyname = 'members read business_members'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read business_members" on public.business_members using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_modules' and policyname = 'Owner can manage modules'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage modules" on public.business_modules using ( (business_modules.business_id in (select public.my_owned_business_ids())) ) with check ( (business_modules.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_modules' and policyname = 'members read business_modules'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read business_modules" on public.business_modules using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_roles' and policyname = 'members read business_roles'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read business_roles" on public.business_roles using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'businesses' and policyname = 'members read businesses'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read businesses" on public.businesses using ((id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'Owner can manage calendar events'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage calendar events" on public.calendar_events using ( (calendar_events.business_id in (select public.my_owned_business_ids())) ) with check ( (calendar_events.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "calendar delete" on public.calendar_events using ((business_id in (select public.my_res_businesses('calendar', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "calendar insert" on public.calendar_events with check ((business_id in (select public.my_res_businesses('calendar', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar read'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "calendar read" on public.calendar_events using ((business_id in (select public.my_view_any_businesses('calendar'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'calendar update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "calendar update" on public.calendar_events using ((business_id in (select public.my_res_businesses('calendar', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_communications' and policyname = 'members read client_communications'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read client_communications" on public.client_communications using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_communications' and policyname = 'writers delete client_communications'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete client_communications" on public.client_communications using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_communications' and policyname = 'writers insert client_communications'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert client_communications" on public.client_communications with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_communications' and policyname = 'writers update client_communications'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update client_communications" on public.client_communications using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_contacts' and policyname = 'client_contacts delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "client_contacts delete" on public.client_contacts using ((business_id in (select public.my_res_businesses('clients', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_contacts' and policyname = 'client_contacts insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "client_contacts insert" on public.client_contacts with check ((business_id in (select public.my_res_businesses('clients', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_contacts' and policyname = 'client_contacts update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "client_contacts update" on public.client_contacts using ((business_id in (select public.my_res_businesses('clients', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_contacts' and policyname = 'members read client_contacts'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read client_contacts" on public.client_contacts using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_field_templates' and policyname = 'members read client_field_templates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read client_field_templates" on public.client_field_templates using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_field_templates' and policyname = 'owner manage templates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "owner manage templates" on public.client_field_templates using ( (client_field_templates.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_locations' and policyname = 'members read client_locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read client_locations" on public.client_locations using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_locations' and policyname = 'writers delete client_locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete client_locations" on public.client_locations using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_locations' and policyname = 'writers insert client_locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert client_locations" on public.client_locations with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_locations' and policyname = 'writers update client_locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update client_locations" on public.client_locations using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'Owner can manage clients'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage clients" on public.clients using ( (clients.business_id in (select public.my_owned_business_ids())) ) with check ( (clients.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'clients delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "clients delete" on public.clients using ((business_id in (select public.my_res_businesses('clients', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'clients insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "clients insert" on public.clients with check ((business_id in (select public.my_res_businesses('clients', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'clients update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "clients update" on public.clients using ((business_id in (select public.my_res_businesses('clients', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employee_locations' and policyname = 'members read employee_locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read employee_locations" on public.employee_locations using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'Owner can manage employees'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage employees" on public.employees using ( (employees.business_id in (select public.my_owned_business_ids())) ) with check ( (employees.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'employees delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "employees delete" on public.employees using ((business_id in (select public.my_res_businesses('employees', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'employees insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "employees insert" on public.employees with check ((business_id in (select public.my_res_businesses('employees', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employees' and policyname = 'employees update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "employees update" on public.employees using ((business_id in (select public.my_res_businesses('employees', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment' and policyname = 'equipment delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment delete" on public.equipment using ((business_id in (select public.my_res_businesses('equipment', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment' and policyname = 'equipment insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment insert" on public.equipment with check ((business_id in (select public.my_res_businesses('equipment', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment' and policyname = 'equipment read'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment read" on public.equipment using ((business_id in (select public.my_view_any_businesses('equipment'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment' and policyname = 'equipment update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment update" on public.equipment using ((business_id in (select public.my_res_businesses('equipment', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_photos' and policyname = 'equipment_photos delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment_photos delete" on public.equipment_photos using ((business_id in (select public.my_res_businesses('equipment', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_photos' and policyname = 'equipment_photos insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment_photos insert" on public.equipment_photos with check ((business_id in (select public.my_res_businesses('equipment', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_photos' and policyname = 'equipment_photos read'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment_photos read" on public.equipment_photos using ((business_id in (select public.my_view_any_businesses('equipment'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'equipment_photos' and policyname = 'equipment_photos update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "equipment_photos update" on public.equipment_photos using ((business_id in (select public.my_res_businesses('equipment', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'estimates' and policyname = 'owner manage estimates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "owner manage estimates" on public.estimates using ((estimates.business_id in (select public.my_owned_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_categories' and policyname = 'members read file_categories'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read file_categories" on public.file_categories using ( (business_id in (select public.my_member_business_ids())) and (crew_visible or (business_id in (select public.my_write_businesses()))) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_categories' and policyname = 'writers delete file_categories'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete file_categories" on public.file_categories using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_categories' and policyname = 'writers insert file_categories'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert file_categories" on public.file_categories with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_categories' and policyname = 'writers update file_categories'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update file_categories" on public.file_categories using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_entries' and policyname = 'members read file_entries'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read file_entries" on public.file_entries using ( (business_id in (select public.my_member_business_ids())) and ( (business_id in (select public.my_write_businesses())) or coalesce( crew_visible, (select c.crew_visible from public.file_categories c where c.id = category_id) ) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_entries' and policyname = 'writers delete file_entries'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete file_entries" on public.file_entries using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_entries' and policyname = 'writers insert file_entries'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert file_entries" on public.file_entries with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_entries' and policyname = 'writers update file_entries'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update file_entries" on public.file_entries using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_folders' and policyname = 'members read file_folders'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read file_folders" on public.file_folders using ( (business_id in (select public.my_member_business_ids())) and ( (business_id in (select public.my_write_businesses())) or exists ( select 1 from public.file_categories c where c.id = category_id and c.crew_visible ) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_folders' and policyname = 'writers delete file_folders'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete file_folders" on public.file_folders using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_folders' and policyname = 'writers insert file_folders'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert file_folders" on public.file_folders with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_folders' and policyname = 'writers update file_folders'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update file_folders" on public.file_folders using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_sections' and policyname = 'members read file_sections'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read file_sections" on public.file_sections using ( (business_id in (select public.my_member_business_ids())) and exists ( select 1 from public.file_categories c where c.id = category_id and (c.crew_visible or (c.business_id in (select public.my_write_businesses()))) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_sections' and policyname = 'writers delete file_sections'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete file_sections" on public.file_sections using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_sections' and policyname = 'writers insert file_sections'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert file_sections" on public.file_sections with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_sections' and policyname = 'writers update file_sections'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update file_sections" on public.file_sections using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'import_logs' and policyname = 'writers insert import_logs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert import_logs" on public.import_logs with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'import_logs' and policyname = 'writers read import_logs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers read import_logs" on public.import_logs using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'Owner can manage inventory'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage inventory" on public.inventory_items using ( (inventory_items.business_id in (select public.my_owned_business_ids())) ) with check ( (inventory_items.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inventory delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "inventory delete" on public.inventory_items using ((business_id in (select public.my_res_businesses('inventory', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inventory insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "inventory insert" on public.inventory_items with check ((business_id in (select public.my_res_businesses('inventory', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inventory read'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "inventory read" on public.inventory_items using ((business_id in (select public.my_view_any_businesses('inventory'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inventory update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "inventory update" on public.inventory_items using ((business_id in (select public.my_res_businesses('inventory', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_field_templates' and policyname = 'members read invoice_field_templates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read invoice_field_templates" on public.invoice_field_templates using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_payments delete" on public.invoice_payments using ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_payments insert" on public.invoice_payments with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_payments update" on public.invoice_payments using ((business_id in (select public.my_res_businesses('invoices', 'edit')))) with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_reminders' and policyname = 'invoice_reminders delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_reminders delete" on public.invoice_reminders using ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_reminders' and policyname = 'invoice_reminders insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_reminders insert" on public.invoice_reminders with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_reminders' and policyname = 'invoice_reminders update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoice_reminders update" on public.invoice_reminders using ((business_id in (select public.my_res_businesses('invoices', 'edit')))) with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'Owner can manage invoices'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage invoices" on public.invoices using ( (invoices.business_id in (select public.my_owned_business_ids())) ) with check ( (invoices.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoices delete" on public.invoices using ((business_id in (select public.my_res_businesses('invoices', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoices insert" on public.invoices with check ((business_id in (select public.my_res_businesses('invoices', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "invoices update" on public.invoices using ((business_id in (select public.my_res_businesses('invoices', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignment_field_templates' and policyname = 'members read job_assignment_field_templates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read job_assignment_field_templates" on public.job_assignment_field_templates using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'creator assign own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "creator assign own jobs" on public.job_assignments with check (exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and j.created_by = auth.uid() and (j.business_id in (select public.my_res_businesses('jobs', 'create'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'creator unassign own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "creator unassign own jobs" on public.job_assignments using (exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and j.created_by = auth.uid() and (j.business_id in (select public.my_res_businesses('jobs', 'create'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'field assign own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field assign own jobs" on public.job_assignments with check ( exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and j.created_by = auth.uid() and (j.business_id in (select public.my_role_businesses('field'))) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'field unassign own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field unassign own jobs" on public.job_assignments using ( exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and j.created_by = auth.uid() and (j.business_id in (select public.my_role_businesses('field'))) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'job_assignments delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_assignments delete" on public.job_assignments using (exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and (j.business_id in (select public.my_cap_businesses('assignWorkers'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'job_assignments insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_assignments insert" on public.job_assignments with check (exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and (j.business_id in (select public.my_cap_businesses('assignWorkers'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_assignments' and policyname = 'job_assignments update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_assignments update" on public.job_assignments using (exists ( select 1 from public.jobs j where j.id = job_assignments.job_id and (j.business_id in (select public.my_cap_businesses('assignWorkers'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_documents' and policyname = 'members read job documents'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read job documents" on public.job_documents using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_documents' and policyname = 'writers delete job documents'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete job documents" on public.job_documents using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_documents' and policyname = 'writers insert job documents'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert job documents" on public.job_documents with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_field_templates' and policyname = 'members read job_field_templates'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read job_field_templates" on public.job_field_templates using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_items' and policyname = 'job_items delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_items delete" on public.job_items using (exists ( select 1 from public.jobs j where j.id = job_items.job_id and (j.business_id in (select public.my_res_businesses('jobs', 'edit'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_items' and policyname = 'job_items insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_items insert" on public.job_items with check (exists ( select 1 from public.jobs j where j.id = job_items.job_id and (j.business_id in (select public.my_res_businesses('jobs', 'edit'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_items' and policyname = 'job_items update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_items update" on public.job_items using (exists ( select 1 from public.jobs j where j.id = job_items.job_id and (j.business_id in (select public.my_res_businesses('jobs', 'edit'))) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_items' and policyname = 'members read job_items'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read job_items" on public.job_items using (exists ( select 1 from public.jobs j where j.id = job_items.job_id and (j.business_id in (select public.my_member_business_ids())) ))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pause_log' and policyname = 'job_pause_log delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_pause_log delete" on public.job_pause_log using ((business_id in (select public.my_res_businesses('jobs', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pause_log' and policyname = 'job_pause_log insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_pause_log insert" on public.job_pause_log with check ((business_id in (select public.my_res_businesses('jobs', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_pause_log' and policyname = 'job_pause_log update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "job_pause_log update" on public.job_pause_log using ((business_id in (select public.my_res_businesses('jobs', 'edit')))) with check ((business_id in (select public.my_res_businesses('jobs', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'field deletes own photos'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field deletes own photos" on public.job_photos using ( created_by = auth.uid() and (business_id in (select public.my_member_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'field photos on own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field photos on own jobs" on public.job_photos with check ( (business_id in (select public.my_member_business_ids())) and ( public.is_assigned_to_job(job_id) or exists ( select 1 from public.jobs j where j.id = job_photos.job_id and j.created_by = auth.uid() ) ) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'members read job photos'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read job photos" on public.job_photos using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'writers delete job photos'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete job photos" on public.job_photos using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'writers insert job photos'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert job photos" on public.job_photos with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_photos' and policyname = 'writers update job photos'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update job photos" on public.job_photos using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'creator updates own jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "creator updates own jobs" on public.jobs using ( created_by = auth.uid() and (business_id in (select public.my_member_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'field log jobs'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field log jobs" on public.jobs with check ( (business_id in (select public.my_role_businesses('field'))) and created_by = auth.uid() )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "jobs delete" on public.jobs using ((business_id in (select public.my_res_businesses('jobs', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "jobs insert" on public.jobs with check ((business_id in (select public.my_res_businesses('jobs', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "jobs update" on public.jobs using ( (business_id in (select public.my_res_businesses('jobs', 'edit'))) or public.is_assigned_to_job(id) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'locations' and policyname = 'members read locations'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read locations" on public.locations using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_sheet_items' and policyname = 'members read price_sheet_items'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read price_sheet_items" on public.price_sheet_items using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_sheet_items' and policyname = 'writers delete price_sheet_items'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers delete price_sheet_items" on public.price_sheet_items using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_sheet_items' and policyname = 'writers insert price_sheet_items'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers insert price_sheet_items" on public.price_sheet_items with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_sheet_items' and policyname = 'writers update price_sheet_items'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers update price_sheet_items" on public.price_sheet_items using ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_tiers' and policyname = 'members read price_tiers'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "members read price_tiers" on public.price_tiers using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_tiers' and policyname = 'writers write price_tiers'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "writers write price_tiers" on public.price_tiers using ((business_id in (select public.my_write_businesses()))) with check ((business_id in (select public.my_write_businesses())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_charges' and policyname = 'rental_charges delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_charges delete" on public.rental_charges using ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_charges' and policyname = 'rental_charges insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_charges insert" on public.rental_charges with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_charges' and policyname = 'rental_charges update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_charges update" on public.rental_charges using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_expenses' and policyname = 'rental_expenses delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_expenses delete" on public.rental_expenses using ((business_id in (select public.my_res_businesses('rentals', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_expenses' and policyname = 'rental_expenses insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_expenses insert" on public.rental_expenses with check ((business_id in (select public.my_res_businesses('rentals', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_expenses' and policyname = 'rental_expenses update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_expenses update" on public.rental_expenses using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_lease_documents' and policyname = 'rental_lease_documents delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_lease_documents delete" on public.rental_lease_documents using ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_lease_documents' and policyname = 'rental_lease_documents insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_lease_documents insert" on public.rental_lease_documents with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_lease_documents' and policyname = 'rental_lease_documents update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_lease_documents update" on public.rental_lease_documents using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_leases' and policyname = 'rental_leases delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_leases delete" on public.rental_leases using ((business_id in (select public.my_res_businesses('rentals', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_leases' and policyname = 'rental_leases insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_leases insert" on public.rental_leases with check ((business_id in (select public.my_res_businesses('rentals', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_leases' and policyname = 'rental_leases update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_leases update" on public.rental_leases using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance' and policyname = 'rental_maintenance delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance delete" on public.rental_maintenance using ((business_id in (select public.my_res_businesses('rentals', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance' and policyname = 'rental_maintenance insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance insert" on public.rental_maintenance with check ((business_id in (select public.my_res_businesses('rentals', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance' and policyname = 'rental_maintenance update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance update" on public.rental_maintenance using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance_photos' and policyname = 'rental_maintenance_photos delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance_photos delete" on public.rental_maintenance_photos using ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance_photos' and policyname = 'rental_maintenance_photos insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance_photos insert" on public.rental_maintenance_photos with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_maintenance_photos' and policyname = 'rental_maintenance_photos update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_maintenance_photos update" on public.rental_maintenance_photos using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_payments' and policyname = 'rental_payments delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_payments delete" on public.rental_payments using ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_payments' and policyname = 'rental_payments insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_payments insert" on public.rental_payments with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_payments' and policyname = 'rental_payments update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_payments update" on public.rental_payments using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_properties' and policyname = 'rental_properties delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_properties delete" on public.rental_properties using ((business_id in (select public.my_res_businesses('rentals', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_properties' and policyname = 'rental_properties insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_properties insert" on public.rental_properties with check ((business_id in (select public.my_res_businesses('rentals', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_properties' and policyname = 'rental_properties update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_properties update" on public.rental_properties using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_property_photos' and policyname = 'rental_property_photos delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_property_photos delete" on public.rental_property_photos using ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_property_photos' and policyname = 'rental_property_photos insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_property_photos insert" on public.rental_property_photos with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_property_photos' and policyname = 'rental_property_photos update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_property_photos update" on public.rental_property_photos using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_tenants' and policyname = 'rental_tenants delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_tenants delete" on public.rental_tenants using ((business_id in (select public.my_res_businesses('rentals', 'delete'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_tenants' and policyname = 'rental_tenants insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_tenants insert" on public.rental_tenants with check ((business_id in (select public.my_res_businesses('rentals', 'create'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rental_tenants' and policyname = 'rental_tenants update'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "rental_tenants update" on public.rental_tenants using ((business_id in (select public.my_res_businesses('rentals', 'edit')))) with check ((business_id in (select public.my_res_businesses('rentals', 'edit'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'Owner can manage timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "Owner can manage timesheets" on public.timesheets using ( (timesheets.business_id in (select public.my_owned_business_ids())) ) with check ( (timesheets.business_id in (select public.my_owned_business_ids())) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'cap read all timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "cap read all timesheets" on public.timesheets using ((business_id in (select public.my_cap_businesses('viewAllTimesheets'))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'field update own timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field update own timesheets" on public.timesheets using ( (business_id in (select public.my_member_business_ids())) and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid()) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'field write own timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "field write own timesheets" on public.timesheets with check ( (business_id in (select public.my_member_business_ids())) and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid()) )$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'member read own timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ '(member_res|can_write_business|is_business_member|member_view|member_cap|member_role|owner_id)\(|owner_id') then
    execute $q$alter policy "member read own timesheets" on public.timesheets using ( (business_id in (select public.my_member_business_ids())) and exists (select 1 from public.employees e where e.id = timesheets.employee_id and e.user_id = auth.uid()) )$q$;
  end if;
end $$;

-- ── Correlated business_members lookups → set form ─────────────────────────
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_events' and policyname = 'Business members can manage calendar'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "Business members can manage calendar" on public.calendar_events using ((business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'Owners and managers can view all timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "Owners and managers can view all timesheets" on public.timesheets using ((business_id in (select public.my_roles_businesses(array['owner','manager']))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'timesheets' and policyname = 'Owners and managers can update timesheets'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "Owners and managers can update timesheets" on public.timesheets using ((business_id in (select public.my_roles_businesses(array['owner','manager']))))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_clients' and policyname = 'invoice_clients_select'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "invoice_clients_select" on public.invoice_clients using (exists (select 1 from public.invoices i where i.id = invoice_clients.invoice_id and i.business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_clients' and policyname = 'invoice_clients_insert'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "invoice_clients_insert" on public.invoice_clients with check (exists (select 1 from public.invoices i where i.id = invoice_clients.invoice_id and i.business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_clients' and policyname = 'invoice_clients_delete'
             and coalesce(qual, '') || coalesce(with_check, '') ~ 'business_members') then
    execute $q$alter policy "invoice_clients_delete" on public.invoice_clients using (exists (select 1 from public.invoices i where i.id = invoice_clients.invoice_id and i.business_id in (select public.my_member_business_ids())))$q$;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 196_tenant_emergency_relation.sql
-- =============================================================================
-- rental_tenants: add the emergency contact's RELATIONSHIP to the tenant
-- ("madre", "esposo", "amiga"…). A name + phone alone doesn't tell the
-- landlord who they're calling.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run. Run BEFORE saving tenants from the updated app — the tenant form
-- now writes this column.
-- =============================================================================

alter table public.rental_tenants
  add column if not exists emergency_contact_relation text;

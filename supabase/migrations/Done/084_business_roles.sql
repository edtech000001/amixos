-- 084_business_roles.sql
-- Per-business role permission overrides (the editable role matrix).
--
-- Permissions are modeled in code as DEFAULT_ROLE_PERMISSIONS (shared/src/lib/
-- permissions.ts). This table stores a business's CUSTOMIZED version of a
-- role's permission grid. A row exists only for roles an owner has edited;
-- when no row exists the app falls back to the built-in defaults, so an
-- un-customized business behaves exactly as before (empty table = defaults).
--
-- `permissions` is a snapshot of the RolePermissions shape:
--   { "resources": { "jobs": {"view":"all","create":true,...}, ... },
--     "caps": { "manageSettings": true, ... } }
--
-- Phase 2 uses this for client-side resolution only (UI gating). RLS
-- enforcement (member_can) comes in a later migration; until then the existing
-- role-based policies remain the security boundary.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.business_roles (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  key         text not null,                 -- 'owner'|'admin'|'manager'|'office'|'field'|'viewer' (custom slugs later)
  name        text,                          -- display-name override (null = built-in label)
  is_system   boolean not null default true, -- false for future custom roles
  permissions jsonb not null,                -- RolePermissions snapshot
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (business_id, key)
);

create index if not exists business_roles_business_idx
  on public.business_roles (business_id);

alter table public.business_roles enable row level security;

-- Any member reads their business's role config (to resolve their own
-- permissions and, for admins, render the editor).
drop policy if exists "members read business_roles" on public.business_roles;
create policy "members read business_roles" on public.business_roles for select
  using (public.is_business_member(business_id));

-- Only owner/admin manage the role config.
drop policy if exists "admins insert business_roles" on public.business_roles;
create policy "admins insert business_roles" on public.business_roles for insert
  with check (public.is_business_admin(business_id));

drop policy if exists "admins update business_roles" on public.business_roles;
create policy "admins update business_roles" on public.business_roles for update
  using (public.is_business_admin(business_id));

drop policy if exists "admins delete business_roles" on public.business_roles;
create policy "admins delete business_roles" on public.business_roles for delete
  using (public.is_business_admin(business_id));

-- ── Verify (optional) ───────────────────────────────────────────────────────
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='business_roles';

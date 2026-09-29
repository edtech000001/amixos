-- 235_pin_search_path_everywhere.sql
-- Pin search_path on EVERY function in public that still resolves names
-- through the caller's path — including handle_new_user, which 234 missed.
--
-- Why 234 wasn't enough: it listed eleven functions found by scanning the
-- migrations for `security definer` BEFORE the body. handle_new_user declares
-- it at the END (`$$ language plpgsql security definer;`), so the scan walked
-- straight past the one function that runs on every signup. Enumerating from
-- the catalog instead of from source text removes that whole class of miss.
--
-- Scope is wider than 234 on purpose. Supabase's linter flags a mutable
-- search_path on ANY function, not just SECURITY DEFINER ones, and it is right
-- to: a trigger function resolving `now()` or a table name through a caller-
-- controlled path is fragile even when it runs with the caller's own rights.
-- The risk is far smaller without SECURITY DEFINER, but the fix costs nothing.
--
-- Extension-owned functions are skipped: they belong to pgcrypto/postgis/etc,
-- upgrades would overwrite the change, and they are not ours to alter.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

do $$
declare
  fn record;
  n int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      -- Already pinned (234 and the modern helpers) — leave them alone.
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))
      -- Not part of an installed extension.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
      -- Aggregates and window functions take no search_path.
      and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'pinned search_path on % function(s)', n;
end $$;

-- ── employees_roster: the Security Advisor's one ERROR is expected here ──────
-- The view is deliberately security_invoker = off (migration 178): it exists so
-- ANY member can resolve teammate NAMES for pickers without being granted the
-- employees table, which also carries pay, phone and address. Running as the
-- view owner is what makes that possible.
--
-- It is not a leak: the view filters to the caller's own businesses in its
-- WHERE clause (`business_id in (select public.my_member_business_ids())`,
-- keyed on auth.uid()) plus the location lock. The linter cannot see that a
-- view self-filters — it only sees the property — so this entry stays flagged.
-- Recorded here so the next person doesn't "fix" it and silently break every
-- crew picker for non-admin roles.
comment on view public.employees_roster is
  'Names-only employee roster readable by any member of the business. '
  'security_invoker = off ON PURPOSE (178): it bypasses the employees table RLS '
  'so members without the Employees permission can still resolve teammate names, '
  'and re-imposes isolation itself via business_id in (select my_member_business_ids()) '
  'plus the location lock. Supabase Security Advisor flags this as "Security Definer '
  'View"; that is expected, not a finding.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Should return ZERO rows (every public function now carries a search_path):
--
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prokind = 'f'
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--     and (p.proconfig is null
--          or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))
--   order by p.proname;
--
-- Then re-run the Security Advisor: the "Function Search Path Mutable" warnings
-- should be gone, and the employees_roster error should be the only entry left.

-- 261: Clear the Security Advisor's "Auth RLS Initialization Plan" warnings.
--
-- A policy that calls auth.uid() (or auth.jwt() / auth.role() / auth.email())
-- directly re-evaluates it for EVERY row the query touches. Wrapped in a
-- sub-select — (select auth.uid()) — Postgres evaluates it ONCE per query (an
-- "initplan"). Same rows allowed, same rows denied; only faster on big tables.
-- 254–257 converted the main business tables; this sweeps up the rest
-- (profiles, businesses, business_members, user_dashboard_layouts,
-- user_dock_apps, …) without listing them by hand.
--
-- How: read every policy in `public` from pg_policies, rewrite each bare call
-- in its USING / WITH CHECK expression, and ALTER POLICY only the ones that
-- changed. Calls that are already wrapped are left alone (they're masked
-- first), so this is safe to re-run — a second run changes nothing.
--
-- The whole file runs as one transaction in the SQL Editor: if any rewritten
-- policy fails to parse, nothing is applied.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

create or replace function pg_temp.initplan_auth(expr text)
returns text
language plpgsql
as $$
declare
  f text;
  out text := expr;
begin
  if out is null then
    return null;
  end if;
  foreach f in array array['uid', 'jwt', 'role', 'email'] loop
    -- Mask calls that are already wrapped (Postgres prints them as
    -- "( SELECT auth.uid() AS uid)"), wrap the bare ones, then unmask.
    out := replace(out, 'SELECT auth.' || f || '()', 'SELECT __initplan_auth_' || f || '__');
    out := replace(out, 'auth.' || f || '()', '( SELECT auth.' || f || '() AS ' || f || ')');
    out := replace(out, 'SELECT __initplan_auth_' || f || '__', 'SELECT auth.' || f || '()');
  end loop;
  return out;
end;
$$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
  loop
    new_qual := pg_temp.initplan_auth(p.qual);
    new_check := pg_temp.initplan_auth(p.with_check);
    if new_qual is not distinct from p.qual and new_check is not distinct from p.with_check then
      continue;
    end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is distinct from p.qual then
      stmt := stmt || ' using (' || new_qual || ')';
    end if;
    if new_check is distinct from p.with_check then
      stmt := stmt || ' with check (' || new_check || ')';
    end if;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice '261: rewrote % policies', n;
end;
$$;

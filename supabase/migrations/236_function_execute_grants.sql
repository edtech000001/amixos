-- 236_function_execute_grants.sql
-- Stop granting EXECUTE on every public function to the world.
--
-- Postgres gives EXECUTE on a new function to PUBLIC by default, and PostgREST
-- exposes the public schema — so every helper we have written has been callable
-- by an unauthenticated request. That is what the Security Advisor means by
-- "Public Can Execute SECURITY DEFINER".
--
-- How much did that actually expose? Less than the warning count suggests:
--   • Most of the flagged functions are TRIGGER functions (delete_*_object,
--     sync_*, update_updated_at). Postgres refuses to call those directly, so
--     the grant was never usable.
--   • The rest are keyed on auth.uid(), which is null for anon, so they
--     return false/empty.
-- But "harmless today" is not a security boundary: it holds only as long as
-- every future helper remembers to check auth.uid() itself. Default-deny is.
--
-- After this migration the rule is: authenticated users may call public
-- functions (RLS policies need this — a policy calling member_res() is
-- evaluated with the QUERYING user's privileges, so revoking EXECUTE from
-- authenticated would break every policy that uses one); anon may call only
-- the handful of token-based endpoints the public pages actually use.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1. Default-deny for anon, keep authenticated working ────────────────────
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
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'reset execute grants on % function(s)', n;
end $$;

-- ── 2. The public surface, re-granted deliberately ──────────────────────────
-- These back pages reached WITHOUT an account. Each authorizes by an
-- unguessable token (crypto.randomUUID, 122 bits) or refuses outright when
-- auth.uid() is null.
--
-- Matched by NAME, not by signature: the first cut of this migration named
-- business_has_shared_invoice(uuid), which 064 had dropped, and the whole
-- script aborted. Argument lists also drift (179 rebuilt lookup_invite with a
-- new return type), so looking them up in the catalog is the form that keeps
-- working. A name that no longer exists is simply skipped.
do $$
declare
  fn record;
  granted int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in (
        -- Invite landing: shows who invited you before you sign in.
        'lookup_invite',
        -- Raises 'not_authenticated' with no session, so anon calling it is a
        -- no-op; granted because the invite page can fire it while the session
        -- is still hydrating, and a spurious error there reads as a dead link.
        'accept_invite',
        -- Shared document links — token in the URL.
        'get_shared_invoice',
        'get_shared_proposal',
        'get_shared_lease',
        'respond_shared_proposal',
        'sign_shared_lease'
      )
  loop
    execute format('grant execute on function %s to anon, authenticated', fn.sig);
    granted := granted + 1;
    raise notice 'anon may call %', fn.sig;
  end loop;
  raise notice 'granted anon execute on % function(s)', granted;
end $$;

-- ── 3. Cron-only functions stay out of reach of every logged-in user ────────
-- Step 1's blanket grant would otherwise hand these to `authenticated`, and
-- they permanently delete accounts and businesses whose window has closed.
-- The API calls them with the service role (230).
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('purge_due_accounts', 'purge_due_businesses')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    raise notice 'service_role only: %', fn.sig;
  end loop;
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Functions anon can still execute — expect exactly the seven above:
--
--   select p.oid::regprocedure as fn
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and has_function_privilege('anon', p.oid, 'execute')
--   order by 1;
--
-- AFTER RUNNING, smoke-test the anon paths — this migration is the one that
-- could break them:
--   1. open an invite link while signed out            (lookup_invite)
--   2. open a shared invoice link                      (get_shared_invoice)
--   3. open a shared proposal link and respond         (respond_shared_proposal)
--   4. open a lease link and sign                      (sign_shared_lease)
--   5. sign in and load the dashboard                  (policy helpers)

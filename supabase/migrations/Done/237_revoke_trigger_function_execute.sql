-- 237_revoke_trigger_function_execute.sql
-- Finish what 236 started: take EXECUTE back from the functions that were
-- never meant to be called, and bound the one unauthenticated write path.
--
-- 236 default-denied anon but blanket-granted `authenticated` on everything in
-- public, because RLS policies genuinely need it: a policy calling member_res()
-- is evaluated with the QUERYING user's privileges, so revoking EXECUTE there
-- breaks every policy that uses a helper. That blanket grant was too wide in
-- one specific, provable way — it also handed out the TRIGGER functions.
--
-- A function returning `trigger` cannot be invoked directly at all: Postgres
-- raises "trigger functions can only be called as triggers", and PostgREST
-- will not expose it. So the grant bought nothing, and revoking it costs
-- nothing. That return type is the crisp boundary this migration uses — it is
-- why the revoke below is safe in a way that guessing at the callable helpers
-- would not be.
--
-- Firing a trigger does NOT re-check EXECUTE. Postgres checks it once, at
-- CREATE TRIGGER time (pg_proc_aclcheck in CreateTrigger); ExecCallTriggerFunc
-- performs no ACL check. Existing triggers keep working. The one consequence:
-- a future migration that re-creates a trigger must run as the owner/postgres,
-- which is how migrations run in the SQL Editor anyway.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1. Trigger and event-trigger functions: not callable, so not granted ────
-- Catalog-driven on purpose. Scanning the migrations for `returns trigger`
-- missed grant_first_business_trial() (declared across lines) and would have
-- missed rls_auto_enable(), which exists in the database but in no .sql file
-- here — someone created it straight in the SQL Editor. The catalog knows
-- about functions the repo has forgotten.
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
      and p.prorettype in ('pg_catalog.trigger'::regtype,
                           'pg_catalog.event_trigger'::regtype)
      and not exists (select 1 from pg_depend d
                      where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    n := n + 1;
    raise notice 'trigger-only: %', fn.sig;
  end loop;
  raise notice 'revoked execute on % trigger function(s)', n;
end $$;

-- ── 2. role_key_valid: called only from inside SECURITY DEFINER triggers ────
-- The single judgment call in this file. It returns boolean, so unlike the
-- above it IS directly callable — but its only callers are the bodies of
-- validate_business_member_role() and validate_business_invite_role() (179),
-- both SECURITY DEFINER. Inside those, the effective user is the owner, who
-- holds EXECUTE implicitly and is unaffected by this revoke. Nothing in the
-- web, mobile, shared or api source calls it, and no policy references it.
--
-- If that is somehow wrong, the failure is loud and immediate — inserting a
-- business member raises "permission denied for function role_key_valid" —
-- not a silent hole. Undo with:
--   grant execute on function public.role_key_valid(uuid, text, boolean) to authenticated;
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'role_key_valid'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    raise notice 'internal only: %', fn.sig;
  end loop;
end $$;

-- ── 3. waitlist: keep the open door, put a frame around it ──────────────────
-- `Anyone can join waitlist` (009) is WITH CHECK (true) for INSERT, which the
-- Advisor flags. It stays: the landing page at web/src/app/page.tsx submits
-- this form with the anon key and no session, which is the entire point of a
-- waitlist. Reads are already service-role only, so nothing leaks outward.
--
-- What the always-true check does allow is a bot writing unbounded text into
-- every column. The unique index on email caps row count per address; these
-- bound the size of what any one row can hold. A legitimate submission is far
-- inside every limit.
do $$
begin
  if to_regclass('public.waitlist') is null then
    raise notice 'waitlist table absent — skipping';
    return;
  end if;

  -- RFC 5321 caps a path at 254 characters; the shape check is deliberately
  -- loose (one @, no spaces) because strict email regexes reject valid
  -- addresses more often than they stop abuse.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.waitlist'::regclass
                   and conname = 'waitlist_email_sane') then
    alter table public.waitlist add constraint waitlist_email_sane
      check (char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$');
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.waitlist'::regclass
                   and conname = 'waitlist_text_bounds') then
    alter table public.waitlist add constraint waitlist_text_bounds
      check (char_length(coalesce(first_name, ''))    <= 120
         and char_length(coalesce(business_type, '')) <= 60
         and char_length(coalesce(referrer, ''))      <= 500);
  end if;
end $$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- No trigger function should be executable by authenticated. Expect ZERO rows:
--
--   select p.oid::regprocedure as fn
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.prorettype in ('pg_catalog.trigger'::regtype,
--                          'pg_catalog.event_trigger'::regtype)
--     and has_function_privilege('authenticated', p.oid, 'execute')
--   order by 1;
--
-- AFTER RUNNING, smoke-test in this order — #1 is the one that matters most,
-- because handle_new_user() fires on every signup:
--   1. create a brand-new account                  (handle_new_user)
--   2. create a business on it                     (grant_first_business_trial)
--   3. invite a member and accept                  (validate_business_*_role,
--                                                   role_key_valid, cleanup_member_oauth)
--   4. add a payment to an invoice                 (sync_invoice_reminder_summary)
--   5. submit the landing-page waitlist form       (new CHECK constraints)

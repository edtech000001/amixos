-- 234_pin_function_search_path.sql
-- Pin search_path on the 11 SECURITY DEFINER functions that still resolve
-- names dynamically.
--
-- A SECURITY DEFINER function runs with its OWNER's rights. If it resolves an
-- unqualified name (`business_members`, `now()`) through the caller's
-- search_path, then anyone who can put an object earlier on that path decides
-- which code the elevated function actually runs. Pinning search_path removes
-- the caller's influence entirely.
--
-- This is the same rule the newer helpers already follow (181's initplan
-- functions, 230's purge functions, every trigger added since) — these are the
-- leftovers from 021/022, before the convention existed. It is also what
-- Supabase's own Security Advisor flags as "Function Search Path Mutable".
--
-- ALTER FUNCTION rather than CREATE OR REPLACE: the bodies are correct and
-- rewriting eleven of them from memory is how a subtle behaviour change gets
-- introduced. This changes only how names inside them resolve.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- pg_temp last is deliberate: a caller can create objects in their own
-- temporary schema, so it must never shadow public.
alter function public.accept_invite(text)                         set search_path = public, pg_temp;
alter function public.can_write_business(uuid)                    set search_path = public, pg_temp;
alter function public.has_business_role(uuid, text[])             set search_path = public, pg_temp;
alter function public.is_assigned_to_job(uuid)                    set search_path = public, pg_temp;
alter function public.is_business_admin(uuid)                     set search_path = public, pg_temp;
alter function public.is_business_member(uuid)                    set search_path = public, pg_temp;
alter function public.list_audit_log(uuid, int, timestamptz)      set search_path = public, pg_temp;
alter function public.list_business_members(uuid)                 set search_path = public, pg_temp;
alter function public.lookup_invite(text)                         set search_path = public, pg_temp;
alter function public.member_role(uuid)                           set search_path = public, pg_temp;
alter function public.my_pending_invites()                        set search_path = public, pg_temp;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Every SECURITY DEFINER function in public should now carry a search_path.
-- This should return ZERO rows:
--
--   select p.proname, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.prosecdef                                   -- SECURITY DEFINER
--     and (p.proconfig is null
--          or not exists (select 1 from unnest(p.proconfig) c
--                         where c like 'search\_path=%'))
--   order by p.proname;

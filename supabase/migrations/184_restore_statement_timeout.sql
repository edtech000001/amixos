-- 184_restore_statement_timeout.sql
-- 161 raised the authenticated role's statement_timeout to 20s as a safety net
-- while the jobs RLS was slow. The 181/182 overhaul (initplan policies +
-- indexes + one-scan RPCs) fixed the underlying cost, so restore Supabase's
-- default ceiling — a regression should fail loudly, not hide behind a
-- 20-second wait.
--
-- Applies to NEW connections (existing pooled connections pick it up as they
-- recycle). If some legitimate heavy report ever trips 8s, raise that one
-- query's path — don't re-raise the global ceiling.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter role authenticated set statement_timeout = '8s';

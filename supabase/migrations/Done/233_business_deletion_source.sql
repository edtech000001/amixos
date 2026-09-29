-- 233_business_deletion_source.sql
-- Mark a business deletion that came from an ACCOUNT deletion.
--
-- Deleting a sole owner's account already takes their businesses with it
-- (businesses.owner_id cascades on user delete), but nothing recorded that in
-- business_deletions — so the team banner (232) had nothing to show. Today
-- that is harmless, because the account path refuses while a business still
-- has other members. It stops being harmless the moment the owner invites
-- somebody DURING the 30-day window: the newcomer joins a business that is
-- already scheduled to disappear and sees no warning at all.
--
-- The API now schedules those businesses explicitly. This flag is what lets a
-- RESTORE undo only what the account deletion scheduled: a business the owner
-- had separately chosen to close must stay closed.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.business_deletions
  add column if not exists from_account_deletion boolean not null default false;

comment on column public.business_deletions.from_account_deletion is
  'true = scheduled as a side effect of the owner deleting their account; restoring the account un-schedules it. false = the owner closed this business deliberately.';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name, column_default from information_schema.columns
--   where table_name = 'business_deletions' and column_name = 'from_account_deletion';

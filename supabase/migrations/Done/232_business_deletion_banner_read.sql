-- 232_business_deletion_banner_read.sql
-- Let EVERY member of a business see that it is scheduled for deletion.
--
-- 230 gave business_deletions a read policy keyed on the INVOICES view
-- (my_view_businesses('invoices','all')) — copied from the invoice tables
-- without thinking it through. That is the wrong gate for this table: a field
-- worker, or anyone whose role can't see invoices, could not read the row and
-- so never saw the warning banner. They would keep working normally right up
-- until the business and all its data vanished.
--
-- Membership is the correct test: if you belong to the business, you are
-- entitled to know it is going away. The row carries no sensitive content —
-- a date and who requested it.
--
-- my_member_business_ids() (migration 161) is the no-arg, auth.uid()-keyed set
-- function the initplan rule requires (CLAUDE.md): referenced via
-- `business_id in (select …)` so it evaluates once per query, never per row.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop policy if exists "business_deletions read members" on public.business_deletions;
create policy "business_deletions read members" on public.business_deletions for select
  using (business_id in (select public.my_member_business_ids()));

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select policyname, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename = 'business_deletions';
--   -- expect one SELECT policy, qualifying on my_member_business_ids()

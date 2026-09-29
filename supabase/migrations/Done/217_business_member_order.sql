-- 217 — Per-user ordering for the business switcher
--
-- The switcher lists businesses by created_at, which is an accident of signup
-- order rather than anything the user chose. Someone who works in one business
-- daily and another twice a year wants the daily one first.
--
-- The column lives on business_members, not businesses, because the order is
-- PER USER: two people in the same set of businesses can each want their own,
-- and one person's preference must not reorder anyone else's switcher.
--
-- NULL = unordered, and sorts after everything explicitly placed, falling back
-- to created_at. So a business added after the order was saved appears
-- predictably at the end rather than jumping to the front, and nobody has to
-- backfill existing rows for the switcher to keep working.

alter table public.business_members
  add column if not exists sort_order integer;

comment on column public.business_members.sort_order is
  'This member''s preferred position for the business in their own switcher. '
  'NULL sorts last, then by businesses.created_at.';

-- The switcher reads every membership for one user and sorts them, so the
-- existing user_id index already serves it; no new index needed.

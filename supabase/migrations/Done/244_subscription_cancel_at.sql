-- 244 — When a canceled plan ends
--
-- Cancellations take effect at the END of the paid period (Stripe portal:
-- "cancel at end of billing period"). Until then the subscription is still
-- 'active', so nothing in the app said it was ending. The billing webhook now
-- records when it will end, and Account settings shows
-- "Your plan ends on …" with a way to renew.
--
-- null = not scheduled to end. Cleared again if they un-cancel in the portal.
--
-- Read by its own query in Account settings — deliberately NOT in the
-- app-wide businesses select, so this column missing can't break loading.
--
-- IMPORTANT: run manually in the Supabase SQL Editor.

alter table public.businesses
  add column if not exists subscription_cancel_at timestamptz;

comment on column public.businesses.subscription_cancel_at is
  'When a canceled-but-still-active subscription ends (Stripe cancel_at / cancel_at_period_end). null = renewing normally. Set by the billing webhook (migration 244).';

-- 099_subscriptions.sql
-- Per-business subscription state for Stripe billing (web checkout). Each
-- business carries its own plan + trial + Stripe ids.
--
-- Trial model: app-managed, NO credit card. A new business gets 14 days of
-- full access (subscription_status='trialing', trial_ends_at = now()+14d) with
-- no Stripe involvement. Stripe only enters when the owner subscribes on the
-- web (card collected then); the webhook flips status to 'active'.
--
-- Status values: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none'.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists plan                   text,
  add column if not exists subscription_status    text,
  add column if not exists billing_period         text,
  add column if not exists trial_ends_at          timestamptz,
  add column if not exists current_period_end     timestamptz,
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;

-- Grandfather every EXISTING business to 'active' (no trial expiry) so current
-- users are never locked out. Guarded on NULL so re-runs / new trials are safe.
update public.businesses
  set subscription_status = 'active'
  where subscription_status is null;

-- Future inserts (new businesses) default to a 14-day app-managed trial.
alter table public.businesses
  alter column subscription_status set default 'trialing';
alter table public.businesses
  alter column trial_ends_at set default (now() + interval '14 days');

comment on column public.businesses.subscription_status is
  'trialing | active | past_due | canceled | none. Trialing is app-managed (no card).';
comment on column public.businesses.plan is
  'Active plan key (basico|profesional|negocio) once subscribed; null during trial.';

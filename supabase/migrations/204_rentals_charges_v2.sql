-- 204_rentals_charges_v2.sql
-- =============================================================================
-- Rentals v2, part 1 — charges beyond rent + late-fee rules + proration.
--
-- 1. MULTIPLE CHARGES PER LEASE-MONTH. 194 anchored lazy generation on
--    `unique (lease_id, period_start)`, which makes a late fee or a one-off
--    charge (utility, damage) impossible in a month that already has rent.
--    Replaced with `unique (lease_id, period_start, dedupe_key)`:
--      · rent        → dedupe_key 'rent'       (one per lease-month, as before)
--      · late fee    → dedupe_key 'late_fee'   (one per lease-month)
--      · manual      → dedupe_key = random uuid (unlimited per month)
--    A PARTIAL unique index would be the "purer" model, but PostgREST's
--    on_conflict= parameter can't express an index predicate, so the lazy
--    generator (upsert + ignoreDuplicates) could no longer infer it.
--
-- 2. LATE-FEE RULE per lease. `late_fee_since` is stamped when the rule is
--    first enabled so enabling a fee today can NEVER retro-charge historical
--    months that were imported unpaid.
--
-- 3. PRORATION opt-in per lease (first and last partial month).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

-- ── 1. rental_charges.dedupe_key ────────────────────────────────────────────
alter table public.rental_charges
  add column if not exists dedupe_key text not null default gen_random_uuid()::text;

-- Every pre-existing row is rent (the app never wrote `kind`), and each is
-- already unique per (lease_id, period_start) — so this can't collide.
update public.rental_charges set dedupe_key = 'rent' where kind = 'rent' and dedupe_key <> 'rent';

alter table public.rental_charges
  drop constraint if exists rental_charges_lease_id_period_start_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rental_charges_lease_period_dedupe_key'
      and conrelid = 'public.rental_charges'::regclass
  ) then
    alter table public.rental_charges
      add constraint rental_charges_lease_period_dedupe_key
      unique (lease_id, period_start, dedupe_key);
  end if;
end$$;

comment on column public.rental_charges.dedupe_key is
  'Idempotency discriminator: ''rent'' / ''late_fee'' for generated charges, a random uuid for manual ones.';

-- ── 2 + 3. Lease rule columns ───────────────────────────────────────────────
alter table public.rental_leases
  add column if not exists late_fee_amount     numeric(12,2),
  add column if not exists late_fee_grace_days smallint,
  add column if not exists late_fee_since      date,
  add column if not exists prorate_partial     boolean not null default false;

comment on column public.rental_leases.late_fee_since is
  'Fees only materialize for rent due on/after this date — set when the rule is enabled so history is never retro-charged.';
comment on column public.rental_leases.prorate_partial is
  'When true the first and last partial months are charged pro-rata by day.';

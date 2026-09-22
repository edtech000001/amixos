-- 230_account_deletion.sql
-- In-app account deletion (App Store guideline 5.1.1(v): an app that offers
-- account creation must let the user DELETE that account from inside the app).
--
-- Model: a 30-day grace window.
--   1. The user asks to delete → a row lands here and they are signed out.
--      Signing in again during the window shows "restore account" instead of
--      the dashboard; nothing is destroyed yet and the subscription is already
--      cancelled.
--   2. After `purge_after`, the account is hard-deleted: auth.users is removed
--      and every cascade fires (a business they OWN goes with them — the API
--      refuses the request up front when that business still has other
--      members, so this can only take data that was theirs alone).
--
-- The row is the single source of truth for both the app gate and the purge.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create table if not exists public.account_deletions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- When the hard delete becomes due. Kept as a column (not computed from
  -- requested_at) so the window can be extended per-user by support without a
  -- code change.
  purge_after  timestamptz not null default now() + interval '30 days',
  -- Free text for support ("switching to another tool") — optional, never
  -- required, and never shown to anyone but staff.
  reason       text
);

create index if not exists account_deletions_due_idx
  on public.account_deletions (purge_after);

alter table public.account_deletions enable row level security;

-- The user may SEE their own pending deletion — that is what drives the
-- restore screen. Creating and removing rows is the API's job (service role),
-- so there is deliberately no insert/update/delete policy: a compromised
-- client cannot schedule someone else's deletion, nor cancel its own purge by
-- writing directly to PostgREST.
drop policy if exists "account_deletions read own" on public.account_deletions;
create policy "account_deletions read own" on public.account_deletions for select
  using (user_id = (select auth.uid()));

-- ── Purge ────────────────────────────────────────────────────────────────────
-- Deletes every account whose window has closed. SECURITY DEFINER so it can
-- reach auth.users; returns the ids it removed so a caller can log them.
--
-- NOTE: this clears DATABASE rows only. Storage objects (logos, payment
-- photos, the Files module) are NOT reachable from SQL — the API's purge
-- endpoint empties the bucket prefixes first, then calls this. Running this
-- function on its own leaves those files orphaned.
create or replace function public.purge_due_accounts()
returns table(user_id uuid)
language plpgsql security definer set search_path = public, auth as $$
begin
  return query
  with due as (
    select d.user_id from public.account_deletions d where d.purge_after <= now()
  ), gone as (
    delete from auth.users u where u.id in (select due.user_id from due)
    returning u.id
  )
  select gone.id from gone;
end;
$$;

revoke all on function public.purge_due_accounts() from public, anon, authenticated;

-- ── Business deletion ────────────────────────────────────────────────────────
-- The account rule above refuses to delete an owner who still has a business
-- with other members — otherwise one person's "delete my account" quietly
-- erases their whole team's clients, jobs and invoices. That must not become a
-- trap: closing the BUSINESS is the owner's own decision to make, members or
-- not, so it gets its own action with the same 30-day window.
--
-- Deleting the business here removes the company data for EVERYONE in it; the
-- members' own logins survive (they keep any other business they belong to).
create table if not exists public.business_deletions (
  business_id  uuid primary key references public.businesses(id) on delete cascade,
  requested_at timestamptz not null default now(),
  purge_after  timestamptz not null default now() + interval '30 days',
  -- Who pressed the button (kept after purge only in the audit log).
  requested_by uuid references auth.users(id) on delete set null,
  reason       text
);

create index if not exists business_deletions_due_idx
  on public.business_deletions (purge_after);

alter table public.business_deletions enable row level security;

-- Every member may SEE that their business is scheduled for deletion — the
-- banner depends on it. Writes stay with the API (service role), which checks
-- that the caller is the owner.
drop policy if exists "business_deletions read members" on public.business_deletions;
create policy "business_deletions read members" on public.business_deletions for select
  using (business_id in (select public.my_view_businesses('invoices', 'all')));

create or replace function public.purge_due_businesses()
returns table(business_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select d.business_id from public.business_deletions d where d.purge_after <= now()
  ), gone as (
    delete from public.businesses b where b.id in (select due.business_id from due)
    returning b.id
  )
  select gone.id from gone;
end;
$$;

revoke all on function public.purge_due_businesses() from public, anon, authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='account_deletions';
--   -- expect exactly one: select
--
--   select * from public.account_deletions;          -- pending account deletions
--   select * from public.business_deletions;         -- pending business deletions
--   select * from public.purge_due_accounts();       -- DB-only purge (see note)
--   select * from public.purge_due_businesses();

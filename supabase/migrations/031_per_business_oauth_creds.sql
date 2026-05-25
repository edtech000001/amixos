-- 031_per_business_oauth_creds.sql
-- Make Google Contacts sync per-business instead of per-user. Each business
-- a user owns / belongs to gets its own Google connection, so Prime can sync
-- to one Gmail, Champion to another, etc. — clean separation of contact
-- lists per business.
--
-- This drops any existing user_oauth_credentials rows because pre-031 they
-- weren't tagged with a business; we don't know which one they should
-- attach to. Affected users will be prompted to reconnect (one-time cost).
--
-- Idempotent: safe to re-run.

-- Step 1: clear stale rows that don't have business_id yet.
delete from public.user_oauth_credentials
  where business_id is null
     or business_id not in (select id from public.businesses);

-- Step 2: add business_id column. Nullable for the alter (we already cleared
-- the table), then NOT NULL after we adjust the PK.
alter table public.user_oauth_credentials
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;

-- Step 3: switch the primary key from (user_id) alone to (user_id, business_id).
-- The old PK is named user_oauth_credentials_pkey by Postgres default.
alter table public.user_oauth_credentials
  drop constraint if exists user_oauth_credentials_pkey;

-- After dropping, set business_id NOT NULL — there should be zero rows at
-- this point so no rows will fail the constraint.
alter table public.user_oauth_credentials
  alter column business_id set not null;

alter table public.user_oauth_credentials
  add constraint user_oauth_credentials_pkey primary key (user_id, business_id);

-- Indices for the new lookup patterns.
create index if not exists idx_user_oauth_credentials_business
  on public.user_oauth_credentials(business_id);

-- Step 4: refresh RLS policies. Members of the business can read; only
-- admins (or service role) can write — invites + tokens are sensitive.
drop policy if exists "Users can read own oauth credentials" on public.user_oauth_credentials;
drop policy if exists "Users can manage own oauth credentials" on public.user_oauth_credentials;
drop policy if exists "members read own oauth credentials" on public.user_oauth_credentials;

-- Each user reads ONLY their own credentials (per-business), never another
-- member's tokens. user_id = auth.uid() is the gate, not business membership.
create policy "users read own oauth credentials" on public.user_oauth_credentials for select
  using (user_id = auth.uid());

-- Inserts/updates/deletes also gated by user_id = auth.uid() so a user can
-- manage only their own connections. The service-role API still bypasses
-- this for cross-cutting operations.
create policy "users insert own oauth credentials" on public.user_oauth_credentials for insert
  with check (user_id = auth.uid());
create policy "users update own oauth credentials" on public.user_oauth_credentials for update
  using (user_id = auth.uid());
create policy "users delete own oauth credentials" on public.user_oauth_credentials for delete
  using (user_id = auth.uid());

comment on column public.user_oauth_credentials.business_id is
  'Which business this Google connection belongs to. One user can have multiple rows — one per business they sync.';

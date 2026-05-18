-- 020_google_contacts_sync.sql
-- Per-user Google OAuth credentials for the Contacts sync feature.
-- Refresh token + sync config live here; rows exist only when sync is connected.

create table if not exists public.user_oauth_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google',
  refresh_token text not null,
  scopes text[] not null default '{}',
  enabled boolean not null default true,
  contact_group_id text,
  contact_group_name text,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_oauth_credentials enable row level security;

-- Owners can SELECT/UPDATE/DELETE their own row. Refresh token is still
-- visible to them via SELECT — the protection here is mostly that nobody
-- ELSE can read it. The API server uses the service role to read tokens
-- when calling Google on the user's behalf.
drop policy if exists "user reads own oauth creds" on public.user_oauth_credentials;
create policy "user reads own oauth creds" on public.user_oauth_credentials
  for select using (auth.uid() = user_id);

drop policy if exists "user updates own oauth creds" on public.user_oauth_credentials;
create policy "user updates own oauth creds" on public.user_oauth_credentials
  for update using (auth.uid() = user_id);

drop policy if exists "user deletes own oauth creds" on public.user_oauth_credentials;
create policy "user deletes own oauth creds" on public.user_oauth_credentials
  for delete using (auth.uid() = user_id);

-- INSERT only via the service role (api endpoint). No insert policy.

-- Track which Google contact each client was synced to. People API
-- resourceName format: "people/c<contact_id>".
alter table public.clients add column if not exists google_resource_name text;

create index if not exists idx_clients_google_resource
  on public.clients(google_resource_name)
  where google_resource_name is not null;

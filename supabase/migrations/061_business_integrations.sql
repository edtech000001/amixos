-- 061_business_integrations.sql
-- Backing store for the Messaging (SMS) module: per-business credentials for
-- an outbound SMS provider (Twilio, ClickSend, …) plus the "from" number.
--
-- SECURITY: this table holds provider auth secrets (Twilio Auth Token,
-- ClickSend API key). RLS is ENABLED with NO policies, so the anon/auth
-- (client) roles can read or write NOTHING here. Only the service-role API
-- (api/src/routes/sms.ts) touches it — it bypasses RLS. The client learns
-- connection status through GET /api/v1/sms/status (redacted: provider,
-- from-number, masked key) and never sees the raw credentials.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Add-if-not-exists,
-- safe to re-run.

create table if not exists public.business_integrations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  -- Integration category. Today only 'sms'; kept generic so future providers
  -- (email, voice, …) can share the table.
  kind         text not null default 'sms',
  -- 'twilio' | 'clicksend' (the API validates against the known set).
  provider     text not null,
  -- Outbound sender — E.164 number for Twilio, number/sender-id for ClickSend.
  from_number  text,
  -- Provider credentials, e.g. { "accountSid": "...", "authToken": "..." } or
  -- { "username": "...", "apiKey": "..." }. SERVER-ONLY (see header).
  credentials  jsonb not null default '{}'::jsonb,
  enabled      boolean not null default true,
  -- Last send/verify error, surfaced (non-secret) in the module UI.
  last_error   text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One config per provider per business.
  unique (business_id, kind, provider)
);

create index if not exists business_integrations_business_idx
  on public.business_integrations (business_id, kind);

-- RLS on, intentionally NO policies → only the service-role API can access
-- credentials. Do not add a client-facing select policy here; route reads
-- through /api/v1/sms/status so secrets stay server-side.
alter table public.business_integrations enable row level security;

create or replace function public.set_updated_at_business_integrations()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists business_integrations_set_updated_at on public.business_integrations;
create trigger business_integrations_set_updated_at
  before update on public.business_integrations
  for each row execute function public.set_updated_at_business_integrations();

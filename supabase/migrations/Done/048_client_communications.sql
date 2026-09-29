-- 048_client_communications.sql
-- Communication log: one row per time the business contacts a client
-- (call / text / email), plus manual entries (in-person visit, WhatsApp,
-- note). Powers the "Último contacto" hint on the map card and the
-- "Comunicaciones" timeline on the client detail view. Foundation for the
-- future leads CRM.
--
-- Logging is "confirm outcome after": the app fires tel:/sms:/mailto: as
-- usual, then on returning to the app the user confirms the outcome and a
-- row is written. No silent logging — a cancelled prompt writes nothing.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Add-if-not-exists,
-- safe to re-run.

-- ─── 1. client_communications table ───────────────────────────────────────
create table if not exists public.client_communications (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete cascade,

  -- Which contact-person (if any) was reached. set null so deleting a
  -- contact person keeps the historical log row intact.
  client_contact_id   uuid references public.client_contacts(id) on delete set null,

  -- What kind of contact. call/sms/email are auto-loggable from the
  -- quick actions; in_person/whatsapp/note are manual entries.
  type                text not null
    check (type in ('call','sms','email','in_person','whatsapp','note')),

  -- Who reached out to whom. Defaults to outbound (the user contacting the
  -- client); inbound covers logging a call/text the client initiated.
  direction           text not null default 'outbound'
    check (direction in ('outbound','inbound')),

  -- Result of the contact. Nullable — in_person / note have no outcome.
  --   call → connected | no_answer | left_voicemail
  --   sms / email / whatsapp → sent
  outcome             text
    check (outcome in ('connected','no_answer','sent','left_voicemail')),

  -- The phone number / email address actually used (audit trail).
  contact_method      text,

  -- Free-text note per entry.
  note                text,

  -- When the communication happened. Editable + backdatable, distinct
  -- from created_at (when the row was written).
  occurred_at         timestamptz not null default now(),

  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Per-client timeline, newest first.
create index if not exists client_communications_client_idx
  on public.client_communications (client_id, occurred_at desc);
-- Business scoping + the v_client_last_contact aggregation.
create index if not exists client_communications_business_idx
  on public.client_communications (business_id);
-- Contact-person lookups (only the rows that reference one).
create index if not exists client_communications_contact_idx
  on public.client_communications (client_contact_id)
  where client_contact_id is not null;

-- ─── 2. RLS ───────────────────────────────────────────────────────────────
-- Mirrors the equipment (045) template: members read, writers insert/update.
-- DELETE is allowed for writers (not admin-only) because the product lets a
-- user clean up their own log entries.
alter table public.client_communications enable row level security;

create policy "members read client_communications" on public.client_communications for select
  using (public.is_business_member(business_id));

create policy "writers insert client_communications" on public.client_communications for insert
  with check (public.can_write_business(business_id));

create policy "writers update client_communications" on public.client_communications for update
  using (public.can_write_business(business_id));

create policy "writers delete client_communications" on public.client_communications for delete
  using (public.can_write_business(business_id));

-- ─── 3. updated_at trigger ────────────────────────────────────────────────
create or replace function public.set_updated_at_client_communications()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists client_communications_set_updated_at on public.client_communications;
create trigger client_communications_set_updated_at
  before update on public.client_communications
  for each row execute function public.set_updated_at_client_communications();

-- ─── 4. v_client_last_contact view ────────────────────────────────────────
-- One row per client with the most recent contact timestamp. The map /pins
-- endpoint reads this to show "Último contacto: hace X" on each pin card.
-- security_invoker = true so the underlying table RLS applies when queried
-- from a browser client (the API uses the service role + a manual
-- membership check, so it's unaffected either way).
create or replace view public.v_client_last_contact
  with (security_invoker = true) as
  select
    business_id,
    client_id,
    max(occurred_at) as last_contacted_at
  from public.client_communications
  group by business_id, client_id;

-- 231_client_email_included.sql
-- Per-address "include in emails" switch on the client record.
--
-- A client can carry two addresses (office + personal) and, until now, both
-- were all-or-nothing: senders picked ONE (email_office ?? email_home), which
-- silently dropped the other, and the workaround was to re-enter an address as
-- a CC contact just to get it copied.
--
-- These flags let the user say which of the client's OWN addresses take mail.
-- Both default to true, so nothing changes for existing clients: the send that
-- already addressed both keeps addressing both.
--
-- What they do NOT touch — the contact-people rules stay exactly as they are:
--   • client_contacts.receives_email (220) still REPLACES the client's own
--     addresses entirely ("mail my bookkeeper, not me").
--   • client_contacts.cc_on_invoices still adds CC recipients on invoices.
-- A flag here only decides whether that address is in the client's own set.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.clients
  add column if not exists email_office_included boolean not null default true;

alter table public.clients
  add column if not exists email_home_included boolean not null default true;

comment on column public.clients.email_office_included is
  'Include clients.email_office when emailing this client (invoices, proposals, the Email action).';
comment on column public.clients.email_home_included is
  'Include clients.email_home when emailing this client (invoices, proposals, the Email action).';

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name, column_default, is_nullable
--   from information_schema.columns
--   where table_name = 'clients' and column_name like 'email_%_included';
--   -- expect two rows, default true, NOT NULL

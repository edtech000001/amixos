-- 220 — Send a client's email to a contact instead of the client
--
-- Some clients have an email on file but do not want anything sent to it —
-- invoices go to a bookkeeper, an office manager, a family member. Until now
-- the only way to do that was to overwrite the client's own email with someone
-- else's, which loses the client's real address and mislabels whose it is.
--
-- This flags a CONTACT as the recipient instead. The contact row stays the
-- single source of truth for that person's address, so nothing has to be kept
-- in sync — a "billing email" text field on the client would duplicate it and
-- go stale the day that person changes their email.
--
-- Relationship to cc_on_invoices (migration 060): they answer different
-- questions and do not overlap.
--   receives_email   → who the mail is addressed TO. Applies to every send:
--                      invoices, proposals, and the ad-hoc "Email" button.
--   cc_on_invoices   → who else is copied, invoices only.
-- Anyone in TO is dropped from CC so nobody appears twice.
--
-- When NO contact is flagged, behaviour is exactly as before: the client's own
-- email is used. So this changes nothing for existing clients.

alter table public.client_contacts
  add column if not exists receives_email boolean not null default false;

comment on column public.client_contacts.receives_email is
  'This contact receives the client''s email instead of the client. When any '
  'contact on a client has this set, the client''s own address is NOT used as a '
  'recipient. More than one may be set (owner + bookkeeper). A flagged contact '
  'with no email is ignored, so a half-filled contact cannot make a client '
  'unreachable.';

-- Partial: the resolver only ever asks for flagged rows, and in the steady
-- state almost none are.
create index if not exists client_contacts_receives_email_idx
  on public.client_contacts (client_id)
  where receives_email;

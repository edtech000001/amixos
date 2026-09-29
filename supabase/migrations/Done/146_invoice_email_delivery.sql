-- Migration 146: how a sent invoice is delivered by email.
-- Run manually in the Supabase SQL Editor. Safe to re-run.
--
-- 'pdf'  = attach the invoice PDF only (default)
-- 'link' = include the public share link in the email body only
-- 'both' = attach the PDF AND include the link
alter table public.businesses
  add column if not exists invoice_email_delivery text not null default 'pdf';

-- Backfill any existing NULLs (older rows) to the default.
update public.businesses set invoice_email_delivery = 'pdf' where invoice_email_delivery is null;

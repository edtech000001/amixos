-- Migration 015: Add language column to invoices for bilingual invoice output
alter table public.invoices
  add column if not exists language text not null default 'es'
  constraint invoices_language_check check (language in ('es', 'en'));

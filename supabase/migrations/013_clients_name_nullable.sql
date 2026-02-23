-- Migration 013: Make first_name and last_name nullable on clients
-- Allows importing contacts that only have a company name or a single name

alter table public.clients
  alter column first_name drop not null,
  alter column last_name  drop not null;

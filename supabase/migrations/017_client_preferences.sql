-- Migration 017: Client preferences per business
-- Stores which default client fields are required (toggleable in Ajustes)
-- Format: { "first_name": true, "last_name": true, "phone_cell": false, ... }

alter table public.businesses
  add column if not exists client_field_required jsonb not null default '{}'::jsonb;

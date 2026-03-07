-- Migration 018: Job pipeline configuration per business
-- Stores which pipeline steps are disabled (toggled off in Ajustes > Trabajos)
-- Format: { "proposal": true, "sent": true, ... } where true = disabled

alter table public.businesses
  add column if not exists job_pipeline_disabled jsonb not null default '{}'::jsonb;

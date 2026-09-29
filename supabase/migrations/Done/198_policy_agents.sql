-- 198_policy_agents.sql
-- =============================================================================
-- Insurance/policy agent contacts on the business (Ajustes → Negocio):
--   { "coi":      { "name": "...", "email": "..." },
--     "workcomp": { "name": "...", "email": "..." } }
-- Used by the client detail's "Enviar póliza" action: drafts an email asking
-- the agent to send the COI / Workers' Comp certificate to that client,
-- with the client's details in the body. Workcomp falls back to the COI
-- agent when left blank (many businesses use one agent for both).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

alter table public.businesses
  add column if not exists policy_agents jsonb;

comment on column public.businesses.policy_agents is
  'Insurance agent contacts: { coi: {name,email}, workcomp: {name,email} }.';

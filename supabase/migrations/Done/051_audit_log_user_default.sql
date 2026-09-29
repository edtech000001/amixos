-- Migration 051: attribute audit_log entries to the acting user.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- The audit_log.user_id column was never being populated: the shared logAudit
-- helper inserts without user_id and the column had no default, so every
-- client-written entry landed with user_id = NULL and the Activity screen
-- ("Actividad") showed "Usuario desconocido" for everything. Default it to
-- auth.uid() so any insert made through a user's session is attributed
-- automatically — this fixes every existing client call site at once.
--
-- The invites API writes user_id explicitly with the service-role client
-- (where auth.uid() is NULL); that path is unaffected because an explicit
-- value always overrides a column default.
--
-- Note: pre-existing rows keep their NULL user_id — we can't retroactively
-- know who performed past actions.

alter table public.audit_log
  alter column user_id set default auth.uid();

-- 047_clients_geocoding_ignored.sql
-- Per-client "permanently skip geocoding" flag, set from the
-- unresolved-clients modal on the Map. When true, the client is
-- excluded from the geocode banner count, the unresolved-clients list,
-- and the batch geocode-clients RPC — useful for clients that legitimately
-- have no usable address (e.g. cash-only walk-ins, internal records) so
-- they stop nagging the user forever.
--
-- Reversible by editing the client row (or running an UPDATE in the SQL
-- editor) — no separate unignore UI yet.
--
-- Safe to re-run. Run manually in the Supabase SQL Editor.

alter table public.clients
  add column if not exists geocoding_ignored boolean not null default false;

-- Partial index — only the "needs attention" rows. Most clients are
-- already geocoded (have lat), so a full index would be mostly wasted.
create index if not exists idx_clients_geocoding_ignored
  on public.clients (business_id)
  where geocoding_ignored = true;

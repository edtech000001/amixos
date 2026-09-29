-- 064_drop_broad_share_policies.sql
-- Removes the enumerable `using (share_token is not null)` anon read policies
-- now that public invoice/proposal pages fetch via the token-gated RPCs from
-- 063 (get_shared_invoice / get_shared_proposal). After this, anon has NO
-- direct read on these tables — the only public path is presenting a valid
-- token to the RPC, which returns just the one matching document.
--
-- ⚠️ RUN ORDER: run 063 first, deploy the updated /factura/<token> and
-- /propuesta/<token> pages, THEN run this. Dropping these before the new
-- pages are live would break existing public links.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- Proposals (originally migration 019).
drop policy if exists "public read via share_token"          on public.jobs;
drop policy if exists "public read job_items via shared job"  on public.job_items;

-- Invoices (originally migration 056, businesses policy via 060).
drop policy if exists "public read invoice via share_token"             on public.invoices;
drop policy if exists "public read invoice_clients via shared invoice"  on public.invoice_clients;
drop policy if exists "public read clients via shared invoice"          on public.clients;
drop policy if exists "public read business via shared invoice"         on public.businesses;

-- The SECURITY DEFINER helper from 060 is no longer referenced by any policy
-- once the businesses policy above is gone; drop it to avoid leaving a dead
-- function behind. (get_shared_invoice/get_shared_proposal in 061 are the
-- supported path now.)
drop function if exists public.business_has_shared_invoice(uuid);

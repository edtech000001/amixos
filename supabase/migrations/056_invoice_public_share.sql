-- Migration 055: public (anon) read access for shared invoices.
-- Run manually in the Supabase SQL Editor. Safe to re-run.
--
-- Mirrors migration 019 (proposals public share). Anyone holding the random
-- share_token can read the invoice; access is read-only and token-gated. The
-- invoice's line_items are a JSONB column on `invoices` (not a child table),
-- so only the bill-to path needs extra policies: invoice_clients + clients.

-- Invoice itself: readable when a share_token is set.
drop policy if exists "public read invoice via share_token" on public.invoices;
create policy "public read invoice via share_token"
  on public.invoices for select
  using (share_token is not null);

-- Junction rows for a shared invoice.
drop policy if exists "public read invoice_clients via shared invoice" on public.invoice_clients;
create policy "public read invoice_clients via shared invoice"
  on public.invoice_clients for select
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_clients.invoice_id
      and i.share_token is not null
  ));

-- Bill-to client rows reachable from a shared invoice — via the junction
-- table OR the legacy single invoices.client_id FK.
drop policy if exists "public read clients via shared invoice" on public.clients;
create policy "public read clients via shared invoice"
  on public.clients for select
  using (
    exists (
      select 1
      from public.invoice_clients ic
      join public.invoices i on i.id = ic.invoice_id
      where ic.client_id = clients.id
        and i.share_token is not null
    )
    or exists (
      select 1 from public.invoices i
      where i.client_id = clients.id
        and i.share_token is not null
    )
  );

-- Business branding for the public invoice header (name, logo, contact, and
-- the invoice_template default). Readable for any business that has at least
-- one shared invoice.
drop policy if exists "public read business via shared invoice" on public.businesses;
create policy "public read business via shared invoice"
  on public.businesses for select
  using (exists (
    select 1 from public.invoices i
    where i.business_id = businesses.id
      and i.share_token is not null
  ));

-- 063_shared_doc_rpcs.sql
-- Token-gated public access for shared invoices + proposals, the SECURE way.
--
-- Problem with the old approach (056 invoices, 019 proposals): the anon RLS
-- policies were `using (share_token is not null)`, which lets ANY holder of
-- the public anon key read EVERY shared invoice/proposal (and their bill-to
-- client PII) by simply omitting the token filter — RLS can't see the
-- caller's WHERE clause, so the token is never actually required. Enumeration.
--
-- Fix: don't expose the tables to anon at all. These SECURITY DEFINER
-- functions take the token as an argument and return ONLY the single matching
-- record, with just the public-safe columns. Anon must present a valid secret
-- and can never get more than the one document it unlocks. Migration 064 then
-- drops the broad anon table policies (run it after the public pages that call
-- these RPCs are deployed).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run (additive).

-- ── Shared invoice ──────────────────────────────────────────────────────────
-- Returns the invoice row + bill-to client(s) + business branding, shaped to
-- match the public page's previous embed (clients / invoice_clients /
-- businesses). Business + client objects are column-scoped so anon never sees
-- internal business config or unrelated clients.
create or replace function public.get_shared_invoice(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select to_jsonb(i)
    || jsonb_build_object(
         'clients', (
           select to_jsonb(c) from (
             select first_name, last_name, email, phone_cell
             from public.clients where id = i.client_id
           ) c
         ),
         'invoice_clients', coalesce((
           select jsonb_agg(jsonb_build_object('clients', to_jsonb(c)))
           from public.invoice_clients ic
           join lateral (
             select first_name, last_name, email, phone_cell
             from public.clients where id = ic.client_id
           ) c on true
           where ic.invoice_id = i.id
         ), '[]'::jsonb),
         'businesses', (
           select to_jsonb(b) from (
             select name, logo_url, city, state, address, postal_code,
                    tax_id, license_number, email, phone, website, invoice_template
             from public.businesses where id = i.business_id
           ) b
         )
       )
  from public.invoices i
  where i.share_token = p_token
  limit 1;
$$;

-- ── Shared proposal (job) ─────────────────────────────────────────────────────
-- Returns { job: {…scoped job fields, clients, businesses}, items: [...] }.
create or replace function public.get_shared_proposal(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'job', (
      select to_jsonb(jrow)
        || jsonb_build_object(
             'clients', (
               select to_jsonb(c) from (
                 select first_name, last_name, company
                 from public.clients where id = j.client_id
               ) c
             ),
             'businesses', (
               select to_jsonb(b) from (
                 select name, logo_url, city, state
                 from public.businesses where id = j.business_id
               ) b
             )
           )
      from (
        select j.id, j.title, j.description, j.estimate_number, j.status,
               j.issue_date, j.expiry_date, j.scheduled_date, j.subtotal_amount,
               j.tax_rate, j.tax_amount, j.discount, j.total_amount, j.notes
      ) jrow
    ),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', ji.id, 'description', ji.description,
                 'quantity', ji.quantity, 'unit_price', ji.unit_price, 'total', ji.total
               ) order by ji.created_at
             )
      from public.job_items ji
      where ji.job_id = j.id
    ), '[]'::jsonb)
  )
  from public.jobs j
  where j.share_token = p_token
  limit 1;
$$;

grant execute on function public.get_shared_invoice(text)  to anon, authenticated;
grant execute on function public.get_shared_proposal(text) to anon, authenticated;

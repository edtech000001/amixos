-- 172_shared_invoice_client_zip.sql
-- The invoice "Bill To" address line is "City, ST ZIP", but the public
-- shared-invoice RPC's client selects (last set in migration 167) still omitted
-- zip_code, so the shared link + its PDF dropped the zip. Add zip_code to both
-- client sub-selects.
--
-- Recreated verbatim from migration 167 with only zip_code appended to the two
-- client sub-selects. SECURITY DEFINER + fixed search_path unchanged.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.get_shared_invoice(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select to_jsonb(irow)
    || jsonb_build_object(
         'clients', (
           select to_jsonb(c) from (
             select first_name, last_name, email, phone_cell, company, address, city, state, zip_code
             from public.clients where id = i.client_id
           ) c
         ),
         'invoice_clients', coalesce((
           select jsonb_agg(jsonb_build_object('clients', to_jsonb(c)))
           from public.invoice_clients ic
           join lateral (
             select first_name, last_name, email, phone_cell, company, address, city, state, zip_code
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
         ),
         'custom_fields_resolved', coalesce((
           select jsonb_agg(
                    jsonb_build_object('key', t.field_key, 'label', t.field_label, 'value', v.val)
                    order by t.sort_order nulls last, t.field_label
                  )
           from public.invoice_field_templates t
           join lateral (
             select (i.custom_fields ->> t.field_key) as val
           ) v on true
           where t.business_id = i.business_id
             and v.val is not null
             and v.val <> ''
         ), '[]'::jsonb)
       )
  from public.invoices i
  cross join lateral (
    select i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
           i.line_items, i.subtotal_amount, i.tax_rate, i.tax_amount,
           i.total_amount, i.notes, i.language, i.custom_fields,
           i.template_config, i.created_at
  ) irow
  where i.share_token = p_token
  limit 1;
$$;

grant execute on function public.get_shared_invoice(text) to anon, authenticated;

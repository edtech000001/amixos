-- 067_shared_invoice_custom_fields.sql
-- Add resolved custom fields to the public shared-invoice payload so the public
-- invoice page (/factura/<token>) can render the "Campos personalizados" section
-- and freeform custom-field elements with their proper labels.
--
-- get_shared_invoice (063) already returns the whole invoice row (custom_fields
-- JSONB = key→value) but NOT the field templates, which carry the labels and are
-- RLS-protected (anon can't read invoice_field_templates). This SECURITY DEFINER
-- function can, so we join the templates here and return an ordered, non-empty
-- `custom_fields_resolved` array of { key, label, value } alongside the existing
-- shape. Boolean values are passed through as-is (the page formats them).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run (replaces
-- the function). No app change is required for it to take effect — the page
-- already falls back to the raw custom_fields map when this field is absent.

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
  where i.share_token = p_token
  limit 1;
$$;

-- Verify (optional):
--   select (get_shared_invoice('<token>') -> 'custom_fields_resolved');

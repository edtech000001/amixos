-- 173_shared_proposal_theme.sql
-- The public /propuesta/<token> estimate now renders through the invoice THEME
-- engine (same look as invoices), which needs the full business branding +
-- invoice_template config and the client's full address. get_shared_proposal
-- previously returned only name/logo/city/state for the business and
-- first_name/last_name/company for the client. Expand both selects.
--
-- Full replacement of the 151 version — same shape, wider whitelists.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

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
                 select first_name, last_name, company, email, phone_cell,
                        address, city, state, zip_code
                 from public.clients where id = j.client_id
               ) c
             ),
             'businesses', (
               select to_jsonb(b) from (
                 select name, logo_url, city, state, address, postal_code,
                        tax_id, license_number, email, phone, website, invoice_template
                 from public.businesses where id = j.business_id
               ) b
             ),
             'created_by_name', (
               select coalesce(
                 nullif(trim(concat(e.first_name, ' ', e.last_name)), ''),
                 u.raw_user_meta_data->>'display_name',
                 u.raw_user_meta_data->>'name',
                 u.raw_user_meta_data->>'full_name',
                 u.email
               )
               from auth.users u
               left join lateral (
                 select first_name, last_name
                 from public.employees
                 where user_id = u.id and business_id = j.business_id
                 limit 1
               ) e on true
               where u.id = j.created_by
             )
           )
      from (
        select j.id, j.title, j.description, j.estimate_number, j.status,
               j.issue_date, j.expiry_date, j.scheduled_date, j.subtotal_amount,
               j.tax_rate, j.tax_amount, j.discount, j.total_amount, j.notes,
               j.client_response, j.client_responded_at, j.client_signed_name,
               j.client_signature
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

grant execute on function public.get_shared_proposal(text) to anon, authenticated;

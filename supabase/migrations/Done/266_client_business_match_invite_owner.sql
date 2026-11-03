-- 266_client_business_match_invite_owner.sql
-- Audit fixes:
--   * invoices / jobs / invoice_clients only check their OWN business_id, so a
--     row could point at another business's client. refresh_client_stats
--     (definer) then summed it into that client's balance, and the shared
--     invoice / proposal pages returned that client's contact details. Both now
--     only use a client of the document's own business.
--   * accept_invite overwrote any existing role on conflict — an invite sent to
--     the owner's email demoted the owner. The owner row is now never rewritten.
-- Function bodies are the latest versions (252, 229, 173, 176) with only those
-- conditions added.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

create or replace function public.refresh_client_stats(p_client_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.clients c set
    balance_due       = coalesce(s.balance, 0),
    overdue_count     = coalesce(s.overdue, 0),
    last_invoice_date = s.last_inv,
    lifetime_billed   = coalesce(s.billed, 0),
    open_jobs         = coalesce(j.open_cnt, 0),
    last_job_at       = j.last_job
  from (select distinct cb.id, cb.business_id
        from public.clients cb where cb.id = any(p_client_ids)) ids
  cross join lateral (
    select
      sum(i.total_amount - coalesce(i.amount_paid, 0)) filter (where i.status in ('sent', 'overdue')) as balance,
      count(*) filter (where i.status = 'overdue')                                                    as overdue,
      max(i.issue_date) filter (where i.status not in ('draft', 'cancelled'))                         as last_inv,
      sum(i.total_amount) filter (where i.status in ('sent', 'overdue', 'paid'))                      as billed
    from public.invoices i
    where i.client_id = ids.id
      and i.business_id = ids.business_id
  ) s
  cross join lateral (
    select
      count(*) filter (where jb.status in ('accepted', 'scheduled', 'in_progress')) as open_cnt,
      max(jb.created_at)                                                            as last_job
    from public.jobs jb
    where jb.client_id = ids.id
      and jb.business_id = ids.business_id
  ) j
  where c.id = ids.id
    -- No-op writes skipped (no row churn / realtime noise).
    and (c.balance_due, c.overdue_count, c.last_invoice_date, c.lifetime_billed, c.open_jobs, c.last_job_at)
        is distinct from
        (coalesce(s.balance, 0), coalesce(s.overdue, 0)::integer, s.last_inv, coalesce(s.billed, 0), coalesce(j.open_cnt, 0)::integer, j.last_job);
$$;

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
             from public.clients where id = i.client_id and business_id = i.business_id
           ) c
         ),
         'invoice_clients', coalesce((
           select jsonb_agg(jsonb_build_object('clients', to_jsonb(c)))
           from public.invoice_clients ic
           join lateral (
             select first_name, last_name, email, phone_cell, company, address, city, state, zip_code
             from public.clients where id = ic.client_id and business_id = i.business_id
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
         -- Current titles of the jobs billed on this invoice, so the shared
         -- page names single-line jobs the way the app does (migration 229).
         -- Only jobs attached to THIS invoice; titles only.
         'job_titles', coalesce((
           select jsonb_object_agg(j.id::text, j.title)
           from public.jobs j
           where j.invoice_id = i.id
             and j.business_id = i.business_id
             and j.title is not null
         ), '{}'::jsonb),
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
                 from public.clients where id = j.client_id and business_id = j.business_id
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

create or replace function public.accept_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv record;
  user_email text;
  new_member_id uuid;
begin
  select email into user_email from auth.users where id = auth.uid();
  if user_email is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.business_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
      and lower(email) = lower(user_email)
    limit 1;
  if not found then
    raise exception 'invite_not_found_or_expired';
  end if;

  -- Idempotent: if user is already a member, just mark the invite accepted.
  -- Never rewrites the OWNER's row: an invite to the owner's email would
  -- otherwise demote them (migration 266).
  insert into public.business_members (business_id, user_id, role)
    values (inv.business_id, auth.uid(), inv.role)
    on conflict (business_id, user_id)
    do update set role = excluded.role
    where business_members.role <> 'owner'
    returning id into new_member_id;

  update public.business_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = inv.id;

  -- Auto-link this login to its matching worker record (by personal email), so
  -- branch/crew visibility works right away. Only links an unlinked employee.
  update public.employees
    set user_id = auth.uid()
    where business_id = inv.business_id
      and user_id is null
      and email is not null
      and lower(email) = lower(user_email);

  -- Log it.
  insert into public.audit_log (business_id, user_id, action, entity_type, entity_id, details)
    values (inv.business_id, auth.uid(), 'invite.accepted', 'invite', inv.id,
            jsonb_build_object('role', inv.role, 'email', inv.email));

  return inv.business_id;
end;
$$;

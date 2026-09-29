-- 154_security_hardening.sql
-- Batch of RLS / policy / RPC hardening from the security audit. All additive
-- and idempotent. Run manually in the Supabase SQL Editor.
--
-- Covers:
--   1. Delete a member's Google-sync creds when they leave the business (HIGH,
--      the DB half of the stale-credentials fix; the API also gains membership
--      gates).
--   2. Exclude impersonation ("Ver como") JWTs from reading user_oauth_credentials.
--   3. audit_log insert must bind user_id = auth.uid() (stop actor spoofing).
--   4. business_members insert must not create a second 'owner' (block admin
--      → owner escalation); plus a single-owner unique index.
--   5. payroll_payments + employee_loans reads restricted to manager+ (match
--      the employees-privacy model).
--   6. get_shared_invoice returns an explicit column whitelist (data minimization).
--   7. respond_shared_proposal: stricter signature validation (reject markup).

-- ── 1. Clean up OAuth creds on member removal ───────────────────────────────
create or replace function public.cleanup_member_oauth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_oauth_credentials
   where user_id = old.user_id and business_id = old.business_id;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_member_oauth on public.business_members;
create trigger trg_cleanup_member_oauth
  after delete on public.business_members
  for each row execute function public.cleanup_member_oauth();

-- ── 2. Impersonated sessions cannot read the target's Google refresh token ──
-- "Ver como" mints a JWT with amixos_impersonated:true. Personal OAuth tokens
-- are an out-of-app resource; a business-scoped preview must not expose them.
--
-- Drop EVERY historical policy name on this table first (020 used one set of
-- names, 031 another, and 031 never dropped 020's — so an un-guarded
-- permissive policy could otherwise survive and OR past this fix).
drop policy if exists "user reads own oauth creds"        on public.user_oauth_credentials;
drop policy if exists "user updates own oauth creds"      on public.user_oauth_credentials;
drop policy if exists "user deletes own oauth creds"      on public.user_oauth_credentials;
drop policy if exists "Users can read own oauth credentials"   on public.user_oauth_credentials;
drop policy if exists "Users can manage own oauth credentials" on public.user_oauth_credentials;
drop policy if exists "members read own oauth credentials"     on public.user_oauth_credentials;
drop policy if exists "users read own oauth credentials"   on public.user_oauth_credentials;
drop policy if exists "users update own oauth credentials" on public.user_oauth_credentials;
drop policy if exists "users delete own oauth credentials" on public.user_oauth_credentials;

create policy "users read own oauth credentials" on public.user_oauth_credentials for select
  using (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'amixos_impersonated')::boolean, false) = false
  );

create policy "users update own oauth credentials" on public.user_oauth_credentials for update
  using (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'amixos_impersonated')::boolean, false) = false
  );

create policy "users delete own oauth credentials" on public.user_oauth_credentials for delete
  using (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'amixos_impersonated')::boolean, false) = false
  );

-- ── 3. audit_log: actor must be the caller ──────────────────────────────────
-- Previously any member could POST a row with an arbitrary user_id, forging
-- destructive actions against another user in the append-only log.
drop policy if exists "manager+ write audit_log" on public.audit_log;
drop policy if exists "members write audit_log" on public.audit_log;
drop policy if exists "member writes own audit_log" on public.audit_log;
create policy "member writes own audit_log" on public.audit_log for insert
  with check (public.is_business_member(business_id) and user_id = auth.uid());

-- ── 4. business_members: admins cannot mint a second owner ──────────────────
-- 082 hardened UPDATE/DELETE against owner tampering but left INSERT open, so
-- an admin could insert a new row with role='owner' and escalate to full
-- owner (billing, delete-business). Ownership only moves via
-- transfer_business_ownership (153).
drop policy if exists "admin write business_members" on public.business_members;
create policy "admin write business_members" on public.business_members for insert
  with check (public.is_business_admin(business_id) and role <> 'owner');

-- One owner per business, enforced at the storage layer (the transfer RPC
-- flips old→admin and new→owner atomically, so it never trips this).
create unique index if not exists business_members_one_owner_idx
  on public.business_members (business_id)
  where role = 'owner';

-- ── 5. Payroll + loan reads: manager+ only ──────────────────────────────────
-- Pay amounts and loan balances are the most sensitive salary data; the
-- employees table already hides pay rates from office/field, but the payment
-- ledger and loans were readable by every member.
drop policy if exists "members read payroll_payments" on public.payroll_payments;
create policy "manager+ read payroll_payments" on public.payroll_payments for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));

drop policy if exists "members read employee_loans" on public.employee_loans;
create policy "manager+ read employee_loans" on public.employee_loans for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));

-- The old "writers write employee_loans" was FOR ALL, so it ALSO granted
-- SELECT to office+ — ORing past the read restriction above. Replace it with a
-- manager+ FOR ALL (viewer excluded from writes) so office/field can neither
-- read nor write loan balances. Loans are managed from the manager+-gated
-- payroll/employee screens.
drop policy if exists "writers write employee_loans" on public.employee_loans;
drop policy if exists "manager+ write employee_loans" on public.employee_loans;
create policy "manager+ write employee_loans" on public.employee_loans for all
  using (public.has_business_role(business_id, array['owner','admin','manager']))
  with check (public.has_business_role(business_id, array['owner','admin','manager']));

-- ── 6. get_shared_invoice: column whitelist ─────────────────────────────────
-- Was to_jsonb(i) — dumped the whole invoices row (created_by/updated_by,
-- share_token, internal columns) to any anon token holder. Whitelist the
-- display columns the public /factura page actually uses.
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
         -- Resolved custom fields (labels from the RLS-protected templates) —
         -- carried over from 067; the public page renders these.
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

-- ── 7. respond_shared_proposal: stricter signature validation ───────────────
-- Previously accepted any 'data:image/%' ≤200 KB, so an anon caller with a
-- share token could store an attribute-breakout payload that the mobile PDF
-- (expo-print) rendered unescaped. Restrict to real image data-URLs and
-- reject the HTML-breakout characters. (The mobile template also escapes it.)
create or replace function public.respond_shared_proposal(
  p_token text,
  p_action text,
  p_name text default null,
  p_signature text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job
  from public.jobs
  where share_token = p_token and estimate_number is not null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_job.status not in ('proposal', 'sent') then
    return jsonb_build_object('ok', false, 'error', 'already_responded', 'status', v_job.status);
  end if;

  if p_action = 'accepted' then
    if v_job.expiry_date is not null and v_job.expiry_date < current_date then
      return jsonb_build_object('ok', false, 'error', 'expired');
    end if;
    if coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') = '' then
      return jsonb_build_object('ok', false, 'error', 'missing_signature');
    end if;
    -- Must be a real image data-URL, size-capped, with no characters that
    -- could break out of an HTML attribute when rendered into the PDF.
    if p_signature !~ '^data:image/(png|jpeg|svg\+xml);'
       or length(p_signature) > 200000
       or p_signature ~ '["<>]' then
      return jsonb_build_object('ok', false, 'error', 'bad_signature');
    end if;

    update public.jobs set
      status              = 'accepted',
      accepted_at         = now(),
      client_response     = 'accepted',
      client_responded_at = now(),
      client_signed_name  = trim(p_name),
      client_signature    = p_signature
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'accepted');

  elsif p_action = 'declined' then
    update public.jobs set
      status              = 'declined',
      declined_at         = now(),
      client_response     = 'declined',
      client_responded_at = now()
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'declined');

  else
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;
end;
$$;

grant execute on function public.respond_shared_proposal(text, text, text, text) to anon, authenticated;

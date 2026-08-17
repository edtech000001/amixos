-- 206_rentals_lease_esign.sql
-- =============================================================================
-- Rentals v2, part 3 — tenants sign the lease from a share link, mirroring the
-- estimate flow (147/151): an unguessable token on the row, one SECURITY
-- DEFINER read RPC and one write RPC, both granted to anon. The token is the
-- ONLY thing gating access, so it is generated with secureShareToken() and the
-- payload is deliberately minimal (this lease only — no ledger, no other
-- tenants, no sibling properties).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

alter table public.rental_leases
  add column if not exists share_token        text,
  add column if not exists tenant_signature   text,
  add column if not exists tenant_signed_at   timestamptz,
  add column if not exists tenant_signer_name text;

create unique index if not exists rental_leases_share_token_idx
  on public.rental_leases (share_token) where share_token is not null;

-- ── Public read: everything the signing page renders ────────────────────────
create or replace function public.get_shared_lease(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'lease', to_jsonb(lrow),
    'property', (
      select to_jsonb(p) from (
        select name, address, city, state, zip
        from public.rental_properties where id = l.property_id
      ) p
    ),
    'tenant', (
      select to_jsonb(tn) from (
        select first_name, last_name
        from public.rental_tenants where id = l.tenant_id
      ) tn
    ),
    'business', (
      select to_jsonb(b) from (
        select name, logo_url, address, city, state, postal_code, phone, email
        from public.businesses where id = l.business_id
      ) b
    )
  )
  from public.rental_leases l
  cross join lateral (
    select l.id, l.unit_label, l.start_date, l.end_date, l.monthly_rent, l.due_day,
           l.deposit_amount, l.late_fee_amount, l.late_fee_grace_days,
           l.prorate_partial, l.notes, l.status,
           l.tenant_signature, l.tenant_signed_at, l.tenant_signer_name
  ) lrow
  where l.share_token = p_token
  limit 1;
$$;

-- ── Public write: record the tenant's signature ─────────────────────────────
create or replace function public.sign_shared_lease(
  p_token text,
  p_name text,
  p_signature text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease public.rental_leases%rowtype;
begin
  select * into v_lease from public.rental_leases where share_token = p_token limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A lease is signed once. Re-signing would silently overwrite the record of
  -- what the tenant actually agreed to.
  if v_lease.tenant_signed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;

  if coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_signature');
  end if;

  -- Same guard as respond_shared_proposal (147/154): a drawn PNG is tiny, so
  -- the cap stops anon from stuffing megabytes into the row.
  if p_signature not like 'data:image/%' or length(p_signature) > 200000 then
    return jsonb_build_object('ok', false, 'error', 'bad_signature');
  end if;

  update public.rental_leases set
    tenant_signature   = p_signature,
    tenant_signer_name = trim(p_name),
    tenant_signed_at   = now()
  where id = v_lease.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.get_shared_lease(text) to anon, authenticated;
grant execute on function public.sign_shared_lease(text, text, text) to anon, authenticated;

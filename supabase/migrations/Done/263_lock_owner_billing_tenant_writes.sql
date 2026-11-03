-- 263_lock_owner_billing_tenant_writes.sql
-- Audit fixes (2026-11-02):
--   1. Admins could set businesses.owner_id to themselves ("admin update
--      businesses" has no column limits) and then take over the business.
--   2. Owners/admins could write the billing columns directly (free paid plan,
--      trial to 2099, fake lapse → purge). Only Stripe (service_role) and
--      SECURITY DEFINER functions may change them now.
--   3. invoice_payments only checked its own business_id, so a payment could be
--      written against ANOTHER business's invoice (and the definer trigger then
--      rewrote that invoice's amount_paid).
--   4. The 001 timesheet policy "Workers can manage own timesheet" only checked
--      user_id, so a removed worker could still write hours into the business.
--   5. transfer_business_ownership promoted the new owner before demoting the
--      old one, so business_members_one_owner_idx (154) rejected every transfer.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1 + 2. Owner and billing columns are system-only ─────────────────────────
-- SECURITY INVOKER on purpose: current_user is then the caller's role. App
-- users run as 'authenticated'; the Stripe webhook / API run as service_role,
-- and SECURITY DEFINER functions (transfer_business_ownership, cron sweeps) run
-- as their owner — all of those pass.
create or replace function public.businesses_guard_system_cols()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new business starts unpaid; trg_grant_first_business_trial (runs after
    -- this, triggers fire by name) grants the trial when eligible.
    new.subscription_status    := 'none';
    new.trial_ends_at          := null;
    new.plan                   := null;
    new.billing_period         := null;
    new.current_period_end     := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    new.subscription_cancel_at := null;
    new.lapsed_at              := null;
    return new;
  end if;

  if new.owner_id               is distinct from old.owner_id
  or new.subscription_status    is distinct from old.subscription_status
  or new.trial_ends_at          is distinct from old.trial_ends_at
  or new.plan                   is distinct from old.plan
  or new.billing_period         is distinct from old.billing_period
  or new.current_period_end     is distinct from old.current_period_end
  or new.stripe_customer_id     is distinct from old.stripe_customer_id
  or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  or new.subscription_cancel_at is distinct from old.subscription_cancel_at
  or new.lapsed_at              is distinct from old.lapsed_at then
    raise exception 'owner and billing fields are system-managed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.businesses_guard_system_cols() from public, anon, authenticated;

drop trigger if exists businesses_guard_system_cols on public.businesses;
create trigger businesses_guard_system_cols
  before insert or update on public.businesses
  for each row execute function public.businesses_guard_system_cols();

-- ── 3. invoice_payments must point at an invoice of the SAME business ───────
do $$
declare
  v_same_biz constant text :=
    'exists (select 1 from public.invoices i where i.id = invoice_payments.invoice_id and i.business_id = invoice_payments.business_id)';
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments insert') then
    execute format($q$alter policy "invoice_payments insert" on public.invoice_payments with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))) and %s)$q$, v_same_biz);
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments' and policyname = 'invoice_payments update') then
    execute format($q$alter policy "invoice_payments update" on public.invoice_payments using ((business_id in (select public.my_res_businesses('invoices', 'edit')))) with check ((business_id in (select public.my_res_businesses('invoices', 'edit'))) and %s)$q$, v_same_biz);
  end if;
end $$;

-- Belt and braces: the definer trigger only sums payments of the invoice's own business.
create or replace function public.invoices_sync_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[
    case when tg_op in ('INSERT','UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE','DELETE') then old.invoice_id end
  ], null);
  update public.invoices i
     set amount_paid = coalesce((select sum(p.amount) from public.invoice_payments p
                                  where p.invoice_id = i.id and p.business_id = i.business_id), 0)
   where i.id = any(v_ids);
  return coalesce(new, old);
end;
$$;

-- ── 4. Legacy timesheet policy without a membership check ───────────────────
-- Own-row access stays covered by "field write own timesheets" /
-- "field update own timesheets" / "member read own timesheets" (179/256/257),
-- which require membership + the linked employee.
drop policy if exists "Workers can manage own timesheet" on public.timesheets;

-- ── 5. Ownership transfer: demote the old owner FIRST ────────────────────────
create or replace function public.transfer_business_ownership(
  b_id uuid,
  new_owner_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.businesses where id = b_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if new_owner_user_id = v_owner then
    return jsonb_build_object('ok', false, 'error', 'already_owner');
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = b_id and user_id = new_owner_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  update public.businesses
    set owner_id = new_owner_user_id
    where id = b_id;
  -- Old owner → admin before new → owner: business_members_one_owner_idx
  -- (154) allows only one 'owner' row at any moment.
  update public.business_members
    set role = 'admin'
    where business_id = b_id and user_id = v_owner;
  update public.business_members
    set role = 'owner'
    where business_id = b_id and user_id = new_owner_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 060_fix_business_share_recursion.sql
-- Fixes "42P17: infinite recursion detected in policy for relation
-- businesses", which broke ALL businesses reads (every authenticated account
-- load showed the "No pudimos cargar tu cuenta" screen).
--
-- Cause: migration 056's policy `public read business via shared invoice`
-- on public.businesses subqueries public.invoices directly. Evaluating that
-- subquery runs invoices' RLS, whose member policy reads public.businesses,
-- which re-evaluates this policy → infinite recursion. Because RLS errors if
-- ANY permissive policy on the relation recurses, even normal member reads of
-- businesses fail.
--
-- Fix: move the invoice-share check into a SECURITY DEFINER function that
-- reads invoices WITHOUT triggering its RLS (same technique as
-- is_business_member in migration 002), breaking the cycle.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

create or replace function public.business_has_shared_invoice(bid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.invoices
    where business_id = bid and share_token is not null
  );
$$;

grant execute on function public.business_has_shared_invoice(uuid) to anon, authenticated;

drop policy if exists "public read business via shared invoice" on public.businesses;
create policy "public read business via shared invoice"
  on public.businesses for select
  using (public.business_has_shared_invoice(id));

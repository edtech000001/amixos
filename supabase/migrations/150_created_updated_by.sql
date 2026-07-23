-- 150_created_updated_by.sql
-- Who created / last edited a job or invoice, captured at the DATABASE level
-- so every write path (forms, status buttons, item editors, payments, offline
-- sync) records it without app-code changes:
--   * created_by defaults to auth.uid() on insert (jobs already had the
--     column via 019; invoices gain it here).
--   * updated_by is stamped by a BEFORE UPDATE trigger. When the update
--     comes from an anon/SECURITY DEFINER path with no auth.uid() (e.g. the
--     public estimate-signing RPC), the previous value is kept rather than
--     blanked.
-- Display names resolve client-side via list_business_members (022).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.jobs
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.invoices
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Capture the creator even when the app doesn't pass created_by explicitly.
alter table public.jobs     alter column created_by set default auth.uid();
alter table public.invoices alter column created_by set default auth.uid();

create or replace function public.set_updated_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_by on public.jobs;
create trigger jobs_set_updated_by
  before update on public.jobs
  for each row execute function public.set_updated_by();

drop trigger if exists invoices_set_updated_by on public.invoices;
create trigger invoices_set_updated_by
  before update on public.invoices
  for each row execute function public.set_updated_by();

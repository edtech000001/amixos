-- 228_invoice_reminders.sql
-- Payment-reminder log for open (sent / overdue) invoices. Each "Mark as
-- reminded" records who reminded the client, how (email / text / call / in
-- person / other), on which day, plus an optional note — so the team can see
-- at a glance whether a late invoice has already been chased.
--
-- invoices.reminder_count + invoices.last_reminded_on are a rolled-up summary
-- kept in sync by a trigger, so the invoice LIST can show "Reminded 2× · 3d
-- ago" from its existing select without joining the log.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

-- ── 1. Summary columns on invoices ───────────────────────────────────────────
alter table public.invoices add column if not exists reminder_count   integer not null default 0;
alter table public.invoices add column if not exists last_reminded_on date;

-- ── 2. The log ───────────────────────────────────────────────────────────────
create table if not exists public.invoice_reminders (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  -- The day the client was reminded (date-only: people log calls after the fact).
  reminded_on  date not null default current_date,
  method       text not null default 'other'
               check (method in ('email', 'text', 'call', 'in_person', 'other')),
  note         text,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists invoice_reminders_invoice_idx
  on public.invoice_reminders (invoice_id, reminded_on desc);
create index if not exists invoice_reminders_business_idx
  on public.invoice_reminders (business_id);

alter table public.invoice_reminders enable row level security;

-- Same shape as invoice_payments: read follows the invoices read policy
-- (initplan form, migration 181 — no row-column args to SECURITY DEFINER
-- helpers in read policies); writes follow invoices.edit (migration 164).
drop policy if exists "invoice_reminders read" on public.invoice_reminders;
create policy "invoice_reminders read" on public.invoice_reminders for select
  using (business_id in (select public.my_view_businesses('invoices', 'all')));

drop policy if exists "invoice_reminders insert" on public.invoice_reminders;
create policy "invoice_reminders insert" on public.invoice_reminders for insert
  with check (public.member_res(business_id, 'invoices', 'edit'));

drop policy if exists "invoice_reminders update" on public.invoice_reminders;
create policy "invoice_reminders update" on public.invoice_reminders for update
  using (public.member_res(business_id, 'invoices', 'edit'))
  with check (public.member_res(business_id, 'invoices', 'edit'));

drop policy if exists "invoice_reminders delete" on public.invoice_reminders;
create policy "invoice_reminders delete" on public.invoice_reminders for delete
  using (public.member_res(business_id, 'invoices', 'edit'));

-- ── 3. Keep the invoice summary in sync ──────────────────────────────────────
-- SECURITY DEFINER so the rollup lands even for a role whose invoice UPDATE
-- would otherwise be narrower than its reminder INSERT. Trigger-only; never
-- referenced from a policy.
create or replace function public.sync_invoice_reminder_summary()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv uuid;
begin
  for inv in
    select distinct x from unnest(array[
      case when tg_op <> 'INSERT' then old.invoice_id end,
      case when tg_op <> 'DELETE' then new.invoice_id end
    ]) as x where x is not null
  loop
    update public.invoices i
       set reminder_count   = s.cnt,
           last_reminded_on = s.last_on
      from (
        select count(*)::int as cnt, max(r.reminded_on) as last_on
        from public.invoice_reminders r
        where r.invoice_id = inv
      ) s
     where i.id = inv;
  end loop;
  return null;
end;
$$;

drop trigger if exists invoice_reminders_sync on public.invoice_reminders;
create trigger invoice_reminders_sync
  after insert or update or delete on public.invoice_reminders
  for each row execute function public.sync_invoice_reminder_summary();

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'invoice_reminders' order by cmd;
--   -- expect: delete, insert, select, update
--   select column_name from information_schema.columns
--   where table_name = 'invoices' and column_name in ('reminder_count', 'last_reminded_on');

-- Migration 016: Support multiple clients per invoice
-- Adds a junction table and migrates existing client_id data.

create table if not exists public.invoice_clients (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(invoice_id, client_id)
);

-- Enable RLS
alter table public.invoice_clients enable row level security;

-- RLS: users can manage invoice_clients for invoices belonging to their business
create policy "invoice_clients_select" on public.invoice_clients for select using (
  exists (
    select 1 from public.invoices i
    join public.business_members bm on bm.business_id = i.business_id
    where i.id = invoice_clients.invoice_id
      and bm.user_id = auth.uid()
  )
);

create policy "invoice_clients_insert" on public.invoice_clients for insert with check (
  exists (
    select 1 from public.invoices i
    join public.business_members bm on bm.business_id = i.business_id
    where i.id = invoice_clients.invoice_id
      and bm.user_id = auth.uid()
  )
);

create policy "invoice_clients_delete" on public.invoice_clients for delete using (
  exists (
    select 1 from public.invoices i
    join public.business_members bm on bm.business_id = i.business_id
    where i.id = invoice_clients.invoice_id
      and bm.user_id = auth.uid()
  )
);

-- Migrate existing client_id data into the junction table
insert into public.invoice_clients (invoice_id, client_id)
select id, client_id from public.invoices where client_id is not null
on conflict do nothing;

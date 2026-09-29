-- Migration 012: Client contacts (multiple people per client with roles)

create table if not exists public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  role        text,           -- e.g. "Dueño", "Asistente", "Encargado"
  phone       text,
  email       text,
  notes       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.client_contacts enable row level security;

create policy "owner manage client_contacts"
  on public.client_contacts for all
  using (exists (
    select 1 from public.businesses
    where businesses.id = client_contacts.business_id
      and businesses.owner_id = auth.uid()
  ));

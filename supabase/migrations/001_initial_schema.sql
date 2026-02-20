-- ─── Amixos Initial Schema ───────────────────────────────────────────────────
-- Run this in Supabase SQL Editor or via migration

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Profiles (extends Supabase auth.users) ──────────────────────────────────
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  avatar_url text,
  language text not null default 'en',
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Businesses ───────────────────────────────────────────────────────────────
create table if not exists public.businesses (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  service_type text,
  logo_url text,
  address text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  virtual_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

create policy "Owners can manage their businesses"
  on public.businesses for all
  using (auth.uid() = owner_id);

create policy "Members can view their business"
  on public.businesses for select
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = businesses.id
      and business_members.user_id = auth.uid()
    )
  );

-- ─── Business Members (employees/managers) ────────────────────────────────────
create table if not exists public.business_members (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'worker', -- 'owner' | 'manager' | 'worker'
  title text,
  pay_type text, -- 'hourly' | 'salary'
  pay_rate numeric(10,2),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

alter table public.business_members enable row level security;

create policy "Owners and managers can manage members"
  on public.business_members for all
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = business_members.business_id
      and bm.user_id = auth.uid()
      and bm.role in ('owner', 'manager')
    )
  );

create policy "Members can view their own record"
  on public.business_members for select
  using (user_id = auth.uid());

-- ─── Business Modules ─────────────────────────────────────────────────────────
create table if not exists public.business_modules (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  module_key text not null,
  is_active boolean not null default true,
  settings jsonb,
  activated_at timestamptz not null default now(),
  unique (business_id, module_key)
);

alter table public.business_modules enable row level security;

create policy "Business members can view modules"
  on public.business_modules for select
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = business_modules.business_id
      and business_members.user_id = auth.uid()
    )
  );

create policy "Owners can manage modules"
  on public.business_modules for all
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = business_modules.business_id
      and business_members.user_id = auth.uid()
      and business_members.role = 'owner'
    )
  );

-- ─── Clients ──────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  first_name text not null,
  last_name text not null,
  company_name text,
  email text,
  mobile_phone text,
  office_phone text,
  fax text,
  website text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  loyalty_status text not null default 'good_standing', -- 'good_standing' | 'flagged' | 'vip'
  birthday date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "Business members can manage clients"
  on public.clients for all
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = clients.business_id
      and business_members.user_id = auth.uid()
    )
  );

-- ─── Invoices ─────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null,
  type text not null default 'invoice', -- 'invoice' | 'estimate'
  status text not null default 'draft', -- 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  line_items jsonb not null default '[]',
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  signature_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);

alter table public.invoices enable row level security;

create policy "Business members can manage invoices"
  on public.invoices for all
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = invoices.business_id
      and business_members.user_id = auth.uid()
    )
  );

-- ─── Timesheet ────────────────────────────────────────────────────────────────
create table if not exists public.timesheets (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  hours_total numeric(5,2),
  approved boolean not null default false,
  approved_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.timesheets enable row level security;

create policy "Workers can manage own timesheet"
  on public.timesheets for all
  using (user_id = auth.uid());

create policy "Owners and managers can view all timesheets"
  on public.timesheets for select
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = timesheets.business_id
      and business_members.user_id = auth.uid()
      and business_members.role in ('owner', 'manager')
    )
  );

create policy "Owners and managers can approve timesheets"
  on public.timesheets for update
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = timesheets.business_id
      and business_members.user_id = auth.uid()
      and business_members.role in ('owner', 'manager')
    )
  );

-- ─── Calendar Events ──────────────────────────────────────────────────────────
create table if not exists public.calendar_events (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  location text,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

create policy "Business members can manage calendar"
  on public.calendar_events for all
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = calendar_events.business_id
      and business_members.user_id = auth.uid()
    )
  );

-- ─── Inventory ────────────────────────────────────────────────────────────────
create table if not exists public.inventory_items (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  name text not null,
  sku text,
  description text,
  quantity integer not null default 0,
  low_stock_at integer,
  unit_price numeric(10,2),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create policy "Business members can manage inventory"
  on public.inventory_items for all
  using (
    exists (
      select 1 from public.business_members
      where business_members.business_id = inventory_items.business_id
      and business_members.user_id = auth.uid()
    )
  );

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at before update on public.profiles for each row execute function update_updated_at();
create trigger update_businesses_updated_at before update on public.businesses for each row execute function update_updated_at();
create trigger update_clients_updated_at before update on public.clients for each row execute function update_updated_at();
create trigger update_invoices_updated_at before update on public.invoices for each row execute function update_updated_at();
create trigger update_calendar_events_updated_at before update on public.calendar_events for each row execute function update_updated_at();
create trigger update_inventory_updated_at before update on public.inventory_items for each row execute function update_updated_at();

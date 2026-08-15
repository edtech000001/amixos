-- 194_rentals_module.sql
-- =============================================================================
-- Rental Properties module (registry id 'rentals') — v1 landlord-side schema.
--
-- Nine tables:
--   rental_properties         the buildings/houses (branch-scoped via location_id)
--   rental_property_photos    photo gallery per property (equipment_photos clone)
--   rental_tenants            module-OWNED people records. Deliberately NOT
--                             linked to public.clients: tenant PII is gated by
--                             the 'rentals' permission alone, so a "property
--                             manager" custom role (rentals full, all else none)
--                             can work the module with zero Clientes access, and
--                             renters never mix into the service-business client
--                             list.
--   rental_leases             terms: tenant × property, monthly_rent snapshot
--                             source, due_day, deposit; end_date null = month-to-month
--   rental_lease_documents    signed lease PDFs/images (job_documents clone)
--   rental_charges            the rent ledger: one row per lease-month, amount
--                             SNAPSHOTTED at generation. unique(lease_id,
--                             period_start) makes lazy client-side generation
--                             idempotent (no scheduler exists in this stack).
--   rental_payments           payments applied to a charge (invoice_payments
--                             clone incl. check photo + display rotation)
--   rental_maintenance        lightweight per-property maintenance log (NOT jobs)
--   rental_maintenance_photos photos per maintenance record
--   rental_expenses           per-property expense ledger (receipt photo,
--                             category, optional link to the maintenance record
--                             that generated it)
--
-- RLS: new 'rentals' resource. Reads use the 181 initplan pattern
-- (my_view_businesses, evaluated once per query); single-row writes use direct
-- member_res(...) like every sibling write policy (191 documents that split).
-- default_role_permissions() gains a "rentals" key mirroring equipment per
-- role; member_res/member_view fall back to these defaults for roles customized
-- before this key existed (164 forward-compat fix), so NO snapshot backfill.
--
-- Storage: photos/docs live in the private 'business-private' bucket under
-- rentals/<business_id>/… — business id MUST be path segment 2 (the generic 066
-- policies parse it from there). No new storage policies needed. File cleanup
-- is app-side (storage.protect_delete blocks SQL triggers from deleting
-- storage objects).
--
-- ⚠️ Adds data-access rules for a new resource; default access mirrors
-- equipment (owner/admin/manager/office full, field none, viewer read-only).
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- =============================================================================

-- ─── rental_properties ───────────────────────────────────────────────────────
create table if not exists public.rental_properties (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  location_id    uuid references public.locations(id) on delete set null,
  name           text not null,
  address        text,
  city           text,
  state          text,
  zip            text,
  property_type  text check (property_type in ('house','duplex','apartment','commercial','land','other')),
  unit_count     integer,               -- null = single-unit
  purchase_date  date,
  purchase_price numeric(14,2),
  notes          text,
  status         text not null default 'active' check (status in ('active','inactive')),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists rental_properties_keyset_idx
  on public.rental_properties (business_id, name, id);
create index if not exists rental_properties_location_idx
  on public.rental_properties (location_id);

create table if not exists public.rental_property_photos (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  property_id  uuid not null references public.rental_properties(id) on delete cascade,
  storage_path text not null,
  rotation     integer not null default 0,   -- display-only, 0/90/180/270
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists rental_property_photos_prop_idx
  on public.rental_property_photos (property_id, created_at);

-- ─── rental_tenants (module-owned; see header for why not clients) ───────────
create table if not exists public.rental_tenants (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.businesses(id) on delete cascade,
  first_name              text not null,
  last_name               text,
  phone                   text,
  email                   text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes                   text,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists rental_tenants_keyset_idx
  on public.rental_tenants (business_id, first_name, id);

-- ─── rental_leases ───────────────────────────────────────────────────────────
create table if not exists public.rental_leases (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  property_id    uuid not null references public.rental_properties(id) on delete cascade,
  tenant_id      uuid not null references public.rental_tenants(id) on delete cascade,
  unit_label     text,                  -- 'Apto 2', 'Unidad B' — free text, optional
  start_date     date not null,
  end_date       date,                  -- null = month-to-month
  monthly_rent   numeric(12,2) not null,
  due_day        smallint not null default 1 check (due_day between 1 and 31),
  deposit_amount numeric(12,2),
  status         text not null default 'active' check (status in ('active','ended')),
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists rental_leases_biz_status_idx
  on public.rental_leases (business_id, status);
create index if not exists rental_leases_property_idx
  on public.rental_leases (property_id);
create index if not exists rental_leases_tenant_idx
  on public.rental_leases (tenant_id);

create table if not exists public.rental_lease_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  lease_id     uuid not null references public.rental_leases(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists rental_lease_documents_lease_idx
  on public.rental_lease_documents (lease_id, created_at);

-- ─── rental_charges (the ledger) ─────────────────────────────────────────────
create table if not exists public.rental_charges (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  lease_id     uuid not null references public.rental_leases(id) on delete cascade,
  property_id  uuid not null references public.rental_properties(id) on delete cascade,
  period_start date not null,           -- canonical YYYY-MM-01 of the charged month
  due_date     date not null,           -- due_day clamped to the month's length
  amount       numeric(12,2) not null,  -- snapshot of monthly_rent at generation
  kind         text not null default 'rent' check (kind in ('rent','late_fee','other')),
  note         text,
  created_at   timestamptz not null default now(),
  unique (lease_id, period_start)       -- idempotency anchor for lazy generation
);

create index if not exists rental_charges_biz_period_idx
  on public.rental_charges (business_id, period_start);
create index if not exists rental_charges_property_idx
  on public.rental_charges (property_id, period_start);

create table if not exists public.rental_payments (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  charge_id      uuid not null references public.rental_charges(id) on delete cascade,
  lease_id       uuid not null references public.rental_leases(id) on delete cascade,
  amount         numeric(12,2) not null,
  method         text,                  -- free text: efectivo, cheque #1024, Zelle…
  paid_on        date not null default current_date,
  photo_path     text,                  -- check photo; storage cleanup is app-side
  photo_rotation integer not null default 0,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists rental_payments_charge_idx
  on public.rental_payments (charge_id);
create index if not exists rental_payments_lease_idx
  on public.rental_payments (lease_id);
create index if not exists rental_payments_biz_paid_idx
  on public.rental_payments (business_id, paid_on);

-- ─── rental_maintenance (+ photos) ───────────────────────────────────────────
create table if not exists public.rental_maintenance (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  property_id  uuid not null references public.rental_properties(id) on delete cascade,
  title        text not null,
  description  text,
  status       text not null default 'open' check (status in ('open','in_progress','done')),
  reported_on  date not null default current_date,
  completed_on date,
  cost         numeric(12,2),
  fixed_by     text,                    -- free text ("Plomería García")
  employee_id  uuid references public.employees(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists rental_maintenance_prop_idx
  on public.rental_maintenance (property_id, status, reported_on);

create table if not exists public.rental_maintenance_photos (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  maintenance_id uuid not null references public.rental_maintenance(id) on delete cascade,
  storage_path   text not null,
  rotation       integer not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists rental_maintenance_photos_idx
  on public.rental_maintenance_photos (maintenance_id, created_at);

-- ─── rental_expenses ─────────────────────────────────────────────────────────
create table if not exists public.rental_expenses (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  property_id      uuid not null references public.rental_properties(id) on delete cascade,
  expense_date     date not null default current_date,
  amount           numeric(12,2) not null,
  category         text not null default 'other' check (category in
    ('repairs','utilities','property_tax','insurance','mortgage','hoa','management','other')),
  vendor           text,
  note             text,
  receipt_path     text,                -- receipt photo; storage cleanup is app-side
  receipt_rotation integer not null default 0,
  maintenance_id   uuid references public.rental_maintenance(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists rental_expenses_prop_date_idx
  on public.rental_expenses (property_id, expense_date);
create index if not exists rental_expenses_biz_date_idx
  on public.rental_expenses (business_id, expense_date);

-- ─── updated_at triggers (045 equipment convention) ──────────────────────────
create or replace function public.set_updated_at_rentals()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rental_properties_set_updated_at on public.rental_properties;
create trigger rental_properties_set_updated_at
  before update on public.rental_properties
  for each row execute function public.set_updated_at_rentals();

drop trigger if exists rental_tenants_set_updated_at on public.rental_tenants;
create trigger rental_tenants_set_updated_at
  before update on public.rental_tenants
  for each row execute function public.set_updated_at_rentals();

drop trigger if exists rental_leases_set_updated_at on public.rental_leases;
create trigger rental_leases_set_updated_at
  before update on public.rental_leases
  for each row execute function public.set_updated_at_rentals();

drop trigger if exists rental_maintenance_set_updated_at on public.rental_maintenance;
create trigger rental_maintenance_set_updated_at
  before update on public.rental_maintenance
  for each row execute function public.set_updated_at_rentals();

-- ─── default_role_permissions(): add the 'rentals' resource ──────────────────
-- Copy of the 164 version + "rentals" mirroring "equipment" per role. Must stay
-- synced with DEFAULT_ROLE_PERMISSIONS in shared/src/lib/permissions.ts.
-- member_res/member_view (181 versions) fall back to these defaults when a
-- customized role's snapshot lacks the key — no backfill needed.
create or replace function public.default_role_permissions(role text)
returns jsonb language sql immutable as $$
  select case role
    when 'owner' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"equipment":{"view":"all","create":true,"edit":true,"delete":true},"rentals":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'admin' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":true},"jobs":{"view":"all","create":true,"edit":true,"delete":true},"invoices":{"view":"all","create":true,"edit":true,"delete":true},"employees":{"view":"all","create":true,"edit":true,"delete":true},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"equipment":{"view":"all","create":true,"edit":true,"delete":true},"rentals":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'manager' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"all","create":true,"edit":true,"delete":false},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"equipment":{"view":"all","create":true,"edit":true,"delete":true},"rentals":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'office' then
      '{"resources":{"clients":{"view":"all","create":true,"edit":true,"delete":false},"jobs":{"view":"all","create":true,"edit":true,"delete":false},"invoices":{"view":"all","create":true,"edit":true,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"all","create":true,"edit":true,"delete":true},"inventory":{"view":"all","create":true,"edit":true,"delete":true},"equipment":{"view":"all","create":true,"edit":true,"delete":true},"rentals":{"view":"all","create":true,"edit":true,"delete":true},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'field' then
      '{"resources":{"clients":{"view":"assigned","create":false,"edit":false,"delete":false},"jobs":{"view":"assigned","create":true,"edit":true,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"none","create":false,"edit":false,"delete":false},"inventory":{"view":"none","create":false,"edit":false,"delete":false},"equipment":{"view":"none","create":false,"edit":false,"delete":false},"rentals":{"view":"none","create":false,"edit":false,"delete":false},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
    when 'viewer' then
      '{"resources":{"clients":{"view":"all","create":false,"edit":false,"delete":false},"jobs":{"view":"all","create":false,"edit":false,"delete":false},"invoices":{"view":"all","create":false,"edit":false,"delete":false},"employees":{"view":"all","create":false,"edit":false,"delete":false},"calendar":{"view":"all","create":false,"edit":false,"delete":false},"inventory":{"view":"all","create":false,"edit":false,"delete":false},"equipment":{"view":"all","create":false,"edit":false,"delete":false},"rentals":{"view":"all","create":false,"edit":false,"delete":false},"reports":{"view":"all","create":false,"edit":false,"delete":false}}}'::jsonb
    else
      '{"resources":{"clients":{"view":"none","create":false,"edit":false,"delete":false},"jobs":{"view":"none","create":false,"edit":false,"delete":false},"invoices":{"view":"none","create":false,"edit":false,"delete":false},"employees":{"view":"none","create":false,"edit":false,"delete":false},"calendar":{"view":"none","create":false,"edit":false,"delete":false},"inventory":{"view":"none","create":false,"edit":false,"delete":false},"equipment":{"view":"none","create":false,"edit":false,"delete":false},"rentals":{"view":"none","create":false,"edit":false,"delete":false},"reports":{"view":"none","create":false,"edit":false,"delete":false}}}'::jsonb
  end;
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.rental_properties         enable row level security;
alter table public.rental_property_photos    enable row level security;
alter table public.rental_tenants            enable row level security;
alter table public.rental_leases             enable row level security;
alter table public.rental_lease_documents    enable row level security;
alter table public.rental_charges            enable row level security;
alter table public.rental_payments           enable row level security;
alter table public.rental_maintenance        enable row level security;
alter table public.rental_maintenance_photos enable row level security;
alter table public.rental_expenses           enable row level security;

-- Reads: initplan form (181) — my_view_businesses evaluated once per query.
-- 'rentals' has no 'assigned' scope, so the 'all' arm is the whole policy.
drop policy if exists "rental_properties read" on public.rental_properties;
create policy "rental_properties read" on public.rental_properties for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_property_photos read" on public.rental_property_photos;
create policy "rental_property_photos read" on public.rental_property_photos for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_tenants read" on public.rental_tenants;
create policy "rental_tenants read" on public.rental_tenants for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_leases read" on public.rental_leases;
create policy "rental_leases read" on public.rental_leases for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_lease_documents read" on public.rental_lease_documents;
create policy "rental_lease_documents read" on public.rental_lease_documents for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_charges read" on public.rental_charges;
create policy "rental_charges read" on public.rental_charges for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_payments read" on public.rental_payments;
create policy "rental_payments read" on public.rental_payments for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_maintenance read" on public.rental_maintenance;
create policy "rental_maintenance read" on public.rental_maintenance for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_maintenance_photos read" on public.rental_maintenance_photos;
create policy "rental_maintenance_photos read" on public.rental_maintenance_photos for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));
drop policy if exists "rental_expenses read" on public.rental_expenses;
create policy "rental_expenses read" on public.rental_expenses for select
  using (business_id in (select public.my_view_businesses('rentals', 'all')));

-- Writes: direct member_res per sibling convention (single-row; 191 documents
-- that the 181 initplan rewrite deliberately covered read policies only).
-- Primary entities → create/edit/delete map 1:1.
drop policy if exists "rental_properties insert" on public.rental_properties;
create policy "rental_properties insert" on public.rental_properties for insert
  with check (public.member_res(business_id, 'rentals', 'create'));
drop policy if exists "rental_properties update" on public.rental_properties;
create policy "rental_properties update" on public.rental_properties for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_properties delete" on public.rental_properties;
create policy "rental_properties delete" on public.rental_properties for delete
  using (public.member_res(business_id, 'rentals', 'delete'));

drop policy if exists "rental_tenants insert" on public.rental_tenants;
create policy "rental_tenants insert" on public.rental_tenants for insert
  with check (public.member_res(business_id, 'rentals', 'create'));
drop policy if exists "rental_tenants update" on public.rental_tenants;
create policy "rental_tenants update" on public.rental_tenants for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_tenants delete" on public.rental_tenants;
create policy "rental_tenants delete" on public.rental_tenants for delete
  using (public.member_res(business_id, 'rentals', 'delete'));

drop policy if exists "rental_leases insert" on public.rental_leases;
create policy "rental_leases insert" on public.rental_leases for insert
  with check (public.member_res(business_id, 'rentals', 'create'));
drop policy if exists "rental_leases update" on public.rental_leases;
create policy "rental_leases update" on public.rental_leases for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_leases delete" on public.rental_leases;
create policy "rental_leases delete" on public.rental_leases for delete
  using (public.member_res(business_id, 'rentals', 'delete'));

drop policy if exists "rental_maintenance insert" on public.rental_maintenance;
create policy "rental_maintenance insert" on public.rental_maintenance for insert
  with check (public.member_res(business_id, 'rentals', 'create'));
drop policy if exists "rental_maintenance update" on public.rental_maintenance;
create policy "rental_maintenance update" on public.rental_maintenance for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_maintenance delete" on public.rental_maintenance;
create policy "rental_maintenance delete" on public.rental_maintenance for delete
  using (public.member_res(business_id, 'rentals', 'delete'));

drop policy if exists "rental_expenses insert" on public.rental_expenses;
create policy "rental_expenses insert" on public.rental_expenses for insert
  with check (public.member_res(business_id, 'rentals', 'create'));
drop policy if exists "rental_expenses update" on public.rental_expenses;
create policy "rental_expenses update" on public.rental_expenses for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_expenses delete" on public.rental_expenses;
create policy "rental_expenses delete" on public.rental_expenses for delete
  using (public.member_res(business_id, 'rentals', 'delete'));

-- Satellites (photos ×2, lease docs, charges, payments): every write is an
-- edit of the parent's state → 'rentals','edit' (mirrors equipment_photos and
-- invoice_payments keying on the parent's edit).
drop policy if exists "rental_property_photos insert" on public.rental_property_photos;
create policy "rental_property_photos insert" on public.rental_property_photos for insert
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_property_photos update" on public.rental_property_photos;
create policy "rental_property_photos update" on public.rental_property_photos for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_property_photos delete" on public.rental_property_photos;
create policy "rental_property_photos delete" on public.rental_property_photos for delete
  using (public.member_res(business_id, 'rentals', 'edit'));

drop policy if exists "rental_lease_documents insert" on public.rental_lease_documents;
create policy "rental_lease_documents insert" on public.rental_lease_documents for insert
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_lease_documents update" on public.rental_lease_documents;
create policy "rental_lease_documents update" on public.rental_lease_documents for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_lease_documents delete" on public.rental_lease_documents;
create policy "rental_lease_documents delete" on public.rental_lease_documents for delete
  using (public.member_res(business_id, 'rentals', 'edit'));

drop policy if exists "rental_charges insert" on public.rental_charges;
create policy "rental_charges insert" on public.rental_charges for insert
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_charges update" on public.rental_charges;
create policy "rental_charges update" on public.rental_charges for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_charges delete" on public.rental_charges;
create policy "rental_charges delete" on public.rental_charges for delete
  using (public.member_res(business_id, 'rentals', 'edit'));

drop policy if exists "rental_payments insert" on public.rental_payments;
create policy "rental_payments insert" on public.rental_payments for insert
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_payments update" on public.rental_payments;
create policy "rental_payments update" on public.rental_payments for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_payments delete" on public.rental_payments;
create policy "rental_payments delete" on public.rental_payments for delete
  using (public.member_res(business_id, 'rentals', 'edit'));

drop policy if exists "rental_maintenance_photos insert" on public.rental_maintenance_photos;
create policy "rental_maintenance_photos insert" on public.rental_maintenance_photos for insert
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_maintenance_photos update" on public.rental_maintenance_photos;
create policy "rental_maintenance_photos update" on public.rental_maintenance_photos for update
  using (public.member_res(business_id, 'rentals', 'edit'))
  with check (public.member_res(business_id, 'rentals', 'edit'));
drop policy if exists "rental_maintenance_photos delete" on public.rental_maintenance_photos;
create policy "rental_maintenance_photos delete" on public.rental_maintenance_photos for delete
  using (public.member_res(business_id, 'rentals', 'edit'));

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select public.default_role_permissions('office') #> '{resources,rentals}';
--   -- expect: {"view":"all","create":true,"edit":true,"delete":true}
--   select tablename, count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'rental_%'
--   group by tablename order by tablename;
--   -- expect 4 policies per table

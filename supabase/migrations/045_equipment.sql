-- 045_equipment.sql
-- Equipment module: tracks the business's vehicles and machinery
-- (trucks, cars, skid loaders, semis, trailers, generators, etc.) with
-- title/registration info, mileage, plate, loan status, and the
-- employee currently assigned to operate it. Photos live in a separate
-- table so we can attach many per piece of equipment without bloating
-- the row.
--
-- Maintenance records (oil changes, services, etc.) are a follow-up
-- migration — this one keeps the surface area small.
--
-- Storage: photos are uploaded to the existing `business-assets`
-- bucket at path:
--   equipment/<business_id>/<equipment_id>/<uuid>.<ext>
-- equipment_photos.storage_path tracks the path inside the bucket.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Add-if-not-
-- exists, safe to re-run.

-- ─── 1. equipment table ───────────────────────────────────────────────────
create table if not exists public.equipment (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,

  -- User-facing display name ("Truck #1", "Skid Loader — Bobcat").
  name                  text not null,

  -- Free-text category so we can cover farm/construction/transport
  -- vehicles without an exhaustive enum. The UI will suggest common
  -- values but let the user type anything.
  equipment_type        text,

  -- Make / model / year — standard vehicle identification.
  make                  text,
  model                 text,
  year                  integer,
  vin                   text,
  mileage               integer,

  -- License plate + when it expires (drives a "renew soon" reminder
  -- later if we add notifications).
  plate_number          text,
  plate_expiration      date,

  -- Ownership status. paid_off = true when we own it outright; if
  -- false, loan_lender is the bank / dealer / individual we owe.
  paid_off              boolean not null default false,
  loan_lender           text,

  -- Operator currently assigned. Nullable so unassigned equipment is
  -- valid (shop trucks, spares).
  assigned_employee_id  uuid references public.employees(id) on delete set null,

  -- Free-form notes from the office.
  notes                 text,

  -- Bookkeeping.
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists equipment_business_id_idx
  on public.equipment (business_id);
create index if not exists equipment_assigned_employee_id_idx
  on public.equipment (assigned_employee_id);
-- Plate-expiration lookups for the renewal reminder we'll add later.
create index if not exists equipment_plate_expiration_idx
  on public.equipment (business_id, plate_expiration)
  where plate_expiration is not null;

-- ─── 2. equipment_photos table ────────────────────────────────────────────
-- One row per attached photo. storage_path is the canonical key into
-- the `business-assets` bucket; the URL is rebuilt at read time so we
-- can swap private/public bucket strategies without a data migration.
create table if not exists public.equipment_photos (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  equipment_id          uuid not null references public.equipment(id) on delete cascade,

  storage_path          text not null,
  -- Optional caption / "primary photo" flag if we ever pin a hero
  -- image — kept minimal for now.
  sort_order            integer not null default 0,

  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists equipment_photos_equipment_id_idx
  on public.equipment_photos (equipment_id, sort_order);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────
alter table public.equipment        enable row level security;
alter table public.equipment_photos enable row level security;

-- equipment: anyone in the business with at least 'viewer' role can read;
-- writes are restricted to office+ writers (owner/admin/manager/office).
-- We piggy-back on the same helpers used by clients / jobs.
create policy "members read equipment" on public.equipment for select
  using (public.is_business_member(business_id));

create policy "writers insert equipment" on public.equipment for insert
  with check (public.can_write_business(business_id));

create policy "writers update equipment" on public.equipment for update
  using (public.can_write_business(business_id));

create policy "admins delete equipment" on public.equipment for delete
  using (public.is_business_admin(business_id));

-- equipment_photos: same read access as the parent equipment, writes
-- limited to writers. Cascade delete from equipment cleans up rows;
-- the storage objects themselves still need to be deleted in the app.
create policy "members read equipment photos" on public.equipment_photos for select
  using (public.is_business_member(business_id));

create policy "writers insert equipment photos" on public.equipment_photos for insert
  with check (public.can_write_business(business_id));

create policy "writers update equipment photos" on public.equipment_photos for update
  using (public.can_write_business(business_id));

create policy "writers delete equipment photos" on public.equipment_photos for delete
  using (public.can_write_business(business_id));

-- ─── 4. updated_at trigger ────────────────────────────────────────────────
create or replace function public.set_updated_at_equipment()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists equipment_set_updated_at on public.equipment;
create trigger equipment_set_updated_at
  before update on public.equipment
  for each row execute function public.set_updated_at_equipment();

-- ─── 5. Storage bucket policies for equipment/ subpath ────────────────────
-- The `business-assets` bucket already exists (logos use it). Add row-
-- level policies so authenticated business members can read/write
-- photos under their own business's equipment/ subpath only.
--
-- Storage path convention:
--   equipment/<business_id>/<equipment_id>/<uuid>.<ext>
-- The first path segment after `equipment/` is the business_id; we
-- gate access by checking the caller's membership in that business.
--
-- (split_part(name, '/', 2) returns the business_id segment.)

do $$
begin
  -- Only create policies if the bucket exists. Logos onboarding step
  -- creates it implicitly on first upload; if it's missing the
  -- policies will create themselves on next run.
  if exists (select 1 from storage.buckets where id = 'business-assets') then
    -- Read: any member of the owning business.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'equipment_photos_select'
    ) then
      create policy "equipment_photos_select" on storage.objects for select
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'equipment'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;

    -- Write/update/delete: business writers only.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'equipment_photos_insert'
    ) then
      create policy "equipment_photos_insert" on storage.objects for insert
        with check (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'equipment'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'equipment_photos_update'
    ) then
      create policy "equipment_photos_update" on storage.objects for update
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'equipment'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'equipment_photos_delete'
    ) then
      create policy "equipment_photos_delete" on storage.objects for delete
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'equipment'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end$$;

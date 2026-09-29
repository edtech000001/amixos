-- 053_files_module.sql
-- Files module: a company document library the way crews actually use it —
-- Categories → Sections → Entries. An entry is EITHER an uploaded file
-- (lives in the existing `business-assets` bucket) OR a pasted external link
-- (Drive/Dropbox/YouTube/etc. — just a labeled URL, no OAuth). This keeps
-- access control inside Amixos (our roles/RLS) while letting big media live
-- wherever it already does.
--
-- Visibility: a category is either crew_visible (every member sees it, incl.
-- field crews) or office-only (writers only). Sections/entries inherit the
-- parent category's visibility via the RLS EXISTS check, so there's a single
-- source of truth.
--
-- Storage path convention (mirrors equipment/ in 045):
--   files/<business_id>/<uuid>/<filename>
-- (storage.foldername(name))[1] = 'files', [2] = business_id.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Add-if-not-exists,
-- safe to re-run.

-- ─── 1. Tables ─────────────────────────────────────────────────────────────
create table if not exists public.file_categories (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  -- Optional lucide icon name + accent color for the category card.
  icon          text,
  color         text,
  -- When true, field crews / viewers see this category. When false it's
  -- office-only (writers). Defaults true since the common case is "manuals
  -- my crew can read".
  crew_visible  boolean not null default true,
  sort_order    integer not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- file_sections is superseded by file_folders (migration 054). Everything
-- section-specific below is wrapped so that once 054 has run (file_folders
-- exists), re-running 053 is a clean no-op instead of erroring on the dropped
-- table / column or clobbering 054's rewritten file_entries policy.
do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'file_folders'
  ) then
    create table if not exists public.file_sections (
      id            uuid primary key default gen_random_uuid(),
      business_id   uuid not null references public.businesses(id) on delete cascade,
      category_id   uuid not null references public.file_categories(id) on delete cascade,
      name          text not null,
      sort_order    integer not null default 0,
      created_at    timestamptz not null default now()
    );
  end if;
end $$;

create table if not exists public.file_entries (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  section_id    uuid not null references public.file_sections(id) on delete cascade,
  title         text not null,
  -- 'file' → stored in the bucket (storage_path); 'link' → external url.
  kind          text not null default 'file' check (kind in ('file', 'link')),
  storage_path  text,
  file_name     text,
  file_size     bigint,
  mime_type     text,
  url           text,
  sort_order    integer not null default 0,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists file_categories_business_idx
  on public.file_categories (business_id, sort_order);
do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'file_folders'
  ) then
    create index if not exists file_sections_category_idx on public.file_sections (category_id, sort_order);
    create index if not exists file_entries_section_idx on public.file_entries (section_id, sort_order);
  end if;
end $$;

-- ─── 2. RLS ─────────────────────────────────────────────────────────────────
alter table public.file_categories enable row level security;
alter table public.file_entries    enable row level security;
do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'file_folders'
  ) then
    execute 'alter table public.file_sections enable row level security';
  end if;
end $$;

-- NOTE: `create policy` has no IF NOT EXISTS, so each is preceded by a
-- `drop policy if exists` to keep this migration re-runnable (re-running an
-- already-applied file otherwise errors on the first existing policy).

-- Categories: members read crew-visible ones; writers read all. Writes =
-- business writers (owner/admin/manager/office).
drop policy if exists "members read file_categories" on public.file_categories;
create policy "members read file_categories" on public.file_categories for select
  using (
    public.is_business_member(business_id)
    and (crew_visible or public.can_write_business(business_id))
  );
drop policy if exists "writers insert file_categories" on public.file_categories;
create policy "writers insert file_categories" on public.file_categories for insert
  with check (public.can_write_business(business_id));
drop policy if exists "writers update file_categories" on public.file_categories;
create policy "writers update file_categories" on public.file_categories for update
  using (public.can_write_business(business_id));
drop policy if exists "writers delete file_categories" on public.file_categories;
create policy "writers delete file_categories" on public.file_categories for delete
  using (public.can_write_business(business_id));

-- Sections + entries inherit the parent category's visibility via EXISTS so
-- a field worker can't read rows under an office-only category by querying
-- the child tables directly. Skipped once 054 has run (file_folders exists):
-- file_sections is gone, and 054 owns the file_entries read policy.
do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'file_folders'
  ) then
    drop policy if exists "members read file_sections" on public.file_sections;
    create policy "members read file_sections" on public.file_sections for select
      using (
        public.is_business_member(business_id)
        and exists (
          select 1 from public.file_categories c
          where c.id = category_id
            and (c.crew_visible or public.can_write_business(c.business_id))
        )
      );
    drop policy if exists "writers insert file_sections" on public.file_sections;
    create policy "writers insert file_sections" on public.file_sections for insert
      with check (public.can_write_business(business_id));
    drop policy if exists "writers update file_sections" on public.file_sections;
    create policy "writers update file_sections" on public.file_sections for update
      using (public.can_write_business(business_id));
    drop policy if exists "writers delete file_sections" on public.file_sections;
    create policy "writers delete file_sections" on public.file_sections for delete
      using (public.can_write_business(business_id));

    drop policy if exists "members read file_entries" on public.file_entries;
    create policy "members read file_entries" on public.file_entries for select
      using (
        public.is_business_member(business_id)
        and exists (
          select 1
          from public.file_sections s
          join public.file_categories c on c.id = s.category_id
          where s.id = section_id
            and (c.crew_visible or public.can_write_business(c.business_id))
        )
      );
  end if;
end $$;

drop policy if exists "writers insert file_entries" on public.file_entries;
create policy "writers insert file_entries" on public.file_entries for insert
  with check (public.can_write_business(business_id));
drop policy if exists "writers update file_entries" on public.file_entries;
create policy "writers update file_entries" on public.file_entries for update
  using (public.can_write_business(business_id));
drop policy if exists "writers delete file_entries" on public.file_entries;
create policy "writers delete file_entries" on public.file_entries for delete
  using (public.can_write_business(business_id));

-- ─── 3. updated_at trigger on categories ─────────────────────────────────────
create or replace function public.set_updated_at_file_categories()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists file_categories_set_updated_at on public.file_categories;
create trigger file_categories_set_updated_at
  before update on public.file_categories
  for each row execute function public.set_updated_at_file_categories();

-- ─── 4. Storage orphan cleanup ────────────────────────────────────────────────
-- Mirror the job_photos (051) / equipment_photos (052) trigger: when a
-- file entry is deleted (single delete OR cascade from section/category/
-- business), remove its object from the bucket so files don't pile up.
-- Only file-kind entries have a storage_path; link entries are a no-op.
create or replace function public.delete_file_entry_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if old.storage_path is not null then
    delete from storage.objects
    where bucket_id = 'business-assets'
      and name = old.storage_path;
  end if;
  return old;
end;
$$;

drop trigger if exists file_entries_delete_object on public.file_entries;
create trigger file_entries_delete_object
  after delete on public.file_entries
  for each row execute function public.delete_file_entry_object();

-- ─── 5. Storage bucket policies for the files/ subpath ────────────────────────
-- Members of the owning business can read; writers can write. Mirrors the
-- equipment_photos policies in 045.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'business-assets') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'files_select'
    ) then
      create policy "files_select" on storage.objects for select
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'files'
          and public.is_business_member(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'files_insert'
    ) then
      create policy "files_insert" on storage.objects for insert
        with check (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'files'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'files_update'
    ) then
      create policy "files_update" on storage.objects for update
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'files'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'files_delete'
    ) then
      create policy "files_delete" on storage.objects for delete
        using (
          bucket_id = 'business-assets'
          and (storage.foldername(name))[1] = 'files'
          and public.can_write_business(((storage.foldername(name))[2])::uuid)
        );
    end if;
  end if;
end$$;

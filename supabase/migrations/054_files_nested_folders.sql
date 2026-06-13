-- 054_files_nested_folders.sql
-- Evolve the Files module from fixed Category → Section → Entry into a
-- Google-Drive-style tree: top-level folders (the old `file_categories`,
-- which still carry the Team/Office visibility default) containing
-- arbitrarily-nested folders, with files living at any level.
--
-- Visibility model (confirmed with the user):
--   • Top-level folder (file_categories.crew_visible) sets the default for
--     everything nested inside — inherited, NOT per-folder.
--   • Any individual FILE can override its own visibility
--     (file_entries.crew_visible: NULL = inherit the top-level default,
--      true = Team, false = Office) — like Drive's per-item sharing.
--   Keeping the override on files (not folders) means access checks stay a
--   single join to file_categories — no recursive folder walk needed.
--
-- This supersedes file_sections from 053. We migrate each section into a
-- root-level file_folders row (reusing the same id so file_entries.section_id
-- maps 1:1 to folder_id), then drop section_id + the file_sections table.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to
-- re-run (the section migration is skipped once file_sections is gone).

-- ─── 1. Nestable folders ──────────────────────────────────────────────────
create table if not exists public.file_folders (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  -- Top-level folder this belongs to (the visibility root). Every folder,
  -- however deep, carries its category_id so RLS is a single join.
  category_id       uuid not null references public.file_categories(id) on delete cascade,
  -- NULL = a root folder directly under the category; otherwise nests inside
  -- another folder. Self-cascade so deleting a folder removes its subtree.
  parent_folder_id  uuid references public.file_folders(id) on delete cascade,
  name              text not null,
  sort_order        integer not null default 0,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists file_folders_category_idx
  on public.file_folders (category_id, parent_folder_id, sort_order);
create index if not exists file_folders_parent_idx
  on public.file_folders (parent_folder_id);

-- ─── 2. file_entries gains folder placement + per-file visibility ─────────
alter table public.file_entries
  add column if not exists category_id  uuid references public.file_categories(id) on delete cascade,
  add column if not exists folder_id    uuid references public.file_folders(id) on delete cascade,
  -- NULL = inherit the category default; true = Team; false = Office.
  add column if not exists crew_visible boolean;

create index if not exists file_entries_folder_idx
  on public.file_entries (category_id, folder_id, sort_order);

-- ─── 3. Migrate file_sections → root file_folders, repoint entries ─────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'file_sections'
  ) then
    -- Reuse the section id as the folder id → entries.section_id == folder_id.
    insert into public.file_folders (id, business_id, category_id, name, sort_order, created_at)
      select id, business_id, category_id, name, sort_order, created_at
      from public.file_sections
      on conflict (id) do nothing;

    update public.file_entries e
      set folder_id   = e.section_id,
          category_id = f.category_id
      from public.file_folders f
      where e.section_id = f.id
        and e.folder_id is null;
  end if;
end$$;

-- Drop the old section linkage. Removing the column first detaches the FK so
-- dropping file_sections can't cascade-delete file_entries.
-- The old "members read file_entries" policy (from 053) references section_id,
-- so it must be dropped BEFORE the column (Postgres won't drop a column a
-- policy depends on). Section 4 recreates the policy on the new columns.
drop policy if exists "members read file_entries" on public.file_entries;
alter table public.file_entries drop column if exists section_id;
drop table if exists public.file_sections cascade;

-- ─── 4. RLS — folders + rewritten entry visibility ─────────────────────────
alter table public.file_folders enable row level security;

-- Folders: visible when the owning top-level folder (category) is crew-visible,
-- or to writers. Writes = business writers.
create policy "members read file_folders" on public.file_folders for select
  using (
    public.is_business_member(business_id)
    and (
      public.can_write_business(business_id)
      or exists (
        select 1 from public.file_categories c
        where c.id = category_id and c.crew_visible
      )
    )
  );
create policy "writers insert file_folders" on public.file_folders for insert
  with check (public.can_write_business(business_id));
create policy "writers update file_folders" on public.file_folders for update
  using (public.can_write_business(business_id));
create policy "writers delete file_folders" on public.file_folders for delete
  using (public.can_write_business(business_id));

-- file_entries SELECT: replace the old section-join policy. A file is visible
-- to crews when its effective visibility resolves to true —
-- coalesce(file override, category default) — or to writers always.
drop policy if exists "members read file_entries" on public.file_entries;
create policy "members read file_entries" on public.file_entries for select
  using (
    public.is_business_member(business_id)
    and (
      public.can_write_business(business_id)
      or coalesce(
           crew_visible,
           (select c.crew_visible from public.file_categories c where c.id = category_id)
         )
    )
  );
-- insert/update/delete policies from 053 already gate on can_write_business
-- and don't reference section_id, so they carry over unchanged.

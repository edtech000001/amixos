-- Clone the Archivos (files) module from one business to another.
--
-- NOT a migration — an admin tool, run by hand in the SQL Editor.
--
-- Clones categories → nested folders → file entries (structure + metadata).
-- 'link' entries work immediately; uploaded 'file' entries also need the
-- storage copy step (separate Node script — SQL cannot move file bytes).
--
-- THIS IS A MIRROR, NOT A MERGE. The target's files module is DELETED and
-- rebuilt from the source every time, so the two always match and the script is
-- safe to re-run as often as you like.
--
-- WHY IT CHANGED: the first version only ever INSERTed — no delete, no
-- uniqueness check, no ON CONFLICT — so a second run silently produced a
-- complete second copy of every category, folder and entry.

-- create-or-replace matches on SIGNATURE, so a differently-shaped older version
-- would survive as a second overload and calls could bind to either. Drop the
-- 3-arg shape explicitly; harmless if it was never created.
drop function if exists public.clone_files_module(uuid, uuid, boolean);

create or replace function public.clone_files_module(p_source uuid, p_target uuid)
returns text
language plpgsql
as $$
declare
  cat_map  jsonb := '{}'::jsonb;   -- old category id -> new
  fold_map jsonb := '{}'::jsonb;   -- old folder id   -> new
  r record;
  n_cat int := 0; n_fold int := 0; n_entry int := 0;
  n_existing int := 0; n_deleted int := 0;
begin
  if p_source = p_target then raise exception 'source and target must differ'; end if;

  -- ── Wipe the target first ─────────────────────────────────────────────────
  -- Unconditional: these businesses are meant to carry the same documents, so
  -- the target is a copy of the source, never a merge with it. This is what
  -- makes re-running safe — without it each run stacked another full copy.
  select count(*) into n_existing
  from public.file_categories where business_id = p_target;

  -- Entries whose category_id is null are not reachable by the cascade below,
  -- so clear them explicitly first.
  delete from public.file_entries
  where business_id = p_target and category_id is null;
  get diagnostics n_deleted = row_count;

  -- file_folders.category_id and file_entries.category_id both cascade from
  -- file_categories, and folders self-cascade through parent_folder_id, so this
  -- one delete takes the whole tree with it.
  delete from public.file_categories where business_id = p_target;

  -- NOTE: database rows only. Objects already uploaded to the storage bucket
  -- are left behind as orphans; the storage copy script owns those.
  raise notice 'Cleared target files module: % categories + % uncategorized entries', n_existing, n_deleted;

  -- ── 1) Categories ─────────────────────────────────────────────────────────
  for r in select * from public.file_categories where business_id = p_source order by sort_order loop
    declare nid uuid := gen_random_uuid();
    begin
      insert into public.file_categories (id, business_id, name, icon, color, crew_visible, cover_path, sort_order, created_at, updated_at)
      values (nid, p_target, r.name, r.icon, r.color, r.crew_visible, r.cover_path, r.sort_order, now(), now());
      cat_map := cat_map || jsonb_build_object(r.id::text, nid::text);
      n_cat := n_cat + 1;
    end;
  end loop;

  -- ── 2a) Pre-map every folder id so parent_folder_id resolves regardless of order
  for r in select id from public.file_folders where business_id = p_source loop
    fold_map := fold_map || jsonb_build_object(r.id::text, gen_random_uuid()::text);
  end loop;

  -- ── 2b) Insert folders (remap category_id + parent_folder_id) ─────────────
  for r in select * from public.file_folders where business_id = p_source order by sort_order loop
    insert into public.file_folders (id, business_id, category_id, parent_folder_id, name, cover_path, sort_order, created_at)
    values (
      (fold_map ->> r.id::text)::uuid,
      p_target,
      (cat_map ->> r.category_id::text)::uuid,
      case when r.parent_folder_id is null then null else (fold_map ->> r.parent_folder_id::text)::uuid end,
      r.name, r.cover_path, r.sort_order, now()
    );
    n_fold := n_fold + 1;
  end loop;

  -- ── 3) Entries (remap category/folder; rewrite storage_path prefix) ───────
  for r in select * from public.file_entries where business_id = p_source loop
    insert into public.file_entries (id, business_id, category_id, folder_id, title, kind,
      storage_path, file_name, file_size, mime_type, url, crew_visible, sort_order, created_at)
    values (
      gen_random_uuid(), p_target,
      case when r.category_id is null then null else (cat_map ->> r.category_id::text)::uuid end,
      case when r.folder_id   is null then null else (fold_map ->> r.folder_id::text)::uuid end,
      r.title, r.kind,
      case when r.storage_path is null then null
           else replace(r.storage_path, 'files/'||p_source::text||'/', 'files/'||p_target::text||'/') end,
      r.file_name, r.file_size, r.mime_type, r.url, r.crew_visible, r.sort_order, now()
    );
    -- thumbnail_path is deliberately NOT copied: it points at the source's
    -- rendered image. The target re-renders its own once the bytes are copied.
    n_entry := n_entry + 1;
  end loop;

  return format('Mirrored %s categories, %s folders, %s entries  (%s -> %s), replacing %s existing categories',
                n_cat, n_fold, n_entry, p_source, p_target, n_existing);
end;
$$;


-- ── Run it. Safe to repeat — each run wipes and rebuilds the target. ─────────
-- Also the fix for the duplicates the old version already created.

select public.clone_files_module(
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae',
  'd0f73474-b503-41d5-a33f-8a95fff94c17'
);

select public.clone_files_module(
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae',
  '27e313fa-fd2f-44e8-b47d-31041a16b09f'
);


-- ── Verify: each target should now match the source exactly ──────────────────
-- select business_id, count(*) as entries
-- from public.file_entries
-- where business_id in (
--   '47c79845-eb2b-498a-8eb1-94dbac56a5ae',
--   'd0f73474-b503-41d5-a33f-8a95fff94c17',
--   '27e313fa-fd2f-44e8-b47d-31041a16b09f'
-- )
-- group by business_id;

-- 212 — First-page thumbnails for stored files
--
-- Drive-style grid view needs a preview image per file. Supabase Storage can
-- transform images but cannot rasterize a PDF, so the render happens once in
-- api/ (poppler's pdftoppm) and the result is written back to the same private
-- bucket. These columns are the cache: once thumbnail_path is set the image is
-- never regenerated, and every later view is a plain signed-URL fetch.

alter table public.file_entries
  add column if not exists thumbnail_path text;

-- Lets a client tell "not rendered yet" from "will never render", so the grid
-- can show a spinner for the first and a type icon for the second — and so the
-- backfill has a work queue it can drain without retrying hopeless rows.
--   pending     — queued or in flight
--   ready       — thumbnail_path is populated
--   failed      — render errored (encrypted, corrupt, out of memory); retryable
--   unsupported — nothing to render (links, .docx, .zip); terminal
alter table public.file_entries
  add column if not exists thumbnail_status text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'file_entries_thumbnail_status_check'
  ) then
    alter table public.file_entries
      add constraint file_entries_thumbnail_status_check
      check (thumbnail_status is null or thumbnail_status in ('pending', 'ready', 'failed', 'unsupported'));
  end if;
end $$;

-- The backfill's work queue: rows that could have a thumbnail but don't yet.
-- Partial, so it stays tiny once the backlog drains — the steady state is zero
-- matching rows, not one per file.
create index if not exists file_entries_thumbnail_pending_idx
  on public.file_entries (business_id)
  where thumbnail_path is null
    and kind = 'file'
    and (thumbnail_status is null or thumbnail_status = 'pending');

-- NOTE: no RLS changes. Thumbnails live in the same bucket and under the same
-- path prefix as the file they came from, so the existing storage policies and
-- the file_entries policies already cover them — a member who cannot read the
-- file cannot read its preview either.

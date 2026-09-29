-- 148_job_documents.sql
-- Documents attached to jobs (contracts, permits, signed paperwork, PDFs…),
-- mirroring the job_photos pattern: rows in job_documents, objects in the
-- PRIVATE business-private bucket under jobdocs/<business_id>/<job_id>/…,
-- opened via signed URLs.
--
-- Storage-cost guardrails live app-side: 50 MB per file, 20 documents per
-- job, and uploads are blocked once the business hits its plan's storage
-- quota (same business_storage_bytes check the Files module uses — the RPC
-- from migration 100 already counts this path since it sums everything
-- under <bucket>/*/<business_id>/*).
--
-- Storage access: the generic business-private policies from 066 already
-- cover this path (select = member, write = can_write_business), matching
-- the row policies below — no new storage.objects policies needed.
--
-- Run manually in the Supabase SQL Editor. Safe to re-run (additive).

create table if not exists public.job_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists job_documents_job_id_idx
  on public.job_documents (job_id, created_at);

alter table public.job_documents enable row level security;

drop policy if exists "members read job documents" on public.job_documents;
create policy "members read job documents" on public.job_documents
  for select using (public.is_business_member(business_id));

drop policy if exists "writers insert job documents" on public.job_documents;
create policy "writers insert job documents" on public.job_documents
  for insert with check (public.can_write_business(business_id));

drop policy if exists "writers delete job documents" on public.job_documents;
create policy "writers delete job documents" on public.job_documents
  for delete using (public.can_write_business(business_id));

-- Orphan cleanup: deleting the row (directly or via job/business cascade)
-- removes the storage object. SECURITY DEFINER so cascades from users who
-- can't touch storage.objects still clean up. Never blocks the row delete.
create or replace function public.delete_job_document_object()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    delete from storage.objects
    where bucket_id = 'business-private' and name = old.storage_path;
  exception when others then
    null; -- storage cleanup is best-effort
  end;
  return old;
end;
$$;

drop trigger if exists job_documents_delete_object on public.job_documents;
create trigger job_documents_delete_object
  after delete on public.job_documents
  for each row execute function public.delete_job_document_object();

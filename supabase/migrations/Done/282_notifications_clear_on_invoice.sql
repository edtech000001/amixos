-- 282_notifications_clear_on_invoice.sql
-- Putting a job on an invoice (draft included) means the office has dealt
-- with it, so its notifications ("Job completed", reschedules, …) are marked
-- read for everyone — same as archiving (280). Covers jobs already on an
-- invoice too. Reuses notif_clear_jobs_trg (280: swallows its own errors).
--
-- Run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

drop trigger if exists notif_clear_jobs_invoiced on public.jobs;
create trigger notif_clear_jobs_invoiced
  after update on public.jobs
  for each row when (
    (old.invoice_id is null and new.invoice_id is not null)
    or (old.status is distinct from 'invoiced' and new.status = 'invoiced'))
  execute function public.notif_clear_jobs_trg();

-- Backfill: jobs already on an invoice.
update public.notifications n set read_at = now()
  from public.jobs j
 where n.entity_type = 'job' and n.entity_id = j.id
   and n.read_at is null
   and (j.invoice_id is not null or j.status = 'invoiced');

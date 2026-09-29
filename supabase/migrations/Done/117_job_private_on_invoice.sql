-- 117_job_private_on_invoice.sql
-- Ajustes → Trabajos toggle: "Cambiar trabajos a privado al facturar".
-- When enabled, a job automatically flips published_to_crew = false the
-- moment its status becomes 'invoiced', so field workers stop seeing
-- finished/billed work in their lists.
--
-- Done as a trigger (not app code) so EVERY path that invoices a job is
-- covered: job detail, invoice generation, batch invoicing, CSV import, Ami.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists job_private_on_invoice boolean not null default false;

comment on column public.businesses.job_private_on_invoice is
  'When true, jobs auto-switch published_to_crew=false as they become invoiced.';

create or replace function public.job_privatize_on_invoice()
returns trigger as $$
begin
  if new.status = 'invoiced'
     and (tg_op = 'INSERT' or old.status is distinct from 'invoiced')
     and exists (
       select 1 from public.businesses b
       where b.id = new.business_id and b.job_private_on_invoice
     )
  then
    new.published_to_crew := false;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists job_privatize_on_invoice on public.jobs;
create trigger job_privatize_on_invoice
  before insert or update of status on public.jobs
  for each row execute function public.job_privatize_on_invoice();

-- 272_crew_job_edit_lock.sql
-- Crew (roles whose jobs view is 'assigned' — the Field role and custom roles
-- like it) may only move a job through its STATUS on jobs someone else
-- created. Details (title, client, dates, address, totals, notes, line items)
-- stay with the job's creator and with roles that can see all jobs
-- (owner/admin/office/manager or a custom role granted that).
--
-- RLS can't express this: "jobs update" must let assigned crew write the row
-- (that's how status changes land), and policies can't compare columns. So a
-- BEFORE UPDATE trigger rejects any change outside the status columns below.
-- A crew member's OWN jobs (created_by = them, e.g. logged from the field)
-- stay fully editable.

create or replace function public.crew_job_edit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- Columns crew may change on someone else's job: the status flow and what
  -- it stamps, pause details, an on-site client signature, plus columns other
  -- triggers maintain.
  allowed text[] := array[
    'status', 'completed_date',
    'sent_at', 'accepted_at', 'declined_at', 'cancelled_at', 'scheduled_at',
    'in_progress_at', 'completed_at', 'invoiced_at',
    'paused_at', 'paused_from', 'pause_reason', 'pause_note',
    'client_response', 'client_responded_at', 'client_signed_name', 'client_signature',
    'updated_at', 'updated_by', 'published_to_crew'
  ];
  o jsonb; n jsonb;
begin
  if auth.uid() is null then return new; end if;                 -- service role / public token RPCs
  if new.created_by is not distinct from auth.uid() then return new; end if;
  if public.member_view(new.business_id, 'jobs') is distinct from 'assigned' then return new; end if;

  o := to_jsonb(old) - allowed;
  n := to_jsonb(new) - allowed;
  -- "Programar" on a job with no date asks for one — the first date is part
  -- of scheduling, so crew may set it only when it was empty.
  if old.scheduled_date is null then
    o := o - 'scheduled_date';
    n := n - 'scheduled_date';
  end if;

  if o is distinct from n then
    raise exception 'Solo quien creó el trabajo o un administrador puede editar sus detalles. / Only the job''s creator or an admin can edit its details.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- "zz_" → runs after the other BEFORE triggers (alphabetical), so columns they
-- maintain are already set when we compare.
drop trigger if exists zz_crew_job_edit_guard on public.jobs;
create trigger zz_crew_job_edit_guard
  before update on public.jobs
  for each row execute function public.crew_job_edit_guard();

-- Line items are job details too.
create or replace function public.crew_job_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select business_id, created_by into j
    from public.jobs where id = coalesce(new.job_id, old.job_id);
  if not found then return coalesce(new, old); end if;            -- job being deleted (cascade)
  if j.created_by is not distinct from auth.uid() then return coalesce(new, old); end if;
  if public.member_view(j.business_id, 'jobs') is distinct from 'assigned' then return coalesce(new, old); end if;
  raise exception 'Solo quien creó el trabajo o un administrador puede editar sus detalles. / Only the job''s creator or an admin can edit its details.'
    using errcode = '42501';
end;
$$;

drop trigger if exists zz_crew_job_items_guard on public.job_items;
create trigger zz_crew_job_items_guard
  before insert or update or delete on public.job_items
  for each row execute function public.crew_job_items_guard();

revoke execute on function public.crew_job_edit_guard() from public, anon, authenticated;
revoke execute on function public.crew_job_items_guard() from public, anon, authenticated;

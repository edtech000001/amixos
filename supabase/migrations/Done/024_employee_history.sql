-- Migration 024: Employee history / milestones
-- Run in Supabase SQL Editor
--
-- Append-only log of major changes to an employee record (hire, raise,
-- role change, terminate/rehire). Used to answer "how long has Juan been
-- making $17/h?" without grepping the audit log.

create table if not exists public.employee_history (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,

  -- Coarse event categories so the UI can pick an icon/label per type.
  event_type      text not null
                    check (event_type in (
                      'hired',          -- record created
                      'pay_change',     -- pay_rate and/or pay_type changed
                      'role_change',    -- role changed
                      'terminated',     -- active toggled false
                      'rehired',        -- active toggled true (after a terminate)
                      'note'            -- manual milestone (future)
                    )),

  -- Old/new values relevant to this event. Stored as JSONB so the schema
  -- doesn't churn when we add fields. Convention:
  --   pay_change : { from_rate, to_rate, from_type, to_type }
  --   role_change: { from, to }
  --   hired      : { rate, pay_type, role }
  --   note       : { text }
  details         jsonb not null default '{}'::jsonb,

  -- Date the change took effect ("backdated raise") vs created_at (when
  -- the entry was logged). Defaults to today.
  effective_date  date not null default current_date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists employee_history_employee_idx
  on public.employee_history (employee_id, effective_date desc, created_at desc);

create index if not exists employee_history_business_idx
  on public.employee_history (business_id);

alter table public.employee_history enable row level security;

-- Same role gating as the employees table: managers+ read & write,
-- admin can delete (correcting a misfile). Append-only — no UPDATE policy.
create policy "manager+ read employee_history" on public.employee_history for select
  using (public.has_business_role(business_id, array['owner','admin','manager','viewer']));

create policy "manager+ write employee_history" on public.employee_history for insert
  with check (public.has_business_role(business_id, array['owner','admin','manager']));

create policy "admin delete employee_history" on public.employee_history for delete
  using (public.is_business_admin(business_id));

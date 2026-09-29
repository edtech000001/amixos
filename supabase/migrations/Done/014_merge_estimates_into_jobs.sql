-- Migration 014: Merge Estimates into Jobs
-- Cotizaciones (estimates) are now a "proposal" phase within the Trabajos (jobs) pipeline.
-- New status flow: proposal → sent → accepted → scheduled → in_progress → completed → invoiced
-- Also: declined, cancelled (terminal states)

-- ── 1. Add proposal/quote columns to jobs ───────────────────────────────────
alter table public.jobs
  add column if not exists estimate_number  text,
  add column if not exists notes            text,
  add column if not exists issue_date       date,
  add column if not exists expiry_date      date,
  add column if not exists subtotal_amount  numeric(10,2) not null default 0,
  add column if not exists tax_rate         numeric(5,2)  not null default 0,
  add column if not exists tax_amount       numeric(10,2) not null default 0,
  add column if not exists discount         numeric(10,2) not null default 0,
  add column if not exists sent_at          timestamptz,
  add column if not exists accepted_at      timestamptz,
  add column if not exists declined_at      timestamptz;

-- ── 2. Backfill subtotal_amount for existing jobs ───────────────────────────
update public.jobs set subtotal_amount = total_amount where subtotal_amount = 0 and total_amount > 0;

-- ── 3. Expand status constraint to include proposal statuses ────────────────
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in (
    'proposal','sent','accepted','declined',
    'scheduled','in_progress','completed','cancelled','invoiced'
  ));

-- ── 4. Migrate existing estimates into jobs ─────────────────────────────────

-- 4a. For converted estimates that already have a linked job: update the existing job with estimate fields
update public.jobs j
set
  estimate_number = e.estimate_number,
  notes           = e.notes,
  issue_date      = e.issue_date,
  expiry_date     = e.expiry_date,
  subtotal_amount = e.subtotal_amount,
  tax_rate        = e.tax_rate,
  tax_amount      = e.tax_amount,
  discount        = e.discount,
  sent_at         = e.sent_at,
  accepted_at     = e.accepted_at,
  declined_at     = e.declined_at
from public.estimates e
where e.status = 'converted'
  and e.job_id is not null
  and e.job_id = j.id;

-- 4b. Insert non-converted estimates (and converted-to-invoice-only) as new jobs
insert into public.jobs (
  business_id, client_id, invoice_id,
  title, description, status, priority,
  total_amount, internal_notes,
  estimate_number, notes, issue_date, expiry_date,
  subtotal_amount, tax_rate, tax_amount, discount,
  sent_at, accepted_at, declined_at,
  created_at, updated_at
)
select
  e.business_id,
  e.client_id,
  case when e.status = 'converted' and e.invoice_id is not null then e.invoice_id else null end,
  e.title,
  null, -- description
  case
    when e.status = 'draft'    then 'proposal'
    when e.status = 'sent'     then 'sent'
    when e.status = 'expired'  then 'sent'  -- expiry computed client-side from expiry_date
    when e.status = 'accepted' then 'accepted'
    when e.status = 'declined' then 'declined'
    when e.status = 'converted' and e.invoice_id is not null and e.job_id is null then 'invoiced'
    else 'proposal'
  end,
  'normal', -- priority
  e.total_amount,
  e.internal_notes,
  e.estimate_number,
  e.notes,
  e.issue_date,
  e.expiry_date,
  e.subtotal_amount,
  e.tax_rate,
  e.tax_amount,
  e.discount,
  e.sent_at,
  e.accepted_at,
  e.declined_at,
  e.created_at,
  e.updated_at
from public.estimates e
where not (e.status = 'converted' and e.job_id is not null);

-- 4c. Migrate line_items JSONB from estimates into job_items table
-- For each newly created job (matched by estimate_number), insert line items
insert into public.job_items (job_id, item_type, description, quantity, unit_price)
select
  j.id,
  'other',
  (li->>'description')::text,
  coalesce((li->>'quantity')::numeric, 1),
  coalesce((li->>'unit_price')::numeric, 0)
from public.estimates e
cross join lateral jsonb_array_elements(e.line_items) as li
join public.jobs j on j.estimate_number = e.estimate_number and j.business_id = e.business_id
where not (e.status = 'converted' and e.job_id is not null)
  and jsonb_array_length(e.line_items) > 0;

-- ── 5. Archive the estimates table ──────────────────────────────────────────
alter table if exists public.estimates rename to _estimates_archived;

-- Disable RLS policies on archived table (they reference the old name)
comment on table public._estimates_archived is 'DEPRECATED - merged into jobs table in migration 014. Kept for reference.';

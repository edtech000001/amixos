-- 136_payment_breakdown_snapshot.sql
-- Freeze the hours breakdown into each payroll payment: the jobs (id, title,
-- date, worked/driven hours) + logged hours that produced the check, captured
-- at pay time. History then shows HOW the total was earned forever — deleting
-- or editing a job later only breaks that job's link, never the record.
-- Shape mirrors employeeBreakdownInRange's PayrollBreakdown. Null on old rows
-- and imports → the history detail falls back to a live recomputation.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.payroll_payments
  add column if not exists breakdown jsonb;

comment on column public.payroll_payments.breakdown is
  'Pay-time snapshot of the hours breakdown ({jobs:[{jobId,title,date,workedHours,drivenHours}],loggedHours,workedHours,drivenHours,totalHours}). Null = recompute live.';

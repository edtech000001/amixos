-- 123_payroll_components.sql
-- Configurable pay components (Nómina):
--   * businesses.payroll_config — jsonb, shape (all optional, defaults keep
--     today's behavior exactly):
--       { "overtime": { "enabled": bool, "weeklyThreshold": 40, "multiplier": 1.5 },
--         "driver":   { "mode": "same" | "rate" | "flat", "rate": 0, "flat": 0 } }
--     - overtime: hourly workers get threshold×weeks regular hours, the rest
--       at rate×multiplier (threshold is per WEEK, scaled to the pay period).
--     - driver: how driven hours pay — same = employee rate (legacy),
--       rate = custom $/driven hour, flat = fixed $ per job driven.
--   * payroll_payments.driver_hours / bonus — component detail stored with
--     each payment (bonus is entered at mark-paid). Also the landing columns
--     for the upcoming payroll-history import.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.businesses
  add column if not exists payroll_config jsonb;

comment on column public.businesses.payroll_config is
  'Pay components config: overtime (weekly threshold + multiplier) and driver-hours pay mode. Null = legacy behavior.';

alter table public.payroll_payments
  add column if not exists driver_hours numeric,
  add column if not exists bonus numeric;

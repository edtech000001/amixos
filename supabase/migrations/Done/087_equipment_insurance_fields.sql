-- 087_equipment_insurance_fields.sql (renumbered from 079 to resolve a duplicate number)
-- Universal asset fields for the equipment module: insurance (carrier, policy
-- number, agent + phone, expiration), serial number (non-vehicle assets that
-- have no VIN), purchase + warranty dates, and current location. All nullable.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.

alter table public.equipment
  add column if not exists serial_number           text,
  add column if not exists insurance_carrier        text,
  add column if not exists insurance_policy_number  text,
  add column if not exists insurance_agent          text,
  add column if not exists insurance_agent_phone    text,
  add column if not exists insurance_expiration     date,
  add column if not exists purchase_date            date,
  add column if not exists warranty_expiration      date,
  add column if not exists location                 text;

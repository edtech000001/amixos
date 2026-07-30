-- Internal notes on invoices: private reminders for the business, never shown
-- on the client-facing invoice document (PDF / public /factura page / email).
-- Distinct from `notes`, which IS client-facing.
alter table invoices add column if not exists internal_notes text;

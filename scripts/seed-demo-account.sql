-- Demo data for the App Review account (Prime Landscaping).
--
-- CONTENT IS IN ENGLISH on purpose: App Review uses English devices, and the
-- app's screens follow the device language — Spanish job titles, notes and
-- invoice PDFs inside an English UI made the demo harder to evaluate. Client
-- and employee names stay Hispanic: realistic for Amixos's market.
--
-- Run the WHOLE file in the Supabase SQL Editor. It is idempotent: both parts
-- begin by deleting the demo business's rows, so re-running resets rather than
-- duplicating. Running only half of it is what causes trouble — a second Part 1
-- leaves two clients per surname, and Part 2's joins then emit two rows per
-- invoice number, which collides with the unique (business_id, invoice_number).
--
-- Everything is scoped to the one business id below. Nothing here touches any
-- other tenant.
--
-- Values were read off the live schema rather than the migrations, because the
-- two have drifted: clients carries both `mobile_phone` (legacy) and
-- `phone_cell` (current), and jobs.status allows 'posible', which is not in the
-- flow CLAUDE.md documents.

begin;

-- Wipe the demo business's data first, so the whole file can be re-run without
-- duplicating anything. Order follows the foreign keys: job_items hangs off
-- jobs, and jobs/invoices reference clients. Everything is scoped to the one
-- demo business id — no other tenant is touched.
delete from public.job_items
 where job_id in (select id from public.jobs
                   where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8');
delete from public.calendar_events where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.invoices        where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.jobs            where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.inventory_items where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.timesheets      where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.employees       where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.clients         where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';

-- ── Clients ────────────────────────────────────────────────────────────────
-- Spread across the alphabet so the A–Z index has several letters to land on,
-- and mixed company/person so both row layouts are visible.
insert into public.clients
  (business_id, first_name, last_name, company, phone_cell, email_office,
   address, city, state, zip_code, notes)
values
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Alejandro','Ramírez','Ramírez Landscaping','(512) 555-0142','alejandro@ramirezland.com','1420 Oak Creek Dr','Austin','TX','78704','Client since 2023. Prefers WhatsApp.'),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Beatriz','Solís',null,'(512) 555-0188','beatriz.solis@gmail.com','908 Kingsbury St','Austin','TX','78702',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Carlos','Mendoza','Mendoza Construction','(512) 555-0119','carlos@mendozaconstruction.com','5511 Burnet Rd','Austin','TX','78756','Pays net 30.'),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Diana','Fuentes',null,'(737) 555-0164','dfuentes@outlook.com','212 Vista Ln','Round Rock','TX','78664',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Eduardo','Navarro','Navarro Properties','(512) 555-0177','ed@navarroproperties.com','77 Commerce Blvd','Pflugerville','TX','78660','4 properties on a maintenance plan.'),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Gloria','Herrera',null,'(512) 555-0103','gloria.herrera@gmail.com','3301 Manchaca Rd','Austin','TX','78704',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Javier','Ortiz','Ortiz Auto Group','(512) 555-0155','javier@ortizauto.com','8800 Research Blvd','Austin','TX','78758',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Lucía','Delgado',null,'(737) 555-0129','lucia.d@yahoo.com','45 Ridgeview Ct','Cedar Park','TX','78613','Only available on weekends.'),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Marisol','Vega','Vega Family Dental','(512) 555-0198','office@vegadental.com','1200 W 38th St','Austin','TX','78705',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Rafael','Castillo',null,'(512) 555-0136','rcastillo@gmail.com','620 Slaughter Ln','Austin','TX','78748',null),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Sofía','Peña','Peña Bakery','(737) 555-0147','sofia@penabakery.com','515 E 6th St','Austin','TX','78701','New client — referred by Carlos Mendoza.'),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Tomás','Aguilar',null,'(512) 555-0171','taguilar@gmail.com','9 Hillcrest Dr','Georgetown','TX','78626',null);

-- ── Employees ──────────────────────────────────────────────────────────────
-- show_in_roster so they appear in crew pickers. All HOURLY on purpose: the
-- app pays a salary as a fixed amount PER PAY PERIOD (shared/src/lib/
-- payroll.ts), so the yearly figures this used to seed ($58,000 / $72,000)
-- were paid every month — $130k payroll and a -4300% margin on screen.
insert into public.employees
  (business_id, first_name, last_name, phone, email, role, pay_type, pay_rate,
   active, hire_date, city, state, show_in_roster, overtime_eligible)
values
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Miguel','Torres','(512) 555-0201','miguel.torres@example.com','field','hourly',24.00,true,'2024-03-11','Austin','TX',true,true),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Ana','Ruiz','(512) 555-0202','ana.ruiz@example.com','office','hourly',26.00,true,'2023-09-05','Austin','TX',true,false),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Pedro','Lozano','(512) 555-0203','pedro.lozano@example.com','field','hourly',22.50,true,'2025-01-20','Round Rock','TX',true,true),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Rosa','García','(512) 555-0204','rosa.garcia@example.com','manager','hourly',30.00,true,'2022-06-14','Austin','TX',true,false),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Hugo','Beltrán','(512) 555-0205','hugo.beltran@example.com','field','hourly',21.00,true,'2025-07-02','Pflugerville','TX',true,true);

-- ── Hours ──────────────────────────────────────────────────────────────────
-- Today's hours (so the CURRENT pay period, Inicio's payroll card and Team →
-- Hours are never empty, whatever day this runs) plus the previous four days
-- for history. Re-running resets them (deleted above with the employees).
-- clock_in/clock_out are set explicitly: clock_in defaults to now() and an
-- entry with no clock_out counts as "clocked in" — Inicio showed 25 people
-- "Active now".
insert into public.timesheets (business_id, employee_id, worker_name, work_date, hours_worked, approved, clock_in, clock_out)
select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8', e.id, e.first_name || ' ' || e.last_name, current_date - d.n, d.h, true,
       (current_date - d.n) + time '08:00', (current_date - d.n) + time '08:00' + d.h * interval '1 hour'
from public.employees e
join (values
  ('Miguel', 0, 8.0), ('Pedro', 0, 8.0), ('Hugo', 0, 7.5), ('Rosa', 0, 6.0), ('Ana', 0, 4.0),
  ('Miguel', 1, 8.0), ('Pedro', 1, 8.5), ('Hugo', 1, 8.0), ('Rosa', 1, 8.0), ('Ana', 1, 8.0),
  ('Miguel', 2, 9.0), ('Pedro', 2, 8.0), ('Hugo', 2, 8.0), ('Rosa', 2, 8.0), ('Ana', 2, 8.0),
  ('Miguel', 3, 8.0), ('Pedro', 3, 7.0), ('Hugo', 3, 8.0), ('Rosa', 3, 8.0), ('Ana', 3, 8.0),
  ('Miguel', 4, 8.0), ('Pedro', 4, 8.0), ('Hugo', 4, 6.5), ('Rosa', 4, 8.0), ('Ana', 4, 8.0)
) as d(first, n, h) on d.first = e.first_name
where e.business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';

-- The sign-in account's own name. Team lists the owner from an employees row
-- linked by user_id; with none, the app auto-creates one named from the
-- account ("demo") — so seed it here, named.
update public.profiles set first_name = 'Daniel', last_name = 'Moreno'
where id = (select owner_id from public.businesses where id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8');
insert into public.employees (business_id, user_id, first_name, last_name, role, active)
select id, owner_id, 'Daniel', 'Moreno', 'owner', true
from public.businesses where id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';

-- ── Inventory ──────────────────────────────────────────────────────────────
-- Two items sit under their threshold on purpose, so the low-stock state is
-- visible instead of a uniformly healthy list.
insert into public.inventory_items
  (business_id, name, sku, description, quantity, unit, unit_cost, unit_price,
   category, low_stock_threshold)
values
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Garden soil (2 cu ft bag)','SOIL-2CF','Ready-to-plant soil mix',48,'bag',4.25,9.99,'Materials',20),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Bark mulch (3 cu ft bag)','MULCH-3CF','Dark brown mulch',6,'bag',3.10,7.49,'Materials',15),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','1" PVC pipe (10 ft)','PVC-1-10','For irrigation',120,'each',6.80,14.00,'Irrigation',40),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','4" pop-up sprinkler','SPR-4IN','Adjustable head',9,'each',5.40,12.50,'Irrigation',25),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','20-20-20 fertilizer (50 lb)','FERT-202020','All-purpose',22,'sack',28.00,49.99,'Chemicals',10),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Trimmer line (0.095")','TRIM-095','1 lb spool',35,'spool',9.00,18.00,'Supplies',12),
  ('b9e348d6-3ea6-42dd-9697-0211b6b376b8','Work gloves','GLV-STD','Size L',60,'pair',3.50,8.00,'Safety',20);

-- ── Business settings ─────────────────────────────────────────────────────
-- New invoices the reviewer creates default to English too. Only the
-- defaultLanguage keys change; the rest of the invoice design is kept.
update public.businesses
set invoice_template =
      coalesce(invoice_template, '{}'::jsonb)
      || jsonb_build_object(
           'defaultLanguage', 'en',
           'flow',     coalesce(invoice_template -> 'flow', '{}'::jsonb)     || '{"defaultLanguage":"en"}'::jsonb,
           'freeform', coalesce(invoice_template -> 'freeform', '{}'::jsonb) || '{"defaultLanguage":"en"}'::jsonb)
where id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
  and (invoice_template is null or jsonb_typeof(invoice_template) = 'object');

commit;


-- ══ PART 2 ═════════════════════════════════════════════════════════════════
-- The block above commits on its own. If anything below fails, ONLY this part
-- rolls back — re-run from here, not from the top, or you will duplicate the
-- clients, employees and inventory.

-- Clear anything a previous attempt left behind, so this part can be re-run
-- safely. invoices.invoice_number is unique per business, so a half-finished
-- run otherwise fails on INV-1001 forever. Order follows the foreign keys.
delete from public.job_items
 where job_id in (select id from public.jobs
                   where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8');
delete from public.calendar_events where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.invoices        where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
delete from public.jobs            where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';

-- ── Jobs ───────────────────────────────────────────────────────────────────
-- Spread across the pipeline so every tab has rows: proposal → sent →
-- scheduled → in_progress → completed → invoiced. Status values come from
-- jobs_status_check, which also allows 'posible' and 'declined'.
begin;

insert into public.jobs
  (business_id, client_id, title, description, status, priority,
   job_address, job_city, job_state, scheduled_date, total_amount, estimated_hours)
select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8', c.id, v.title, v.descr, v.status, v.priority,
       c.address, c.city, c.state, v.sched, v.amount, v.hours
from (values
  ('Ramírez',  'Front yard redesign',             'Full redesign with native plants and drip irrigation.', 'proposal',    'normal', current_date + 12, 4850.00, 32),
  ('Solís',    'Monthly maintenance',             'Mow, edge and cleanup. Monthly plan.',                   'sent',        'low',    current_date + 5,   320.00,  4),
  ('Mendoza',  'Irrigation install — Phase 1',    'North side: 6 zones, smart controller.',             'accepted',    'high',   current_date + 3,  7200.00, 48),
  ('Fuentes',  'Tree trimming',                   'Three oaks, safety trim before the season.',        'scheduled',   'normal', current_date + 2,   950.00,  8),
  ('Navarro',  'Property maintenance',            'Four properties, visit every two weeks.',                     'scheduled',   'normal', current_date + 6,  1680.00, 16),
  ('Herrera',  'Sprinkler repair',                'Replace 4 heads and adjust pressure.',                    'in_progress', 'urgent', current_date,       410.00,  3),
  ('Ortiz',    'Parking lot landscaping',         'Perimeter planters and mulch.',                       'in_progress', 'high',   current_date - 1,  3300.00, 24),
  ('Delgado',  'Sod installation',                'Zoysia in the backyard, 1,200 sq ft.',                       'completed',   'normal', current_date - 4,  2150.00, 18),
  ('Vega',     'Seasonal cleanup',                'Leaf removal and winter prep.',                'completed',   'low',    current_date - 9,   540.00,  6),
  ('Peña',     'Entrance planters',               'Two raised planters with seasonal plants.',         'invoiced',    'normal', current_date - 14, 1275.00, 10),
  -- total_amount is NOT NULL with a default of 0, so an explicit null is
  -- rejected even though the column looks optional. 0 = not yet quoted.
  ('Castillo', 'Estimate — retaining wall',       'Site visit done, material still to be decided.',                 'posible',     'low',    null,                 0.00,    null)
) as v(cli, title, descr, status, priority, sched, amount, hours)
join public.clients c
  on c.business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
 and c.last_name = v.cli;

-- Line items on the two biggest jobs, so a reviewer opening one sees a
-- breakdown rather than a bare total. item_type is constrained to
-- labor | material | equipment | other.
-- `total` is a GENERATED column (quantity * unit_price) — Postgres rejects any
-- explicit value, even the correct one.
insert into public.job_items (job_id, item_type, description, quantity, unit_price)
select j.id, v.kind, v.descr, v.qty, v.price
from (values
  ('Irrigation install — Phase 1', 'labor',     'Installation labor',               48, 65.00),
  ('Irrigation install — Phase 1', 'material',  '1" PVC pipe (10 ft)',              60, 14.00),
  ('Irrigation install — Phase 1', 'material',  '4" pop-up sprinkler',              42, 12.50),
  ('Irrigation install — Phase 1', 'equipment', 'Trencher rental (2 days)',          2, 185.00),
  ('Front yard redesign',          'labor',     'Design and site prep',             32, 65.00),
  ('Front yard redesign',          'material',  'Native plants (assorted)',          1, 1420.00),
  ('Front yard redesign',          'material',  'Bark mulch (3 cu ft bag)',         40, 7.49)
) as v(job_title, kind, descr, qty, price)
join public.jobs j
  on j.business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
 and j.title = v.job_title;

-- ── Invoices ───────────────────────────────────────────────────────────────
-- One per status the list groups by (overdue, sent, draft, paid), so no tab is
-- empty. line_items is JSONB using the canonical {description, qty, rate}
-- shape — the document and PDF read qty/rate, NOT quantity/unit_price, and
-- render $0 for anything else (shared/src/lib/invoicing.ts:42).
insert into public.invoices
  (business_id, client_id, invoice_number, status, language, issue_date, due_date,
   line_items, subtotal_amount, tax_rate, tax_amount, total_amount, notes, paid_at)
select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8', c.id, v.num, v.status, 'en',
       v.issued, v.due, v.items::jsonb, v.sub, 8.25, round(v.sub * 0.0825, 2),
       round(v.sub * 1.0825, 2), v.note, v.paid
from (values
  ('Delgado', 'INV-1001', 'paid',    current_date - 20, current_date - 5,
   '[{"description":"Zoysia sod installation","qty":1200,"rate":1.45},{"description":"Site preparation","qty":8,"rate":55}]',
   2180.00, 'Thank you for your business.', (now() - interval '6 days')),
  ('Vega',    'INV-1002', 'paid',    current_date - 15, current_date,
   '[{"description":"Seasonal cleanup","qty":6,"rate":90}]',
   540.00, null, (now() - interval '1 hour')),  -- always THIS month (Inicio's earnings card)
  ('Peña',    'INV-1003', 'sent',    current_date - 6,  current_date + 9,
   '[{"description":"Raised planters","qty":2,"rate":480},{"description":"Seasonal plants","qty":1,"rate":315}]',
   1275.00, 'Due in 15 days.', null),
  ('Navarro', 'INV-1004', 'overdue', current_date - 40, current_date - 10,
   '[{"description":"Bi-weekly maintenance — September","qty":2,"rate":840}]',
   1680.00, 'Second reminder sent.', null),
  ('Ortiz',   'INV-1005', 'draft',   current_date,      current_date + 30,
   '[{"description":"Perimeter planters","qty":1,"rate":2400},{"description":"Mulch","qty":120,"rate":7.5}]',
   3300.00, null, null)
) as v(cli, num, status, issued, due, items, sub, note, paid)
join public.clients c
  on c.business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
 and c.last_name = v.cli;

-- ── Calendar ───────────────────────────────────────────────────────────────
-- created_by is NOT NULL here (unlike jobs/invoices, where it is optional).
-- Derived from the business rather than hardcoded, so this stays correct if the
-- script is ever pointed at a different demo account.
insert into public.calendar_events
  (business_id, title, description, start_time, end_time, location, event_type,
   client_id, created_by)
select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8', v.title, v.descr,
       (current_date + v.day)::timestamptz + v.start_h,
       (current_date + v.day)::timestamptz + v.end_h,
       c.address, v.kind, c.id,
       (select owner_id from public.businesses
         where id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8')
from (values
  ('Tree trimming — Fuentes',         'Three oaks.',                  2, interval '8 hours',  interval '12 hours', 'job'),
  ('Estimate visit — Castillo',       'Measure the retaining wall.',  3, interval '14 hours', interval '15 hours', 'appointment'),
  ('Maintenance — Navarro',           'Four properties.',             6, interval '7 hours',  interval '16 hours', 'job'),
  ('Materials delivery',              'Mulch and soil.',              4, interval '9 hours',  interval '10 hours', 'delivery')
) as v(title, descr, day, start_h, end_h, kind)
left join public.clients c
  on c.business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
 and c.last_name = split_part(v.title, ' — ', 2);

commit;

-- ── Undo, if you need to start over ────────────────────────────────────────
-- Order matters: job_items and invoices reference jobs/clients.
--
--   begin;
--   delete from public.job_items where job_id in (
--     select id from public.jobs where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8');
--   delete from public.calendar_events where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   delete from public.invoices        where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   delete from public.jobs            where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   delete from public.inventory_items where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   delete from public.employees       where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   delete from public.clients         where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';
--   commit;


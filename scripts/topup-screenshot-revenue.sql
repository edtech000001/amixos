-- topup-screenshot-revenue.sql
-- Seed realistic paid revenue for App Store SCREENSHOTS.
--
-- Problem it solves: the Inicio earnings card led with "$585 — -75% vs mes
-- anterior" and "Total 2026: $2,944". Partly an artifact of shooting on the 2nd
-- of the month (two days of earnings vs a full September), but a buyer reading
-- the screenshot just sees a business in decline.
--
-- What drives that card (dashboard_stats, migrations 225/240):
--   earnings_month = sum(total_amount - passthrough_amount)
--                    where status = 'paid' and paid_at >= start of month
--   the bar chart   = the same, bucketed by extract(month from paid_at)
-- So ONLY status='paid' + paid_at matter. issue_date/due_date are cosmetic.
--
-- Invoices are ISSUED in the prior weeks and PAID in the current month — which
-- is how real receivables behave, and avoids a wall of same-day invoices in the
-- Facturas list.
--
-- Re-runnable: every row it creates uses the INV-3xxx number block, which is
-- deleted first. Your existing INV-1xxx / INV-2xxx invoices are never touched.
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Safe to re-run.

-- ── 0. Guard ────────────────────────────────────────────────────────────────
-- Sanity check: confirms the demo business exists and shows what it holds now.
-- (Targeted BY ID, not by name — an earlier version matched on the name
-- 'Prime Landscaping' and silently affected zero rows when it didn't match
-- exactly; `ilike` with no wildcards is an exact, case-insensitive compare.)
select b.id, b.name,
       (select count(*) from public.invoices i where i.business_id = b.id) as invoices
  from public.businesses b
 where b.id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8';


-- ── 1. Clear anything this script created previously ────────────────────────
delete from public.invoices
 where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
   and invoice_number like 'INV-3%';


-- ── 2. CURRENT MONTH — the fix for the "-75%" headline ──────────────────────
-- Paid on the 1st/2nd (invoices issued 2-4 weeks ago finally clearing), so the
-- month total reads healthy even two days in.
with biz as (
  select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'::uuid as id
), cli as (
  -- Cycle through whatever clients exist, so this works without knowing names.
  select c.id, (row_number() over (order by c.created_at, c.id) - 1) as rn
    from public.clients c, biz
   where c.business_id = biz.id
), n as (
  select count(*)::int as total from cli
)
insert into public.invoices
  (business_id, client_id, invoice_number, status, language, issue_date, due_date,
   line_items, subtotal_amount, tax_rate, tax_amount, total_amount, notes, paid_at)
select biz.id, cli.id, v.num, 'paid', 'es',
       current_date - v.issued_ago,
       current_date - v.issued_ago + 15,
       v.items::jsonb, v.sub, 8.25,
       round(v.sub * 0.0825, 2), round(v.sub * 1.0825, 2), null,
       date_trunc('month', now()) + make_interval(days => v.pay_day, hours => v.pay_hour)
from (values
  -- num, client slot, issued N days ago, paid on day-of-month, hour, items, subtotal
  ('INV-3101', 0, 24, 0, 9,
   '[{"description":"Mantenimiento mensual — septiembre","qty":4,"rate":385},{"description":"Poda de setos","qty":6,"rate":65}]',
   1930.00),
  ('INV-3102', 1, 21, 0, 11,
   '[{"description":"Instalación de césped San Agustín","qty":1800,"rate":1.35},{"description":"Preparación del terreno","qty":10,"rate":58}]',
   3010.00),
  ('INV-3103', 2, 18, 1, 14,
   '[{"description":"Sistema de riego — zona trasera","qty":1,"rate":2240},{"description":"Controlador inteligente","qty":1,"rate":310}]',
   2550.00),
  ('INV-3104', 3, 16, 0, 10,
   '[{"description":"Limpieza de temporada","qty":8,"rate":95},{"description":"Retiro de escombros","qty":1,"rate":240}]',
   1000.00),
  ('INV-3105', 4, 12, 1, 15,
   '[{"description":"Mantillo de cedro","qty":140,"rate":7.25},{"description":"Instalación de mantillo","qty":6,"rate":55}]',
   1345.00)
) as v(num, cli_rn, issued_ago, pay_day, pay_hour, items, sub)
cross join biz
cross join n
join cli on cli.rn = (v.cli_rn % greatest(n.total, 1));


-- ── 3. OPTIONAL — backfill Jan through last month ───────────────────────────
-- Run this too if you want the 12-month bar chart to read as a going concern
-- instead of two lonely bars. Amounts climb gently so the trend looks like a
-- business that is growing, with the current month highest.
--
-- Skip this block if you only wanted the current-month fix.
with biz as (
  select 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'::uuid as id
), cli as (
  select c.id, (row_number() over (order by c.created_at, c.id) - 1) as rn
    from public.clients c, biz
   where c.business_id = biz.id
), n as (
  select count(*)::int as total from cli
)
insert into public.invoices
  (business_id, client_id, invoice_number, status, language, issue_date, due_date,
   line_items, subtotal_amount, tax_rate, tax_amount, total_amount, notes, paid_at)
select biz.id, cli.id, v.num, 'paid', 'es',
       (date_trunc('month', current_date) - make_interval(months => v.mo_ago) + interval '3 days')::date,
       (date_trunc('month', current_date) - make_interval(months => v.mo_ago) + interval '18 days')::date,
       v.items::jsonb, v.sub, 8.25,
       round(v.sub * 0.0825, 2), round(v.sub * 1.0825, 2), null,
       date_trunc('month', now()) - make_interval(months => v.mo_ago) + make_interval(days => v.pay_day, hours => 10)
from (values
  -- mo_ago, day paid, subtotal
  ('INV-3201', 9, 14, 0, '[{"description":"Mantenimiento mensual — enero","qty":4,"rate":385},{"description":"Poda de invierno","qty":5,"rate":78}]', 1930.00),
  ('INV-3202', 9, 25, 1, '[{"description":"Reparación de riego","qty":1,"rate":1950}]', 1950.00),
  ('INV-3203', 8, 12, 2, '[{"description":"Mantenimiento mensual — febrero","qty":4,"rate":385},{"description":"Fertilización","qty":1,"rate":420}]', 1960.00),
  ('INV-3204', 8, 24, 0, '[{"description":"Diseño de jardín frontal","qty":1,"rate":2290}]', 2290.00),
  ('INV-3205', 7, 10, 1, '[{"description":"Mantenimiento mensual — marzo","qty":4,"rate":420},{"description":"Plantas de temporada","qty":1,"rate":560}]', 2240.00),
  ('INV-3206', 7, 22, 2, '[{"description":"Instalación de césped","qty":1600,"rate":1.72}]', 2752.00),
  ('INV-3207', 6, 11, 0, '[{"description":"Mantenimiento mensual — abril","qty":4,"rate":420},{"description":"Control de maleza","qty":3,"rate":145}]', 2115.00),
  ('INV-3208', 6, 23, 1, '[{"description":"Jardineras elevadas","qty":4,"rate":495},{"description":"Tierra vegetal","qty":12,"rate":48}]', 2556.00),
  ('INV-3209', 5, 13, 2, '[{"description":"Mantenimiento mensual — mayo","qty":4,"rate":450},{"description":"Poda de árboles","qty":7,"rate":120}]', 2640.00),
  ('INV-3210', 5, 26, 0, '[{"description":"Sistema de riego por goteo","qty":1,"rate":3140}]', 3140.00),
  ('INV-3211', 4, 12, 1, '[{"description":"Mantenimiento mensual — junio","qty":4,"rate":450},{"description":"Mantillo de cedro","qty":160,"rate":7.25}]', 2960.00),
  ('INV-3212', 4, 24, 2, '[{"description":"Cercado perimetral","qty":120,"rate":28}]', 3360.00),
  ('INV-3213', 3, 10, 0, '[{"description":"Mantenimiento mensual — julio","qty":4,"rate":450},{"description":"Riego de emergencia","qty":1,"rate":680}]', 2480.00),
  ('INV-3214', 3, 25, 1, '[{"description":"Paisajismo — patio trasero","qty":1,"rate":3890}]', 3890.00),
  ('INV-3215', 2, 11, 2, '[{"description":"Mantenimiento mensual — agosto","qty":4,"rate":485},{"description":"Poda de setos","qty":8,"rate":65}]', 2460.00),
  ('INV-3216', 2, 23, 0, '[{"description":"Instalación de iluminación exterior","qty":1,"rate":4250}]', 4250.00),
  ('INV-3217', 1, 9,  1, '[{"description":"Mantenimiento mensual — septiembre","qty":4,"rate":485},{"description":"Limpieza de canaletas","qty":1,"rate":390}]', 2330.00),
  ('INV-3218', 1, 21, 2, '[{"description":"Renovación de jardín frontal","qty":1,"rate":2890}]', 2890.00)
) as v(num, mo_ago, pay_day, cli_rn, items, sub)
cross join biz
cross join n
join cli on cli.rn = (v.cli_rn % greatest(n.total, 1));


-- ── 4. Verify ───────────────────────────────────────────────────────────────
-- Month-by-month paid revenue. The last row (current month) should be the
-- highest, and the month before it clearly lower — that's the "+X% vs mes
-- anterior" the dashboard will show.
select to_char(paid_at, 'YYYY-MM') as month,
       count(*)                    as invoices,
       sum(total_amount)           as revenue
  from public.invoices
 where business_id = 'b9e348d6-3ea6-42dd-9697-0211b6b376b8'
   and status = 'paid'
   and paid_at >= date_trunc('year', current_date)
 group by 1
 order by 1;

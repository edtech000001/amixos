import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { geocodeMissingClients, geocodeMissingEmployees } from '../lib/geocoding';

export const mapRouter = Router();
mapRouter.use(authenticate);

// Each pin returns the raw fields the client needs to apply pin-style
// rules locally (see shared/lib/mapPinResolve.ts). The API no longer
// resolves colors/icons — that lives on the client so rule changes don't
// require a redeploy of the API.
interface ClientPin {
  id: string;
  type: 'client';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  company: string | null;
  // Standard fields that rules can match on.
  phone_cell: string | null;
  phone_office: string | null;
  email_office: string | null;
  email_home: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  custom_fields: Record<string, unknown> | null;
  // Most recent communication (call/text/email/manual) with this client,
  // sourced from v_client_last_contact. null = never contacted. Drives the
  // "Último contacto: hace X" line on the pin card.
  last_contacted_at: string | null;
}

interface JobPin {
  id: string;
  type: 'job';
  lat: number;
  lng: number;
  title: string;
  status: string;
  scheduled_date: string | null;
  client_name: string | null;
  // Standard rule-matchable fields.
  description: string | null;
  priority: string;
  job_address: string | null;
  job_city: string | null;
  job_state: string | null;
  custom_fields: Record<string, unknown> | null;
}

interface EmployeePin {
  id: string;
  type: 'employee';
  lat: number;
  lng: number;
  // Derived: where they are today is the lat/lng of the job they're
  // assigned to today. We pin the EMPLOYEE id but the location comes
  // from the job.
  first_name: string;
  last_name: string;
  // The job they're at right now (display label "Carlos H. — at Job
  // ABC for Client X").
  job_id: string | null;
  job_title: string | null;
  // Rule-matchable employee fields.
  role: string | null;
}

/**
 * GET /api/v1/map/pins?business_id=...
 *
 * Returns every map-able entity in a single payload so the client renders
 * once. Three buckets:
 *
 *   - clients: every client in the business with non-null lat/lng
 *   - jobs:    every job (excluding cancelled/declined) with non-null job_lat/job_lng
 *   - employees: every employee assigned to a job scheduled TODAY, pinned
 *     at that job's location. No GPS — purely schedule-derived.
 *
 * Pin styling (color + icon) is NOT computed here — the client applies
 * `shared/lib/mapPinResolve.ts` to each pin at render time using the
 * business's `map_pin_config`. That keeps all rule logic in one place
 * and means new operators don't require an API redeploy.
 *
 * If clients are missing coordinates, they don't appear here. The UI
 * surfaces a "X clients need geocoding" hint that calls the backfill
 * endpoint below to populate them.
 */
mapRouter.get('/pins', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const businessId = req.query.business_id as string | undefined;
  if (!businessId) return res.status(400).json({ success: false, message: 'business_id required' });

  // Caller is a member of the business? Service-role client bypasses RLS
  // so we have to check manually.
  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (!membership) return res.status(403).json({ success: false, message: 'forbidden' });

  const today = new Date().toISOString().split('T')[0];

  const [clientsRes, jobsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, first_name, last_name, company, phone_cell, phone_office, email_office, email_home, address, city, state, zip_code, lat, lng, custom_fields')
      .eq('business_id', businessId)
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    supabase
      .from('jobs')
      .select('id, title, description, status, priority, scheduled_date, job_address, job_city, job_state, job_lat, job_lng, custom_fields, clients(first_name, last_name)')
      .eq('business_id', businessId)
      .not('job_lat', 'is', null)
      .not('job_lng', 'is', null)
      .not('status', 'in', '("cancelled","declined")'),
    // Employees assigned to a job scheduled TODAY with coords. One query
    // joins employees → assignments → jobs so we have everything in hand.
    supabase
      .from('job_assignments')
      .select('id, employees(id, first_name, last_name, role), jobs(id, title, job_lat, job_lng, scheduled_date, business_id)')
      .eq('jobs.business_id', businessId)
      .eq('jobs.scheduled_date', today),
  ]);

  // Most-recent contact per client. Read from the v_client_last_contact
  // view (one row per client). Paginated with .range() — communication
  // volume grows faster than any other client-scoped table.
  const lastContactByClient = new Map<string, string>();
  {
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('v_client_last_contact')
        .select('client_id, last_contacted_at')
        .eq('business_id', businessId)
        .range(from, from + pageSize - 1);
      if (error) break; // view may not exist yet (pre-migration) — degrade gracefully
      const rows = (data ?? []) as Array<{ client_id: string; last_contacted_at: string | null }>;
      for (const r of rows) {
        if (r.last_contacted_at) lastContactByClient.set(r.client_id, r.last_contacted_at);
      }
      if (rows.length < pageSize) break;
    }
  }

  const clients: ClientPin[] = ((clientsRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone_cell: string | null;
    phone_office: string | null;
    email_office: string | null;
    email_home: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    lat: number;
    lng: number;
    custom_fields: Record<string, unknown> | null;
  }>).map(c => ({
    id: c.id,
    type: 'client',
    lat: c.lat,
    lng: c.lng,
    first_name: c.first_name,
    last_name: c.last_name,
    company: c.company,
    phone_cell: c.phone_cell,
    phone_office: c.phone_office,
    email_office: c.email_office,
    email_home: c.email_home,
    address: c.address,
    city: c.city,
    state: c.state,
    zip_code: c.zip_code,
    custom_fields: c.custom_fields,
    last_contacted_at: lastContactByClient.get(c.id) ?? null,
  }));

  const jobs: JobPin[] = ((jobsRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    scheduled_date: string | null;
    job_address: string | null;
    job_city: string | null;
    job_state: string | null;
    job_lat: number;
    job_lng: number;
    custom_fields: Record<string, unknown> | null;
    clients: { first_name: string; last_name: string } | null;
  }>).map(j => ({
    id: j.id,
    type: 'job',
    lat: j.job_lat,
    lng: j.job_lng,
    title: j.title,
    status: j.status,
    scheduled_date: j.scheduled_date,
    client_name: j.clients ? `${j.clients.first_name} ${j.clients.last_name}` : null,
    description: j.description,
    priority: j.priority,
    job_address: j.job_address,
    job_city: j.job_city,
    job_state: j.job_state,
    custom_fields: j.custom_fields,
  }));

  // Employee pins: dedup by employee id (an employee assigned to two
  // jobs today shows up once at the first one). Filter rows where the
  // join didn't yield a valid job/employee.
  const seen = new Set<string>();
  const employees: EmployeePin[] = [];
  for (const row of ((assignmentsRes.data ?? []) as unknown as Array<{
    employees: { id: string; first_name: string; last_name: string; role: string | null } | null;
    jobs: { id: string; title: string; job_lat: number | null; job_lng: number | null; business_id: string; scheduled_date: string | null } | null;
  }>)) {
    const e = row.employees;
    const j = row.jobs;
    if (!e || !j || j.business_id !== businessId) continue;
    if (j.job_lat == null || j.job_lng == null) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    employees.push({
      id: e.id,
      type: 'employee',
      lat: j.job_lat,
      lng: j.job_lng,
      first_name: e.first_name,
      last_name: e.last_name,
      job_id: j.id,
      job_title: j.title,
      role: e.role,
    });
  }

  // Geocoding breakdown — UI surfaces this so the user understands why
  // some clients aren't on the map.
  //   - noAddress:    no address fields filled in (need to edit the client)
  //   - unresolved:   address exists but Google couldn't find it (or returned http/parse error)
  //   - pending:      address exists, never attempted yet (will geocode on next tap)
  // Total `needsGeocoding` = noAddress + unresolved + pending; it's the
  // count of all rows with NULL lat regardless of attempt history.
  // All three counts exclude `geocoding_ignored = true` clients (migration
  // 047) so the user can permanently silence rows they don't want pinned.
  const [{ count: needsGeocoding }, { count: noAddress }, { count: unresolved }] = await Promise.all([
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('geocoding_ignored', false)
      .is('lat', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('geocoding_ignored', false)
      .is('lat', null)
      .is('address', null)
      .is('city', null)
      .is('state', null)
      .is('zip_code', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('geocoding_ignored', false)
      .is('lat', null)
      .not('lat_lookup_attempted_at', 'is', null),
  ]);

  const total = needsGeocoding ?? 0;
  const noAddrCount = noAddress ?? 0;
  const unresolvedCount = Math.max(0, (unresolved ?? 0) - 0);
  const pendingCount = Math.max(0, total - noAddrCount - unresolvedCount);

  return res.json({
    success: true,
    data: {
      clients,
      jobs,
      employees,
      needsGeocoding: total,
      geocodeBreakdown: {
        noAddress: noAddrCount,
        unresolved: unresolvedCount,
        pending: pendingCount,
      },
    },
  });
});

/**
 * POST /api/v1/map/geocode-clients
 * Body: { business_id, max_rows? = 100 }
 *
 * Backfills missing lat/lng on the business's clients via Google Geocoding
 * API. Caps at max_rows per call so a click can't drain the API budget;
 * caller can repeat until needsGeocoding hits zero.
 */
mapRouter.post('/geocode-clients', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, max_rows } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  // Same membership gate as /pins. Server-role client bypasses RLS.
  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', business_id)
    .maybeSingle();
  if (!membership) return res.status(403).json({ success: false, message: 'forbidden' });

  const cap = typeof max_rows === 'number' && max_rows > 0 ? Math.min(max_rows, 250) : 100;
  const result = await geocodeMissingClients(business_id, cap);

  return res.json({ success: true, data: result });
});

/**
 * POST /api/v1/map/geocode-employees
 * Body: { business_id, max_rows? = 100 }
 *
 * Backfills missing lat/lng on the business's ACTIVE employees (home-address
 * fallback for the Crew Finder). Same auth/cap semantics as geocode-clients.
 */
mapRouter.post('/geocode-employees', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthenticated' });

  const { business_id, max_rows } = req.body ?? {};
  if (!business_id || typeof business_id !== 'string') {
    return res.status(400).json({ success: false, message: 'business_id required' });
  }

  const { data: membership } = await supabase
    .from('business_members')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', business_id)
    .maybeSingle();
  if (!membership) return res.status(403).json({ success: false, message: 'forbidden' });

  const cap = typeof max_rows === 'number' && max_rows > 0 ? Math.min(max_rows, 250) : 100;
  const result = await geocodeMissingEmployees(business_id, cap);

  return res.json({ success: true, data: result });
});

// Note: rule match counts are computed client-side via direct Supabase
// queries — see mobile/modules/map/MapSettingsSheet.tsx and
// web/src/modules/map/MapSettingsPanel.tsx. RLS scopes to the business
// so no API round-trip is needed.

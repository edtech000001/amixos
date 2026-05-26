import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { geocodeMissingClients } from '../lib/geocoding';

export const mapRouter = Router();
mapRouter.use(authenticate);

interface ClientPin {
  id: string;
  type: 'client';
  lat: number;
  lng: number;
  first_name: string;
  last_name: string;
  company: string | null;
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
      .select('id, first_name, last_name, company, lat, lng')
      .eq('business_id', businessId)
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    supabase
      .from('jobs')
      .select('id, title, status, scheduled_date, job_lat, job_lng, clients(first_name, last_name)')
      .eq('business_id', businessId)
      .not('job_lat', 'is', null)
      .not('job_lng', 'is', null)
      .not('status', 'in', '("cancelled","declined")'),
    // Employees assigned to a job scheduled TODAY with coords. One query
    // joins employees → assignments → jobs so we have everything in hand.
    supabase
      .from('job_assignments')
      .select('id, employees(id, first_name, last_name), jobs(id, title, job_lat, job_lng, scheduled_date, business_id)')
      .eq('jobs.business_id', businessId)
      .eq('jobs.scheduled_date', today),
  ]);

  const clients: ClientPin[] = ((clientsRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    lat: number;
    lng: number;
  }>).map(c => ({
    id: c.id,
    type: 'client',
    lat: c.lat,
    lng: c.lng,
    first_name: c.first_name,
    last_name: c.last_name,
    company: c.company,
  }));

  const jobs: JobPin[] = ((jobsRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    status: string;
    scheduled_date: string | null;
    job_lat: number;
    job_lng: number;
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
  }));

  // Employee pins: dedup by employee id (an employee assigned to two
  // jobs today shows up once at the first one). Filter rows where the
  // join didn't yield a valid job/employee.
  const seen = new Set<string>();
  const employees: EmployeePin[] = [];
  for (const row of ((assignmentsRes.data ?? []) as unknown as Array<{
    employees: { id: string; first_name: string; last_name: string } | null;
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
    });
  }

  // How many clients in this business still need geocoding? The UI uses
  // this to surface a "Locate X clients" prompt.
  const { count: needsGeocoding } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('lat', null);

  return res.json({
    success: true,
    data: {
      clients,
      jobs,
      employees,
      needsGeocoding: needsGeocoding ?? 0,
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

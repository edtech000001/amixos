// Fetches everything the Crew Finder ranking needs (crewFinder.ts is pure). All
// list reads paginate via fetchAll (1000-row cap). Ranking runs client-side;
// the only server dependency is geocoding (triggered separately).

import { fetchAll } from './supabaseFetch';
import { jobToItem, type CalItem, type RawJob } from './calendarModel';
import { normalizeOperatingHours } from './operatingHours';
import type { CrewFinderEmployee, CrewFinderInput } from './crewFinder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface CrewFinderTarget {
  /** Job being scheduled — excluded from the window so it doesn't count as its
   *  own crew's booking / nearby job. Null for a not-yet-created job. */
  jobId: string | null;
  lat: number | null;
  lng: number | null;
  scheduledDate: string | null;
  clientId: string | null;
}

export interface CrewFinderData extends CrewFinderInput {
  /** Active employees with no home coords yet (for the "geocode" hint/trigger). */
  needsGeocodeCount: number;
  /** True once the target has usable coordinates (own or client fallback). */
  targetHasCoords: boolean;
}

const DEFAULT_WINDOW_DAYS = 45;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface RawEmp {
  id: string;
  first_name: string;
  last_name: string;
  lat: number | null;
  lng: number | null;
}
interface RawJobRow extends RawJob {
  job_lat: number | null;
  job_lng: number | null;
}
interface RawAssignment {
  job_id: string;
  employee_id: string | null;
  is_lead: boolean | null;
  employees: { first_name: string; last_name: string } | null;
}

export async function fetchCrewFinderData(
  supabase: SupabaseLike,
  businessId: string,
  target: CrewFinderTarget,
  opts: { windowDays?: number } = {},
): Promise<CrewFinderData> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const today = new Date();
  const todayYmd = ymd(today);
  const endYmd = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowDays));

  const [emps, jobRows, biz] = await Promise.all([
    fetchAll<RawEmp>((from, to) =>
      supabase
        .from('employees')
        .select('id, first_name, last_name, lat, lng')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('first_name')
        .range(from, to),
    ),
    // Jobs overlapping [today, today+window], excl. cancelled/declined — mirrors
    // the calendar's overlap query so multi-day/in-progress jobs are included.
    fetchAll<RawJobRow>((from, to) =>
      supabase
        .from('jobs')
        .select('id, title, status, scheduled_date, end_date, time_start, time_end, all_day, job_city, job_state, job_lat, job_lng')
        .eq('business_id', businessId)
        .not('status', 'in', '("cancelled","declined")')
        .lte('scheduled_date', endYmd)
        .or(`end_date.gte.${todayYmd},and(end_date.is.null,scheduled_date.gte.${todayYmd})`)
        .range(from, to),
    ),
    supabase.from('businesses').select('operating_hours').eq('id', businessId).maybeSingle(),
  ]);

  // Drop the job being scheduled (if any) so it doesn't self-count.
  const jobs = jobRows.filter(j => j.id !== target.jobId);
  const jobIds = jobs.map(j => j.id);

  // Assignments for the window's jobs → group by job.
  const assignments = jobIds.length
    ? await fetchAll<RawAssignment>((from, to) =>
        supabase
          .from('job_assignments')
          .select('job_id, employee_id, is_lead, employees(first_name, last_name)')
          .in('job_id', jobIds)
          .range(from, to),
      )
    : [];

  const assigneesByJob = new Map<string, { id: string; name: string }[]>();
  const leadByJob = new Map<string, string>();
  for (const a of assignments) {
    if (!a.employee_id) continue;
    const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}`.trim() : '';
    if (!assigneesByJob.has(a.job_id)) assigneesByJob.set(a.job_id, []);
    assigneesByJob.get(a.job_id)!.push({ id: a.employee_id, name });
    if (a.is_lead) leadByJob.set(a.job_id, name);
  }

  const jobCoords: Record<string, { lat: number; lng: number } | null> = {};
  const assignedItems: CalItem[] = [];
  for (const j of jobs) {
    jobCoords[j.id] = j.job_lat != null && j.job_lng != null ? { lat: j.job_lat, lng: j.job_lng } : null;
    const item = jobToItem({
      ...j,
      assignees: assigneesByJob.get(j.id) ?? [],
      lead_name: leadByJob.get(j.id) ?? null,
    });
    if (item) assignedItems.push(item);
  }

  // Target coords: own, else the assigned client's geocoded coords.
  let targetLat = target.lat;
  let targetLng = target.lng;
  if ((targetLat == null || targetLng == null) && target.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('lat, lng')
      .eq('id', target.clientId)
      .maybeSingle();
    if (client?.lat != null && client?.lng != null) {
      targetLat = client.lat;
      targetLng = client.lng;
    }
  }

  const employees: CrewFinderEmployee[] = emps.map(e => ({
    id: e.id,
    name: `${e.first_name} ${e.last_name}`.trim(),
    homeLat: e.lat,
    homeLng: e.lng,
  }));

  return {
    target: { lat: targetLat, lng: targetLng, scheduledDate: target.scheduledDate },
    employees,
    assignedItems,
    jobCoords,
    operatingHours: normalizeOperatingHours(biz.data?.operating_hours),
    windowDays,
    needsGeocodeCount: emps.filter(e => e.lat == null).length,
    targetHasCoords: targetLat != null && targetLng != null,
  };
}

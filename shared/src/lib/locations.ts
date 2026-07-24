// Locations data layer — shared by web and mobile so both platforms manage
// branches the same way. A business can have multiple physical locations
// (e.g. "Lexington", "Georgia"); jobs belong to one location, workers can be
// assigned to many (home + borrowed), and reports roll up across all of them.
//
// See supabase/migrations/104_locations.sql for the schema.

import { fetchAll } from './supabaseFetch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface Location {
  id: string;
  business_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
  archived: boolean;
  created_at: string;
}

export interface EmployeeLocation {
  id: string;
  business_id: string;
  employee_id: string;
  location_id: string;
  is_primary: boolean;
}

export interface LocationInput {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

const LOCATION_COLS =
  'id, business_id, name, address, city, state, postal_code, country, is_default, archived, created_at';

// All active (non-archived) locations for a business, oldest first so the
// default/original branch sorts to the top.
export async function fetchLocations(
  supabase: SupabaseLike,
  businessId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Location[]> {
  return fetchAll<Location>((from, to) => {
    let q = supabase
      .from('locations')
      .select(LOCATION_COLS)
      .eq('business_id', businessId);
    if (!opts.includeArchived) q = q.eq('archived', false);
    return q.order('created_at', { ascending: true }).range(from, to);
  });
}

export async function createLocation(
  supabase: SupabaseLike,
  businessId: string,
  input: LocationInput,
): Promise<Location | null> {
  const { data, error } = await supabase
    .from('locations')
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postal_code: input.postal_code ?? null,
      country: input.country ?? null,
    })
    .select(LOCATION_COLS)
    .single();
  if (error) return null;
  return data as Location;
}

export async function updateLocation(
  supabase: SupabaseLike,
  locationId: string,
  patch: Partial<LocationInput> & { archived?: boolean },
): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.city !== undefined) update.city = patch.city;
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.postal_code !== undefined) update.postal_code = patch.postal_code;
  if (patch.country !== undefined) update.country = patch.country;
  if (patch.archived !== undefined) update.archived = patch.archived;
  const { error } = await supabase.from('locations').update(update).eq('id', locationId);
  return !error;
}

// Soft-delete: archive so existing jobs/assignments keep their reference.
export async function archiveLocation(
  supabase: SupabaseLike,
  locationId: string,
): Promise<boolean> {
  return updateLocation(supabase, locationId, { archived: true });
}

// ── Employee ↔ location assignments ──────────────────────────────────────

// All worker↔location links for a business (used to build per-location
// employee lists and to show each worker's branches).
export async function fetchEmployeeLocations(
  supabase: SupabaseLike,
  businessId: string,
): Promise<EmployeeLocation[]> {
  return fetchAll<EmployeeLocation>((from, to) =>
    supabase
      .from('employee_locations')
      .select('id, business_id, employee_id, location_id, is_primary')
      .eq('business_id', businessId)
      .range(from, to),
  );
}

// Replace a worker's full set of location assignments in one call. The primary
// (home) location is flagged; the rest are borrowed branches.
export async function setEmployeeLocations(
  supabase: SupabaseLike,
  businessId: string,
  employeeId: string,
  locationIds: string[],
  primaryLocationId: string | null,
): Promise<boolean> {
  const del = await supabase
    .from('employee_locations')
    .delete()
    .eq('business_id', businessId)
    .eq('employee_id', employeeId);
  if (del.error) return false;
  if (locationIds.length === 0) return true;
  const rows = locationIds.map((location_id) => ({
    business_id: businessId,
    employee_id: employeeId,
    location_id,
    is_primary: location_id === primaryLocationId,
  }));
  const { error } = await supabase.from('employee_locations').insert(rows);
  return !error;
}

// Set (or clear) a worker's HOME branch without disturbing their borrowed
// branches. Used by the employee add/edit form, where you pick a primary
// location; lending to extra branches stays managed in Ajustes → Ubicaciones.
// homeLocationId null = worker keeps any existing branches but has no primary.
export async function setEmployeePrimaryLocation(
  supabase: SupabaseLike,
  businessId: string,
  employeeId: string,
  homeLocationId: string | null,
): Promise<boolean> {
  const links = await fetchEmployeeLocations(supabase, businessId).catch(() => [] as EmployeeLocation[]);
  const mine = links.filter((l) => l.employee_id === employeeId);
  const ids = new Set(mine.map((l) => l.location_id));
  if (homeLocationId) ids.add(homeLocationId);
  return setEmployeeLocations(supabase, businessId, employeeId, Array.from(ids), homeLocationId);
}

// A worker's home (primary) branch id, or null. Convenience for forms.
export function primaryLocationOf(links: EmployeeLocation[], employeeId: string): string | null {
  return links.find((l) => l.employee_id === employeeId && l.is_primary)?.location_id ?? null;
}

// The logged-in member's HOME branch (their employee row's primary location),
// or null if they have no roster row / no primary. Used to default the active
// location filter to "my branch" for non-owners. Single .single() fetches —
// no pagination needed.
export async function fetchMyHomeLocation(
  supabase: SupabaseLike,
  businessId: string,
  userId: string,
): Promise<string | null> {
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (!emp?.id) return null;
  const { data: link } = await supabase
    .from('employee_locations')
    .select('location_id')
    .eq('employee_id', emp.id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  return link?.location_id ?? null;
}

// Toggle whether a worker is "shared" into a branch (lent there). Adds or
// removes the membership but NEVER removes their home branch — sharing is for
// borrowed branches only. Returns the resulting "is now shared" state.
export async function toggleEmployeeBranch(
  supabase: SupabaseLike,
  businessId: string,
  employeeId: string,
  locationId: string,
): Promise<boolean> {
  const links = await fetchEmployeeLocations(supabase, businessId).catch(() => [] as EmployeeLocation[]);
  const mine = links.filter((l) => l.employee_id === employeeId);
  const primary = mine.find((l) => l.is_primary)?.location_id ?? null;
  if (locationId === primary) return true; // home branch — leave it
  const has = mine.some((l) => l.location_id === locationId);
  const ids = has
    ? mine.map((l) => l.location_id).filter((x) => x !== locationId)
    : [...mine.map((l) => l.location_id), locationId];
  await setEmployeeLocations(supabase, businessId, employeeId, Array.from(new Set(ids)), primary);
  return !has;
}

// Employee IDs assigned to a given location (home or borrowed). Pass through to
// scope an employee list to the active branch.
export function employeeIdsAtLocation(
  links: EmployeeLocation[],
  locationId: string,
): Set<string> {
  return new Set(links.filter((l) => l.location_id === locationId).map((l) => l.employee_id));
}

// ── Client ↔ location assignments (mirrors employees) ─────────────────────
// Clients are shared-by-default (no link = shows everywhere); a client can be
// filed to a home branch and shared into others so they never vanish from a
// branch where they have work.

export interface ClientLocation {
  id: string;
  business_id: string;
  client_id: string;
  location_id: string;
  is_primary: boolean;
}

export async function fetchClientLocations(
  supabase: SupabaseLike,
  businessId: string,
): Promise<ClientLocation[]> {
  return fetchAll<ClientLocation>((from, to) =>
    supabase
      .from('client_locations')
      .select('id, business_id, client_id, location_id, is_primary')
      .eq('business_id', businessId)
      .range(from, to),
  );
}

export async function setClientLocations(
  supabase: SupabaseLike,
  businessId: string,
  clientId: string,
  locationIds: string[],
  primaryLocationId: string | null,
): Promise<boolean> {
  const del = await supabase
    .from('client_locations')
    .delete()
    .eq('business_id', businessId)
    .eq('client_id', clientId);
  if (del.error) return false;
  if (locationIds.length === 0) return true;
  const rows = locationIds.map((location_id) => ({
    business_id: businessId,
    client_id: clientId,
    location_id,
    is_primary: location_id === primaryLocationId,
  }));
  const { error } = await supabase.from('client_locations').insert(rows);
  return !error;
}

// Set the client's HOME branch without disturbing its shared branches.
export async function setClientPrimaryLocation(
  supabase: SupabaseLike,
  businessId: string,
  clientId: string,
  homeLocationId: string | null,
): Promise<boolean> {
  const links = await fetchClientLocations(supabase, businessId).catch(() => [] as ClientLocation[]);
  const mine = links.filter((l) => l.client_id === clientId);
  const ids = new Set(mine.map((l) => l.location_id));
  if (homeLocationId) ids.add(homeLocationId);
  return setClientLocations(supabase, businessId, clientId, Array.from(ids), homeLocationId);
}

export function primaryClientLocationOf(links: ClientLocation[], clientId: string): string | null {
  return links.find((l) => l.client_id === clientId && l.is_primary)?.location_id ?? null;
}

// Toggle whether a client is shared into a branch (never removes its home).
export async function toggleClientBranch(
  supabase: SupabaseLike,
  businessId: string,
  clientId: string,
  locationId: string,
): Promise<boolean> {
  const links = await fetchClientLocations(supabase, businessId).catch(() => [] as ClientLocation[]);
  const mine = links.filter((l) => l.client_id === clientId);
  const primary = mine.find((l) => l.is_primary)?.location_id ?? null;
  if (locationId === primary) return true;
  const has = mine.some((l) => l.location_id === locationId);
  const ids = has
    ? mine.map((l) => l.location_id).filter((x) => x !== locationId)
    : [...mine.map((l) => l.location_id), locationId];
  await setClientLocations(supabase, businessId, clientId, Array.from(new Set(ids)), primary);
  return !has;
}

// Client IDs linked to a given location. A client with NO links is shared
// (shows in every branch) — the caller ORs that in.
export function clientIdsAtLocation(
  links: ClientLocation[],
  locationId: string,
): Set<string> {
  return new Set(links.filter((l) => l.location_id === locationId).map((l) => l.client_id));
}

// Client IDs that have at least one branch link (i.e. are NOT shared-everywhere).
export function clientsWithAnyLocation(links: ClientLocation[]): Set<string> {
  return new Set(links.map((l) => l.client_id));
}

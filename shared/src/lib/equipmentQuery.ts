// Server-side paginated + searched equipment loading.
//
// Keyset by (name, id) ASC — the equipment list's default (ungrouped) view is
// A–Z by name, and while searching it collapses to a flat name-sorted list, so
// both paginate cleanly. name is NOT NULL. Cursor values are double-quoted/
// escaped for PostgREST (names hold reserved chars).
//
// Grouping (type / lead / property / expiration) needs every matching row to
// bucket + rank, so those views load-all + group client-side (equipment is a
// low-volume list — a fleet rarely runs to thousands of assets).

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any };

export interface EquipmentCursor {
  name: string;
  id: string;
}

export interface EquipmentQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Free-text search across name, make, model, plate, type. */
  search?: string;
  cursor?: EquipmentCursor | null;
  pageSize?: number;
}

export interface EquipmentPage<T extends { id: string; name: string }> {
  items: T[];
  nextCursor: EquipmentCursor | null;
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const quoteVal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Fetch one page of equipment. `select` MUST include `id, name` for the keyset. */
export async function fetchEquipmentPage<T extends { id: string; name: string }>(
  supabase: AnySupabase,
  select: string,
  params: EquipmentQueryParams,
): Promise<EquipmentPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('equipment').select(select).eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (term) {
    const like = `%${escLike(term)}%`;
    q = q.or(`name.ilike.${like},make.ilike.${like},model.ilike.${like},plate_number.ilike.${like},equipment_type.ilike.${like}`);
  }
  if (params.cursor) {
    const nm = quoteVal(params.cursor.name);
    q = q.or(`name.gt.${nm},and(name.eq.${nm},id.gt.${params.cursor.id})`);
  }
  q = q.order('name', { ascending: true }).order('id', { ascending: true }).limit(pageSize);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const items = (data ?? []) as T[];
  const last = items[items.length - 1] as any;
  const nextCursor = items.length === pageSize && last ? { name: last.name, id: last.id } : null;
  return { items, nextCursor };
}

/** Load ALL equipment matching the filters (name order) — the load-all path for
 *  the grouped views (type / lead / property / expiration). */
export async function fetchAllEquipmentMatching<T extends { id: string; name: string }>(
  supabase: AnySupabase,
  select: string,
  params: EquipmentQueryParams,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: EquipmentCursor | null = null;
  for (let i = 0; i < 100; i++) {
    const page = await fetchEquipmentPage<T>(supabase, select, { ...params, cursor, pageSize: 1000 });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Total equipment matching the filters (for the header count). */
export async function fetchEquipmentCount(
  supabase: AnySupabase,
  params: Pick<EquipmentQueryParams, 'businessId' | 'locationId' | 'search'>,
): Promise<number> {
  const term = params.search?.trim() ?? '';
  let q = supabase.from('equipment').select('id', { count: 'exact', head: true })
    .eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (term) {
    const like = `%${escLike(term)}%`;
    q = q.or(`name.ilike.${like},make.ilike.${like},model.ilike.${like},plate_number.ilike.${like},equipment_type.ilike.${like}`);
  }
  const { count } = await q;
  return count ?? 0;
}

/** True when the grouped view needs the FULL matching set (any grouping except
 *  the default flat 'none' view; while searching the list is flat regardless). */
export function equipmentNeedsAll(groupBy: string, searching: boolean): boolean {
  return groupBy !== 'none' && !searching;
}

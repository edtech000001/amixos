// Server-side paginated + searched inventory loading.
//
// Keyset by (name, id) ASC — inventory reads best alphabetically, and the list
// has no other sort. name is NOT NULL so the cursor never straddles a null.
// Cursor values are double-quoted/escaped for PostgREST (names hold reserved
// chars like '.' ',').
//
// The "low stock" segment filters on the STORED generated column `is_low_stock`
// (migration 166) — PostgREST can't compare quantity <= low_stock_threshold in a
// filter. The summary strip (count, total value, low-stock count) sums EVERY
// item in scope, so it comes from the `inventory_stats` RPC, not the loaded page.

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnySupabase = { from: (table: string) => any; rpc: (fn: string, params?: any) => any };

export interface InventoryCursor {
  name: string;
  id: string;
}

export interface InventoryQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Free-text search across name, sku, category. */
  search?: string;
  /** Restrict to low-stock items (the "bajo_stock" segment). */
  lowStockOnly?: boolean;
  cursor?: InventoryCursor | null;
  pageSize?: number;
}

export interface InventoryPage<T extends { id: string; name: string }> {
  items: T[];
  nextCursor: InventoryCursor | null;
}

export interface InventoryStats {
  count: number;
  value: number;
  lowStockCount: number;
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const quoteVal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Fetch one page of inventory items. `select` MUST include `id, name` for the
 *  keyset. Returns the rows plus the next-page cursor. */
export async function fetchInventoryPage<T extends { id: string; name: string }>(
  supabase: AnySupabase,
  select: string,
  params: InventoryQueryParams,
): Promise<InventoryPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('inventory_items').select(select).eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (params.lowStockOnly) q = q.eq('is_low_stock', true);
  if (term) {
    const like = `%${escLike(term)}%`;
    q = q.or(`name.ilike.${like},sku.ilike.${like},category.ilike.${like}`);
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

/** Whole-scope summary (count, total stock value, low-stock count) via the
 *  inventory_stats RPC — independent of search / segment, matching the list's
 *  header which always reflects the full location. */
export async function fetchInventoryStats(
  supabase: AnySupabase,
  params: Pick<InventoryQueryParams, 'businessId' | 'locationId'>,
): Promise<InventoryStats> {
  const { data, error } = await supabase.rpc('inventory_stats', {
    p_business_id: params.businessId,
    p_location_id: params.locationId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { total_count: number | string; total_value: number | string; low_stock_count: number | string }
    | undefined;
  return {
    count: Number(row?.total_count ?? 0),
    value: Number(row?.total_value ?? 0),
    lowStockCount: Number(row?.low_stock_count ?? 0),
  };
}

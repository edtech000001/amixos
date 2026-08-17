// Server-side paginated + searched rental-properties loading, plus the bounded
// fetch-all helpers the rest of the module leans on.
//
// Keyset by (name, id) ASC on rental_properties_keyset_idx — mirrors
// equipmentQuery.ts. Rental row counts are low (a landlord rarely runs to
// thousands of anything), but PostgREST silently caps .select() at 1000 rows,
// so every "load all" path still loops (CLAUDE.md pagination rule).

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  duePeriodsForLease,
  parseDateOnly,
  type RentalCharge,
  type RentalExpense,
  type RentalLease,
  type RentalMaintenance,
  type RentalPayment,
  type RentalTenant,
} from './rentals';

type AnySupabase = { from: (table: string) => any };

export interface RentalPropertyCursor {
  name: string;
  id: string;
}

export interface RentalPropertyQueryParams {
  businessId: string;
  /** Active branch, or null for "all locations". */
  locationId?: string | null;
  /** Free-text search across name, address, city. */
  search?: string;
  cursor?: RentalPropertyCursor | null;
  pageSize?: number;
}

export interface RentalPropertyPage<T extends { id: string; name: string }> {
  items: T[];
  nextCursor: RentalPropertyCursor | null;
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const quoteVal = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Fetch one page of properties. `select` MUST include `id, name`. */
export async function fetchRentalPropertiesPage<T extends { id: string; name: string }>(
  supabase: AnySupabase,
  select: string,
  params: RentalPropertyQueryParams,
): Promise<RentalPropertyPage<T>> {
  const pageSize = params.pageSize ?? 50;
  const term = params.search?.trim() ?? '';

  let q = supabase.from('rental_properties').select(select).eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (term) {
    const like = `%${escLike(term)}%`;
    q = q.or(`name.ilike.${like},address.ilike.${like},city.ilike.${like}`);
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

/** Load ALL properties matching the filters (name order). */
export async function fetchAllRentalPropertiesMatching<T extends { id: string; name: string }>(
  supabase: AnySupabase,
  select: string,
  params: RentalPropertyQueryParams,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: RentalPropertyCursor | null = null;
  for (let i = 0; i < 100; i++) {
    const page = await fetchRentalPropertiesPage<T>(supabase, select, { ...params, cursor, pageSize: 1000 });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Total properties matching the filters (header count). */
export async function fetchRentalPropertiesCount(
  supabase: AnySupabase,
  params: Pick<RentalPropertyQueryParams, 'businessId' | 'locationId' | 'search'>,
): Promise<number> {
  const term = params.search?.trim() ?? '';
  let q = supabase.from('rental_properties').select('id', { count: 'exact', head: true })
    .eq('business_id', params.businessId);
  if (params.locationId) q = q.eq('location_id', params.locationId);
  if (term) {
    const like = `%${escLike(term)}%`;
    q = q.or(`name.ilike.${like},address.ilike.${like},city.ilike.${like}`);
  }
  const { count } = await q;
  return count ?? 0;
}

// ─── Bounded fetch-all helpers (keyset by uuid id; 1000-row loop) ────────────

async function fetchAllRows<T extends { id: string }>(
  build: (afterId: string | null, pageSize: number) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  let afterId: string | null = null;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await build(afterId, pageSize);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    afterId = rows[rows.length - 1].id;
  }
  return out;
}

export function fetchAllTenants(supabase: AnySupabase, businessId: string): Promise<RentalTenant[]> {
  return fetchAllRows<RentalTenant>((afterId, pageSize) => {
    let q = supabase.from('rental_tenants').select('*')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchAllLeases(
  supabase: AnySupabase,
  businessId: string,
  opts?: { status?: 'active' | 'ended'; propertyId?: string },
): Promise<RentalLease[]> {
  return fetchAllRows<RentalLease>((afterId, pageSize) => {
    let q = supabase.from('rental_leases').select('*')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (opts?.status) q = q.eq('status', opts.status);
    if (opts?.propertyId) q = q.eq('property_id', opts.propertyId);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchChargesForLease(supabase: AnySupabase, leaseId: string): Promise<RentalCharge[]> {
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .eq('lease_id', leaseId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** All charges for one month (YYYY-MM-01) across the business — the rent roll. */
export function fetchChargesForMonth(
  supabase: AnySupabase,
  businessId: string,
  periodStart: string,
): Promise<RentalCharge[]> {
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .eq('business_id', businessId)
      .eq('period_start', periodStart)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** All charges for one property (property_id is denormalized on charges). */
export function fetchChargesForProperty(supabase: AnySupabase, propertyId: string): Promise<RentalCharge[]> {
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .eq('property_id', propertyId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** Every charge whose period falls in [fromPeriod, toPeriod] — the Overview's
 *  12-month trend and YTD figures. Paginated: a 3-year-old portfolio easily
 *  exceeds the 1000-row cap. */
export function fetchChargesInRange(
  supabase: AnySupabase,
  businessId: string,
  fromPeriod: string,
  toPeriod: string,
): Promise<RentalCharge[]> {
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .eq('business_id', businessId)
      .gte('period_start', fromPeriod)
      .lte('period_start', toPeriod)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** Payments RECEIVED in [from, to] (by paid_on) — cash-basis income. */
export function fetchPaymentsInRange(
  supabase: AnySupabase,
  businessId: string,
  from: string,
  to: string,
): Promise<RentalPayment[]> {
  return fetchAllRows<RentalPayment>((afterId, pageSize) => {
    let q = supabase.from('rental_payments').select('*')
      .eq('business_id', businessId)
      .gte('paid_on', from)
      .lte('paid_on', to)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** Every unpaid-capable charge for the business regardless of age — the
 *  delinquency aging table and all-time per-property balances. */
export function fetchAllCharges(
  supabase: AnySupabase,
  businessId: string,
): Promise<RentalCharge[]> {
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** Every payment for the business (pairs with fetchAllCharges for balances). */
export function fetchAllPayments(
  supabase: AnySupabase,
  businessId: string,
): Promise<RentalPayment[]> {
  return fetchAllRows<RentalPayment>((afterId, pageSize) => {
    let q = supabase.from('rental_payments').select('*')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** All charges across a set of leases (a tenant's history — small set). */
export function fetchChargesForLeases(
  supabase: AnySupabase,
  leaseIds: string[],
): Promise<RentalCharge[]> {
  if (leaseIds.length === 0) return Promise.resolve([]);
  return fetchAllRows<RentalCharge>((afterId, pageSize) => {
    let q = supabase.from('rental_charges').select('*')
      .in('lease_id', leaseIds)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

/** All payments across a set of leases (a property's leases — small set). */
export function fetchPaymentsForLeases(
  supabase: AnySupabase,
  leaseIds: string[],
): Promise<RentalPayment[]> {
  if (leaseIds.length === 0) return Promise.resolve([]);
  return fetchAllRows<RentalPayment>((afterId, pageSize) => {
    let q = supabase.from('rental_payments').select('*')
      .in('lease_id', leaseIds)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchPaymentsForLease(supabase: AnySupabase, leaseId: string): Promise<RentalPayment[]> {
  return fetchAllRows<RentalPayment>((afterId, pageSize) => {
    let q = supabase.from('rental_payments').select('*')
      .eq('lease_id', leaseId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchPaymentsForCharges(
  supabase: AnySupabase,
  businessId: string,
  chargeIds: string[],
): Promise<RentalPayment[]> {
  if (chargeIds.length === 0) return Promise.resolve([]);
  return fetchAllRows<RentalPayment>((afterId, pageSize) => {
    let q = supabase.from('rental_payments').select('*')
      .eq('business_id', businessId)
      .in('charge_id', chargeIds)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchExpensesForProperty(
  supabase: AnySupabase,
  propertyId: string,
): Promise<RentalExpense[]> {
  return fetchAllRows<RentalExpense>((afterId, pageSize) => {
    let q = supabase.from('rental_expenses').select('*')
      .eq('property_id', propertyId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchExpensesInRange(
  supabase: AnySupabase,
  businessId: string,
  from: string,
  to: string,
): Promise<RentalExpense[]> {
  return fetchAllRows<RentalExpense>((afterId, pageSize) => {
    let q = supabase.from('rental_expenses').select('*')
      .eq('business_id', businessId)
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

export function fetchMaintenanceForProperty(
  supabase: AnySupabase,
  propertyId: string,
): Promise<RentalMaintenance[]> {
  return fetchAllRows<RentalMaintenance>((afterId, pageSize) => {
    let q = supabase.from('rental_maintenance').select('*')
      .eq('property_id', propertyId)
      .order('id', { ascending: true })
      .limit(pageSize);
    if (afterId) q = q.gt('id', afterId);
    return q;
  });
}

// ─── Lazy charge generation ──────────────────────────────────────────────────

/**
 * Materialize every missing lease-month charge up to the current month, then
 * flip fully-ended leases to status='ended'. Idempotent: anchored on the DB's
 * unique (lease_id, period_start) with ignoreDuplicates, so concurrent loads
 * from two devices race harmlessly and existing charges keep their snapshotted
 * amount. Caller gates on can.editRentals (viewers just read what exists).
 * Returns true when anything was inserted or a lease auto-ended (caller
 * refetches then).
 */
export async function generateChargesForLeases(
  supabase: AnySupabase,
  leases: RentalLease[],
  today: Date = new Date(),
): Promise<boolean> {
  const active = leases.filter((l) => l.status === 'active');
  if (active.length === 0) return false;

  const rows: Array<Record<string, unknown>> = [];
  for (const lease of active) {
    for (const p of duePeriodsForLease(lease, today)) {
      rows.push({
        business_id: lease.business_id,
        lease_id: lease.id,
        property_id: lease.property_id,
        period_start: p.periodStart,
        due_date: p.dueDate,
        amount: lease.monthly_rent,
      });
    }
  }

  let changed = false;
  if (rows.length > 0) {
    // Batches of 500 keep each upsert well under request-size limits.
    for (let i = 0; i < rows.length; i += 500) {
      const { error, count } = await supabase.from('rental_charges')
        .upsert(rows.slice(i, i + 500), {
          onConflict: 'lease_id,period_start',
          ignoreDuplicates: true,
          count: 'exact',
        });
      if (error) throw new Error(error.message);
      if ((count ?? 0) > 0) changed = true;
    }
  }

  // Lazy auto-end: a lease past its end date has all charges materialized now.
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endedIds = active
    .filter((l) => l.end_date && parseDateOnly(l.end_date).getTime() < t.getTime())
    .map((l) => l.id);
  if (endedIds.length > 0) {
    const { error } = await supabase.from('rental_leases')
      .update({ status: 'ended' })
      .in('id', endedIds);
    if (!error) changed = true;
  }
  return changed;
}

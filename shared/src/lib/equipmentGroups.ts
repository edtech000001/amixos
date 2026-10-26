// Grouping for the equipment list (web + mobile share the ordering so the two
// platforms always show the same sections). Mirrors the clients grouping in
// ./clientSections.ts.

import { plateExpirationDays } from './equipment';

export type EquipmentGroupKey =
  | 'none'
  | 'lead'
  | 'type'
  | 'property'
  | 'expiration';

export interface EquipmentSection<T> {
  /** Section header; '' for the flat (ungrouped / search-results) section. */
  title: string;
  data: T[];
}

interface GroupableEquipment {
  name: string;
  equipment_type: string | null;
  paid_off: boolean;
  plate_expiration: string | null; // ISO date
  assigned_employee_id: string | null;
}

// Persisted group-by preference (web: localStorage, mobile: AsyncStorage).
export const EQUIPMENT_GROUP_KEY = 'amixos.equipment.groupBy';

const VALID: EquipmentGroupKey[] = ['none', 'lead', 'type', 'property', 'expiration'];

/** Coerce a stored value into a valid EquipmentGroupKey; defaults to 'none'. */
export function parseEquipmentGroupKey(raw: string | null | undefined): EquipmentGroupKey {
  return VALID.includes(raw as EquipmentGroupKey) ? (raw as EquipmentGroupKey) : 'none';
}

// ── Quick filters ───────────────────────────────────────────────────────────
// The expiration filters of the saved EquipmentView (below) — several can be
// on at once (OR'd). The Filters-button badge / filter bar keep an active
// filter visible, so a saved one can't quietly read as missing equipment.

export type EquipmentQuickFilter =
  | 'all'
  | 'plate_expired'
  | 'plate_expiring'
  | 'policy_expired'
  | 'policy_expiring';

interface FilterableEquipment {
  plate_expiration: string | null;   // ISO date
  insurance_expiration: string | null; // ISO date
}

/** "Expiring soon" = within this many days (matches the expiration grouping). */
const EXPIRING_SOON_DAYS = 30;

export function equipmentMatchesQuickFilter(
  e: FilterableEquipment,
  filter: EquipmentQuickFilter,
): boolean {
  if (filter === 'all') return true;
  const days = plateExpirationDays(
    filter === 'plate_expired' || filter === 'plate_expiring'
      ? e.plate_expiration
      : e.insurance_expiration,
  );
  if (days === null) return false;
  if (filter === 'plate_expired' || filter === 'policy_expired') return days < 0;
  return days >= 0 && days <= EXPIRING_SOON_DAYS;
}

export interface EquipmentGroupLabels {
  unassigned: string;
  noType: string;
  paid: string;
  financed: string;
  expired: string;
  expiringSoon: string;
  valid: string;
  noPlate: string;
}

/**
 * Group equipment into titled sections by the chosen key. Items are sorted by
 * name within each section; sections are ordered by a per-key rank (so e.g. the
 * "expired" plates float to the top and "no plate" sinks to the bottom), then
 * alphabetically. `none` (or while searching) returns a single flat section.
 */
export function groupEquipment<T extends GroupableEquipment>(
  items: T[],
  groupBy: EquipmentGroupKey,
  searching: boolean,
  opts: {
    leadName: (id: string | null) => string | null;
    labels: EquipmentGroupLabels;
    /** Rows are already in the chosen sort order (sortEquipment) — keep it
     *  inside each section instead of re-sorting by name. */
    keepOrder?: boolean;
  },
): EquipmentSection<T>[] {
  const sorted = opts.keepOrder ? [...items] : [...items].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
  );
  if (groupBy === 'none' || searching) {
    return sorted.length > 0 ? [{ title: '', data: sorted }] : [];
  }

  const { labels } = opts;
  const bucketOf = (e: T): { title: string; rank: number } => {
    if (groupBy === 'type') {
      const v = e.equipment_type?.trim();
      return v ? { title: v, rank: 0 } : { title: labels.noType, rank: 1 };
    }
    if (groupBy === 'lead') {
      const name = opts.leadName(e.assigned_employee_id)?.trim();
      return name ? { title: name, rank: 0 } : { title: labels.unassigned, rank: 1 };
    }
    if (groupBy === 'property') {
      return e.paid_off
        ? { title: labels.paid, rank: 1 }
        : { title: labels.financed, rank: 0 };
    }
    // expiration
    const days = plateExpirationDays(e.plate_expiration);
    if (days === null) return { title: labels.noPlate, rank: 3 };
    if (days < 0) return { title: labels.expired, rank: 0 };
    if (days <= 30) return { title: labels.expiringSoon, rank: 1 };
    return { title: labels.valid, rank: 2 };
  };

  const map = new Map<string, { title: string; rank: number; data: T[] }>();
  for (const e of sorted) {
    const b = bucketOf(e);
    const existing = map.get(b.title);
    if (existing) existing.data.push(e);
    else map.set(b.title, { title: b.title, rank: b.rank, data: [e] });
  }

  return Array.from(map.values())
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    })
    .map(({ title, data }) => ({ title, data }));
}

// ── Sort + saved view (Filters sheet / web filter bar) ─────────────────────
// Sorting + the filters below run client-side over the load-all set (a fleet
// is small), so they need no server support.

export type EquipmentSortKey = 'name' | 'recent' | 'plate' | 'policy';
export const EQUIPMENT_SORT_KEYS: EquipmentSortKey[] = ['name', 'recent', 'plate', 'policy'];
/** Name A–Z; newest first; expirations SOONEST first (what needs action). */
const SORT_DEFAULT_DESC: Record<EquipmentSortKey, boolean> = { name: false, recent: true, plate: false, policy: false };
export function equipmentSortIsDesc(k: EquipmentSortKey, sortDesc?: boolean | null): boolean {
  return sortDesc ?? SORT_DEFAULT_DESC[k];
}
export function equipmentSortCaption(k: EquipmentSortKey, desc: boolean):
  'az' | 'za' | 'newest' | 'oldest' | 'soonest' | 'latest' {
  if (k === 'name') return desc ? 'za' : 'az';
  if (k === 'recent') return desc ? 'newest' : 'oldest';
  return desc ? 'latest' : 'soonest';
}

interface SortableEquipment {
  name: string;
  created_at?: string | null;
  plate_expiration: string | null;
  insurance_expiration: string | null;
}

export function sortEquipment<T extends SortableEquipment>(items: T[], k: EquipmentSortKey, sortDesc: boolean | null): T[] {
  const dir = equipmentSortIsDesc(k, sortDesc) ? -1 : 1;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  const val = (e: T): string | null =>
    k === 'recent' ? e.created_at ?? null : k === 'plate' ? e.plate_expiration : k === 'policy' ? e.insurance_expiration : null;
  return [...items].sort((a, b) => {
    if (k === 'name') return byName(a, b) * dir;
    const va = val(a), vb = val(b);
    // No date sinks to the bottom in either direction.
    if (!va || !vb) return va ? -1 : vb ? 1 : byName(a, b);
    return va.localeCompare(vb) * dir || byName(a, b);
  });
}

export type EquipmentExpiryFilter = Exclude<EquipmentQuickFilter, 'all'>;
export const EQUIPMENT_EXPIRY_FILTERS: EquipmentExpiryFilter[] = ['plate_expired', 'plate_expiring', 'policy_expired', 'policy_expiring'];
export type EquipmentAssigned = 'any' | 'assigned' | 'unassigned';

export interface EquipmentView {
  sortBy: EquipmentSortKey;
  sortDesc: boolean | null;
  /** Expiration filters — OR'd: "plate expiring" + "policy expiring" shows
   *  equipment with EITHER coming due. */
  expiry: EquipmentExpiryFilter[];
  assigned: EquipmentAssigned;
}
export const EQUIPMENT_VIEW_KEY = 'amixos.equipmentView.v1';
export const DEFAULT_EQUIPMENT_VIEW: EquipmentView = { sortBy: 'name', sortDesc: null, expiry: [], assigned: 'any' };

export function parseEquipmentView(raw: string | null | undefined): EquipmentView {
  const out: EquipmentView = { ...DEFAULT_EQUIPMENT_VIEW, expiry: [] };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    if (EQUIPMENT_SORT_KEYS.includes(o?.sortBy)) out.sortBy = o.sortBy;
    if (typeof o?.sortDesc === 'boolean') out.sortDesc = o.sortDesc;
    if (Array.isArray(o?.expiry)) out.expiry = o.expiry.filter((k: unknown) => EQUIPMENT_EXPIRY_FILTERS.includes(k as EquipmentExpiryFilter));
    if (o?.assigned === 'assigned' || o?.assigned === 'unassigned') out.assigned = o.assigned;
  } catch { /* corrupt — defaults */ }
  return out;
}

/** Row filters of the view (sort excluded). */
export function equipmentMatchesView(
  e: FilterableEquipment & { assigned_employee_id: string | null },
  v: Pick<EquipmentView, 'expiry' | 'assigned'>,
): boolean {
  if (v.assigned === 'assigned' && !e.assigned_employee_id) return false;
  if (v.assigned === 'unassigned' && e.assigned_employee_id) return false;
  if (v.expiry.length && !v.expiry.some(f => equipmentMatchesQuickFilter(e, f))) return false;
  return true;
}

/** Whether the view needs every row (anything but the plain A–Z page). */
export function equipmentViewNeedsAll(v: EquipmentView): boolean {
  return v.expiry.length > 0 || v.assigned !== 'any' || v.sortBy !== 'name' || v.sortDesc === true;
}

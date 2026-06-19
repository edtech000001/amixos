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
  },
): EquipmentSection<T>[] {
  const sorted = [...items].sort((a, b) =>
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

// Jobs-list field filters (migration 253) — the UI side: which fields can be
// filtered, the saved picks (value + its display label, so a chip reads
// "Lead · Juan Pérez" before the values have loaded), and the query shape.
// The filter rules themselves: job_matches_filters() in SQL, mirrored by
// applyFieldFilters() in jobsQuery.ts.

import type { JobFieldFilters } from './jobsQuery';

export interface PickedValue { v: string; l: string }
/** field key → picked values. */
export type JobFieldPicks = Record<string, PickedValue[]>;

export interface JobFilterField { key: string; label: string }

/** Built-in fields, then the business's custom job fields ('cf:<key>'). */
export function jobFilterFields(
  t: { lead: string; crew: string; client: string; priority: string; state: string; city: string },
  custom: { field_key: string; field_label: string }[] = [],
): JobFilterField[] {
  return [
    { key: 'lead', label: t.lead },
    { key: 'crew', label: t.crew },
    { key: 'client', label: t.client },
    { key: 'priority', label: t.priority },
    { key: 'state', label: t.state },
    { key: 'city', label: t.city },
    ...custom.map(c => ({ key: `cf:${c.field_key}`, label: c.field_label })),
  ];
}

/** The picks as the query/RPC arg (values only). */
export function picksToQuery(p: JobFieldPicks | null | undefined): JobFieldFilters {
  const out: JobFieldFilters = {};
  for (const [k, vals] of Object.entries(p ?? {})) if (vals?.length) out[k] = vals.map(x => x.v);
  return out;
}

export function picksCount(p: JobFieldPicks | null | undefined): number {
  return Object.values(p ?? {}).filter(v => v?.length).length;
}

/** Tolerant parse of a saved blob. */
export function parsePicks(o: unknown): JobFieldPicks {
  const out: JobFieldPicks = {};
  if (!o || typeof o !== 'object') return out;
  for (const [k, vals] of Object.entries(o as Record<string, unknown>)) {
    if (!Array.isArray(vals)) continue;
    const ok = vals.filter((x): x is PickedValue => !!x && typeof (x as PickedValue).v === 'string')
      .map(x => ({ v: x.v, l: typeof x.l === 'string' ? x.l : x.v }));
    if (ok.length) out[k] = ok;
  }
  return out;
}

/** Display label for a value: '' → "(Empty)", priorities translated. */
export function jobFilterValueLabel(
  field: string,
  value: string,
  label: string,
  t: { empty: string },
  priorities: Record<string, string>,
): string {
  if (value === '') return t.empty;
  if (field === 'priority') return priorities[value] ?? value;
  return label || value;
}

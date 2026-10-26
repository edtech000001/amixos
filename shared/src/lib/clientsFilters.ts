// Persisted clients-list sort + filters (migration 252), saved per
// device+business next to the group-by (CLIENTS_GROUP_KEY). Mirrors
// invoicesFilters.ts.

import { parseAppliedDatePreset, type AppliedDatePreset } from './dateRangePresets';
import {
  CLIENT_QUICK_KEYS,
  CLIENT_SORT_KEYS,
  type ClientDateField,
  type ClientQuickFilter,
  type ClientSortKey,
} from './clientsQuery';

export interface ClientsFilters {
  sortBy: ClientSortKey;
  sortDesc: boolean | null;
  quick: ClientQuickFilter[];
  dateField: ClientDateField;
  dateFrom: string | null;
  dateTo: string | null;
  datePreset: AppliedDatePreset | null;
}

export const CLIENTS_FILTERS_KEY = 'amixos.clientsFilters.v1';

export const DEFAULT_CLIENTS_FILTERS: ClientsFilters = {
  sortBy: 'name', sortDesc: null, quick: [], dateField: 'added', dateFrom: null, dateTo: null, datePreset: null,
};

/** Parse a stored blob, tolerating bad/old data (falls back per field). */
export function parseClientsFilters(raw: string | null | undefined): ClientsFilters {
  const out = { ...DEFAULT_CLIENTS_FILTERS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return out;
    if (CLIENT_SORT_KEYS.includes(o.sortBy)) out.sortBy = o.sortBy;
    if (typeof o.sortDesc === 'boolean') out.sortDesc = o.sortDesc;
    if (Array.isArray(o.quick)) out.quick = o.quick.filter((k: unknown): k is ClientQuickFilter => CLIENT_QUICK_KEYS.includes(k as ClientQuickFilter));
    if (o.dateField === 'added' || o.dateField === 'invoiced') out.dateField = o.dateField;
    if (typeof o.dateFrom === 'string') out.dateFrom = o.dateFrom;
    if (typeof o.dateTo === 'string') out.dateTo = o.dateTo;
    out.datePreset = parseAppliedDatePreset(o.datePreset);
  } catch { /* corrupt — defaults */ }
  return out;
}

/** Activity numbers a list row can show (wrappers map them from the row). */
export interface ClientRowStats {
  balanceDue?: number | null;
  lifetimeBilled?: number | null;
  lastInvoiceDate?: string | null;
  createdAt?: string | null;
}

/**
 * The one stat a row shows on the right — whichever the active sort/filter is
 * about ("Owes $1,240" while sorting by balance). null = nothing (default A–Z).
 */
export function clientRowStat(
  c: ClientRowStats,
  f: { sortBy: ClientSortKey; quick: ClientQuickFilter[] },
  t: { owes: string; billed: string; lastInvoiced: string; neverInvoiced: string; added: string },
  locale: string,
): { text: string; tone: 'danger' | 'muted' } | null {
  const money = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = (d: string) => {
    // Date-only strings parse as UTC midnight (a day early in the US).
    const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
    const sameYear = dt.getFullYear() === new Date().getFullYear();
    return dt.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  };
  const has = (k: ClientQuickFilter) => f.quick.includes(k);
  if (f.sortBy === 'balance' || has('owes') || has('overdue')) {
    return (c.balanceDue ?? 0) > 0 ? { text: t.owes.replace('{{amount}}', money(c.balanceDue!)), tone: 'danger' } : null;
  }
  if (f.sortBy === 'billed') return { text: t.billed.replace('{{amount}}', money(c.lifetimeBilled ?? 0)), tone: 'muted' };
  if (f.sortBy === 'invoiced' || has('recent_invoiced') || has('inactive')) {
    return { text: c.lastInvoiceDate ? t.lastInvoiced.replace('{{date}}', date(c.lastInvoiceDate)) : t.neverInvoiced, tone: 'muted' };
  }
  if ((f.sortBy === 'recent' || has('recent_added')) && c.createdAt) {
    return { text: t.added.replace('{{date}}', date(c.createdAt)), tone: 'muted' };
  }
  return null;
}

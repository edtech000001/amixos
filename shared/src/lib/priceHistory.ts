// Price sheet change history (migration 258). A trigger records every PRICE
// change of a price_sheet_items row; this loads one item's history and turns
// each entry into display lines for the item detail view (web + mobile).

import { usStateName } from './usStates';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type RateMap = Record<string, number> | null;

export interface PriceHistoryEntry {
  id: string;
  kind: 'created' | 'updated' | 'baseline';
  changedAt: string;
  changedByName: string | null;
  oldRate: number | null;
  newRate: number | null;
  oldMode: string | null;
  newMode: string | null;
  oldUnit: string | null;
  newUnit: string | null;
  oldStateRates: RateMap;
  newStateRates: RateMap;
  oldClientRates: RateMap;
  newClientRates: RateMap;
}

export interface PriceItemHistory {
  /** When the item was added (price_sheet_items.created_at). */
  createdAt: string | null;
  /** Newest first. */
  entries: PriceHistoryEntry[];
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

export async function fetchPriceItemHistory(supabase: SupabaseLike, itemId: string): Promise<PriceItemHistory> {
  const [itemRes, histRes] = await Promise.all([
    supabase.from('price_sheet_items').select('created_at').eq('id', itemId).maybeSingle(),
    // One item's price changes — small and bounded; newest first.
    supabase.from('price_sheet_item_history')
      .select('id, kind, changed_at, changed_by_name, old_rate, new_rate, old_pricing_mode, new_pricing_mode, old_unit_label, new_unit_label, old_state_rates, new_state_rates, old_client_rates, new_client_rates')
      .eq('item_id', itemId)
      .order('changed_at', { ascending: false })
      .limit(500),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (histRes.data ?? []) as any[];
  return {
    createdAt: itemRes.data?.created_at ?? null,
    entries: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      changedAt: r.changed_at,
      changedByName: r.changed_by_name ?? null,
      oldRate: num(r.old_rate),
      newRate: num(r.new_rate),
      oldMode: r.old_pricing_mode ?? null,
      newMode: r.new_pricing_mode ?? null,
      oldUnit: r.old_unit_label ?? null,
      newUnit: r.new_unit_label ?? null,
      oldStateRates: r.old_state_rates ?? null,
      newStateRates: r.new_state_rates ?? null,
      oldClientRates: r.old_client_rates ?? null,
      newClientRates: r.new_client_rates ?? null,
    })),
  };
}

/** The newest entry that actually set the price ('updated' or 'created');
 *  null when the only record is the baseline (no change since tracking began). */
export function lastPriceChange(h: PriceItemHistory): PriceHistoryEntry | null {
  return h.entries.find(e => e.kind !== 'baseline') ?? null;
}

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "$3.25/ft" · "$5,000 flat" · "$45" */
export function historyPriceLabel(rate: number | null, mode: string | null, unit: string | null, flatWord: string): string {
  if (rate == null) return '—';
  if (mode === 'flat') return `${money(rate)} ${flatWord}`;
  return unit ? `${money(rate)}/${unit}` : money(rate);
}

export interface PriceHistoryLabels {
  flatWord: string;
  /** Shown for a state / client price that didn't exist on one side. */
  none: string;
}

/**
 * What changed in one entry, one line each: the base price first, then every
 * per-state and per-client price that was added, removed or changed —
 * "$3.25/ft → $3.50/ft", "Nebraska: $3.00 → $3.25", "Acme Farms: none → $3.10".
 * Created / baseline entries list the price as it was set.
 */
export function describePriceEntry(
  e: PriceHistoryEntry,
  opts: { labels: PriceHistoryLabels; locale?: 'es' | 'en'; clientName: (id: string) => string },
): string[] {
  const { labels } = opts;
  const lines: string[] = [];
  const newLabel = historyPriceLabel(e.newRate, e.newMode, e.newUnit, labels.flatWord);
  if (e.kind !== 'updated') {
    lines.push(newLabel);
  } else {
    const oldLabel = historyPriceLabel(e.oldRate, e.oldMode, e.oldUnit, labels.flatWord);
    if (oldLabel !== newLabel) lines.push(`${oldLabel} → ${newLabel}`);
  }
  const diffMap = (before: RateMap, after: RateMap, name: (k: string) => string) => {
    if (e.kind !== 'updated') {
      // Overrides as set: "Nebraska: $3.00"
      for (const [k, v] of Object.entries(after ?? {})) lines.push(`${name(k)}: ${money(Number(v))}`);
      return;
    }
    const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
    for (const k of keys) {
      const a = before?.[k];
      const b = after?.[k];
      if (a != null && b != null && Number(a) === Number(b)) continue;
      const from = a == null ? labels.none : money(Number(a));
      const to = b == null ? labels.none : money(Number(b));
      lines.push(`${name(k)}: ${from} → ${to}`);
    }
  };
  diffMap(e.oldStateRates, e.newStateRates, st => usStateName(st, opts.locale));
  diffMap(e.oldClientRates, e.newClientRates, opts.clientName);
  return lines;
}

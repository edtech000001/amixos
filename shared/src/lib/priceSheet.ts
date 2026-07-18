// Price sheet — a per-business catalog of priced items that AUTOPRICES job
// line items. Web and mobile compute rates identically through here so a
// pivot foot, a salon cut, and a retail item all flow through one model.
//
// pricing_mode:
//   'per_unit' → amount = quantity × rate  (per foot / per cut / per item)
//   'flat'     → amount = rate             (corner, loading fee; qty forced 1)

import { US_STATE_NAME_TO_ABBR } from './usStates';

export type PricingMode = 'per_unit' | 'flat';

export interface PriceSheetItem {
  id: string;
  name: string;
  /** Free-text grouping shown as a section header ("New Pivots"). */
  category: string | null;
  pricingMode: PricingMode;
  /** Display-only unit for per_unit items (ft, cut, item, sq ft…). */
  unitLabel: string | null;
  rate: number;
  /** Per-state overrides: { "NE": 3.75 }. Autoprice uses the job's state. */
  stateRates: Record<string, number> | null;
  /** Per-tier overrides: { "<tierId>": 4.00 }. Beats state for a client on it. */
  tierRates: Record<string, number> | null;
  /** Alternate phrasings/acronyms for text auto-matching (already split). */
  matchTerms: string[];
  /** true = a surcharge that STACKS on top of the matched base price during
   *  autoprice (e.g. Boombacks +$0.25/ft), not a base price itself. */
  isAddon: boolean;
  sortOrder: number;
  active: boolean;
}

/** Row shape as stored in Supabase (snake_case). */
export interface PriceSheetRow {
  id: string;
  name: string;
  category: string | null;
  pricing_mode: string;
  unit_label: string | null;
  rate: number;
  state_rates: Record<string, number> | null;
  tier_rates: Record<string, number> | null;
  match_terms: string | null;
  is_addon?: boolean | null;
  sort_order: number;
  active: boolean;
}

export function rowToPriceSheetItem(r: PriceSheetRow): PriceSheetItem {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    pricingMode: r.pricing_mode === 'flat' ? 'flat' : 'per_unit',
    unitLabel: r.unit_label,
    rate: Number(r.rate) || 0,
    stateRates: normalizeStateRates(r.state_rates),
    tierRates: normalizeStateRates(r.tier_rates),
    matchTerms: splitMatchTerms(r.match_terms),
    isAddon: r.is_addon === true,
    sortOrder: r.sort_order ?? 0,
    active: r.active !== false,
  };
}

/** Split the stored match_terms blob into clean lowercase terms. */
export function splitMatchTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
}

/** Coerce a stored state_rates jsonb into a clean { STATE: number } map. */
export function normalizeStateRates(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    const key = k.trim().toUpperCase();
    if (key && Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The rate that applies for a job in `state` — the per-state override when the
 * item has one for that state, else the base rate. State match is
 * case-insensitive and tolerates full names being passed as-is (we key on the
 * raw uppercased string the caller provides, so store overrides the same way
 * the job stores its state, e.g. 'NE').
 */
export interface RateContext {
  state?: string | null;
  /** The job's client's price tier id, if any. */
  tierId?: string | null;
}

export function applicableRate(item: PriceSheetItem, ctx?: RateContext | string | null): number {
  // Back-compat: a bare string is treated as the state.
  const c: RateContext = typeof ctx === 'string' || ctx == null ? { state: ctx as string | null } : ctx;
  if (c.tierId && item.tierRates) {
    const hit = item.tierRates[c.tierId];
    if (Number.isFinite(hit)) return hit;
  }
  if (c.state && item.stateRates) {
    // Overrides are keyed by 2-letter code; tolerate a full state name being
    // passed ("Kansas" → "KS") so job/client states in either form still match.
    const t = c.state.trim();
    const code = t.length === 2 ? t.toUpperCase() : (US_STATE_NAME_TO_ABBR[t.toLowerCase()] ?? t.toUpperCase());
    const hit = item.stateRates[code];
    if (Number.isFinite(hit)) return hit;
  }
  return item.rate;
}

export interface AutopricedLine {
  /** Billed quantity: the measurement for per_unit, 1 for flat. */
  quantity: number;
  /** Rate that was applied (state-aware). */
  unitPrice: number;
  /** Raw measured quantity when it differs from the billed quantity (flat
   *  items) — preserved so a 205 ft corner keeps its footage. Null otherwise. */
  originalQuantity: number | null;
  amount: number;
}

/**
 * Autoprice one line: given the chosen catalog item, the measured quantity the
 * crew entered, and the job's state, return the billed quantity + rate.
 *   per_unit → bill the measured quantity at the state rate.
 *   flat     → bill 1 × rate, and remember the measurement in originalQuantity
 *              (unless it was already 1).
 *
 * `addons` are surcharges that STACK on top: per-unit add-ons raise the rate
 * (base $3.50/ft + Boombacks $0.25/ft = $3.75/ft), flat add-ons add to the
 * total. The billed rate is blended so quantity × unitPrice still equals amount.
 */
export function autopriceLine(
  item: PriceSheetItem,
  measuredQty: number,
  ctx?: RateContext | string | null,
  addons: PriceSheetItem[] = [],
): AutopricedLine {
  const baseRate = applicableRate(item, ctx);
  let perUnitAddon = 0;
  let flatAddon = 0;
  for (const a of addons) {
    const r = applicableRate(a, ctx);
    if (a.pricingMode === 'flat') flatAddon += r; else perUnitAddon += r;
  }

  if (item.pricingMode === 'flat') {
    const measured = Number.isFinite(measuredQty) && measuredQty > 0 ? measuredQty : null;
    // Flat base: base + flat add-ons, plus any per-unit add-ons × measurement.
    const amount = round2(baseRate + flatAddon + perUnitAddon * (measured ?? 1));
    return {
      quantity: 1,
      unitPrice: amount,
      originalQuantity: measured && measured !== 1 ? measured : null,
      amount,
    };
  }

  const qty = Number.isFinite(measuredQty) && measuredQty > 0 ? measuredQty : 1;
  const effRate = baseRate + perUnitAddon;
  const amount = round2(qty * effRate + flatAddon);
  // Clean rate when there's no flat add-on ($3.75); otherwise blend so the line
  // total is exact.
  const unitPrice = flatAddon ? round2(amount / qty) : round2(effRate);
  return { quantity: qty, unitPrice, originalQuantity: null, amount };
}

/** All ACTIVE add-on items whose name or a match term appears in `text` — the
 *  surcharges that stack onto a matched base line during autoprice. */
export function matchingAddons(text: string, items: PriceSheetItem[]): PriceSheetItem[] {
  const hay = norm(text);
  if (!hay.trim()) return [];
  return items.filter(item => {
    if (!item.active || !item.isAddon) return false;
    const terms = [item.name, ...item.matchTerms].map(norm).filter(t => t.length >= 2);
    return terms.some(t => hay.includes(t));
  });
}

/** Human summary for the picker/read view: "$3.50 / ft" or "$3,300 flat". */
export function priceItemLabel(item: PriceSheetItem, flatWord: string): string {
  const money = `$${item.rate.toLocaleString('en-US', { minimumFractionDigits: item.rate % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  if (item.pricingMode === 'flat') return `${money} ${flatWord}`;
  return item.unitLabel ? `${money} / ${item.unitLabel}` : money;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Text auto-match ─────────────────────────────────────────────────────────

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export interface PriceMatch {
  item: PriceSheetItem;
  /** The term that matched (name or an alias) — its length breaks ties. */
  term: string;
}

/**
 * Best-effort: pick the price item whose name OR one of its match terms
 * appears in `text`. Ranking, in order:
 *   1. LONGEST single matching term wins (so "corner repair" beats "repair",
 *      and "zimmatic" beats the shared word "corner").
 *   2. Tie on longest term → the item that matches MORE of its terms wins
 *      (so a job whose text has "corner" + "valley" picks the Valley item over
 *      one that only matches "corner"). This lets notes disambiguate two items
 *      that share a generic word of the same length.
 * Returns null when nothing matches, or the top two items are tied on BOTH
 * (length and match count) but are different items (genuinely ambiguous → let
 * the user pick). NOT reliable — callers must warn the user to verify.
 */
export function suggestPriceItem(text: string, items: PriceSheetItem[]): PriceMatch | null {
  const hay = norm(text);
  if (!hay.trim()) return null;
  let best: { item: PriceSheetItem; term: string; len: number; count: number } | null = null;
  let ambiguous = false;
  for (const item of items) {
    if (!item.active || item.isAddon) continue; // add-ons stack separately
    const terms = [item.name, ...item.matchTerms].map(norm).filter(t => t.length >= 2);
    // This item's longest matching term + how many DISTINCT terms it matched.
    let maxLen = 0;
    let longest = '';
    const matchedTerms = new Set<string>();
    for (const term of terms) {
      if (!hay.includes(term)) continue;
      matchedTerms.add(term);
      if (term.length > maxLen) { maxLen = term.length; longest = term; }
    }
    if (maxLen === 0) continue; // no match on this item
    const count = matchedTerms.size;
    if (!best || maxLen > best.len || (maxLen === best.len && count > best.count)) {
      best = { item, term: longest, len: maxLen, count };
      ambiguous = false;
    } else if (maxLen === best.len && count === best.count && best.item.id !== item.id) {
      ambiguous = true;
    }
  }
  return ambiguous || !best ? null : { item: best.item, term: best.term };
}

/** Pull a measured quantity out of free text ("1200 ft", "6-180ft", "205'").
 *  Prefers a number adjacent to a unit; else the largest standalone number. */
export function extractQuantity(text: string): number | null {
  const t = text.toLowerCase();
  // Number immediately before ft / feet / ' / " .
  const unit = /(\d[\d,]*(?:\.\d+)?)\s*(?:ft|feet|'|foot)/g;
  let m: RegExpExecArray | null;
  let best: number | null = null;
  while ((m = unit.exec(t))) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  if (best != null) return best;
  // Fallback: the largest bare number (avoids matching "7 Tower" → 7 when a
  // real footage exists, but still returns something).
  const nums = (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(x => parseFloat(x.replace(/,/g, '')));
  const max = nums.filter(Number.isFinite).sort((a, b) => b - a)[0];
  return max ?? null;
}

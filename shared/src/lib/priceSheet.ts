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
  /** Per-client overrides: { "<clientId>": 4.00 }. Beats state pricing. */
  clientRates: Record<string, number> | null;
  /** Alternate phrasings/acronyms for text auto-matching (already split). */
  matchTerms: string[];
  /** true = a surcharge that STACKS on top of the matched base price during
   *  autoprice (e.g. Boombacks +$0.25/ft), not a base price itself. */
  isAddon: boolean;
  /** Flat add-ons only: true = fold this surcharge into the matched line's
   *  total (blended rate); false (default) = give it its own line under the
   *  job. Ignored for per-unit add-ons (they always raise the base rate). */
  addonInline: boolean;
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
  client_rates?: Record<string, number> | null;
  match_terms: string | null;
  is_addon?: boolean | null;
  addon_inline?: boolean | null;
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
    clientRates: normalizeStateRates(r.client_rates ?? null),
    matchTerms: splitMatchTerms(r.match_terms),
    isAddon: r.is_addon === true,
    addonInline: r.addon_inline === true,
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
  /** The job's/invoice's client id — their custom price wins over state. */
  clientId?: string | null;
}

export function applicableRate(item: PriceSheetItem, ctx?: RateContext | string | null): number {
  // Back-compat: a bare string is treated as the state.
  const c: RateContext = typeof ctx === 'string' || ctx == null ? { state: ctx as string | null } : ctx;
  if (c.clientId && item.clientRates) {
    const hit = item.clientRates[c.clientId];
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
  /** Per-unit add-ons blended into unitPrice, summarized for a UI indicator
   *  (e.g. "+Polly/Aluminum $0.50/ft"). Null when none applied. */
  addonNote: string | null;
  /** Flat add-ons that were NOT folded into the rate — only populated when
   *  `splitFlatAddons` is on, so the caller can emit each as its own line
   *  (keeps the base rate clean instead of smearing $600 into $/ft). */
  flatAddons: { name: string; rate: number }[];
}

/** "$0.50 / ft" style summary for one applied add-on. */
function addonLabel(a: PriceSheetItem, rate: number): string {
  const money = `$${rate.toLocaleString('en-US', { minimumFractionDigits: rate % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return a.pricingMode === 'flat'
    ? `+${a.name} ${money}`
    : `+${a.name} ${money}${a.unitLabel ? `/${a.unitLabel}` : ''}`;
}

/**
 * Autoprice one line: given the chosen catalog item, the measured quantity the
 * crew entered, and the job's state, return the billed quantity + rate.
 *   per_unit → bill the measured quantity at the state rate.
 *   flat     → bill 1 × rate, and remember the measurement in originalQuantity
 *              (unless it was already 1).
 *
 * `addons` are surcharges that STACK on top. Per-unit add-ons always raise the
 * rate (base $3.50/ft + Boombacks $0.25/ft = $3.75/ft). Flat add-ons depend on
 * `splitFlatAddons` + each add-on's `addonInline`:
 *   • split (own line)  → returned in `flatAddons` for the caller to emit; the
 *     base line keeps its clean per-unit rate.
 *   • bundled (inline)  → folded into the total and the line is billed 1 × the
 *     exact total (never a blended per-unit rate, which would round off).
 */
export function autopriceLine(
  item: PriceSheetItem,
  measuredQty: number,
  ctx?: RateContext | string | null,
  addons: PriceSheetItem[] = [],
  opts?: {
    /** Keep flat add-ons OUT of the rate and return them in `flatAddons` for
     *  the caller to emit as separate line items (invoice autoprice). Default
     *  false → flat add-ons blend into the amount, as the job form expects. */
    splitFlatAddons?: boolean;
  },
): AutopricedLine {
  const baseRate = applicableRate(item, ctx);
  let perUnitAddon = 0;
  let flatAddon = 0;
  // Notes summarize add-ons FOLDED into this line's rate/total (not the ones
  // split into their own line) — so the user can see what's baked in.
  const foldedNotes: string[] = [];
  const splitFlat: { name: string; rate: number }[] = [];
  for (const a of addons) {
    const r = applicableRate(a, ctx);
    if (a.pricingMode === 'flat') {
      // Own line only when splitting is enabled (invoice autoprice) AND this
      // add-on isn't marked inline. Inline flat add-ons — and every flat add-on
      // in the job form (no splitting) — fold into the rate instead.
      if (opts?.splitFlatAddons && !a.addonInline) {
        splitFlat.push({ name: a.name, rate: round2(r) });
      } else {
        flatAddon += r;
        foldedNotes.push(addonLabel(a, r)); // bundled → explain the blended rate
      }
    } else {
      perUnitAddon += r;
      foldedNotes.push(addonLabel(a, r));
    }
  }
  const addonNote = foldedNotes.length ? foldedNotes.join(' · ') : null;

  if (item.pricingMode === 'flat') {
    const measured = Number.isFinite(measuredQty) && measuredQty > 0 ? measuredQty : null;
    // Flat base: base + flat add-ons, plus any per-unit add-ons × measurement.
    const amount = round2(baseRate + flatAddon + perUnitAddon * (measured ?? 1));
    return {
      quantity: 1,
      unitPrice: amount,
      originalQuantity: measured && measured !== 1 ? measured : null,
      amount,
      addonNote,
      flatAddons: splitFlat,
    };
  }

  const qty = Number.isFinite(measuredQty) && measuredQty > 0 ? measuredQty : 1;
  const effRate = baseRate + perUnitAddon;
  const amount = round2(qty * effRate + flatAddon);
  if (flatAddon > 0) {
    // A flat add-on is bundled INTO this per-unit line → bill 1 × the exact
    // total. Blending it into the per-unit rate both looks odd ($4.21/ft) and
    // rounds the total off (1295 × $4.21 = $5,451.95, losing $4.30 vs the true
    // $5,456.25). Keep the measurement in originalQuantity for reference.
    return { quantity: 1, unitPrice: amount, originalQuantity: qty !== 1 ? qty : null, amount, addonNote, flatAddons: splitFlat };
  }
  // No flat add-on → clean per-unit rate ($3.75), quantity × rate is exact.
  return { quantity: qty, unitPrice: round2(effRate), originalQuantity: null, amount, addonNote, flatAddons: splitFlat };
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
interface ScoredItem { item: PriceSheetItem; term: string; len: number; count: number; prio: boolean }

/** Score every ACTIVE base item that matches `text`, ranked by:
 *  1. a priority (custom-field) match, 2. longest matching term, 3. most terms. */
function scoreItems(text: string, items: PriceSheetItem[], priorityText?: string): ScoredItem[] {
  const hay = norm(text);
  if (!hay.trim()) return [];
  const prio = priorityText ? norm(priorityText) : '';
  const scored: ScoredItem[] = [];
  for (const item of items) {
    if (!item.active || item.isAddon) continue; // add-ons stack separately
    const terms = [item.name, ...item.matchTerms].map(norm).filter(t => t.length >= 2);
    let maxLen = 0; let longest = ''; let prioHit = false;
    const matchedTerms = new Set<string>();
    for (const term of terms) {
      if (!hay.includes(term)) continue;
      matchedTerms.add(term);
      if (prio && prio.includes(term)) prioHit = true;
      if (term.length > maxLen) { maxLen = term.length; longest = term; }
    }
    if (maxLen === 0) continue;
    scored.push({ item, term: longest, len: maxLen, count: matchedTerms.size, prio: prioHit });
  }
  return scored;
}

/** Rank tuple (higher wins on each, left-to-right): priority, term length, term count. */
const scoreRank = (s: ScoredItem): [number, number, number] => [s.prio ? 1 : 0, s.len, s.count];

export interface PriceSuggestion {
  /** The single best item, or null when nothing matched OR 2+ items tie for top. */
  pick: PriceMatch | null;
  /** The 2+ equally-top items when it's a tie (empty otherwise) — offer these to
   *  the user to pick from instead of skipping the line. */
  tied: PriceSheetItem[];
}

/** Like suggestPriceItem, but also surfaces the tied candidates when the top
 *  match is ambiguous — so the caller can ask the user which price to use. */
export function suggestPriceItemDetailed(
  text: string,
  items: PriceSheetItem[],
  /** Higher-signal text (e.g. a job's custom-field VALUES like Project Type). */
  priorityText?: string,
): PriceSuggestion {
  const scored = scoreItems(text, items, priorityText);
  if (!scored.length) return { pick: null, tied: [] };
  scored.sort((a, b) => {
    const ra = scoreRank(a); const rb = scoreRank(b);
    for (let i = 0; i < 3; i++) { if (ra[i] !== rb[i]) return rb[i] - ra[i]; }
    return 0;
  });
  const top = scored[0];
  const tiedTop = scored.filter(s => s.prio === top.prio && s.len === top.len && s.count === top.count);
  if (tiedTop.length === 1) return { pick: { item: top.item, term: top.term }, tied: [] };
  return { pick: null, tied: tiedTop.map(s => s.item) };
}

/** Best-effort single match — null when nothing matches OR it's an ambiguous tie
 *  (callers that want to resolve the tie use suggestPriceItemDetailed). */
export function suggestPriceItem(
  text: string,
  items: PriceSheetItem[],
  priorityText?: string,
): PriceMatch | null {
  return suggestPriceItemDetailed(text, items, priorityText).pick;
}

/** Diagnostic: every ACTIVE base item whose name/term appears in `text`, with
 *  the matched term and whether it hit the priority text. Powers the "why no
 *  match" popup — reveals a tie (2+ equal matches) vs the item not being loaded. */
export function diagnosePriceMatches(
  text: string,
  items: PriceSheetItem[],
  priorityText?: string,
): { name: string; term: string; prio: boolean }[] {
  const hay = norm(text);
  const prio = priorityText ? norm(priorityText) : '';
  const out: { name: string; term: string; prio: boolean }[] = [];
  for (const item of items) {
    if (!item.active || item.isAddon) continue;
    const terms = [item.name, ...item.matchTerms].map(norm).filter(t => t.length >= 2);
    let maxLen = 0; let longest = ''; let prioHit = false;
    for (const term of terms) {
      if (!hay.includes(term)) continue;
      if (prio && prio.includes(term)) prioHit = true;
      if (term.length > maxLen) { maxLen = term.length; longest = term; }
    }
    if (maxLen > 0) out.push({ name: item.name, term: longest, prio: prioHit });
  }
  return out;
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

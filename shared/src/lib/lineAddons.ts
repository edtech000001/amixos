// Manual add-on toggles for one invoice line (Edit item → Add-ons). Mirrors
// what autoprice produces, without re-pricing the base rate:
//   per-unit add-on    → folded into the line's rate + listed in addonNote
//   flat add-on        → its own "+ name" line (job lines only, moves with the job)
//   inline flat add-on → bundled: line billed 1 × total, priceBasis keeps
//                        "1,299 × $3.25", addonNote lists the fee

import { addonLabel, applicableRate, type PriceSheetItem, type RateContext } from './priceSheet';
import type { InvoiceLineItem } from './invoicing';

/** Active add-ons a line can take. Per-unit ones are skipped for a bundled
 *  line (billed 1 × total) and flat ones for a line with no job to attach to. */
export function addonChoices(items: PriceSheetItem[], line: InvoiceLineItem | undefined): PriceSheetItem[] {
  if (!line || line.addon) return [];
  return items
    .filter(i => i.active && i.isAddon)
    .filter(i => (i.pricingMode === 'flat' ? (foldedFlat(i, line) || !!line.job_id) : !line.priceBasis))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const inNote = (a: PriceSheetItem, line: InvoiceLineItem | undefined) =>
  (line?.addonNote ?? '').split(' · ').some(p => p.startsWith(`+${a.name} `));

/** A flat add-on that lives INSIDE this line's price (bundled) rather than as
 *  its own line: marked inline on the price sheet, or already folded in here
 *  (follows the line, even if the price-sheet setting changed since). */
export function foldedFlat(a: PriceSheetItem, line: InvoiceLineItem | undefined): boolean {
  return a.pricingMode === 'flat' && (a.addonInline || inNote(a, line));
}

const sameName = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/** Ids of the add-ons already on the line (flat: its job has the "+ name"
 *  line; per-unit: listed in the line's addonNote). */
export function currentAddonIds(lines: InvoiceLineItem[], index: number, choices: PriceSheetItem[]): string[] {
  const line = lines[index];
  if (!line) return [];
  return choices.filter(a =>
    inNote(a, line) ||
    (a.pricingMode === 'flat' && !!line.job_id && lines.some(l => l.addon && l.job_id === line.job_id && sameName(l.description, a.name))),
  ).map(a => a.id);
}

/** New price-field value after a per-unit add-on is switched on/off. Exact —
 *  no rounding (money rule): $3.25 + $0.5 → "3.75". */
export function toggledRate(rate: string, addon: PriceSheetItem, on: boolean, ctx: RateContext): string {
  const r = applicableRate(addon, ctx);
  const base = parseFloat(rate) || 0;
  return String(Number((on ? base + r : base - r).toFixed(6)));
}

export interface EditPrice { qty: number; rate: number; basis: { qty: number; rate: number } | null }

/** Fold an inline flat add-on into (or out of) the line, the way autoprice
 *  bundles it: on → billed 1 × total with the measured "qty × rate" kept as
 *  basis; off → fee taken back out, and the line unbundled when nothing else
 *  is folded in and the total still matches its basis. Exact, no rounding. */
export function toggleInlineFlat(cur: EditPrice, addon: PriceSheetItem, on: boolean, ctx: RateContext, otherInlineOn: boolean): EditPrice {
  const r = applicableRate(addon, ctx);
  const x = (n: number) => Number(n.toFixed(6));
  if (on) {
    if (cur.basis || cur.qty === 1) return { ...cur, rate: x(cur.rate + r) };
    return { qty: 1, rate: x(cur.qty * cur.rate + r), basis: { qty: cur.qty, rate: cur.rate } };
  }
  const rate = x(cur.rate - r);
  if (cur.basis && !otherInlineOn && Math.abs(rate - cur.basis.qty * cur.basis.rate) < 0.005) {
    return { qty: cur.basis.qty, rate: cur.basis.rate, basis: null };
  }
  return { ...cur, rate };
}

/** What to save for the picked add-ons: the per-unit note and the flat lines. */
export function addonSave(choices: PriceSheetItem[], pickedIds: string[], ctx: RateContext, line: InvoiceLineItem | undefined): {
  addonNote: string | null;
  flatAddons: { managed: string[]; chosen: { description: string; rate: number }[] };
} {
  const picked = choices.filter(a => pickedIds.includes(a.id));
  // Folded into the line (noted): per-unit + inline flat. Own line: other flats.
  const folded = picked.filter(a => a.pricingMode !== 'flat' || foldedFlat(a, line));
  const ownLine = (a: PriceSheetItem) => a.pricingMode === 'flat' && !foldedFlat(a, line);
  return {
    addonNote: folded.length ? folded.map(a => addonLabel(a, applicableRate(a, ctx))).join(' · ') : null,
    flatAddons: {
      managed: choices.filter(ownLine).map(a => a.name),
      chosen: picked.filter(ownLine).map(a => ({ description: a.name, rate: applicableRate(a, ctx) })),
    },
  };
}

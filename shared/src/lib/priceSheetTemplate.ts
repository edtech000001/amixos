// Style/layout config for the client-facing price-sheet generator, stored on
// businesses.price_sheet_template (migration 145). Kept deliberately small — a
// header accent color, the section (category) order, and an optional label for
// per-unit prices ("$4 Per Foot").

/** Visual theme for the generated sheet — distinct looks for different trades.
 *  classic  = clean list w/ dividers (default)
 *  cards    = each section in a bordered card
 *  bold     = accent-colored section header bars (construction/landscaping)
 *  elegant  = centered serif header + underlined sections (salon/spa)
 *  minimal  = airy, thin, understated */
export type PriceSheetDesign = 'classic' | 'cards' | 'bold' | 'elegant' | 'minimal';
export const PRICE_SHEET_DESIGNS: PriceSheetDesign[] = ['classic', 'cards', 'bold', 'elegant', 'minimal'];

export interface PriceSheetTemplateConfig {
  /** Layout preset. */
  design: PriceSheetDesign;
  /** Hex color for the header title, state label, and section headers. */
  accentColor: string;
  /** Category names in display order. Categories not listed follow after,
   *  alphabetically. Uncategorized always sinks last. */
  categoryOrder: string[];
}

export const DEFAULT_PRICE_SHEET_TEMPLATE: PriceSheetTemplateConfig = {
  design: 'classic',
  accentColor: '#4F46E5',
  categoryOrder: [],
};

export function normalizePriceSheetTemplate(raw: unknown): PriceSheetTemplateConfig {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Partial<PriceSheetTemplateConfig>)
    : {};
  return {
    design: typeof r.design === 'string' && (PRICE_SHEET_DESIGNS as string[]).includes(r.design) ? (r.design as PriceSheetDesign) : 'classic',
    accentColor: typeof r.accentColor === 'string' && r.accentColor.trim() ? r.accentColor.trim() : DEFAULT_PRICE_SHEET_TEMPLATE.accentColor,
    categoryOrder: Array.isArray(r.categoryOrder) ? r.categoryOrder.filter((x): x is string => typeof x === 'string') : [],
  };
}

/**
 * Order a set of category keys by the configured order: listed categories first
 * (in that order), the rest alphabetically after, and the uncategorized bucket
 * (`uncategorizedKey`) always last.
 */
export function orderCategories(keys: string[], order: string[], uncategorizedKey: string): string[] {
  const idx = new Map(order.map((c, i) => [c, i]));
  return [...keys].sort((a, b) => {
    if (a === uncategorizedKey) return 1;
    if (b === uncategorizedKey) return -1;
    const ia = idx.has(a) ? idx.get(a)! : Infinity;
    const ib = idx.has(b) ? idx.get(b)! : Infinity;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

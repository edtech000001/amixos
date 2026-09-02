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
  /** Categories left OFF the printed sheet. Stored as an exclusion list rather
   *  than an inclusion one so a category added later is printed by default —
   *  an inclusion list would silently drop every new section. */
  hiddenCategories: string[];
  /** Individual price_sheet_items.id values left off the printed sheet. Same
   *  reasoning: exclusions, so new prices print unless you say otherwise. */
  hiddenItemIds: string[];
}

export const DEFAULT_PRICE_SHEET_TEMPLATE: PriceSheetTemplateConfig = {
  design: 'classic',
  accentColor: '#4F46E5',
  categoryOrder: [],
  hiddenCategories: [],
  hiddenItemIds: [],
};

export function normalizePriceSheetTemplate(raw: unknown): PriceSheetTemplateConfig {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Partial<PriceSheetTemplateConfig>)
    : {};
  return {
    design: typeof r.design === 'string' && (PRICE_SHEET_DESIGNS as string[]).includes(r.design) ? (r.design as PriceSheetDesign) : 'classic',
    accentColor: typeof r.accentColor === 'string' && r.accentColor.trim() ? r.accentColor.trim() : DEFAULT_PRICE_SHEET_TEMPLATE.accentColor,
    categoryOrder: Array.isArray(r.categoryOrder) ? r.categoryOrder.filter((x): x is string => typeof x === 'string') : [],
    hiddenCategories: Array.isArray(r.hiddenCategories) ? r.hiddenCategories.filter((x): x is string => typeof x === 'string') : [],
    hiddenItemIds: Array.isArray(r.hiddenItemIds) ? r.hiddenItemIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** Should this item be printed? A hidden section hides everything inside it,
 *  so an item is printed only when neither it nor its section is excluded. */
export function isPrintable(
  item: { id: string; category: string | null },
  cfg: Pick<PriceSheetTemplateConfig, 'hiddenCategories' | 'hiddenItemIds'>,
  uncategorizedKey: string,
): boolean {
  if (cfg.hiddenItemIds.includes(item.id)) return false;
  const key = (item.category ?? '').trim() || uncategorizedKey;
  return !cfg.hiddenCategories.includes(key);
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

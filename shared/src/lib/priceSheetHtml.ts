// Standalone HTML for the client-facing price sheet. Used by mobile (expo-print
// → PDF → share/email) and by web's print path, so all three surfaces render one
// document. Pricing resolves through applicableRate (client > state > base),
// identical to web/autoprice.
//
// THE CHROME COMES FROM THE INVOICE THEME. Logo, font, accent and density are
// read from businesses.invoice_template rather than configured separately: the
// owner already chose how their documents look, and a price sheet that arrives
// styled like a different company is worse than one that matches. Asking them
// to configure a second identity is asking twice.
//
// `design` on the price-sheet template therefore controls only ONE thing: how
// the price rows are laid out. It used to control nothing at all — this builder
// never read it, so the five pills were stored, shown in web's preview, and
// silently ignored by every generated document.

import { applicableRate, type PriceSheetItem, type RateContext } from './priceSheet';
import { normalizePriceSheetTemplate, orderCategories, type PriceSheetDesign } from './priceSheetTemplate';
import { resolveConfig, styleTokens } from './invoiceTemplate';

const UNCAT = '__uncategorized__';
const ADDONS = '__additional_charges__';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface PriceSheetHtmlLabels {
  sheetTitle: string;
  generatedOn: string;
  preparedFor: string;
  flatWord: string;
  additionalCharges: string;
  uncategorized: string;
}

export function buildPriceSheetHtml(opts: {
  items: PriceSheetItem[];
  ctx: RateContext;
  businessName: string;
  logoUrl?: string | null;
  /** Pre-built address/contact lines (city-state-zip, street, phone, email). */
  businessLines: string[];
  /** businesses.price_sheet_template (raw jsonb ok) — row design, section
   *  order and exclusions. */
  template: unknown;
  /** businesses.invoice_template (raw jsonb ok) — supplies the chrome: accent,
   *  font, logo size, density. Omit and the invoice defaults apply, which is
   *  still a coherent document rather than a second unstyled one. */
  invoiceTemplate?: unknown;
  labels: PriceSheetHtmlLabels;
  stateLabel: string;
  preparedFor?: string | null;
  todayStr: string;
}): string {
  const tpl = normalizePriceSheetTemplate(opts.template);
  // One identity for every document this business sends.
  const inv = resolveConfig(null, opts.invoiceTemplate ?? null);
  const tok = styleTokens(inv);
  const accent = tok.accent;
  const design: PriceSheetDesign = tpl.design;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const priceDisplay = (item: PriceSheetItem, plus = false) => {
    const m = `${plus ? '+ ' : ''}${money(applicableRate(item, opts.ctx))}`;
    if (item.pricingMode === 'flat') return `${m} ${opts.labels.flatWord}`;
    return item.unitLabel ? `${m} / ${item.unitLabel}` : m;
  };

  // Exclusions are applied HERE rather than in each caller, so web preview,
  // web PDF and mobile PDF cannot disagree about what prints.
  const by = new Map<string, PriceSheetItem[]>();
  opts.items.forEach(i => {
    const key = i.isAddon ? ADDONS : ((i.category ?? '').trim() || UNCAT);
    if (tpl.hiddenCategories.includes(key)) return;
    if (tpl.hiddenItemIds.includes(i.id)) return;
    const arr = by.get(key);
    if (arr) arr.push(i); else by.set(key, [i]);
  });
  // A section whose every price was excluded never enters the map, so it
  // cannot print as a bare heading.
  const keys = orderCategories(Array.from(by.keys()), tpl.categoryOrder, UNCAT);
  const sectionLabel = (k: string) =>
    k === ADDONS ? opts.labels.additionalCharges : k === UNCAT ? opts.labels.uncategorized : k;

  // The five designs differ ONLY here — the header, logo and business block are
  // the invoice's in every one of them. 'cards' wraps each section in a bordered
  // panel; 'minimal' drops the rules; 'bold' fills the section header with the
  // accent; 'elegant' uses a hairline and wider tracking. Anything else is
  // 'classic'.
  const sections = keys.map(k => {
    const isAddon = k === ADDONS;
    const rows = (by.get(k) ?? []).map(i => `
      <div class="row">
        <span class="row-name">${esc(i.name)}</span>
        <span class="row-price${isAddon ? ' addon' : ''}">${esc(priceDisplay(i, isAddon))}</span>
      </div>`).join('');
    return `
      <div class="section">
        <div class="section-title">${esc(sectionLabel(k))}</div>
        <div class="rows">${rows}</div>
      </div>`;
  }).join('');

  // Per-design CSS, appended after the base rules so it overrides them.
  const designCss = ({
    classic: '',
    cards: `
    .section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px 6px; margin-top: 12px; }
    .section-title { border-bottom: none; margin-bottom: 2px; }
    .row { border-bottom: 1px solid #f8fafc; }`,
    bold: `
    .section-title { background: ${esc(accent)}; color: #ffffff; border-bottom: none; padding: 5px 8px; border-radius: 4px; }
    .row { padding: 5px 0; }
    .row-name { font-weight: 600; }`,
    elegant: `
    .section-title { border-bottom: 0.5px solid ${esc(accent)}; letter-spacing: 0.16em; font-weight: 600; }
    .row { border-bottom: none; padding: 3px 0; }
    .row-name { font-style: italic; }`,
    minimal: `
    .section-title { border-bottom: none; color: #64748b; letter-spacing: 0.04em; }
    .row { border-bottom: none; padding: 2px 0; }
    .row-price { font-weight: 600; }`,
  } as Record<PriceSheetDesign, string>)[design] ?? '';

  const metaLine = `${esc(opts.labels.generatedOn)} ${esc(opts.todayStr)}${
    opts.preparedFor ? ` · ${esc(opts.labels.preparedFor)}: ${esc(opts.preparedFor)}` : ''
  }`;

  const showLogo = inv.showLogo && !!opts.logoUrl;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(opts.labels.sheetTitle)}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: ${tok.cssFontFamily}; color: #0f172a; margin: 0; font-size: ${tok.fontPx}px; background: #ffffff; }

    /* Header mirrors the invoice: business block on the left, document title on
       the right. Matching the invoice is the whole point — a client who has
       received an invoice should recognise this instantly. */
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid ${esc(accent)}; }
    .biz { display: flex; gap: 12px; align-items: flex-start; }
    .biz img { max-height: ${tok.logoPx}px; max-width: ${tok.logoPx * 2}px; object-fit: contain; }
    .biz-name { font-size: ${tok.fontPx + 6}px; font-weight: 700; margin: 0; }
    .biz-line { font-size: ${tok.fontPx - 3}px; color: #64748b; margin: 1px 0 0; }
    .doc { text-align: right; white-space: nowrap; }
    .doc-title { font-size: ${tok.fontPx + 6}px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 0; color: ${esc(accent)}; }
    .doc-sub { font-size: ${tok.fontPx - 2}px; color: #475569; margin: 3px 0 0; }
    .meta { font-size: ${tok.fontPx - 3}px; color: #94a3b8; margin: 2px 0 0; }

    .section { margin-top: ${tok.density === 'compact' ? 12 : 18}px; }
    .section-title { font-size: ${tok.fontPx - 2}px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${esc(accent)}; border-bottom: 1.5px solid ${esc(accent)}; padding-bottom: 4px; margin-bottom: 4px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .row-name { font-size: ${tok.fontPx}px; }
    .row-price { font-size: ${tok.fontPx}px; font-weight: 700; white-space: nowrap; }
    .row-price.addon { color: #d97706; }
${designCss}
  </style>
</head>
<body>
  <div class="header">
    <div class="biz">
      ${showLogo ? `<img src="${esc(opts.logoUrl as string)}" alt="">` : ''}
      <div>
        <p class="biz-name">${esc(opts.businessName)}</p>
        ${opts.businessLines.filter(Boolean).map(l => `<p class="biz-line">${esc(l)}</p>`).join('')}
      </div>
    </div>
    <div class="doc">
      <p class="doc-title">${esc(opts.labels.sheetTitle)}</p>
      <p class="doc-sub">${esc(opts.stateLabel)}</p>
      <p class="meta">${metaLine}</p>
    </div>
  </div>
  ${sections}
</body>
</html>`;
}

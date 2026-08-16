// Standalone HTML for the client-facing price sheet — used by MOBILE to render
// the same document the web generator prints (expo-print → PDF → share sheet).
// One clean "classic" layout honoring the business's accent color and category
// order; pricing resolves through applicableRate (client > state > base),
// identical to web/autoprice.

import { applicableRate, type PriceSheetItem, type RateContext } from './priceSheet';
import { normalizePriceSheetTemplate, orderCategories } from './priceSheetTemplate';

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
  /** businesses.price_sheet_template (raw jsonb ok) — accent + section order. */
  template: unknown;
  labels: PriceSheetHtmlLabels;
  stateLabel: string;
  preparedFor?: string | null;
  todayStr: string;
}): string {
  const tpl = normalizePriceSheetTemplate(opts.template);
  const accent = tpl.accentColor;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const priceDisplay = (item: PriceSheetItem, plus = false) => {
    const m = `${plus ? '+ ' : ''}${money(applicableRate(item, opts.ctx))}`;
    if (item.pricingMode === 'flat') return `${m} ${opts.labels.flatWord}`;
    return item.unitLabel ? `${m} / ${item.unitLabel}` : m;
  };

  const by = new Map<string, PriceSheetItem[]>();
  opts.items.forEach(i => {
    const key = i.isAddon ? ADDONS : ((i.category ?? '').trim() || UNCAT);
    const arr = by.get(key);
    if (arr) arr.push(i); else by.set(key, [i]);
  });
  const keys = orderCategories(Array.from(by.keys()), tpl.categoryOrder, UNCAT);
  const sectionLabel = (k: string) =>
    k === ADDONS ? opts.labels.additionalCharges : k === UNCAT ? opts.labels.uncategorized : k;

  const sections = keys.map(k => {
    const rows = (by.get(k) ?? []).map(i => `
      <div class="row">
        <span class="row-name">${esc(i.name)}</span>
        <span class="row-price${k === ADDONS ? ' addon' : ''}">${esc(priceDisplay(i, k === ADDONS))}</span>
      </div>`).join('');
    return `
      <div class="section">
        <div class="section-title">${esc(sectionLabel(k))}</div>
        ${rows}
      </div>`;
  }).join('');

  const metaLine = `${esc(opts.labels.generatedOn)} ${esc(opts.todayStr)}${
    opts.preparedFor ? ` · ${esc(opts.labels.preparedFor)}: ${esc(opts.preparedFor)}` : ''
  }`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(opts.labels.sheetTitle)}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 13px; background: #ffffff; }
    .header { text-align: center; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
    .header img { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; margin-bottom: 6px; }
    .biz-name { font-size: 22px; font-weight: 700; margin: 0; }
    .biz-line { font-size: 11px; color: #64748b; margin: 1px 0 0; }
    .doc-title { font-size: 17px; font-weight: 600; margin: 12px 0 0; color: ${esc(accent)}; }
    .meta { font-size: 10px; color: #94a3b8; margin-top: 3px; }
    .section { margin-top: 18px; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${esc(accent)}; border-bottom: 1.5px solid ${esc(accent)}; padding-bottom: 4px; margin-bottom: 4px; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .row-name { font-size: 13px; }
    .row-price { font-size: 13px; font-weight: 700; white-space: nowrap; }
    .row-price.addon { color: #d97706; }
  </style>
</head>
<body>
  <div class="header">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ''}
    <p class="biz-name">${esc(opts.businessName)}</p>
    ${opts.businessLines.filter(Boolean).map(l => `<p class="biz-line">${esc(l)}</p>`).join('')}
    <p class="doc-title">${esc(opts.labels.sheetTitle)} · ${esc(opts.stateLabel)}</p>
    <p class="meta">${metaLine}</p>
  </div>
  ${sections}
</body>
</html>`;
}

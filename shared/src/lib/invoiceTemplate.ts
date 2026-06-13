/**
 * Invoice template engine — a single config-driven model that every invoice
 * renderer consumes: the in-app document (React: InvoiceDocument.tsx / .web),
 * the public web page, and the print/PDF HTML (buildInvoiceHtml, used by web
 * print + mobile expo-print).
 *
 * Design rules that keep this future-proof for the drag-drop builder (Phase 3):
 *   - Config carries a `version` and goes through `normalizeConfig` everywhere,
 *     so adding fields/sections later never breaks a stored config.
 *   - Presets are just seed configs of `InvoiceTemplateConfig`.
 *   - All formatting / ordering / show-hide lives in `buildInvoiceViewModel`;
 *     renderers emit markup only, so the React and HTML paths can't drift in
 *     logic. The builder will add OPTIONAL positioning fields to the SAME
 *     section objects + an optional `layoutMode`, defaulted by normalizeConfig.
 *
 * Platform note: this module must stay platform-agnostic (it's imported by the
 * Next web app and the RN app). No `react-native` / DOM imports. Font family is
 * exposed as a token; the RN renderer maps it to a native family itself.
 */

import {
  getInvoiceLabels,
  getInvoiceDateLocale,
  type InvoiceLang,
  type InvoiceLabelKey,
} from '../i18n/invoice';
import { formatDateLong } from './format';

export const INVOICE_TEMPLATE_VERSION = 1;

export type InvoicePresetId = 'clasica' | 'moderna' | 'minimalista' | 'compacta';
export type InvoiceFont = 'sans' | 'serif' | 'mono';
export type InvoiceDensity = 'comfortable' | 'compact';
export type InvoiceLogoSize = 'sm' | 'md' | 'lg';

/** Ordered, show/hideable document sections. The Phase-3 builder adds OPTIONAL
 *  positioning fields to these same objects — never new section *kinds*. */
export type InvoiceSectionId =
  | 'header'
  | 'billTo'
  | 'lineItems'
  | 'totals'
  | 'customFields'
  | 'notes'
  | 'paymentInstructions'
  | 'footer';

export const ALL_SECTION_IDS: InvoiceSectionId[] = [
  'header',
  'billTo',
  'lineItems',
  'totals',
  'customFields',
  'notes',
  'paymentInstructions',
  'footer',
];

export interface InvoiceSection {
  id: InvoiceSectionId;
  show: boolean;
  // Freeform placement (Phase 3), as PERCENT of the canvas (0–100). Optional
  // and ignored while layoutMode is 'flow', so flow configs are unaffected.
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export type InvoiceLayoutMode = 'flow' | 'freeform';

export interface InvoiceColumns {
  qty: boolean;
  rate: boolean;
  total: boolean;
  // `description` is always shown.
}

export interface InvoiceTextBlocks {
  headerNote?: string;
  paymentInstructions?: string;
  footer?: string;
}

export interface InvoiceTemplateConfig {
  version: number;
  presetId: InvoicePresetId;
  accentColor: string;
  font: InvoiceFont;
  density: InvoiceDensity;
  showLogo: boolean;
  logoSize: InvoiceLogoSize;
  sections: InvoiceSection[];
  columns: InvoiceColumns;
  text: InvoiceTextBlocks;
  // 'flow' (default) stacks sections in order; 'freeform' positions them by the
  // per-section x/y/w/h rect (the drag-drop builder). Absent ⇒ 'flow'.
  layoutMode?: InvoiceLayoutMode;
}

// ── Presets ──────────────────────────────────────────────────────────────────

const ACCENT_DEFAULT = '#4F46E5'; // app primary (indigo)

const fullSections = (): InvoiceSection[] =>
  ALL_SECTION_IDS.map(id => ({ id, show: true }));

export const INVOICE_PRESETS: Record<InvoicePresetId, InvoiceTemplateConfig> = {
  clasica: {
    version: INVOICE_TEMPLATE_VERSION,
    presetId: 'clasica',
    accentColor: '#1F2937', // conservative slate
    font: 'sans',
    density: 'comfortable',
    showLogo: true,
    logoSize: 'md',
    sections: fullSections(),
    columns: { qty: true, rate: true, total: true },
    text: {},
  },
  moderna: {
    version: INVOICE_TEMPLATE_VERSION,
    presetId: 'moderna',
    accentColor: ACCENT_DEFAULT,
    font: 'sans',
    density: 'comfortable',
    showLogo: true,
    logoSize: 'lg',
    sections: fullSections(),
    columns: { qty: true, rate: true, total: true },
    text: {},
  },
  minimalista: {
    version: INVOICE_TEMPLATE_VERSION,
    presetId: 'minimalista',
    accentColor: '#111827',
    font: 'serif',
    density: 'comfortable',
    showLogo: false,
    logoSize: 'sm',
    sections: fullSections(),
    columns: { qty: true, rate: true, total: true },
    text: {},
  },
  compacta: {
    version: INVOICE_TEMPLATE_VERSION,
    presetId: 'compacta',
    accentColor: '#1F2937',
    font: 'sans',
    density: 'compact',
    showLogo: true,
    logoSize: 'sm',
    sections: fullSections(),
    columns: { qty: true, rate: true, total: true },
    text: {},
  },
};

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = INVOICE_PRESETS.clasica;

// ── Normalize / resolve ──────────────────────────────────────────────────────

/** Merge an arbitrary stored config onto DEFAULT, dedupe + order sections, and
 *  append any newly-introduced section ids at the end (hidden). Every consumer
 *  routes stored config through this so old configs survive new fields. */
export function normalizeConfig(raw: unknown): InvoiceTemplateConfig {
  const base = DEFAULT_INVOICE_TEMPLATE;
  if (!raw || typeof raw !== 'object') return clone(base);
  const r = raw as Partial<InvoiceTemplateConfig>;

  const presetId: InvoicePresetId =
    r.presetId && INVOICE_PRESETS[r.presetId] ? r.presetId : base.presetId;

  // Sections: keep known, ordered, deduped; append missing ids as hidden.
  const seen = new Set<InvoiceSectionId>();
  const sections: InvoiceSection[] = [];
  const pct = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : undefined;
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    if (s && ALL_SECTION_IDS.includes(s.id) && !seen.has(s.id)) {
      seen.add(s.id);
      sections.push({ id: s.id, show: s.show !== false, x: pct(s.x), y: pct(s.y), w: pct(s.w), h: pct(s.h) });
    }
  }
  for (const id of ALL_SECTION_IDS) {
    if (!seen.has(id)) sections.push({ id, show: true });
  }

  return {
    version: INVOICE_TEMPLATE_VERSION,
    presetId,
    accentColor: typeof r.accentColor === 'string' ? r.accentColor : base.accentColor,
    font: r.font === 'serif' || r.font === 'mono' ? r.font : 'sans',
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    showLogo: r.showLogo !== false,
    logoSize: r.logoSize === 'sm' || r.logoSize === 'lg' ? r.logoSize : 'md',
    sections,
    columns: {
      qty: r.columns?.qty !== false,
      rate: r.columns?.rate !== false,
      total: r.columns?.total !== false,
    },
    text: {
      headerNote: str(r.text?.headerNote),
      paymentInstructions: str(r.text?.paymentInstructions),
      footer: str(r.text?.footer),
    },
    layoutMode: r.layoutMode === 'freeform' ? 'freeform' : 'flow',
  };
}

/** Pick the effective config: per-invoice frozen override → business default →
 *  app default. Always normalized. */
export function resolveConfig(
  invoiceConfig: unknown,
  businessConfig: unknown,
): InvoiceTemplateConfig {
  if (invoiceConfig && typeof invoiceConfig === 'object') return normalizeConfig(invoiceConfig);
  if (businessConfig && typeof businessConfig === 'object') return normalizeConfig(businessConfig);
  return clone(DEFAULT_INVOICE_TEMPLATE);
}

// ── Style tokens ─────────────────────────────────────────────────────────────

export interface StyleTokens {
  accent: string;
  font: InvoiceFont;
  /** CSS font stack for web / HTML / PDF. */
  cssFontFamily: string;
  density: InvoiceDensity;
  /** Card padding in px (web/RN). */
  pad: number;
  /** Body font size in px. */
  fontPx: number;
  /** Logo height in px. */
  logoPx: number;
}

const CSS_FONTS: Record<InvoiceFont, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace',
};

const LOGO_PX: Record<InvoiceLogoSize, number> = { sm: 36, md: 52, lg: 72 };

export function styleTokens(config: InvoiceTemplateConfig): StyleTokens {
  const compact = config.density === 'compact';
  return {
    accent: config.accentColor || ACCENT_DEFAULT,
    font: config.font,
    cssFontFamily: CSS_FONTS[config.font],
    density: config.density,
    pad: compact ? 16 : 24,
    fontPx: compact ? 12 : 14,
    logoPx: LOGO_PX[config.logoSize],
  };
}

// ── View model ───────────────────────────────────────────────────────────────

/** Structurally compatible with InvoiceDetailScreen's `InvoiceDetail`. */
export interface InvoiceDocClient {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCell: string | null;
}
export interface InvoiceDocLineItem {
  description: string;
  qty: number;
  rate: number;
}
export interface InvoiceDocData {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  lineItems: InvoiceDocLineItem[];
  subtotalAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  language: InvoiceLang;
  clients: InvoiceDocClient[];
  customFields?: { label: string; value: string }[];
}

/** Business branding used in the invoice header. */
export interface InvoiceBranding {
  name: string;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  postalCode: string | null;
  taxId: string | null;
  licenseNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface InvoiceViewModel {
  style: StyleTokens;
  lang: InvoiceLang;
  labels: Record<InvoiceLabelKey, string>;
  /** Visible sections in render order (empty-data sections already dropped). */
  sections: InvoiceSectionId[];
  /** 'flow' stacks sections; 'freeform' positions them by `rects`. */
  layoutMode: InvoiceLayoutMode;
  /** Freeform placement per section, percent of the canvas (0–100). */
  rects: Partial<Record<InvoiceSectionId, { x: number; y: number; w: number; h: number }>>;
  header: {
    showLogo: boolean;
    logoUrl: string | null;
    businessName: string;
    businessLines: string[];
    invoiceTitle: string;
    invoiceNumber: string;
    statusLabel: string;
    issueLabel: string;
    issueValue: string;
    dueLabel: string;
    dueValue: string | null;
    headerNote: string | null;
  };
  billTo: { name: string; lines: string[] }[];
  columns: InvoiceColumns;
  items: { description: string; qty: string; rate: string; total: string }[];
  totals: { subtotal: string; taxLabel: string | null; taxValue: string | null; total: string };
  customFields: { label: string; value: string }[];
  notes: string | null;
  paymentInstructions: string | null;
  footer: string | null;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function buildInvoiceViewModel(
  config: InvoiceTemplateConfig,
  invoice: InvoiceDocData,
  branding: InvoiceBranding,
): InvoiceViewModel {
  const cfg = normalizeConfig(config);
  const style = styleTokens(cfg);
  const lang: InvoiceLang = invoice.language ?? 'es';
  const labels = getInvoiceLabels(lang);
  const dateLoc = getInvoiceDateLocale(lang);
  const fmtDate = (iso: string) => formatDateLong(iso, dateLoc);

  const businessLines = [
    [branding.city, branding.state].filter(Boolean).join(', '),
    branding.address ?? '',
    branding.phone ?? '',
    branding.email ?? '',
    branding.website ?? '',
    branding.taxId ? `${labels.from === 'De' ? 'RFC/Tax ID' : 'Tax ID'}: ${branding.taxId}` : '',
    branding.licenseNumber ? `Lic: ${branding.licenseNumber}` : '',
  ]
    .map(s => s.trim())
    .filter(Boolean);

  const billTo = invoice.clients.map(c => ({
    name: `${c.firstName} ${c.lastName}`.trim(),
    lines: [c.email ?? '', c.phoneCell ?? ''].map(s => s.trim()).filter(Boolean),
  }));

  const items = invoice.lineItems.map(l => {
    const qty = Number(l.qty) || 0;
    const rate = Number(l.rate) || 0;
    return {
      description: l.description,
      qty: String(qty),
      rate: fmtMoney(rate),
      total: fmtMoney(qty * rate),
    };
  });

  const customFields = invoice.customFields ?? [];
  const headerNote = cfg.text.headerNote?.trim() || null;
  const paymentInstructions = cfg.text.paymentInstructions?.trim() || null;
  const footer = cfg.text.footer?.trim() || null;
  const notes = invoice.notes?.trim() || null;

  // Drop sections with no data so empty blocks don't print.
  const hasData: Record<InvoiceSectionId, boolean> = {
    header: true,
    billTo: billTo.length > 0,
    lineItems: items.length > 0,
    totals: true,
    customFields: customFields.length > 0,
    notes: !!notes,
    paymentInstructions: !!paymentInstructions,
    footer: !!footer,
  };
  const visible = cfg.sections.filter(s => s.show && hasData[s.id]);
  const sections = visible.map(s => s.id);
  const rects: Partial<Record<InvoiceSectionId, { x: number; y: number; w: number; h: number }>> = {};
  for (const s of visible) {
    if (s.x != null && s.y != null && s.w != null && s.h != null) {
      rects[s.id] = { x: s.x, y: s.y, w: s.w, h: s.h };
    }
  }

  return {
    style,
    lang,
    labels,
    sections,
    layoutMode: cfg.layoutMode === 'freeform' ? 'freeform' : 'flow',
    rects,
    header: {
      showLogo: cfg.showLogo && !!branding.logoUrl,
      logoUrl: branding.logoUrl,
      businessName: branding.name,
      businessLines,
      invoiceTitle: labels.invoice,
      invoiceNumber: invoice.invoiceNumber,
      statusLabel: (labels as Record<string, string>)[invoice.status] ?? invoice.status,
      issueLabel: labels.issueDate,
      issueValue: fmtDate(invoice.issueDate),
      dueLabel: labels.dueDate,
      dueValue: invoice.dueDate ? fmtDate(invoice.dueDate) : null,
      headerNote,
    },
    billTo,
    columns: cfg.columns,
    items,
    totals: {
      subtotal: fmtMoney(invoice.subtotalAmount),
      taxLabel: invoice.taxRate > 0 ? `${labels.tax} (${invoice.taxRate}%)` : null,
      taxValue: invoice.taxRate > 0 ? fmtMoney(invoice.taxAmount) : null,
      total: fmtMoney(invoice.totalAmount),
    },
    customFields,
    notes,
    paymentInstructions,
    footer,
  };
}

// ── HTML renderer (web print + mobile expo-print) ────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const br = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

export function buildInvoiceHtml(vm: InvoiceViewModel): string {
  const { style: st, header: h, labels: L } = vm;
  const accent = escapeHtml(st.accent);
  const logoMax = st.logoPx;

  const headerHtml = `
    <div class="inv-header">
      <div class="inv-from">
        ${h.showLogo && h.logoUrl ? `<img class="inv-logo" src="${escapeHtml(h.logoUrl)}" alt="">` : ''}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${h.businessLines.map(l => `<div class="inv-bizline">${escapeHtml(l)}</div>`).join('')}
      </div>
      <div class="inv-meta">
        <div class="inv-title">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status">${escapeHtml(h.statusLabel)}</div>
        <div class="inv-metaline"><span>${escapeHtml(h.issueLabel)}:</span> ${escapeHtml(h.issueValue)}</div>
        ${h.dueValue ? `<div class="inv-metaline"><span>${escapeHtml(h.dueLabel)}:</span> ${escapeHtml(h.dueValue)}</div>` : ''}
      </div>
    </div>
    ${h.headerNote ? `<div class="inv-note-top">${br(h.headerNote)}</div>` : ''}`;

  const billToHtml = `
    <div class="inv-billto">
      <div class="inv-sectlabel">${escapeHtml(L.billTo)}</div>
      ${vm.billTo
        .map(
          c => `<div class="inv-client">
            <div class="inv-clientname">${escapeHtml(c.name)}</div>
            ${c.lines.map(l => `<div class="inv-bizline">${escapeHtml(l)}</div>`).join('')}
          </div>`,
        )
        .join('')}
    </div>`;

  const cols = vm.columns;
  const itemsHtml = `
    <table class="inv-table">
      <thead><tr>
        <th class="ta-l">${escapeHtml(L.item)}</th>
        ${cols.qty ? `<th class="ta-c">${escapeHtml(L.qty)}</th>` : ''}
        ${cols.rate ? `<th class="ta-r">${escapeHtml(L.rate)}</th>` : ''}
        ${cols.total ? `<th class="ta-r">${escapeHtml(L.total)}</th>` : ''}
      </tr></thead>
      <tbody>
        ${vm.items
          .map(
            it => `<tr>
              <td class="ta-l">${escapeHtml(it.description)}</td>
              ${cols.qty ? `<td class="ta-c">${escapeHtml(it.qty)}</td>` : ''}
              ${cols.rate ? `<td class="ta-r">${escapeHtml(it.rate)}</td>` : ''}
              ${cols.total ? `<td class="ta-r strong">${escapeHtml(it.total)}</td>` : ''}
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;

  const totalsHtml = `
    <div class="inv-totals">
      <div class="inv-totrow"><span>${escapeHtml(L.subtotal)}</span><span>${escapeHtml(vm.totals.subtotal)}</span></div>
      ${vm.totals.taxLabel ? `<div class="inv-totrow"><span>${escapeHtml(vm.totals.taxLabel)}</span><span>${escapeHtml(vm.totals.taxValue ?? '')}</span></div>` : ''}
      <div class="inv-totrow grand"><span>${escapeHtml(L.total)}</span><span>${escapeHtml(vm.totals.total)}</span></div>
    </div>`;

  const customFieldsHtml = `
    <div class="inv-block">
      <div class="inv-sectlabel">${escapeHtml(L.customFields)}</div>
      ${vm.customFields
        .map(
          f => `<div class="inv-cfrow"><span>${escapeHtml(f.label)}</span><span>${escapeHtml(f.value)}</span></div>`,
        )
        .join('')}
    </div>`;

  const notesHtml = vm.notes
    ? `<div class="inv-block"><div class="inv-sectlabel">${escapeHtml(L.notes)}</div><div class="inv-text">${br(vm.notes)}</div></div>`
    : '';
  const payHtml = vm.paymentInstructions
    ? `<div class="inv-block"><div class="inv-sectlabel">${escapeHtml(vm.lang === 'es' ? 'Instrucciones de pago' : 'Payment instructions')}</div><div class="inv-text">${br(vm.paymentInstructions)}</div></div>`
    : '';
  const footerHtml = vm.footer ? `<div class="inv-footer">${br(vm.footer)}</div>` : '';

  const sectionHtml: Record<InvoiceSectionId, string> = {
    header: headerHtml,
    billTo: billToHtml,
    lineItems: itemsHtml,
    totals: totalsHtml,
    customFields: customFieldsHtml,
    notes: notesHtml,
    paymentInstructions: payHtml,
    footer: footerHtml,
  };
  const freeform = vm.layoutMode === 'freeform';
  const body = freeform
    ? `<div class="inv-canvas">${vm.sections
        .map(id => {
          const r = vm.rects[id];
          if (!r) return '';
          return `<div class="inv-abs" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%">${sectionHtml[id]}</div>`;
        })
        .join('')}</div>`
    : vm.sections.map(id => sectionHtml[id]).join('\n');

  const gap = st.density === 'compact' ? 14 : 22;
  const cellPad = st.density === 'compact' ? '6px 8px' : '9px 8px';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(h.invoiceNumber)}</title>
  <style>
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: ${st.cssFontFamily}; color: #1f2937; margin: 0; font-size: ${st.fontPx}px; }
    .inv-doc > * { margin-bottom: ${gap}px; }
    .inv-canvas { position: relative; width: 100%; aspect-ratio: 8.5 / 11; }
    .inv-canvas > * { margin-bottom: 0; }
    .inv-abs { position: absolute; overflow: hidden; }
    .inv-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid ${accent}; padding-bottom: ${gap}px; }
    .inv-logo { max-height: ${logoMax}px; max-width: 220px; object-fit: contain; margin-bottom: 8px; display: block; }
    .inv-bizname { font-weight: 700; font-size: ${st.fontPx + 4}px; }
    .inv-bizline { color: #6b7280; font-size: ${st.fontPx - 2}px; margin-top: 2px; }
    .inv-meta { text-align: right; }
    .inv-title { text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; font-weight: 700; font-size: ${st.fontPx + 6}px; }
    .inv-number { font-weight: 600; margin-top: 2px; }
    .inv-status { display: inline-block; margin-top: 4px; font-size: ${st.fontPx - 3}px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
    .inv-metaline { font-size: ${st.fontPx - 2}px; color: #374151; margin-top: 4px; }
    .inv-metaline span { color: #9ca3af; }
    .inv-note-top { font-size: ${st.fontPx - 1}px; color: #374151; }
    .inv-sectlabel { text-transform: uppercase; letter-spacing: 0.05em; font-size: ${st.fontPx - 3}px; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
    .inv-clientname { font-weight: 600; }
    .inv-client + .inv-client { margin-top: 6px; }
    .inv-table { width: 100%; border-collapse: collapse; }
    .inv-table th { font-size: ${st.fontPx - 3}px; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; border-bottom: 1px solid #e5e7eb; padding: ${cellPad}; }
    .inv-table td { padding: ${cellPad}; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .inv-table tr { break-inside: avoid; }
    .inv-table thead { display: table-header-group; }
    .ta-l { text-align: left; } .ta-c { text-align: center; } .ta-r { text-align: right; }
    .strong { font-weight: 600; color: #111827; }
    .inv-totals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; break-inside: avoid; }
    .inv-totrow { display: flex; gap: 48px; font-size: ${st.fontPx}px; color: #374151; }
    .inv-totrow span:last-child { min-width: 110px; text-align: right; }
    .inv-totrow.grand { border-top: 2px solid #e5e7eb; padding-top: 8px; margin-top: 2px; font-weight: 700; font-size: ${st.fontPx + 4}px; }
    .inv-totrow.grand span:last-child { color: ${accent}; }
    .inv-block { break-inside: avoid; }
    .inv-cfrow { display: flex; justify-content: space-between; gap: 16px; font-size: ${st.fontPx - 1}px; padding: 2px 0; }
    .inv-cfrow span:first-child { color: #6b7280; }
    .inv-text { font-size: ${st.fontPx - 1}px; color: #4b5563; white-space: pre-wrap; line-height: 1.5; }
    .inv-footer { border-top: 1px solid #e5e7eb; padding-top: 10px; color: #9ca3af; font-size: ${st.fontPx - 2}px; text-align: center; white-space: pre-wrap; }
  </style>
</head>
<body><div class="inv-doc">${body}</div></body>
</html>`;
}

// ── Editor helpers (Phase 2 settings) ────────────────────────────────────────

export function applyPreset(presetId: InvoicePresetId): InvoiceTemplateConfig {
  return clone(INVOICE_PRESETS[presetId] ?? DEFAULT_INVOICE_TEMPLATE);
}
export function setAccent(c: InvoiceTemplateConfig, accentColor: string): InvoiceTemplateConfig {
  return { ...c, accentColor };
}
export function setFont(c: InvoiceTemplateConfig, font: InvoiceFont): InvoiceTemplateConfig {
  return { ...c, font };
}
export function setDensity(c: InvoiceTemplateConfig, density: InvoiceDensity): InvoiceTemplateConfig {
  return { ...c, density };
}
export function setShowLogo(c: InvoiceTemplateConfig, showLogo: boolean): InvoiceTemplateConfig {
  return { ...c, showLogo };
}
export function setLogoSize(c: InvoiceTemplateConfig, logoSize: InvoiceLogoSize): InvoiceTemplateConfig {
  return { ...c, logoSize };
}
export function toggleSection(c: InvoiceTemplateConfig, id: InvoiceSectionId): InvoiceTemplateConfig {
  return {
    ...c,
    sections: c.sections.map(s => (s.id === id ? { ...s, show: !s.show } : s)),
  };
}
export function reorderSections(
  c: InvoiceTemplateConfig,
  from: number,
  to: number,
): InvoiceTemplateConfig {
  const next = [...c.sections];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return c;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...c, sections: next };
}
export function setColumn(
  c: InvoiceTemplateConfig,
  key: keyof InvoiceColumns,
  value: boolean,
): InvoiceTemplateConfig {
  return { ...c, columns: { ...c.columns, [key]: value } };
}
export function setText(
  c: InvoiceTemplateConfig,
  key: keyof InvoiceTextBlocks,
  value: string,
): InvoiceTemplateConfig {
  return { ...c, text: { ...c.text, [key]: value } };
}

// ── Freeform builder (Phase 3) ───────────────────────────────────────────────

// Default stacked heights (percent of canvas) used to seed a freeform layout
// from a flow config the first time the builder is opened.
const FREEFORM_H: Record<InvoiceSectionId, number> = {
  header: 16, billTo: 12, lineItems: 30, totals: 12,
  customFields: 12, notes: 12, paymentInstructions: 10, footer: 6,
};

function seedRects(sections: InvoiceSection[]): InvoiceSection[] {
  let y = 3;
  return sections.map(s => {
    if (!s.show) return s;
    if (s.x != null && s.y != null && s.w != null && s.h != null) return s;
    const h = FREEFORM_H[s.id] ?? 10;
    const seeded = { ...s, x: 4, y: Math.min(y, 96), w: 92, h };
    y += h + 2;
    return seeded;
  });
}

export function setLayoutMode(c: InvoiceTemplateConfig, mode: InvoiceLayoutMode): InvoiceTemplateConfig {
  if (mode === 'freeform') return { ...c, layoutMode: 'freeform', sections: seedRects(c.sections) };
  return { ...c, layoutMode: 'flow' };
}

export function setSectionRect(
  c: InvoiceTemplateConfig,
  id: InvoiceSectionId,
  rect: { x: number; y: number; w: number; h: number },
): InvoiceTemplateConfig {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const w = Math.max(8, clamp(rect.w));
  const h = Math.max(4, clamp(rect.h));
  return {
    ...c,
    sections: c.sections.map(s =>
      s.id === id
        ? { ...s, x: Math.min(clamp(rect.x), 100 - w), y: Math.min(clamp(rect.y), 100 - h), w, h }
        : s,
    ),
  };
}

/** A realistic sample for the settings live preview (no real invoice needed). */
export const SAMPLE_INVOICE: InvoiceDocData = {
  invoiceNumber: 'FAC-0001',
  status: 'sent',
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  lineItems: [
    { description: 'Mano de obra', qty: 8, rate: 45 },
    { description: 'Materiales', qty: 1, rate: 220 },
  ],
  subtotalAmount: 580,
  taxRate: 8,
  taxAmount: 46.4,
  totalAmount: 626.4,
  notes: 'Gracias por su preferencia.',
  language: 'es',
  clients: [{ firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', phoneCell: '(555) 123-4567' }],
  customFields: [],
};

// ── internals ────────────────────────────────────────────────────────────────

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

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

/** Industry-tailored templates. Each is a seed `InvoiceTemplateConfig` pairing a
 *  layout `archetype` with industry-appropriate color/font/copy. `general` is the
 *  universal default and the back-compat target for older configs. */
export type InvoicePresetId =
  | 'general'
  | 'profesional'
  | 'construccion'
  | 'plomeria'
  | 'electrico'
  | 'pintura'
  | 'techado'
  | 'hvac'
  | 'jardineria'
  | 'limpieza'
  | 'mudanzas'
  | 'mecanico'
  | 'detallado'
  | 'salon'
  | 'catering'
  | 'fotografia'
  | 'tutoria';

/** Header LAYOUT structure (the most visually distinctive zone). The body below
 *  (line items, totals, etc.) always flows identically so multi-page print stays
 *  robust regardless of archetype. */
export type InvoiceArchetype = 'classic' | 'band' | 'centered' | 'sidebar' | 'minimal';
export const ALL_ARCHETYPES: InvoiceArchetype[] = ['classic', 'band', 'centered', 'sidebar', 'minimal'];

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

// ── Freeform elements (Canva-style canvas) ──────────────────────────────────
// In 'freeform' layout the document is a flat list of positioned ELEMENTS the
// user drags/resizes: the logo, auto-bound data fields, and static text blocks.

/** Auto-bound data fields a user can drop onto the canvas. Each resolves to
 *  live invoice/business data at render time (see resolveFieldValue / the
 *  lineItems table). */
export type InvoiceFieldKey =
  | 'businessName'
  | 'businessContact'
  | 'invoiceTitle'
  | 'invoiceNumber'
  | 'status'
  | 'issueDate'
  | 'dueDate'
  | 'billToLabel'
  | 'billToName'
  | 'billToContact'
  | 'lineItems'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'notes'
  | 'paymentInstructions'
  | 'headerNote'
  | 'footer';

export const FREEFORM_FIELD_KEYS: InvoiceFieldKey[] = [
  'businessName', 'businessContact', 'invoiceTitle', 'invoiceNumber', 'status',
  'issueDate', 'dueDate', 'billToLabel', 'billToName', 'billToContact',
  'lineItems', 'subtotal', 'tax', 'total', 'notes', 'paymentInstructions',
  'headerNote', 'footer',
];

export interface InvoiceElementStyle {
  fontSize?: number;                       // px (at the 720px reference width)
  bold?: boolean;
  color?: string;                          // hex; defaults to theme text/accent
  align?: 'left' | 'center' | 'right';
  font?: InvoiceFont;                      // per-element font; inherits theme font when unset
}

export type InvoiceElementKind = 'logo' | 'field' | 'text';

export interface InvoiceElement {
  id: string;
  kind: InvoiceElementKind;
  field?: InvoiceFieldKey;                 // when kind === 'field'
  text?: string;                           // when kind === 'text'
  // Position + size as PERCENT of the canvas (0–100).
  x: number;
  y: number;
  w: number;
  h: number;
  style?: InvoiceElementStyle;
}

export interface InvoiceTemplateConfig {
  version: number;
  presetId: InvoicePresetId;
  /** Header layout structure. Absent on legacy configs ⇒ 'classic' (unchanged). */
  archetype: InvoiceArchetype;
  accentColor: string;
  font: InvoiceFont;
  density: InvoiceDensity;
  showLogo: boolean;
  logoSize: InvoiceLogoSize;
  sections: InvoiceSection[];
  columns: InvoiceColumns;
  text: InvoiceTextBlocks;
  // 'flow' (default) stacks sections in order; 'freeform' renders `elements`
  // (the element canvas / drag-drop builder). Absent ⇒ 'flow'.
  layoutMode?: InvoiceLayoutMode;
  // Freeform elements — the positioned logo / field / text blocks. Seeded from
  // a sensible default layout the first time freeform is enabled.
  elements?: InvoiceElement[];
  // The business-wide default language for NEW invoices. Does NOT affect how an
  // existing invoice renders — each invoice carries its own `language` field
  // (set from this default at creation, overridable per invoice).
  defaultLanguage: InvoiceLang;
}

// ── Presets ──────────────────────────────────────────────────────────────────

const ACCENT_DEFAULT = '#4F46E5'; // app primary (indigo)

const fullSections = (): InvoiceSection[] =>
  ALL_SECTION_IDS.map(id => ({ id, show: true }));

/** Seed-config builder so each industry preset is a one-liner. Default copy is
 *  Spanish (app is Spanish-first); a user can clear/edit it after applying. */
function preset(
  id: InvoicePresetId,
  archetype: InvoiceArchetype,
  accentColor: string,
  opts: {
    font?: InvoiceFont;
    density?: InvoiceDensity;
    logoSize?: InvoiceLogoSize;
    showLogo?: boolean;
    text?: InvoiceTextBlocks;
  } = {},
): InvoiceTemplateConfig {
  return {
    version: INVOICE_TEMPLATE_VERSION,
    presetId: id,
    archetype,
    accentColor,
    font: opts.font ?? 'sans',
    density: opts.density ?? 'comfortable',
    showLogo: opts.showLogo ?? true,
    logoSize: opts.logoSize ?? 'md',
    sections: fullSections(),
    columns: { qty: true, rate: true, total: true },
    text: opts.text ?? {},
    defaultLanguage: 'es',
  };
}

export const INVOICE_PRESETS: Record<InvoicePresetId, InvoiceTemplateConfig> = {
  // Universal
  general: preset('general', 'classic', '#1F2937'),
  profesional: preset('profesional', 'sidebar', ACCENT_DEFAULT, { logoSize: 'lg' }),
  // Construcción y oficios
  construccion: preset('construccion', 'band', '#D97706', {
    text: {
      paymentInstructions: 'Pago neto a 30 días. Aceptamos cheque, transferencia y tarjeta.',
      footer: 'Gracias por confiar en nuestro trabajo.',
    },
  }),
  plomeria: preset('plomeria', 'band', '#2563EB', {
    text: { footer: 'Garantía de 90 días en mano de obra.' },
  }),
  electrico: preset('electrico', 'band', '#CA8A04', {
    text: { footer: 'Trabajo realizado conforme al código eléctrico vigente.' },
  }),
  pintura: preset('pintura', 'centered', '#7C3AED'),
  techado: preset('techado', 'band', '#334155', {
    text: { footer: 'Garantía de materiales y mano de obra disponible bajo solicitud.' },
  }),
  hvac: preset('hvac', 'band', '#0284C7', {
    text: { footer: 'Mantenimiento recomendado cada 6 meses.' },
  }),
  // Hogar y exterior
  jardineria: preset('jardineria', 'sidebar', '#059669', {
    text: { footer: 'Gracias por mantener su jardín con nosotros.' },
  }),
  limpieza: preset('limpieza', 'centered', '#0EA5E9', {
    text: { footer: 'Gracias por su preferencia.' },
  }),
  mudanzas: preset('mudanzas', 'sidebar', '#EA580C'),
  // Auto
  mecanico: preset('mecanico', 'sidebar', '#DC2626', {
    text: { footer: 'Garantía de 30 días o 1,000 millas en reparaciones.' },
  }),
  detallado: preset('detallado', 'centered', '#0F172A'),
  // Cuidado y eventos
  salon: preset('salon', 'centered', '#DB2777', { font: 'serif' }),
  catering: preset('catering', 'minimal', '#B45309', { font: 'serif' }),
  fotografia: preset('fotografia', 'minimal', '#111827', { font: 'serif', showLogo: false }),
  tutoria: preset('tutoria', 'minimal', '#0D9488', { font: 'serif' }),
};

/** Older configs used abstract preset ids; map them to the nearest new id so the
 *  picker still highlights something sensible (the rest of the stored config is
 *  preserved by normalizeConfig regardless). */
const PRESET_ALIASES: Record<string, InvoicePresetId> = {
  clasica: 'general',
  moderna: 'profesional',
  minimalista: 'fotografia',
  compacta: 'general',
};

/** Ordered industry groups for the gallery picker. Names live in i18n. */
export const INVOICE_PRESET_GROUPS: { id: string; presetIds: InvoicePresetId[] }[] = [
  { id: 'universal', presetIds: ['general', 'profesional'] },
  { id: 'construccion', presetIds: ['construccion', 'plomeria', 'electrico', 'pintura', 'techado', 'hvac'] },
  { id: 'hogar', presetIds: ['jardineria', 'limpieza', 'mudanzas'] },
  { id: 'auto', presetIds: ['mecanico', 'detallado'] },
  { id: 'eventos', presetIds: ['salon', 'catering', 'fotografia', 'tutoria'] },
];

export const INVOICE_PRESET_IDS: InvoicePresetId[] = INVOICE_PRESET_GROUPS.flatMap(g => g.presetIds);

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = INVOICE_PRESETS.general;

// ── Freeform default layout + element validation ─────────────────────────────

/** A sensible starting layout (percent coords) seeded when freeform is first
 *  enabled — the user then drags/edits from here. Stable ids so re-normalizing
 *  is idempotent. */
export function defaultElements(): InvoiceElement[] {
  return [
    { id: 'el-logo', kind: 'logo', x: 5, y: 4, w: 22, h: 9 },
    { id: 'el-bizname', kind: 'field', field: 'businessName', x: 5, y: 15, w: 45, h: 4, style: { bold: true, fontSize: 18 } },
    { id: 'el-bizcontact', kind: 'field', field: 'businessContact', x: 5, y: 19, w: 45, h: 12, style: { fontSize: 11 } },
    { id: 'el-title', kind: 'field', field: 'invoiceTitle', x: 60, y: 4, w: 35, h: 7, style: { bold: true, fontSize: 28, align: 'right' } },
    { id: 'el-number', kind: 'field', field: 'invoiceNumber', x: 60, y: 11, w: 35, h: 4, style: { align: 'right', fontSize: 13 } },
    { id: 'el-issue', kind: 'field', field: 'issueDate', x: 55, y: 17, w: 40, h: 4, style: { align: 'right', fontSize: 11 } },
    { id: 'el-due', kind: 'field', field: 'dueDate', x: 55, y: 21, w: 40, h: 4, style: { align: 'right', fontSize: 11 } },
    { id: 'el-billlabel', kind: 'field', field: 'billToLabel', x: 5, y: 34, w: 45, h: 3, style: { bold: true, fontSize: 11 } },
    { id: 'el-billname', kind: 'field', field: 'billToName', x: 5, y: 37, w: 45, h: 4, style: { bold: true, fontSize: 13 } },
    { id: 'el-billcontact', kind: 'field', field: 'billToContact', x: 5, y: 41, w: 45, h: 8, style: { fontSize: 11 } },
    { id: 'el-items', kind: 'field', field: 'lineItems', x: 5, y: 51, w: 90, h: 30 },
    { id: 'el-subtotal', kind: 'field', field: 'subtotal', x: 55, y: 83, w: 40, h: 4, style: { align: 'right', fontSize: 12 } },
    { id: 'el-tax', kind: 'field', field: 'tax', x: 55, y: 87, w: 40, h: 4, style: { align: 'right', fontSize: 12 } },
    { id: 'el-total', kind: 'field', field: 'total', x: 55, y: 91, w: 40, h: 5, style: { align: 'right', bold: true, fontSize: 16 } },
  ];
}

function normalizeElement(e: unknown): InvoiceElement | null {
  if (!e || typeof e !== 'object') return null;
  const el = e as Partial<InvoiceElement>;
  const kind = el.kind;
  if (kind !== 'logo' && kind !== 'field' && kind !== 'text') return null;
  if (kind === 'field' && !(el.field && FREEFORM_FIELD_KEYS.includes(el.field))) return null;
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d;
  const style = el.style && typeof el.style === 'object' ? el.style : undefined;
  const out: InvoiceElement = {
    id: typeof el.id === 'string' && el.id ? el.id : `el-${kind}-${Math.round(num(el.x, 0))}-${Math.round(num(el.y, 0))}`,
    kind,
    x: num(el.x, 4),
    y: num(el.y, 4),
    w: Math.max(5, num(el.w, 30)),
    h: Math.max(3, num(el.h, 6)),
  };
  if (kind === 'field') out.field = el.field;
  if (kind === 'text') out.text = typeof el.text === 'string' ? el.text : '';
  if (style) {
    out.style = {
      fontSize: typeof style.fontSize === 'number' ? Math.max(6, Math.min(72, style.fontSize)) : undefined,
      bold: style.bold === true ? true : undefined,
      color: typeof style.color === 'string' ? style.color : undefined,
      align: style.align === 'center' || style.align === 'right' ? style.align : undefined,
      font: style.font === 'serif' || style.font === 'mono' || style.font === 'sans' ? style.font : undefined,
    };
  }
  return out;
}

// ── Normalize / resolve ──────────────────────────────────────────────────────

/** Merge an arbitrary stored config onto DEFAULT, dedupe + order sections, and
 *  append any newly-introduced section ids at the end (hidden). Every consumer
 *  routes stored config through this so old configs survive new fields. */
export function normalizeConfig(raw: unknown): InvoiceTemplateConfig {
  const base = DEFAULT_INVOICE_TEMPLATE;
  if (!raw || typeof raw !== 'object') return clone(base);
  const r = raw as Partial<InvoiceTemplateConfig>;

  const rawPreset = typeof r.presetId === 'string' ? r.presetId : '';
  const presetId: InvoicePresetId = INVOICE_PRESETS[rawPreset as InvoicePresetId]
    ? (rawPreset as InvoicePresetId)
    : PRESET_ALIASES[rawPreset] ?? base.presetId;
  const archetype: InvoiceArchetype =
    r.archetype && ALL_ARCHETYPES.includes(r.archetype) ? r.archetype : 'classic';

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

  const layoutMode: InvoiceLayoutMode = r.layoutMode === 'freeform' ? 'freeform' : 'flow';
  let elements = Array.isArray(r.elements)
    ? r.elements.map(normalizeElement).filter((e): e is InvoiceElement => e !== null)
    : undefined;
  // In freeform mode we always need elements to render — seed the default
  // layout if none are present yet.
  if (layoutMode === 'freeform' && (!elements || elements.length === 0)) {
    elements = defaultElements();
  }

  return {
    version: INVOICE_TEMPLATE_VERSION,
    presetId,
    archetype,
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
    layoutMode,
    ...(elements ? { elements } : {}),
    defaultLanguage: r.defaultLanguage === 'en' ? 'en' : 'es',
  };
}

/** The business-wide default invoice language stored in the theme config.
 *  New invoices seed their `language` from this (overridable per invoice). */
export function invoiceDefaultLanguage(rawConfig: unknown): InvoiceLang {
  return normalizeConfig(rawConfig).defaultLanguage;
}

/** Auto-number prefix by language: INV- (English) / FAC- (Spanish). Used as the
 *  default invoice number; a user-entered custom number overrides it. */
export function invoiceNumberPrefix(lang: InvoiceLang): string {
  return lang === 'en' ? 'INV' : 'FAC';
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
  /** Header layout structure (body sections are archetype-independent). */
  archetype: InvoiceArchetype;
  labels: Record<InvoiceLabelKey, string>;
  /** Visible sections in render order (empty-data sections already dropped). */
  sections: InvoiceSectionId[];
  /** 'flow' stacks sections; 'freeform' renders `elements`. */
  layoutMode: InvoiceLayoutMode;
  /** Freeform placement per section, percent of the canvas (0–100). [legacy] */
  rects: Partial<Record<InvoiceSectionId, { x: number; y: number; w: number; h: number }>>;
  /** Freeform elements (logo / field / text), positioned. Empty in flow mode. */
  elements: InvoiceElement[];
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
    archetype: cfg.archetype,
    labels,
    sections,
    layoutMode: cfg.layoutMode === 'freeform' ? 'freeform' : 'flow',
    rects,
    elements: cfg.layoutMode === 'freeform' ? (cfg.elements ?? []) : [],
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

/** Text content for a bound field element. 'lineItems' renders as a table and
 *  'logo' as an image — those are handled by the renderers, not here. */
export function resolveFieldValue(vm: InvoiceViewModel, key: InvoiceFieldKey): string {
  const h = vm.header;
  switch (key) {
    case 'businessName': return h.businessName;
    case 'businessContact': return h.businessLines.join('\n');
    case 'invoiceTitle': return h.invoiceTitle;
    case 'invoiceNumber': return h.invoiceNumber;
    case 'status': return h.statusLabel;
    case 'issueDate': return `${h.issueLabel}: ${h.issueValue}`;
    case 'dueDate': return h.dueValue ? `${h.dueLabel}: ${h.dueValue}` : '';
    case 'billToLabel': return vm.labels.billTo;
    case 'billToName': return vm.billTo.map(c => c.name).join('\n');
    case 'billToContact': return vm.billTo.flatMap(c => c.lines).join('\n');
    case 'subtotal': return `${vm.labels.subtotal}: ${vm.totals.subtotal}`;
    case 'tax': return vm.totals.taxLabel ? `${vm.totals.taxLabel}: ${vm.totals.taxValue}` : '';
    case 'total': return `${vm.labels.total}: ${vm.totals.total}`;
    case 'notes': return vm.notes ?? '';
    case 'paymentInstructions': return vm.paymentInstructions ?? '';
    case 'headerNote': return vm.header.headerNote ?? '';
    case 'footer': return vm.footer ?? '';
    case 'lineItems': return '';
    default: return '';
  }
}

/** CSS font stack for a font choice — exposed so renderers can apply a
 *  per-element font. */
export function cssFontFamily(font: InvoiceFont): string {
  return CSS_FONTS[font];
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Readable text color (#FFFFFF or near-black) for text placed ON an accent fill
 *  — used by the band/sidebar archetypes. */
export function onAccentColor(hex: string): string {
  const c = parseHex(hex);
  if (!c) return '#FFFFFF';
  // Perceived luminance (sRGB) — light backgrounds get dark text.
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.62 ? '#111827' : '#FFFFFF';
}

/** rgba() string from a hex + alpha — valid in CSS, RN, and print HTML. Falls
 *  back to the input when the hex can't be parsed. */
export function withAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Fields that default to the accent color in freeform when no explicit color
 *  is set (mirrors how flow uses accent for the title + grand total). */
export function fieldUsesAccent(field: InvoiceFieldKey | undefined): boolean {
  return field === 'invoiceTitle' || field === 'total';
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
  const onAcc = escapeHtml(onAccentColor(st.accent));
  const subtleOnAcc = onAcc === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(17,24,39,0.68)';
  const tint = withAlpha(st.accent, 0.1);

  const logoTag = (cls: string) =>
    h.showLogo && h.logoUrl ? `<img class="${cls}" src="${escapeHtml(h.logoUrl)}" alt="">` : '';
  const bizLines = (cls: string) =>
    h.businessLines.map(l => `<div class="${cls}">${escapeHtml(l)}</div>`).join('');
  const meta = (cls: string) => `
    <div class="inv-metaline ${cls}"><span>${escapeHtml(h.issueLabel)}:</span> ${escapeHtml(h.issueValue)}</div>
    ${h.dueValue ? `<div class="inv-metaline ${cls}"><span>${escapeHtml(h.dueLabel)}:</span> ${escapeHtml(h.dueValue)}</div>` : ''}`;

  const headerByArchetype = (): string => {
    switch (vm.archetype) {
      case 'band':
        return `
    <div class="inv-band">
      <div class="inv-from">
        ${logoTag('inv-logo')}
        <div class="inv-bizname onacc">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bandline')}
      </div>
      <div class="inv-meta">
        <div class="inv-title onacc">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number onacc">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status onacc-sub">${escapeHtml(h.statusLabel)}</div>
        ${meta('onacc-sub')}
      </div>
    </div>`;
      case 'centered':
        return `
    <div class="inv-centered">
      ${logoTag('inv-logo-c')}
      <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
      ${bizLines('inv-bizline')}
      <div class="inv-title-c">${escapeHtml(h.invoiceTitle)}</div>
      <div class="inv-number">${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)}</div>
      <div class="inv-meta-c">${meta('')}</div>
    </div>`;
      case 'sidebar':
        return `
    <div class="inv-sidebar">
      <div class="inv-sidecard">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
      <div class="inv-side-main">
        <div class="inv-title">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status">${escapeHtml(h.statusLabel)}</div>
        ${meta('')}
      </div>
    </div>`;
      case 'minimal':
        return `
    <div class="inv-minimal">
      <div class="inv-min-top">
        <div class="inv-min-biz">${escapeHtml(h.businessName)}</div>
        ${logoTag('inv-logo-min')}
      </div>
      <div class="inv-accent-rule"></div>
      <div class="inv-title-min">${escapeHtml(h.invoiceTitle)}</div>
      <div class="inv-min-meta">${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)} · ${escapeHtml(h.issueLabel)} ${escapeHtml(h.issueValue)}${h.dueValue ? ` · ${escapeHtml(h.dueLabel)} ${escapeHtml(h.dueValue)}` : ''}</div>
    </div>`;
      default: // classic
        return `
    <div class="inv-header">
      <div class="inv-from">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
      <div class="inv-meta">
        <div class="inv-title">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status">${escapeHtml(h.statusLabel)}</div>
        ${meta('')}
      </div>
    </div>`;
    }
  };

  const headerHtml = `${headerByArchetype()}
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

  const elStyleCss = (el: InvoiceElement): string => {
    const s = el.style ?? {};
    const parts: string[] = [];
    if (s.fontSize) parts.push(`font-size:${s.fontSize}px`);
    if (s.bold) parts.push('font-weight:700');
    const color = s.color ?? (el.kind === 'field' && fieldUsesAccent(el.field) ? st.accent : undefined);
    if (color) parts.push(`color:${escapeHtml(color)}`);
    if (s.align) parts.push(`text-align:${s.align}`);
    if (s.font) parts.push(`font-family:${cssFontFamily(s.font)}`);
    return parts.join(';');
  };
  const elInner = (el: InvoiceElement): string => {
    if (el.kind === 'logo') return h.logoUrl ? `<img class="inv-el-logo" src="${escapeHtml(h.logoUrl)}" alt="">` : '';
    if (el.kind === 'text') return `<div class="inv-el-text">${br(el.text ?? '')}</div>`;
    if (el.field === 'lineItems') return itemsHtml;
    return `<div class="inv-el-text">${br(resolveFieldValue(vm, el.field as InvoiceFieldKey))}</div>`;
  };

  const body = freeform
    ? `<div class="inv-canvas">${vm.elements
        .map(el => `<div class="inv-abs" style="left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;${elStyleCss(el)}">${elInner(el)}</div>`)
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
    body { font-family: ${st.cssFontFamily}; color: #1f2937; margin: 0; font-size: ${st.fontPx}px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .inv-doc > * { margin-bottom: ${gap}px; }
    .inv-canvas { position: relative; width: 100%; aspect-ratio: 8.5 / 11; }
    .inv-canvas > * { margin-bottom: 0; }
    .inv-abs { position: absolute; overflow: hidden; }
    .inv-el-logo { max-width: 100%; max-height: 100%; object-fit: contain; }
    .inv-el-text { white-space: pre-wrap; line-height: 1.35; }
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
    /* — band archetype — */
    .inv-band { display: flex; justify-content: space-between; gap: 24px; background: ${accent}; padding: ${gap}px ${gap + 4}px; border-radius: 10px; }
    .inv-band .inv-bizname.onacc { color: ${onAcc}; }
    .inv-band .inv-bandline { color: ${subtleOnAcc}; font-size: ${st.fontPx - 2}px; margin-top: 2px; }
    .inv-band .inv-meta { text-align: right; }
    .inv-band .inv-title.onacc { text-transform: uppercase; letter-spacing: 0.08em; color: ${onAcc}; font-weight: 700; font-size: ${st.fontPx + 6}px; }
    .inv-band .inv-number.onacc { color: ${onAcc}; font-weight: 600; margin-top: 2px; }
    .inv-band .onacc-sub { color: ${subtleOnAcc}; font-size: ${st.fontPx - 2}px; margin-top: 3px; }
    .inv-band .onacc-sub span { color: ${subtleOnAcc}; }
    /* — centered archetype — */
    .inv-centered { text-align: center; padding-bottom: ${gap}px; border-bottom: 2px solid ${accent}; }
    .inv-logo-c { max-height: ${logoMax}px; max-width: 220px; object-fit: contain; margin: 0 auto 8px; display: block; }
    .inv-title-c { text-transform: uppercase; letter-spacing: 0.12em; color: ${accent}; font-weight: 700; font-size: ${st.fontPx + 8}px; margin-top: 12px; }
    .inv-meta-c .inv-metaline { display: inline-block; margin: 4px 8px 0; }
    /* — sidebar archetype — */
    .inv-sidebar { display: flex; gap: 18px; align-items: stretch; }
    .inv-sidecard { background: ${tint}; border-radius: 12px; padding: 16px; width: 40%; }
    .inv-side-main { flex: 1; padding-top: 4px; }
    /* — minimal archetype — */
    .inv-minimal { padding-bottom: ${gap}px; border-bottom: 1px solid #e5e7eb; }
    .inv-min-top { display: flex; justify-content: space-between; align-items: center; }
    .inv-min-biz { text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-size: ${st.fontPx - 1}px; font-weight: 600; }
    .inv-logo-min { max-height: ${Math.round(logoMax * 0.7)}px; max-width: 160px; object-fit: contain; }
    .inv-accent-rule { width: 32px; height: 3px; background: ${accent}; border-radius: 2px; margin: 14px 0 8px; }
    .inv-title-min { font-weight: 300; font-size: ${st.fontPx + 16}px; color: #111827; letter-spacing: 0.02em; }
    .inv-min-meta { color: #6b7280; font-size: ${st.fontPx - 2}px; margin-top: 6px; }
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

/** Apply an industry template. Replaces layout/style/copy with the preset, but
 *  preserves the business's chosen default invoice language across switches. */
export function applyPreset(presetId: InvoicePresetId, current?: InvoiceTemplateConfig): InvoiceTemplateConfig {
  const next = clone(INVOICE_PRESETS[presetId] ?? DEFAULT_INVOICE_TEMPLATE);
  if (current) next.defaultLanguage = current.defaultLanguage;
  return next;
}
export function setArchetype(c: InvoiceTemplateConfig, archetype: InvoiceArchetype): InvoiceTemplateConfig {
  return { ...c, archetype };
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
export function setDefaultLanguage(c: InvoiceTemplateConfig, defaultLanguage: InvoiceLang): InvoiceTemplateConfig {
  return { ...c, defaultLanguage };
}

// ── Freeform element editor (Phase 3 — element canvas) ───────────────────────

export function setLayoutMode(c: InvoiceTemplateConfig, mode: InvoiceLayoutMode): InvoiceTemplateConfig {
  if (mode === 'freeform') {
    const elements = c.elements && c.elements.length ? c.elements : defaultElements();
    return { ...c, layoutMode: 'freeform', elements };
  }
  return { ...c, layoutMode: 'flow' };
}

let elCounter = 0;
/** Stable-ish id for a newly added element (no Math.random / Date needed). */
function newElementId(kind: InvoiceElementKind): string {
  elCounter += 1;
  return `el-${kind}-${elCounter}`;
}

export function addFieldElement(c: InvoiceTemplateConfig, field: InvoiceFieldKey): InvoiceTemplateConfig {
  const el: InvoiceElement = { id: newElementId('field'), kind: 'field', field, x: 8, y: 8, w: 40, h: 6 };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
export function addTextElement(c: InvoiceTemplateConfig, text = ''): InvoiceTemplateConfig {
  const el: InvoiceElement = { id: newElementId('text'), kind: 'text', text, x: 8, y: 8, w: 35, h: 5 };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
export function addLogoElement(c: InvoiceTemplateConfig): InvoiceTemplateConfig {
  // Only one logo element makes sense — reuse the existing one if present.
  if ((c.elements ?? []).some(e => e.kind === 'logo')) return c;
  const el: InvoiceElement = { id: newElementId('logo'), kind: 'logo', x: 5, y: 4, w: 22, h: 9 };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
export function updateElement(c: InvoiceTemplateConfig, id: string, patch: Partial<InvoiceElement>): InvoiceTemplateConfig {
  return { ...c, elements: (c.elements ?? []).map(e => (e.id === id ? { ...e, ...patch } : e)) };
}
export function updateElementStyle(c: InvoiceTemplateConfig, id: string, patch: Partial<InvoiceElementStyle>): InvoiceTemplateConfig {
  return {
    ...c,
    elements: (c.elements ?? []).map(e => (e.id === id ? { ...e, style: { ...e.style, ...patch } } : e)),
  };
}
export function setElementRect(
  c: InvoiceTemplateConfig,
  id: string,
  rect: { x: number; y: number; w: number; h: number },
): InvoiceTemplateConfig {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const w = Math.max(5, clamp(rect.w));
  const h = Math.max(3, clamp(rect.h));
  return updateElement(c, id, {
    x: Math.min(clamp(rect.x), 100 - w),
    y: Math.min(clamp(rect.y), 100 - h),
    w,
    h,
  });
}
export function removeElement(c: InvoiceTemplateConfig, id: string): InvoiceTemplateConfig {
  return { ...c, elements: (c.elements ?? []).filter(e => e.id !== id) };
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

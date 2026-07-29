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
export type { InvoiceLang } from '../i18n/invoice';
import { formatDateLong } from './format';
import { INVOICE_ICON_NODES } from './invoiceIconNodes';

export const INVOICE_TEMPLATE_VERSION = 1;

/** Universal templates — each is a genuinely distinct LAYOUT (not a recolor).
 *  The accent/font are just defaults the user freely overrides. Display names are
 *  generic ("Plantilla 1…"). The first 8 reuse their archetype name as id; the
 *  premium 8 combine an archetype with table/total/footer/decoration styling. */
export type InvoicePresetId =
  | 'classic' | 'band' | 'sidebar' | 'split' | 'stamp' | 'leftbar' | 'centered' | 'minimal'
  | 'hero' | 'ledger' | 'masthead' | 'boutique' | 'wave' | 'fresh' | 'orbit' | 'prism';

/** Header LAYOUT structure (the most visually distinctive zone). The body below
 *  (line items, totals, etc.) always flows identically so multi-page print stays
 *  robust regardless of archetype. */
export type InvoiceArchetype =
  | 'classic'
  | 'band'
  | 'sidebar'
  | 'split'
  | 'stamp'
  | 'leftbar'
  | 'centered'
  | 'minimal'
  // Premium layouts (Canva-style references).
  | 'hero'        // oversized title, business left
  | 'wordmark'    // big accent "INVOICE" word right, divider under
  | 'panel'       // full-width colored masthead panel, light text
  | 'elegant'     // serif, big left title + circular logo badge
  | 'titleLeft'   // serif title left, logo right
  | 'bandCenter'; // centered title inside a full-width band
export const ALL_ARCHETYPES: InvoiceArchetype[] = [
  'classic', 'band', 'sidebar', 'split', 'stamp', 'leftbar', 'centered', 'minimal',
  'hero', 'wordmark', 'panel', 'elegant', 'titleLeft', 'bandCenter',
];

/** Line-items header fill. */
export type InvoiceTableHeader = 'plain' | 'accent' | 'dark' | 'tint';
/** Full-bleed page flourish drawn as an absolute SVG layer behind the content. */
export type InvoiceDecoration = 'none' | 'corners' | 'wave' | 'arc';

export type InvoiceFont =
  // Sans
  | 'sans' | 'helvetica' | 'gillsans' | 'futura' | 'avenir' | 'optima' | 'trebuchet' | 'verdana'
  // Serif
  | 'serif' | 'times' | 'palatino' | 'baskerville' | 'didot' | 'hoefler' | 'typewriter' | 'copperplate'
  // Mono
  | 'mono' | 'courier';
/** Picker order — grouped sans → serif → mono. */
export const ALL_FONTS: InvoiceFont[] = [
  'sans', 'helvetica', 'gillsans', 'futura', 'avenir', 'optima', 'trebuchet', 'verdana',
  'serif', 'times', 'palatino', 'baskerville', 'didot', 'hoefler', 'typewriter', 'copperplate',
  'mono', 'courier',
];
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
  // ── shape / icon styling ──
  fill?: string;                           // shape fill (hex); defaults to the theme accent
  opacity?: number;                        // 0–1, for shapes/icons (default 1)
  radius?: number;                         // rectangle corner radius in px (default 0)
}

export type InvoiceElementKind = 'logo' | 'field' | 'text' | 'customField' | 'shape' | 'icon';

/** Decorative shapes a user can drop on the freeform canvas. A thin rectangle
 *  doubles as a divider/line; an ellipse with equal w/h is a circle. */
export type InvoiceShapeKind = 'rectangle' | 'ellipse';
export const INVOICE_SHAPE_KINDS: InvoiceShapeKind[] = ['rectangle', 'ellipse'];

/** Icon name — a key into the shared lucide-derived catalog (INVOICE_ICON_NODES),
 *  which reuses the same ~180 icons the map pins offer (mapPinPresets.ts). All
 *  three renderers draw the icon's geometry, stroked in the element color. */
export type InvoiceIconName = string;
export const INVOICE_ICON_NAMES: InvoiceIconName[] = Object.keys(INVOICE_ICON_NODES);
/** Fallback when an element's icon is unknown (kept in the catalog). */
export const DEFAULT_INVOICE_ICON: InvoiceIconName = 'star';

/** Map the original hand-authored icon names to the nearest catalog icon, so
 *  elements saved before the catalog switch still resolve to something sensible. */
const LEGACY_ICON_ALIASES: Record<string, InvoiceIconName> = {
  arrowRight: 'navigation-2', dollar: 'dollar-sign', close: 'circle-x',
  diamond: 'star', triangle: 'triangle-alert', check: 'circle-check-big',
  circle: 'info', plus: 'sparkles',
};

/** Resolve any stored icon name to a valid catalog key (never drops the element). */
function resolveIconName(raw: unknown): InvoiceIconName {
  if (typeof raw === 'string') {
    if (INVOICE_ICON_NODES[raw]) return raw;
    if (LEGACY_ICON_ALIASES[raw]) return LEGACY_ICON_ALIASES[raw];
  }
  return DEFAULT_INVOICE_ICON;
}

export interface InvoiceElement {
  id: string;
  kind: InvoiceElementKind;
  field?: InvoiceFieldKey;                 // when kind === 'field'
  text?: string;                           // when kind === 'text'
  shape?: InvoiceShapeKind;                // when kind === 'shape'
  icon?: InvoiceIconName;                  // when kind === 'icon'
  // When kind === 'customField' — binds to a per-business custom field by key;
  // resolves to that invoice's value at render time. customLabel is the label to
  // display (snapshotted so the element still reads sensibly if a template is
  // later renamed/removed).
  customKey?: string;
  customLabel?: string;
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
  /** Exact logo max-height in px. When set it overrides the `logoSize` preset,
   *  letting the slider push the logo bigger (or smaller) than Small/Med/Large.
   *  null/absent = fall back to the `logoSize` bucket. */
  logoPx?: number | null;
  /** Invert the logo's colors (CSS invert filter) — flips a black logo to white
   *  so a monochrome logo stays visible on a dark header band. Opt-in because it
   *  also colour-shifts a colored logo. */
  logoInvert?: boolean;
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
  // ── Premium style layer (all optional; defaults reproduce the plain look) ──
  tableHeader?: InvoiceTableHeader;  // line-items header fill (default 'plain')
  totalBar?: boolean;                // grand total as a full-width accent bar
  footerBar?: boolean;               // business contact as an accent footer strip
  pageTint?: boolean;                // tint the page background with the accent
  decoration?: InvoiceDecoration;    // full-bleed SVG flourish (default 'none')
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
    tableHeader?: InvoiceTableHeader;
    totalBar?: boolean;
    footerBar?: boolean;
    pageTint?: boolean;
    decoration?: InvoiceDecoration;
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
    tableHeader: opts.tableHeader ?? 'plain',
    totalBar: opts.totalBar ?? false,
    footerBar: opts.footerBar ?? false,
    pageTint: opts.pageTint ?? false,
    decoration: opts.decoration ?? 'none',
  };
}

export const INVOICE_PRESETS: Record<InvoicePresetId, InvoiceTemplateConfig> = {
  classic: preset('classic', 'classic', '#1F2937'),
  band: preset('band', 'band', '#4F46E5', { logoSize: 'lg' }),
  sidebar: preset('sidebar', 'sidebar', '#059669', { logoSize: 'lg' }),
  split: preset('split', 'split', '#0EA5E9'),
  stamp: preset('stamp', 'stamp', '#7C3AED'),
  leftbar: preset('leftbar', 'leftbar', '#DC2626'),
  centered: preset('centered', 'centered', '#D97706', { font: 'serif' }),
  minimal: preset('minimal', 'minimal', '#111827', { font: 'serif', logoSize: 'sm' }),
  // Premium (Plantilla 9–16)
  hero: preset('hero', 'hero', '#1D4ED8', { logoSize: 'sm', tableHeader: 'accent', totalBar: true, decoration: 'corners' }),
  ledger: preset('ledger', 'wordmark', '#DC2626', { tableHeader: 'dark', footerBar: true, decoration: 'corners' }),
  masthead: preset('masthead', 'panel', '#111827', { footerBar: true }),
  boutique: preset('boutique', 'elegant', '#8A7E66', { font: 'serif', tableHeader: 'tint', footerBar: true }),
  wave: preset('wave', 'titleLeft', '#1E3A8A', { font: 'serif', tableHeader: 'accent', totalBar: true, decoration: 'wave' }),
  fresh: preset('fresh', 'bandCenter', '#5F7A6B', { footerBar: true, pageTint: true }),
  orbit: preset('orbit', 'classic', '#0F766E', { tableHeader: 'accent', footerBar: true, decoration: 'arc' }),
  prism: preset('prism', 'panel', '#4F46E5', { tableHeader: 'accent', footerBar: true }),
};

/** Display order in the gallery → also drives the "Plantilla N" numbering. */
export const INVOICE_PRESET_IDS: InvoicePresetId[] = [
  'classic', 'band', 'sidebar', 'split', 'stamp', 'leftbar', 'centered', 'minimal',
  'hero', 'ledger', 'masthead', 'boutique', 'wave', 'fresh', 'orbit', 'prism',
];

/** Older configs used industry / abstract preset ids; map them to the nearest
 *  layout so the picker still highlights sensibly. The stored config's accent +
 *  archetype are preserved by normalizeConfig regardless, so existing invoices
 *  keep rendering exactly as before. */
const PRESET_ALIASES: Record<string, InvoicePresetId> = {
  // abstract (v1)
  clasica: 'classic', moderna: 'band', minimalista: 'minimal', compacta: 'classic',
  // industry (v2)
  general: 'classic', profesional: 'sidebar',
  construccion: 'band', plomeria: 'band', electrico: 'band', techado: 'band', hvac: 'band',
  pintura: 'centered', jardineria: 'sidebar', limpieza: 'centered', mudanzas: 'sidebar',
  mecanico: 'sidebar', detallado: 'centered',
  salon: 'centered', catering: 'minimal', fotografia: 'minimal', tutoria: 'minimal',
};

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = INVOICE_PRESETS.classic;

// ── Freeform layout (theme decomposed into movable elements) ─────────────────

/** Shared body elements (billing / items / totals) — identical under every
 *  header style; only the header differs by archetype. */
function bodyElements(): InvoiceElement[] {
  return [
    { id: 'el-billlabel', kind: 'field', field: 'billToLabel', x: 5, y: 35, w: 45, h: 3, style: { bold: true, fontSize: 11 } },
    { id: 'el-billname', kind: 'field', field: 'billToName', x: 5, y: 38, w: 45, h: 4, style: { bold: true, fontSize: 13 } },
    { id: 'el-billcontact', kind: 'field', field: 'billToContact', x: 5, y: 42, w: 45, h: 8, style: { fontSize: 11 } },
    { id: 'el-items', kind: 'field', field: 'lineItems', x: 5, y: 52, w: 90, h: 28 },
    { id: 'el-subtotal', kind: 'field', field: 'subtotal', x: 55, y: 83, w: 40, h: 4, style: { align: 'right', fontSize: 12 } },
    { id: 'el-tax', kind: 'field', field: 'tax', x: 55, y: 87, w: 40, h: 4, style: { align: 'right', fontSize: 12 } },
    { id: 'el-total', kind: 'field', field: 'total', x: 55, y: 91, w: 40, h: 5, style: { align: 'right', bold: true, fontSize: 16 } },
  ];
}

/** Decompose a theme into individually-movable freeform elements that reproduce
 *  its look: a band-style header becomes an accent rectangle + light text; a
 *  plain header is business-left / accent-title-right. Everything is a real
 *  element, so in freeform the user can drag/restyle every piece. The band shape
 *  is listed FIRST so it paints behind the text. */
export function buildThemeElements(cfg: InvoiceTemplateConfig): InvoiceElement[] {
  const accent = cfg.accentColor || ACCENT_DEFAULT;
  const onAcc = onAccentColor(accent);
  const bandLike = cfg.archetype === 'band' || cfg.archetype === 'panel' || cfg.archetype === 'bandCenter';
  const header: InvoiceElement[] = bandLike
    ? [
        { id: 'el-band', kind: 'shape', shape: 'rectangle', x: 4, y: 4, w: 92, h: 25, style: { fill: accent, radius: 12 } },
        { id: 'el-bizname', kind: 'field', field: 'businessName', x: 9, y: 9, w: 44, h: 5, style: { bold: true, fontSize: 20, color: onAcc } },
        { id: 'el-bizcontact', kind: 'field', field: 'businessContact', x: 9, y: 15, w: 44, h: 11, style: { fontSize: 11, color: onAcc } },
        { id: 'el-title', kind: 'field', field: 'invoiceTitle', x: 52, y: 8, w: 40, h: 7, style: { bold: true, fontSize: 30, align: 'right', color: onAcc } },
        { id: 'el-number', kind: 'field', field: 'invoiceNumber', x: 52, y: 15, w: 40, h: 4, style: { bold: true, align: 'right', fontSize: 14, color: onAcc } },
        { id: 'el-status', kind: 'field', field: 'status', x: 52, y: 19, w: 40, h: 3, style: { align: 'right', fontSize: 10, color: onAcc } },
        { id: 'el-issue', kind: 'field', field: 'issueDate', x: 48, y: 22, w: 44, h: 3, style: { align: 'right', fontSize: 11, color: onAcc } },
        { id: 'el-due', kind: 'field', field: 'dueDate', x: 48, y: 25, w: 44, h: 3, style: { align: 'right', fontSize: 11, color: onAcc } },
      ]
    : [
        ...(cfg.showLogo ? [{ id: 'el-logo', kind: 'logo', x: 5, y: 4, w: 22, h: 9 } as InvoiceElement] : []),
        { id: 'el-bizname', kind: 'field', field: 'businessName', x: 5, y: 15, w: 45, h: 4, style: { bold: true, fontSize: 18 } },
        { id: 'el-bizcontact', kind: 'field', field: 'businessContact', x: 5, y: 19, w: 45, h: 12, style: { fontSize: 11 } },
        { id: 'el-title', kind: 'field', field: 'invoiceTitle', x: 60, y: 4, w: 35, h: 7, style: { bold: true, fontSize: 28, align: 'right' } },
        { id: 'el-number', kind: 'field', field: 'invoiceNumber', x: 60, y: 11, w: 35, h: 4, style: { align: 'right', fontSize: 13 } },
        { id: 'el-issue', kind: 'field', field: 'issueDate', x: 55, y: 17, w: 40, h: 4, style: { align: 'right', fontSize: 11 } },
        { id: 'el-due', kind: 'field', field: 'dueDate', x: 55, y: 21, w: 40, h: 4, style: { align: 'right', fontSize: 11 } },
      ];
  return [...header, ...bodyElements()];
}

/** Back-compat: the plain (classic) decomposition. */
export function defaultElements(): InvoiceElement[] {
  return buildThemeElements(DEFAULT_INVOICE_TEMPLATE);
}

function normalizeElement(e: unknown): InvoiceElement | null {
  if (!e || typeof e !== 'object') return null;
  const el = e as Partial<InvoiceElement>;
  const kind = el.kind;
  if (kind !== 'logo' && kind !== 'field' && kind !== 'text' && kind !== 'customField' && kind !== 'shape' && kind !== 'icon') return null;
  if (kind === 'field' && !(el.field && FREEFORM_FIELD_KEYS.includes(el.field))) return null;
  if (kind === 'customField' && !(typeof el.customKey === 'string' && el.customKey)) return null;
  if (kind === 'shape' && !(el.shape && INVOICE_SHAPE_KINDS.includes(el.shape))) return null;
  // Icon: coerce unknown / legacy names to a real catalog icon (never drop).
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d;
  const style = el.style && typeof el.style === 'object' ? el.style : undefined;
  const out: InvoiceElement = {
    id: typeof el.id === 'string' && el.id ? el.id : `el-${kind}-${Math.round(num(el.x, 0))}-${Math.round(num(el.y, 0))}`,
    kind,
    x: num(el.x, 4),
    y: num(el.y, 4),
    w: Math.max(1, num(el.w, 30)),
    h: Math.max(1, num(el.h, 6)),
  };
  if (kind === 'field') out.field = el.field;
  if (kind === 'text') out.text = typeof el.text === 'string' ? el.text : '';
  if (kind === 'shape') out.shape = el.shape;
  if (kind === 'icon') out.icon = resolveIconName(el.icon);
  if (kind === 'customField') {
    out.customKey = el.customKey;
    out.customLabel = typeof el.customLabel === 'string' ? el.customLabel : el.customKey;
  }
  if (style) {
    out.style = {
      fontSize: typeof style.fontSize === 'number' ? Math.max(6, Math.min(72, style.fontSize)) : undefined,
      bold: style.bold === true ? true : undefined,
      color: typeof style.color === 'string' ? style.color : undefined,
      align: style.align === 'center' || style.align === 'right' ? style.align : undefined,
      font: style.font && ALL_FONTS.includes(style.font) ? style.font : undefined,
      fill: typeof style.fill === 'string' ? style.fill : undefined,
      opacity: typeof style.opacity === 'number' ? Math.max(0, Math.min(1, style.opacity)) : undefined,
      radius: typeof style.radius === 'number' ? Math.max(0, Math.min(200, style.radius)) : undefined,
    };
  }
  return out;
}

// ── Normalize / resolve ──────────────────────────────────────────────────────

/** Structured and Freeform are two independently-saved themes inside one stored
 *  value; `active` is the one the toggle currently selects. Legacy stored values
 *  are a single InvoiceTemplateConfig and still work everywhere. */
export interface InvoiceThemeBundle {
  version: number;
  active: InvoiceLayoutMode;
  flow: InvoiceTemplateConfig;      // the Structured theme
  freeform: InvoiceTemplateConfig;  // the Freeform theme
}

function isBundle(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && 'flow' in (raw as object) && 'freeform' in (raw as object);
}
const asObj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

/** Merge an arbitrary stored config onto DEFAULT, dedupe + order sections, and
 *  append any newly-introduced section ids at the end (hidden). Every consumer
 *  routes stored config through this so old configs survive new fields. If the
 *  stored value is a theme bundle, the ACTIVE theme is resolved transparently —
 *  so every render path (resolveConfig, invoiceDefaultLanguage, …) is bundle-
 *  aware without changing its call sites. */
export function normalizeConfig(raw: unknown): InvoiceTemplateConfig {
  const base = DEFAULT_INVOICE_TEMPLATE;
  if (isBundle(raw)) {
    const b = raw as Partial<InvoiceThemeBundle>;
    const active: InvoiceLayoutMode = b.active === 'freeform' ? 'freeform' : 'flow';
    const cfg = active === 'freeform' ? b.freeform : b.flow;
    return normalizeConfig({ ...asObj(cfg), layoutMode: active });
  }
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
  // Freeform always needs elements (the theme decomposed into movable pieces) —
  // seed them from the resolved theme if none are present yet.
  if (layoutMode === 'freeform' && (!elements || elements.length === 0)) {
    elements = buildThemeElements({
      ...base,
      accentColor: typeof r.accentColor === 'string' ? r.accentColor : base.accentColor,
      archetype,
      showLogo: r.showLogo !== false,
    });
  }

  return {
    version: INVOICE_TEMPLATE_VERSION,
    presetId,
    archetype,
    accentColor: typeof r.accentColor === 'string' ? r.accentColor : base.accentColor,
    font: r.font && ALL_FONTS.includes(r.font) ? r.font : 'sans',
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    showLogo: r.showLogo !== false,
    logoSize: r.logoSize === 'sm' || r.logoSize === 'lg' ? r.logoSize : 'md',
    logoPx: typeof r.logoPx === 'number' && isFinite(r.logoPx) ? clampLogoPx(r.logoPx) : null,
    logoInvert: r.logoInvert === true,
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
    tableHeader:
      r.tableHeader === 'accent' || r.tableHeader === 'dark' || r.tableHeader === 'tint'
        ? r.tableHeader
        : 'plain',
    totalBar: r.totalBar === true,
    footerBar: r.footerBar === true,
    pageTint: r.pageTint === true,
    decoration:
      r.decoration === 'corners' || r.decoration === 'wave' || r.decoration === 'arc'
        ? r.decoration
        : 'none',
  };
}

/** Normalize a stored value into a full theme bundle for the EDITOR. A legacy
 *  single config seeds BOTH themes from itself (so nothing is lost), with the
 *  active theme matching its old layoutMode. */
export function normalizeBundle(raw: unknown): InvoiceThemeBundle {
  if (isBundle(raw)) {
    const b = raw as Partial<InvoiceThemeBundle>;
    const active: InvoiceLayoutMode = b.active === 'freeform' ? 'freeform' : 'flow';
    return {
      version: INVOICE_TEMPLATE_VERSION,
      active,
      flow: normalizeConfig({ ...asObj(b.flow), layoutMode: 'flow' }),
      freeform: normalizeConfig({ ...asObj(b.freeform), layoutMode: 'freeform' }),
    };
  }
  const single = normalizeConfig(raw);
  const active: InvoiceLayoutMode = single.layoutMode === 'freeform' ? 'freeform' : 'flow';
  return {
    version: INVOICE_TEMPLATE_VERSION,
    active,
    flow: normalizeConfig({ ...single, layoutMode: 'flow' }),
    freeform: normalizeConfig({ ...single, layoutMode: 'freeform' }),
  };
}

/** The active theme config from a bundle (what currently renders / is edited). */
export function activeBundleConfig(b: InvoiceThemeBundle): InvoiceTemplateConfig {
  return b.active === 'freeform' ? b.freeform : b.flow;
}

/** The business-wide default invoice language. New invoices seed their
 *  `language` from this (overridable per invoice).
 *
 *  Reads the EXPLICIT choice from the theme configs where
 *  setBundleDefaultLanguage stores it (flow/freeform), or a legacy top-level
 *  config — NOT normalizeConfig(bundle), which always fell back to 'es' because
 *  a bundle has no top-level defaultLanguage. When the business never chose a
 *  language, falls back to `localeFallback` (the app UI language) so an
 *  English-app business gets English invoices by default instead of Spanish. */
export function invoiceDefaultLanguage(rawConfig: unknown, localeFallback?: string): InvoiceLang {
  const o = asObj(rawConfig);
  const explicit = [asObj(o.flow).defaultLanguage, asObj(o.freeform).defaultLanguage, o.defaultLanguage]
    .find((v): v is InvoiceLang => v === 'en' || v === 'es');
  if (explicit) return explicit;
  return localeFallback === 'en' ? 'en' : localeFallback === 'es' ? 'es' : 'es';
}

/** Auto-number prefix by language: INV- (English) / FAC- (Spanish). Used as the
 *  default invoice number; a user-entered custom number overrides it. */
export function invoiceNumberPrefix(lang: InvoiceLang): string {
  return lang === 'en' ? 'INV' : 'FAC';
}

/** Fallback starting invoice number when a business hasn't set one (and for
 *  clients running before migration 079). Matches the DB column default. */
export const DEFAULT_INVOICE_START_NUMBER = 1000;

/**
 * Next sequential invoice number string, e.g. "FAC-1000".
 *
 *  - `startNumber`: the business's configured first number (businesses
 *    .invoice_start_number); falls back to DEFAULT_INVOICE_START_NUMBER.
 *  - `existingCount`: how many invoices the business already has.
 *
 * seq = startNumber + existingCount, zero-padded to 4 digits. With the legacy
 * default of 1 this reproduces the old `count + 1` numbering exactly.
 */
export function nextInvoiceNumber(
  lang: InvoiceLang,
  startNumber: number | null | undefined,
  existingCount: number,
): string {
  const start = Math.max(1, Math.floor(startNumber ?? DEFAULT_INVOICE_START_NUMBER));
  const seq = start + Math.max(0, existingCount);
  return `${invoiceNumberPrefix(lang)}-${String(seq).padStart(4, '0')}`;
}

/** Pick the effective config: per-invoice frozen override → business default →
 *  app default. Always normalized. */
export function resolveConfig(
  invoiceConfig: unknown,
  businessConfig: unknown,
): InvoiceTemplateConfig {
  const biz = businessConfig && typeof businessConfig === 'object' ? normalizeConfig(businessConfig) : null;
  if (invoiceConfig && typeof invoiceConfig === 'object') {
    const snap = normalizeConfig(invoiceConfig);
    // Sharing an invoice freezes its snapshot so restyling the default THEME
    // later never changes an already-sent invoice. But the TEXT blocks (payment
    // instructions / footer) are business-wide CONTENT the owner edits centrally
    // — those should always reflect the current business template, not the value
    // frozen at share time. So keep the frozen theme, overlay the live text.
    return biz ? { ...snap, text: biz.text } : snap;
  }
  if (biz) return biz;
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
  // Sans
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  gillsans: '"Gill Sans", "Gill Sans MT", Calibri, "Trebuchet MS", sans-serif',
  futura: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif',
  avenir: '"Avenir Next", Avenir, "Segoe UI", Corbel, sans-serif',
  optima: 'Optima, Candara, "Segoe UI", "Gill Sans", sans-serif',
  trebuchet: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
  verdana: 'Verdana, Geneva, Tahoma, sans-serif',
  // Serif
  serif: 'Georgia, "Times New Roman", Times, serif',
  times: '"Times New Roman", Times, serif',
  palatino: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
  baskerville: 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, Georgia, serif',
  didot: 'Didot, "Bodoni MT", "Hoefler Text", "Playfair Display", Georgia, serif',
  hoefler: '"Hoefler Text", "Baskerville Old Face", Garamond, Georgia, serif',
  typewriter: '"American Typewriter", Rockwell, "Courier New", Courier, serif',
  copperplate: 'Copperplate, "Copperplate Gothic Light", "Big Caslon", "Times New Roman", serif',
  // Mono
  mono: '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace',
  courier: '"Courier New", Courier, monospace',
};

/** Native font family per platform for the RN renderer. `null` ⇒ system font.
 *  Android lacks most named fonts, so it falls back to a generic family; the PDF
 *  (HTML/CSS) still uses the full stack, so the printed output is correct. */
export const RN_FONTS: Record<InvoiceFont, { ios: string; android: string } | null> = {
  // Sans
  sans: null,
  helvetica: { ios: 'Helvetica Neue', android: 'sans-serif' },
  gillsans: { ios: 'Gill Sans', android: 'sans-serif' },
  futura: { ios: 'Futura', android: 'sans-serif' },
  avenir: { ios: 'Avenir Next', android: 'sans-serif' },
  optima: { ios: 'Optima', android: 'sans-serif' },
  trebuchet: { ios: 'Trebuchet MS', android: 'sans-serif' },
  verdana: { ios: 'Verdana', android: 'sans-serif' },
  // Serif
  serif: { ios: 'Georgia', android: 'serif' },
  times: { ios: 'Times New Roman', android: 'serif' },
  palatino: { ios: 'Palatino', android: 'serif' },
  baskerville: { ios: 'Baskerville', android: 'serif' },
  didot: { ios: 'Didot', android: 'serif' },
  hoefler: { ios: 'Hoefler Text', android: 'serif' },
  typewriter: { ios: 'American Typewriter', android: 'serif' },
  copperplate: { ios: 'Copperplate', android: 'serif' },
  // Mono
  mono: { ios: 'Menlo', android: 'monospace' },
  courier: { ios: 'Courier New', android: 'monospace' },
};

const LOGO_PX: Record<InvoiceLogoSize, number> = { sm: 36, md: 52, lg: 72 };

// Slider bounds for the exact logo height. Min is a touch under Small; max is
// well past Large so a business can make its logo the visual anchor.
export const LOGO_PX_MIN = 24;
export const LOGO_PX_MAX = 200;

export function clampLogoPx(px: number): number {
  return Math.max(LOGO_PX_MIN, Math.min(LOGO_PX_MAX, Math.round(px)));
}

/** The logo max-height actually used: the exact `logoPx` override when set,
 *  otherwise the Small/Med/Large bucket. */
export function effectiveLogoPx(config: InvoiceTemplateConfig): number {
  return config.logoPx != null ? clampLogoPx(config.logoPx) : LOGO_PX[config.logoSize];
}

export function styleTokens(config: InvoiceTemplateConfig): StyleTokens {
  const compact = config.density === 'compact';
  return {
    accent: config.accentColor || ACCENT_DEFAULT,
    font: config.font,
    cssFontFamily: CSS_FONTS[config.font],
    density: config.density,
    pad: compact ? 16 : 24,
    fontPx: compact ? 12 : 14,
    logoPx: effectiveLogoPx(config),
  };
}

// ── View model ───────────────────────────────────────────────────────────────

/** Structurally compatible with InvoiceDetailScreen's `InvoiceDetail`. */
export interface InvoiceDocClient {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCell: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
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
  customFields?: { label: string; value: string; key?: string }[];
  /** 'estimate' renders a proposal through the invoice theme engine. In that
   *  mode the title becomes "Estimate", `dueDate` is treated as the "valid
   *  until" date, and the estimate-only fields below are shown. */
  docType?: 'invoice' | 'estimate';
  estimateDescription?: string | null;
  estimateTerms?: string | null;
  estimatePreparedBy?: string | null;
  estimateSignature?: { image: string; line: string } | null;
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
  /** Premium style layer. */
  tableHeader: InvoiceTableHeader;
  totalBar: boolean;
  footerBar: boolean;
  pageTint: boolean;
  decoration: InvoiceDecoration;
  /** Business name + contact lines for the footer strip (when footerBar). */
  footerContact: string[];
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
    /** Invert the logo's colors (see InvoiceTemplateConfig.logoInvert). */
    logoInvert: boolean;
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
  customFields: { label: string; value: string; key?: string }[];
  notes: string | null;
  paymentInstructions: string | null;
  footer: string | null;
  /** 'invoice' (default) or 'estimate'. Estimate reuses the entire theme with
   *  different header labels + a few estimate-only blocks (below). */
  docType: 'invoice' | 'estimate';
  /** Estimate-only content, null for invoices. Description renders under Bill To
   *  (before items); terms + signature render at the bottom. */
  estimate: {
    description: string | null;
    terms: string | null;
    preparedBy: string | null;
    signature: { image: string; line: string } | null;
    labels: { description: string; terms: string; preparedBy: string; approval: string };
  } | null;
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
    // Street address first, then city/state — standard mailing-address order.
    branding.address ?? '',
    [branding.city, branding.state].filter(Boolean).join(', '),
    branding.phone ?? '',
    branding.email ?? '',
    branding.website ?? '',
    branding.taxId ? `${labels.from === 'De' ? 'RFC/Tax ID' : 'Tax ID'}: ${branding.taxId}` : '',
    branding.licenseNumber ? `Lic: ${branding.licenseNumber}` : '',
  ]
    .map(s => s.trim())
    .filter(Boolean);

  const billTo = invoice.clients.map(c => {
    // "City, ST ZIP" — US mailing format; each part optional.
    const cityStateZip = [
      [c.city ?? '', c.state ?? ''].map(s => s.trim()).filter(Boolean).join(', '),
      (c.zip ?? '').trim(),
    ]
      .filter(Boolean)
      .join(' ');
    return {
      name: `${c.firstName} ${c.lastName}`.trim(),
      // Company + address + phone + email — whatever the client record lists.
      lines: [c.company ?? '', c.address ?? '', cityStateZip, c.phoneCell ?? '', c.email ?? '']
        .map(s => s.trim())
        .filter(Boolean),
    };
  });

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

  // Estimate mode reuses the whole theme; only the header labels change and a
  // few estimate-only blocks (description / terms / approval) are carried on
  // the vm for the renderers to place.
  const isEstimate = invoice.docType === 'estimate';
  const estimate = isEstimate
    ? {
        description: invoice.estimateDescription?.trim() || null,
        terms: invoice.estimateTerms?.trim() || null,
        preparedBy: invoice.estimatePreparedBy?.trim() || null,
        signature: invoice.estimateSignature ?? null,
        labels: {
          description: labels.description,
          terms: labels.terms,
          preparedBy: labels.preparedBy,
          approval: labels.approval,
        },
      }
    : null;

  // Drop sections with no data so empty blocks don't print.
  const hasData: Record<InvoiceSectionId, boolean> = {
    header: true,
    billTo: billTo.length > 0,
    lineItems: items.length > 0,
    totals: true,
    customFields: customFields.length > 0,
    notes: !!notes,
    paymentInstructions: !!paymentInstructions,
    // With a footer BAR, the tagline moves INTO the bar (the business-contact
    // strip it replaces is redundant with the header), so it's dropped from the
    // body sections. Without a bar it stays a normal body section.
    footer: !!footer && cfg.footerBar !== true,
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
    tableHeader: cfg.tableHeader ?? 'plain',
    totalBar: cfg.totalBar === true,
    footerBar: cfg.footerBar === true,
    pageTint: cfg.pageTint === true,
    decoration: cfg.decoration ?? 'none',
    footerContact: [branding.name, ...businessLines].filter(Boolean),
    labels,
    sections,
    layoutMode: cfg.layoutMode === 'freeform' ? 'freeform' : 'flow',
    rects,
    elements: cfg.layoutMode === 'freeform' ? (cfg.elements ?? []) : [],
    header: {
      showLogo: cfg.showLogo && !!branding.logoUrl,
      logoUrl: branding.logoUrl,
      logoInvert: cfg.logoInvert === true,
      businessName: branding.name,
      businessLines,
      invoiceTitle: isEstimate ? labels.estimate : labels.invoice,
      invoiceNumber: invoice.invoiceNumber,
      // Estimates have no invoice-style status badge; blank it out.
      statusLabel: isEstimate ? '' : ((labels as Record<string, string>)[invoice.status] ?? invoice.status),
      issueLabel: labels.issueDate,
      issueValue: fmtDate(invoice.issueDate),
      // In estimate mode the "due date" slot becomes "valid until".
      dueLabel: isEstimate ? labels.validUntil : labels.dueDate,
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
    docType: isEstimate ? 'estimate' : 'invoice',
    estimate,
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

/** Text for a custom-field element: "Label: value" using the invoice's value for
 *  the element's customKey (falls back to the snapshotted label / a dash). */
export function customFieldElementText(vm: InvoiceViewModel, el: InvoiceElement): string {
  const match = vm.customFields.find(f => f.key && f.key === el.customKey);
  // Prefer the element's snapshotted label (works even where templates aren't
  // readable, e.g. the public page); fall back to the live template label.
  const label = el.customLabel ?? match?.label ?? '';
  const value = match?.value ?? '';
  return value ? `${label}: ${value}` : label;
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

/** HSL → #rrggbb. h 0–360, s/l 0–100. */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const c = ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** #rgb/#rrggbb → HSL (h 0–360, s/l 0–100). Falls back to the app indigo. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const c = parseHex(hex) ?? { r: 79, g: 70, b: 229 };
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** rgba() string from a hex + alpha — valid in CSS, RN, and print HTML. Falls
 *  back to the input when the hex can't be parsed. */
export function withAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** One drawable shape in a 0–100 (x) × 0–130 (y) normalized canvas. Each renderer
 *  maps these to its own SVG syntax so the flourish is identical everywhere. */
export interface DecoShape {
  kind: 'path' | 'circle';
  d?: string;
  cx?: number; cy?: number; r?: number;
  fill: string;
  opacity?: number;
}
export interface DecoSpec { viewBox: string; shapes: DecoShape[] }

/** Full-bleed decorative shapes for a decoration style. `null` for 'none'. */
export function decorationShapes(decoration: InvoiceDecoration, accent: string): DecoSpec | null {
  if (!decoration || decoration === 'none') return null;
  const VB = '0 0 100 130';
  if (decoration === 'corners') {
    return {
      viewBox: VB,
      shapes: [
        { kind: 'path', d: 'M0,0 L40,0 L0,30 Z', fill: accent, opacity: 0.4 },
        { kind: 'path', d: 'M0,0 L26,0 L0,20 Z', fill: accent, opacity: 0.7 },
        { kind: 'path', d: 'M0,0 L14,0 L0,11 Z', fill: accent, opacity: 1 },
        { kind: 'path', d: 'M100,130 L60,130 L100,100 Z', fill: accent, opacity: 0.4 },
        { kind: 'path', d: 'M100,130 L74,130 L100,110 Z', fill: accent, opacity: 0.7 },
        { kind: 'path', d: 'M100,130 L86,130 L100,119 Z', fill: accent, opacity: 1 },
      ],
    };
  }
  if (decoration === 'wave') {
    return {
      viewBox: VB,
      shapes: [
        { kind: 'path', d: 'M0,0 L100,0 L100,7 C70,17 30,-1 0,9 Z', fill: accent, opacity: 0.5 },
        { kind: 'path', d: 'M0,0 L100,0 L100,12 C68,24 32,2 0,15 Z', fill: accent, opacity: 1 },
        { kind: 'path', d: 'M0,130 L100,130 L100,116 C68,128 32,106 0,120 Z', fill: accent, opacity: 1 },
      ],
    };
  }
  // arc — concentric circles peeking from the top-right corner
  return {
    viewBox: VB,
    shapes: [
      { kind: 'circle', cx: 96, cy: 8, r: 40, fill: accent, opacity: 0.12 },
      { kind: 'circle', cx: 104, cy: 0, r: 28, fill: accent, opacity: 0.22 },
      { kind: 'circle', cx: 110, cy: -4, r: 16, fill: accent, opacity: 0.32 },
    ],
  };
}

export interface DecoBand { height: number; spec: DecoSpec }
/** How a decoration is drawn + how much the content must be padded to clear it.
 *  `full` is a stretched edge-to-edge layer (corners/arc); `topBand`/`bottomBand`
 *  are FIXED-height strips (wave) so the curve never scales with page length and
 *  the content can be padded a known amount to sit clear of them. */
export interface DecoRender {
  full: DecoSpec | null;
  topBand: DecoBand | null;
  bottomBand: DecoBand | null;
  padTop: number;
  padBottom: number;
}
export function decorationRender(decoration: InvoiceDecoration, accent: string): DecoRender {
  if (decoration === 'wave') {
    const VB = '0 0 100 26';
    return {
      full: null,
      topBand: {
        height: 50,
        spec: {
          viewBox: VB,
          shapes: [
            { kind: 'path', d: 'M0,0 L100,0 L100,19 C70,9 30,27 0,13 Z', fill: accent, opacity: 0.45 },
            { kind: 'path', d: 'M0,0 L100,0 L100,13 C68,23 32,4 0,17 Z', fill: accent, opacity: 1 },
          ],
        },
      },
      bottomBand: {
        height: 50,
        spec: {
          viewBox: VB,
          shapes: [
            { kind: 'path', d: 'M0,26 L100,26 L100,7 C70,17 30,-1 0,13 Z', fill: accent, opacity: 0.45 },
            { kind: 'path', d: 'M0,26 L100,26 L100,13 C68,3 32,22 0,9 Z', fill: accent, opacity: 1 },
          ],
        },
      },
      padTop: 46,
      padBottom: 58,
    };
  }
  return { full: decorationShapes(decoration, accent), topBand: null, bottomBand: null, padTop: 0, padBottom: 0 };
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

  // Theme 9 (hero) tucks Bill To into the header's right column (under the
  // dates) instead of a full-width row, so it doesn't eat vertical space.
  const isHero = vm.archetype === 'hero';
  const showBillTo = vm.sections.includes('billTo');
  const heroBillToHtml =
    isHero && showBillTo && vm.billTo.length
      ? `<div class="inv-billto inv-hero-billto">
          <div class="inv-sectlabel">${escapeHtml(L.billTo)}</div>
          ${vm.billTo
            .map(
              c => `<div class="inv-client"><div class="inv-clientname">${escapeHtml(c.name)}</div>${c.lines
                .map(l => `<div class="inv-bizline">${escapeHtml(l)}</div>`)
                .join('')}</div>`,
            )
            .join('')}
        </div>`
      : '';
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
      case 'leftbar':
        return `
    <div class="inv-leftbar">
      <div class="inv-leftbar-rule"></div>
      <div class="inv-leftbar-main">
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
      </div>
    </div>`;
      case 'split':
        return `
    <div class="inv-split">
      <div class="inv-from">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
      <div class="inv-split-panel">
        <div class="inv-title">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status">${escapeHtml(h.statusLabel)}</div>
        ${meta('')}
      </div>
    </div>`;
      case 'stamp':
        return `
    <div class="inv-stamp">
      <div class="inv-from">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
      <div class="inv-stamp-right">
        <div class="inv-stamp-chip">
          <div class="inv-stamp-title">${escapeHtml(h.invoiceTitle)}</div>
          <div class="inv-stamp-num">${escapeHtml(h.invoiceNumber)}</div>
          <div class="inv-stamp-status">${escapeHtml(h.statusLabel)}</div>
        </div>
        <div class="inv-stamp-dates">${meta('')}</div>
      </div>
    </div>`;
      case 'hero':
        return `
    <div class="inv-hero">
      <div class="inv-from">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
      <div class="inv-hero-right">
        <div class="inv-hero-word">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status">${escapeHtml(h.statusLabel)}</div>
        ${meta('')}
        ${heroBillToHtml}
      </div>
    </div>`;
      case 'wordmark':
        return `
    <div class="inv-wordmark">
      <div class="inv-wordmark-row">
        <div class="inv-from">
          ${logoTag('inv-logo')}
          <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
          ${bizLines('inv-bizline')}
        </div>
        <div class="inv-wordmark-word">${escapeHtml(h.invoiceTitle)}</div>
      </div>
      <div class="inv-wordmark-rule"></div>
      <div class="inv-wordmark-meta">
        <span>${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)}</span>
        <span>${escapeHtml(h.issueLabel)} ${escapeHtml(h.issueValue)}${h.dueValue ? ` · ${escapeHtml(h.dueLabel)} ${escapeHtml(h.dueValue)}` : ''}</span>
      </div>
    </div>`;
      case 'panel':
        return `
    <div class="inv-panel">
      <div class="inv-panel-left">
        ${logoTag('inv-logo')}
        <div class="inv-bizname onacc">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bandline')}
      </div>
      <div class="inv-panel-right">
        <div class="inv-panel-title onacc">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number onacc">${escapeHtml(h.invoiceNumber)}</div>
        <div class="inv-status onacc-sub">${escapeHtml(h.statusLabel)}</div>
        ${meta('onacc-sub')}
      </div>
    </div>`;
      case 'elegant':
        return `
    <div class="inv-elegant">
      <div class="inv-elegant-left">
        <div class="inv-elegant-title">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)}</div>
        <div class="inv-elegant-dates">${escapeHtml(h.issueLabel)} ${escapeHtml(h.issueValue)}${h.dueValue ? `  ·  ${escapeHtml(h.dueLabel)} ${escapeHtml(h.dueValue)}` : ''}</div>
      </div>
      <div class="inv-elegant-badge">
        ${logoTag('inv-elegant-logo')}
        <div class="inv-elegant-badge-name">${escapeHtml(h.businessName)}</div>
      </div>
    </div>`;
      case 'titleLeft':
        return `
    <div class="inv-titleleft">
      <div class="inv-titleleft-main">
        <div class="inv-title-tl">${escapeHtml(h.invoiceTitle)}</div>
        <div class="inv-number">${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)}</div>
        ${meta('')}
      </div>
      <div class="inv-titleleft-logo">
        ${logoTag('inv-logo')}
        <div class="inv-bizname">${escapeHtml(h.businessName)}</div>
        ${bizLines('inv-bizline')}
      </div>
    </div>`;
      case 'bandCenter':
        return `
    <div class="inv-bandcenter">
      ${logoTag('inv-logo-c')}
      <div class="inv-bandcenter-band">${escapeHtml(h.invoiceTitle)}</div>
      <div class="inv-bandcenter-meta">${escapeHtml(h.invoiceNumber)} · ${escapeHtml(h.statusLabel)} · ${escapeHtml(h.issueLabel)} ${escapeHtml(h.issueValue)}${h.dueValue ? ` · ${escapeHtml(h.dueLabel)} ${escapeHtml(h.dueValue)}` : ''}</div>
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
    <table class="inv-table th-${vm.tableHeader}">
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

  const subtaxRows = `
      <div class="inv-totrow"><span>${escapeHtml(L.subtotal)}</span><span>${escapeHtml(vm.totals.subtotal)}</span></div>
      ${vm.totals.taxLabel ? `<div class="inv-totrow"><span>${escapeHtml(vm.totals.taxLabel)}</span><span>${escapeHtml(vm.totals.taxValue ?? '')}</span></div>` : ''}`;
  const totalsHtml = vm.totalBar
    ? `<div class="inv-totals">${subtaxRows}</div>
       <div class="inv-totalbar"><span>${escapeHtml(L.total)}</span><span>${escapeHtml(vm.totals.total)}</span></div>`
    : `<div class="inv-totals">${subtaxRows}
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

  // Estimate-only blocks: description (renders under Bill To), and terms +
  // approval/signature (render at the bottom). Empty when not an estimate.
  const est = vm.estimate;
  const estDescHtml = est?.description
    ? `<div class="inv-block"><div class="inv-sectlabel">${escapeHtml(est.labels.description)}</div><div class="inv-text">${br(est.description)}</div></div>`
    : '';
  const estBottomHtml = est
    ? [
        est.terms
          ? `<div class="inv-block"><div class="inv-sectlabel">${escapeHtml(est.labels.terms)}</div><div class="inv-text">${br(est.terms)}</div></div>`
          : '',
        est.preparedBy || est.signature
          ? `<div class="inv-block inv-approval"><div class="inv-sectlabel">${escapeHtml(est.labels.approval)}</div>${
              est.preparedBy ? `<div class="inv-text">${escapeHtml(est.labels.preparedBy)}: ${escapeHtml(est.preparedBy)}</div>` : ''
            }${
              est.signature
                ? `<img class="inv-sig" src="${escapeHtml(est.signature.image)}" alt=""><div class="inv-text">${escapeHtml(est.signature.line)}</div>`
                : ''
            }</div>`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

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
    if (color && el.kind !== 'shape') parts.push(`color:${escapeHtml(color)}`);
    if (s.align) parts.push(`text-align:${s.align}`);
    if (s.font) parts.push(`font-family:${cssFontFamily(s.font)}`);
    if (s.opacity != null && s.opacity < 1) parts.push(`opacity:${s.opacity}`);
    return parts.join(';');
  };
  const iconSvg = (el: InvoiceElement): string => {
    const nodes = INVOICE_ICON_NODES[el.icon ?? ''] ?? INVOICE_ICON_NODES[DEFAULT_INVOICE_ICON] ?? [];
    const color = escapeHtml(el.style?.color ?? st.accent);
    const inner = nodes
      .map(n => {
        const { t, ...attrs } = n;
        const a = Object.entries(attrs).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ');
        return `<${t} ${a}/>`;
      })
      .join('');
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">${inner}</svg>`;
  };
  const shapeHtml = (el: InvoiceElement): string => {
    const fill = escapeHtml(el.style?.fill ?? st.accent);
    const radius = el.shape === 'ellipse' ? '50%' : `${el.style?.radius ?? 0}px`;
    return `<div style="width:100%;height:100%;background:${fill};border-radius:${radius}"></div>`;
  };
  const elInner = (el: InvoiceElement): string => {
    if (el.kind === 'logo') return h.logoUrl ? `<img class="inv-el-logo" src="${escapeHtml(h.logoUrl)}" alt="">` : '';
    if (el.kind === 'shape') return shapeHtml(el);
    if (el.kind === 'icon') return iconSvg(el);
    if (el.kind === 'text') return `<div class="inv-el-text">${br(el.text ?? '')}</div>`;
    if (el.kind === 'customField') return `<div class="inv-el-text">${br(customFieldElementText(vm, el))}</div>`;
    if (el.field === 'lineItems') return itemsHtml;
    return `<div class="inv-el-text">${br(resolveFieldValue(vm, el.field as InvoiceFieldKey))}</div>`;
  };

  // Closing sections (payment instructions + tagline) are grouped into a tail
  // wrapper so full-page themes can anchor them to the bottom edge (margin-top:
  // auto), instead of letting them float right under the total with dead space
  // below. On non-full themes the wrapper is inert (no extra space to consume).
  const TAIL_SECTIONS: InvoiceSectionId[] = ['paymentInstructions', 'footer'];

  // Freeform draws the theme decomposed into positioned elements; flow stacks
  // the structured sections.
  const body = freeform
    ? `<div class="inv-canvas">${vm.elements
        .map(el => `<div class="inv-abs" style="left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;${elStyleCss(el)}">${elInner(el)}</div>`)
        .join('')}</div>`
    : (() => {
        // Hero renders Bill To inside the header's right column, so drop the
        // standalone row here to avoid showing it twice.
        const flowSections = isHero ? vm.sections.filter(id => id !== 'billTo') : vm.sections;
        // Estimate description renders right after Bill To (or the header when
        // hero moved Bill To into it); terms + approval go into the tail.
        const anchorId: InvoiceSectionId = flowSections.includes('billTo') ? 'billTo' : 'header';
        const mainStr = flowSections
          .filter(id => !TAIL_SECTIONS.includes(id))
          .map(id => (id === anchorId ? `${sectionHtml[id]}\n${estDescHtml}` : sectionHtml[id]))
          .join('\n');
        const tailStr = [
          ...flowSections.filter(id => TAIL_SECTIONS.includes(id)).map(id => sectionHtml[id]),
          estBottomHtml,
        ]
          .filter(s => s.trim())
          .join('\n');
        return tailStr ? `${mainStr}\n<div class="inv-doc-tail">${tailStr}</div>` : mainStr;
      })();

  const gap = st.density === 'compact' ? 14 : 22;
  const cellPad = st.density === 'compact' ? '6px 8px' : '9px 8px';

  // Decorative SVG layer (shared shape math) + footer contact strip.
  const deco = decorationRender(vm.decoration, st.accent);
  const svgShapes = (spec: DecoSpec) =>
    spec.shapes
      .map(s =>
        s.kind === 'circle'
          ? `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${escapeHtml(s.fill)}"${s.opacity != null ? ` fill-opacity="${s.opacity}"` : ''}/>`
          : `<path d="${s.d}" fill="${escapeHtml(s.fill)}"${s.opacity != null ? ` fill-opacity="${s.opacity}"` : ''}/>`,
      )
      .join('');
  const decoHtml =
    (deco.full ? `<svg class="inv-deco" viewBox="${deco.full.viewBox}" preserveAspectRatio="none">${svgShapes(deco.full)}</svg>` : '') +
    (deco.topBand ? `<svg class="inv-deco-top" viewBox="${deco.topBand.spec.viewBox}" preserveAspectRatio="none" style="height:${deco.topBand.height}px">${svgShapes(deco.topBand.spec)}</svg>` : '') +
    (deco.bottomBand ? `<svg class="inv-deco-bot" viewBox="${deco.bottomBand.spec.viewBox}" preserveAspectRatio="none" style="height:${deco.bottomBand.height}px">${svgShapes(deco.bottomBand.spec)}</svg>` : '');
  const docPad = deco.padTop || deco.padBottom ? ` style="padding-top:${deco.padTop}px;padding-bottom:${deco.padBottom}px"` : '';
  const footerBarHtml =
    !freeform && vm.footerBar && vm.footerContact.length
      ? `<div class="inv-footerbar">${vm.footerContact
          .map((l, i) => `<span class="${i === 0 ? 'fb-name' : ''}">${escapeHtml(l)}</span>`)
          .join('<span class="fb-sep">·</span>')}</div>`
      : '';
  // "Full-page" presets (decoration / footer strip / tint) get a minimum height
  // of one letter page so the flourishes anchor to the page edges and the footer
  // strip sits at the bottom — like a real printed sheet.
  const fullPage = !freeform && (vm.decoration !== 'none' || vm.footerBar || vm.pageTint);
  const pageCls = `inv-page arch-${vm.archetype}${vm.pageTint ? ' tinted' : ''}${fullPage ? ' full' : ''}`;

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
    .inv-logo { max-height: ${logoMax}px; max-width: ${Math.max(220, logoMax * 3)}px; object-fit: contain; margin-bottom: 8px; display: block; }
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
    .inv-logo-c { max-height: ${logoMax}px; max-width: ${Math.max(220, logoMax * 3)}px; object-fit: contain; margin: 0 auto 8px; display: block; }
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
    .inv-logo-min { max-height: ${Math.round(logoMax * 0.7)}px; max-width: ${Math.max(160, Math.round(logoMax * 2))}px; object-fit: contain; }
    .inv-accent-rule { width: 32px; height: 3px; background: ${accent}; border-radius: 2px; margin: 14px 0 8px; }
    .inv-title-min { font-weight: 300; font-size: ${st.fontPx + 16}px; color: #111827; letter-spacing: 0.02em; }
    .inv-min-meta { color: #6b7280; font-size: ${st.fontPx - 2}px; margin-top: 6px; }
    /* — leftbar archetype — */
    .inv-leftbar { display: flex; gap: 16px; align-items: stretch; }
    .inv-leftbar-rule { width: 5px; border-radius: 3px; background: ${accent}; flex: 0 0 auto; }
    .inv-leftbar-main { flex: 1; display: flex; justify-content: space-between; gap: 24px; }
    /* — split archetype — */
    .inv-split { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .inv-split-panel { background: ${tint}; border-radius: 12px; padding: 14px 18px; text-align: right; min-width: 42%; }
    /* — stamp archetype — */
    .inv-stamp { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: ${gap}px; border-bottom: 1px solid #e5e7eb; }
    .inv-stamp-right { text-align: right; }
    .inv-stamp-chip { display: inline-block; background: ${accent}; color: ${onAcc}; border-radius: 8px; padding: 8px 12px; }
    .inv-stamp-title { font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: ${st.fontPx + 4}px; color: ${onAcc}; }
    .inv-stamp-num { font-weight: 600; font-size: ${st.fontPx}px; color: ${onAcc}; margin-top: 1px; }
    .inv-stamp-status { font-size: ${st.fontPx - 3}px; text-transform: uppercase; letter-spacing: 0.04em; color: ${subtleOnAcc}; margin-top: 2px; }
    .inv-stamp-dates { margin-top: 8px; }
    /* — hero archetype — */
    .inv-hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .inv-hero-right { text-align: right; }
    .inv-hero-word { font-weight: 800; text-transform: uppercase; letter-spacing: 0.01em; color: ${accent}; font-size: ${st.fontPx + 30}px; line-height: 1; }
    /* Theme 9 (hero) has a filled diagonal corner behind the sender + Bill To
       block, so the default grey address text reads poorly there — darken it. */
    .arch-hero .inv-bizline { color: #111827; }
    .arch-hero .inv-billto .inv-sectlabel { color: #374151; }
    .inv-hero-billto { margin-top: ${gap}px; }
    .inv-hero-billto .inv-client + .inv-client { margin-top: 6px; }
    /* — wordmark archetype — */
    .inv-wordmark-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .inv-wordmark-word { font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: ${accent}; font-size: ${st.fontPx + 16}px; }
    .inv-wordmark-rule { height: 2px; background: #e5e7eb; margin: 12px 0 8px; }
    .inv-wordmark-meta { display: flex; justify-content: space-between; gap: 16px; font-size: ${st.fontPx - 2}px; color: #6b7280; }
    /* — panel archetype — */
    .inv-panel { display: flex; justify-content: space-between; gap: 24px; background: ${accent}; border-radius: 12px; padding: ${gap + 2}px ${gap + 6}px; }
    .inv-panel-right { text-align: right; }
    .inv-panel-title { text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; font-size: ${st.fontPx + 12}px; color: ${onAcc}; }
    .inv-panel .inv-number.onacc { color: ${onAcc}; font-weight: 600; margin-top: 4px; }
    .inv-panel .onacc-sub { color: ${subtleOnAcc}; font-size: ${st.fontPx - 2}px; margin-top: 3px; }
    .inv-panel .onacc-sub span { color: ${subtleOnAcc}; }
    .inv-panel .inv-bizname.onacc { color: ${onAcc}; }
    .inv-panel .inv-bandline { color: ${subtleOnAcc}; font-size: ${st.fontPx - 2}px; margin-top: 2px; }
    /* — elegant archetype — */
    .inv-elegant { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding-bottom: ${gap}px; border-bottom: 1px solid #e5e7eb; }
    .inv-elegant-title { text-transform: uppercase; letter-spacing: 0.16em; font-weight: 400; font-size: ${st.fontPx + 18}px; color: #111827; }
    .inv-elegant-dates { color: #9ca3af; font-size: ${st.fontPx - 2}px; margin-top: 6px; }
    .inv-elegant-badge { width: 122px; height: 122px; border-radius: 50%; background: ${tint}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; flex: 0 0 auto; }
    .inv-elegant-logo { max-height: 44px; max-width: 80px; object-fit: contain; margin-bottom: 4px; }
    .inv-elegant-badge-name { font-size: ${st.fontPx - 3}px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; padding: 0 10px; }
    /* — titleLeft archetype — */
    .inv-titleleft { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .inv-title-tl { text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; font-size: ${st.fontPx + 14}px; color: ${accent}; }
    .inv-titleleft-logo { text-align: right; }
    .inv-titleleft-logo .inv-logo { margin-left: auto; }
    /* — bandCenter archetype — */
    .inv-bandcenter { text-align: center; }
    .inv-bandcenter-band { background: ${accent}; color: ${onAcc}; text-transform: uppercase; letter-spacing: 0.3em; font-weight: 700; font-size: ${st.fontPx + 6}px; padding: 10px 0; margin: 8px 0; }
    .inv-bandcenter-meta { color: #6b7280; font-size: ${st.fontPx - 2}px; }
    /* — page / decoration / footer bar — */
    .inv-page { position: relative; overflow: hidden; }
    .inv-page.full { display: flex; flex-direction: column; aspect-ratio: 8.5 / 11; }
    .inv-page.full .inv-doc { flex: 1 0 auto; display: flex; flex-direction: column; }
    /* Anchor the closing footer group (payment instructions + tagline) to the
       bottom of the page on full-page themes — the auto top margin eats the
       empty space between the total and the page edge. */
    .inv-page.full .inv-doc-tail { margin-top: auto; }
    .inv-doc-tail > * { margin-bottom: ${gap}px; }
    .inv-page.tinted { background: ${withAlpha(st.accent, 0.06)}; }
    .inv-deco { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
    .inv-deco-top { position: absolute; top: 0; left: 0; width: 100%; z-index: 0; pointer-events: none; }
    .inv-deco-bot { position: absolute; bottom: 0; left: 0; width: 100%; z-index: 0; pointer-events: none; }
    .inv-doc { position: relative; z-index: 1; }
    .inv-footerbar { position: relative; z-index: 1; margin-top: ${gap}px; background: ${accent}; color: ${onAcc}; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 8px; font-size: ${st.fontPx - 2}px; }
    .inv-footerbar .fb-name { font-weight: 700; }
    .inv-footerbar .fb-sep { color: ${subtleOnAcc}; }
    .inv-sectlabel { text-transform: uppercase; letter-spacing: 0.05em; font-size: ${st.fontPx - 3}px; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
    .inv-clientname { font-weight: 600; }
    .inv-client + .inv-client { margin-top: 6px; }
    .inv-table { width: 100%; border-collapse: collapse; }
    .inv-table th { font-size: ${st.fontPx - 3}px; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; border-bottom: 1px solid #e5e7eb; padding: ${cellPad}; }
    .inv-table.th-accent th { background: ${accent}; color: ${onAcc}; border-bottom: none; }
    .inv-table.th-accent thead th:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
    .inv-table.th-accent thead th:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
    .inv-table.th-dark th { background: #1f2937; color: #fff; border-bottom: none; }
    .inv-table.th-tint th { background: ${tint}; color: #4b5563; border-bottom: none; }
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
    .inv-totalbar { display: flex; justify-content: space-between; align-items: center; gap: 24px; background: ${accent}; color: ${onAcc}; padding: 10px 16px; border-radius: 8px; font-weight: 700; font-size: ${st.fontPx + 4}px; break-inside: avoid; }
    .inv-block { break-inside: avoid; }
    .inv-cfrow { display: flex; justify-content: space-between; gap: 16px; font-size: ${st.fontPx - 1}px; padding: 2px 0; }
    .inv-cfrow span:first-child { color: #6b7280; }
    .inv-text { font-size: ${st.fontPx - 1}px; color: #4b5563; white-space: pre-wrap; line-height: 1.5; }
    .inv-footer { border-top: 1px solid #e5e7eb; padding-top: 10px; color: #9ca3af; font-size: ${st.fontPx - 2}px; text-align: center; white-space: pre-wrap; }
    .inv-approval { border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .inv-approval .inv-sectlabel { color: ${accent}; }
    .inv-sig { max-height: 56px; max-width: 240px; object-fit: contain; margin: 6px 0 2px; display: block; }
  </style>
</head>
<body><div class="${pageCls}">${decoHtml}<div class="inv-doc"${docPad}>${body}</div>${footerBarHtml}</div></body>
</html>`;
}

// ── Editor helpers (Phase 2 settings) ────────────────────────────────────────

/** Apply an industry template. Replaces layout/style/copy with the preset, but
 *  preserves the business's chosen default invoice language across switches. */
export function applyPreset(presetId: InvoicePresetId, current?: InvoiceTemplateConfig): InvoiceTemplateConfig {
  const next = clone(INVOICE_PRESETS[presetId] ?? DEFAULT_INVOICE_TEMPLATE);
  if (current) {
    next.defaultLanguage = current.defaultLanguage;
    // Header note, payment instructions, and footer are business CONTENT the
    // owner writes once — switching themes changes styling, not what it says.
    next.text = { ...current.text };
  }
  return next;
}

/** Seed a Freeform config from a Structured preset: the theme is decomposed into
 *  individually-movable elements (every text is draggable), keeping the theme's
 *  colors + decoration. */
export function freeformFromPreset(presetId: InvoicePresetId, current?: InvoiceTemplateConfig): InvoiceTemplateConfig {
  const base = applyPreset(presetId, current);
  return { ...base, layoutMode: 'freeform', elements: buildThemeElements(base) };
}

/** A blank Freeform starting point — the plain default theme as movable
 *  elements (start from scratch). Preserves the chosen default language. */
export function blankFreeform(current?: InvoiceTemplateConfig): InvoiceTemplateConfig {
  const base = clone(DEFAULT_INVOICE_TEMPLATE);
  if (current) base.defaultLanguage = current.defaultLanguage;
  return { ...base, layoutMode: 'freeform', elements: buildThemeElements(base) };
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
export function setLogoPx(c: InvoiceTemplateConfig, px: number): InvoiceTemplateConfig {
  return { ...c, logoPx: clampLogoPx(px) };
}
export function setLogoInvert(c: InvoiceTemplateConfig, logoInvert: boolean): InvoiceTemplateConfig {
  return { ...c, logoInvert };
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
/** Set the default language on BOTH themes in a bundle so the choice is the same
 *  regardless of which layout mode is active. Lets the setting live on the main
 *  invoice settings card (not just the designer). */
export function setBundleDefaultLanguage(b: InvoiceThemeBundle, defaultLanguage: InvoiceLang): InvoiceThemeBundle {
  return {
    ...b,
    flow: { ...b.flow, defaultLanguage },
    freeform: { ...b.freeform, defaultLanguage },
  };
}
export function setDecoration(c: InvoiceTemplateConfig, decoration: InvoiceDecoration): InvoiceTemplateConfig {
  return { ...c, decoration };
}
export function setPageTint(c: InvoiceTemplateConfig, pageTint: boolean): InvoiceTemplateConfig {
  return { ...c, pageTint };
}

// ── Freeform element editor (Phase 3 — element canvas) ───────────────────────

export function setLayoutMode(c: InvoiceTemplateConfig, mode: InvoiceLayoutMode): InvoiceTemplateConfig {
  if (mode === 'freeform') {
    // Decompose the current theme into movable elements if none exist yet.
    const elements = c.elements && c.elements.length ? c.elements : buildThemeElements(c);
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
/** Drop a per-business custom field onto the canvas. Resolves to that invoice's
 *  value for `customKey` at render time. */
export function addCustomFieldElement(c: InvoiceTemplateConfig, customKey: string, customLabel: string): InvoiceTemplateConfig {
  const el: InvoiceElement = { id: newElementId('customField'), kind: 'customField', customKey, customLabel, x: 8, y: 8, w: 40, h: 6 };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
export function addLogoElement(c: InvoiceTemplateConfig): InvoiceTemplateConfig {
  // Only one logo element makes sense — reuse the existing one if present.
  if ((c.elements ?? []).some(e => e.kind === 'logo')) return c;
  const el: InvoiceElement = { id: newElementId('logo'), kind: 'logo', x: 5, y: 4, w: 22, h: 9 };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
/** Drop a decorative shape. Defaults to a wide low rectangle (also reads as a
 *  divider/line) or a modest ellipse; fill defaults to the theme accent. */
export function addShapeElement(c: InvoiceTemplateConfig, shape: InvoiceShapeKind): InvoiceTemplateConfig {
  const el: InvoiceElement = shape === 'ellipse'
    ? { id: newElementId('shape'), kind: 'shape', shape, x: 8, y: 8, w: 14, h: 10, style: { opacity: 1 } }
    : { id: newElementId('shape'), kind: 'shape', shape, x: 8, y: 8, w: 40, h: 2, style: { opacity: 1 } };
  return { ...c, elements: [...(c.elements ?? []), el] };
}
/** Drop an icon glyph (small, roughly square; centered within its box). Color
 *  defaults to the theme accent. */
export function addIconElement(c: InvoiceTemplateConfig, icon: InvoiceIconName): InvoiceTemplateConfig {
  const el: InvoiceElement = { id: newElementId('icon'), kind: 'icon', icon, x: 8, y: 8, w: 7, h: 5 };
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
  const w = Math.max(1, clamp(rect.w));
  const h = Math.max(1, clamp(rect.h));
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
  clients: [{ firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', phoneCell: '(555) 123-4567', company: 'Pérez Construction', address: '742 Evergreen Ter', city: 'Bellevue', state: 'NE' }],
  customFields: [
    { label: 'Orden de compra', value: 'PO-10234' },
    { label: 'Términos', value: 'Neto 30' },
  ],
};

// ── internals ────────────────────────────────────────────────────────────────

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

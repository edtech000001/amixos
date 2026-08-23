'use client';

// Invoice theme editor (web): structured customizer + a Canva-style element
// canvas for freeform mode. Both edit one InvoiceTemplateConfig via the shared
// pure helpers; the canvas/preview render the real InvoiceDocument so what you
// design is exactly what prints / shares. Includes undo/redo history.

import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Image as ImageIcon, Type, Trash2, AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Sparkles, LayoutTemplate } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import {
  INVOICE_PRESET_IDS,
  ALL_FONTS,
  cssFontFamily,
  buildInvoiceViewModel,
  applyPreset,
  setAccent,
  setFont,
  setDensity,
  setShowLogo,
  setLogoPx,
  effectiveLogoPx,
  LOGO_PX_MIN,
  LOGO_PX_MAX,
  toggleSection,
  reorderSections,
  setColumn,
  setText,
  setLayoutMode,
  setPageTint,
  freeformFromPreset,
  blankFreeform,
  invoiceNumberPrefix,
  FREEFORM_FIELD_KEYS,
  INVOICE_SHAPE_KINDS,
  addFieldElement,
  addTextElement,
  addLogoElement,
  addShapeElement,
  addIconElement,
  addCustomFieldElement,
  updateElement,
  updateElementStyle,
  setElementRect,
  removeElement,
  SAMPLE_INVOICE,
  type InvoiceTemplateConfig,
  type InvoicePresetId,
  type InvoiceDocData,
  type InvoiceBranding,
  type InvoiceFont,
  type InvoiceDensity,
  type InvoiceColumns,
  type InvoiceTextBlocks,
  type InvoiceLayoutMode,
  type InvoiceViewModel,
  type InvoiceElement,
  type InvoiceFieldKey,
  type InvoiceShapeKind,
  type InvoiceIconName,
} from '@amixos/shared/lib/invoiceTemplate';
import { INVOICE_ICON_NODES } from '@amixos/shared/lib/invoiceIconNodes';
import { PIN_ICON_CATEGORIES, ALL_PIN_ICONS, type PinIconCategory } from '@amixos/shared/lib/mapPinPresets';
import { Tooltip } from '@amixos/shared/ui/Tooltip';

const ACCENTS = ['#1F2937', '#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777'];
const DOC_W = 720; // fixed render width for the flow preview; scaled to fit

type DesignT = ReturnType<typeof useLang>['t']['dashboard']['settings']['invoices']['design'];

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex self-start rounded-xl border border-border overflow-hidden">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm ${value === o.value ? 'bg-primary text-white' : 'bg-card text-muted hover:bg-surface'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A real, scaled-down render of the template so the gallery shows how each one
// actually looks. Fixed card width ⇒ constant scale (no measuring needed). The
// card is a full letter-size page (8.5×11) so every template is the same height
// and reads like an actual printed sheet.
const PRESET_CARD_W = 150;
const PAGE_RATIO = 11 / 8.5;
function PresetPreview({ vm, w = PRESET_CARD_W }: { vm: InvoiceViewModel; w?: number }) {
  const scale = w / DOC_W;
  return (
    <div style={{ width: w, height: Math.round(w * PAGE_RATIO), overflow: 'hidden', background: '#fff', borderRadius: 6, pointerEvents: 'none', boxShadow: 'inset 0 0 0 1px #f1f5f9' }}>
      <div style={{ width: DOC_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <InvoiceDocument vm={vm} />
      </div>
    </div>
  );
}
// Larger thumbnail for the "Choose a template" picker (4-up, 2×2) so the
// designs are actually legible.
const PRESET_CARD_W_LG = 300;

// Full-screen modal browsing every template in a paginated grid (keeps the
// editor itself uncluttered). Mirrors the mobile theme browser.
const THEMES_PER_PAGE = 4;
function ThemesModal({ open, onClose, currentId, onSelect, value, branding, sample, t }: {
  open: boolean;
  onClose: () => void;
  currentId: InvoicePresetId;
  onSelect: (id: InvoicePresetId) => void;
  value: InvoiceTemplateConfig;
  branding: InvoiceBranding;
  sample: InvoiceDocData;
  t: DesignT;
}) {
  const [page, setPage] = useState(0);
  if (!open) return null;
  const pages = Math.ceil(INVOICE_PRESET_IDS.length / THEMES_PER_PAGE);
  const safePage = Math.min(page, pages - 1);
  const ids = INVOICE_PRESET_IDS.slice(safePage * THEMES_PER_PAGE, safePage * THEMES_PER_PAGE + THEMES_PER_PAGE);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h3 className="font-semibold text-ink">{t.themesTitle}</h3>
          <Tooltip tip="close">
            <button type="button" onClick={onClose} className="text-faint hover:text-ink"><X size={20} /></button>
          </Tooltip>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 justify-items-center">
            {ids.map(id => {
              const active = currentId === id;
              const pvm = buildInvoiceViewModel(applyPreset(id, value), sample, branding);
              return (
                <button key={id} type="button" onClick={() => onSelect(id)}
                  className={`rounded-xl border p-2.5 transition ${active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border'}`}>
                  <PresetPreview vm={pvm} w={PRESET_CARD_W_LG} />
                  <span className="block mt-2 text-sm font-medium text-ink text-center">{t.presets[id]}{active ? ` · ${t.currentTheme}` : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
        {pages > 1 ? (
          <div className="flex items-center justify-center gap-4 px-5 py-3 border-t border-border-soft">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="p-1.5 rounded-lg border border-border text-muted disabled:opacity-30 hover:bg-surface"><ChevronLeft size={18} /></button>
            <span className="text-sm text-muted">{safePage + 1} / {pages}</span>
            <button type="button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} className="p-1.5 rounded-lg border border-border text-muted disabled:opacity-30 hover:bg-surface"><ChevronRight size={18} /></button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Freeform "start from a template" gallery — previews show how each theme looks
// AS a freeform layout (its style applied to the standard elements). A leading
// "Blank" card lets the user start from scratch. Mirrors ThemesModal's grid.
function CopyThemeModal({ open, onClose, onPick, value, branding, sample, t }: {
  open: boolean;
  onClose: () => void;
  onPick: (id: InvoicePresetId | 'blank') => void;
  value: InvoiceTemplateConfig;
  branding: InvoiceBranding;
  sample: InvoiceDocData;
  t: DesignT;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h3 className="font-semibold text-ink">{t.copyThemeTitle}</h3>
          <Tooltip tip="close">
            <button type="button" onClick={onClose} className="text-faint hover:text-ink"><X size={20} /></button>
          </Tooltip>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 justify-items-center">
            <button type="button" onClick={() => onPick('blank')}
              className="rounded-xl border border-dashed border-border p-2 transition hover:border-gray-400">
              <PresetPreview vm={buildInvoiceViewModel(blankFreeform(value), sample, branding)} />
              <span className="block mt-1.5 text-xs font-medium text-ink text-center">{t.blankTheme}</span>
            </button>
            {INVOICE_PRESET_IDS.map(id => (
              <button key={id} type="button" onClick={() => onPick(id)}
                className="rounded-xl border border-border p-2 transition hover:border-border">
                <PresetPreview vm={buildInvoiceViewModel(freeformFromPreset(id, value), sample, branding)} />
                <span className="block mt-1.5 text-xs font-medium text-ink text-center">{t.presets[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FontSelect({ value, onChange, t, inheritLabel }: {
  value?: InvoiceFont; onChange: (f: InvoiceFont | undefined) => void; t: DesignT; inheritLabel?: string;
}) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value ? (e.target.value as InvoiceFont) : undefined)}
      className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-ink">
      {inheritLabel ? <option value="">{inheritLabel}</option> : null}
      {ALL_FONTS.map(f => <option key={f} value={f} style={{ fontFamily: cssFontFamily(f) }}>{t.fonts[f]}</option>)}
    </select>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el); setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  const scale = w > 0 ? w / DOC_W : 1;
  return (
    <div ref={outer} style={{ width: '100%', height: h * scale, overflow: 'hidden' }}>
      <div ref={inner} style={{ width: DOC_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

// ── Element canvas (freeform) — real document + drag/resize/select overlay.
// Drag commits ONE history checkpoint (onBeginInteraction) then streams raw
// onChange so undo doesn't step through every pixel.
function BuilderCanvas({ value, onChange, onBeginInteraction, vm, selectedId, setSelectedId, styleEditor }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  onBeginInteraction: () => void;
  vm: InvoiceViewModel;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** The style panel for the selected element — floated as a popover anchored to
   *  it, so edits happen right where you clicked (no scrolling back up). */
  styleEditor?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; rect: { x: number; y: number; w: number; h: number }; started: boolean } | null>(null);
  const [canvasW, setCanvasW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth));
    ro.observe(el);
    setCanvasW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const els = value.elements ?? [];
  const selEl = els.find(e => e.id === selectedId) ?? null;

  const begin = (e: React.PointerEvent, el: InvoiceElement, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, rect: { x: el.x, y: el.y, w: el.w, h: el.h }, started: false };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    // Checkpoint history once, on the first real movement (not a tap-select).
    if (!d.started) { d.started = true; onBeginInteraction(); }
    const dx = ((e.clientX - d.sx) / box.width) * 100;
    const dy = ((e.clientY - d.sy) / box.height) * 100;
    const next = d.mode === 'move'
      ? { x: d.rect.x + dx, y: d.rect.y + dy, w: d.rect.w, h: d.rect.h }
      : { x: d.rect.x, y: d.rect.y, w: d.rect.w + dx, h: d.rect.h + dy };
    onChange(setElementRect(value, d.id, next));
  };
  const end = () => { drag.current = null; };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerDown={() => setSelectedId(null)}
      style={{ position: 'relative', width: '100%', maxWidth: DOC_W, margin: '0 auto', aspectRatio: '8.5 / 11', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', touchAction: 'none' }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <InvoiceDocument vm={vm} />
      </div>
      {els.map(el => {
        const sel = el.id === selectedId;
        return (
          <div
            key={el.id}
            onPointerDown={e => begin(e, el, 'move')}
            style={{
              position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
              border: sel ? '1.5px solid #4F46E5' : '1px dashed rgba(79,70,229,0.3)',
              background: sel ? 'rgba(79,70,229,0.05)' : 'transparent', cursor: 'move', borderRadius: 4,
            }}
          >
            {/* Editor-only placeholder so the logo slot is visible before a logo
                is uploaded (real invoices/PDFs render nothing when there's none). */}
            {el.kind === 'logo' && !vm.header.logoUrl ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A5B4FC', pointerEvents: 'none' }}>
                <ImageIcon size={26} strokeWidth={1.5} />
              </div>
            ) : null}
            {sel ? (
              <div onPointerDown={e => begin(e, el, 'resize')}
                style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, background: '#4F46E5', borderRadius: 2, cursor: 'nwse-resize' }} />
            ) : null}
          </div>
        );
      })}
      {selEl && styleEditor && canvasW > 0 ? (() => {
        // Float the panel just above the element (or below it when it sits near
        // the top), horizontally clamped to stay on the canvas.
        const popW = Math.min(560, canvasW - 16);
        const elLeftPx = (selEl.x / 100) * canvasW;
        const left = Math.max(8, Math.min(canvasW - popW - 8, elLeftPx));
        const above = selEl.y >= 28;
        return (
          <div
            onPointerDown={e => e.stopPropagation()}
            className="absolute z-30 shadow-xl rounded-xl"
            style={{
              left,
              width: popW,
              ...(above
                ? { bottom: `${100 - selEl.y}%`, marginBottom: 8 }
                : { top: `${selEl.y + selEl.h}%`, marginTop: 8 }),
            }}
          >
            {styleEditor}
          </div>
        );
      })() : null}
    </div>
  );
}

// One icon glyph from the shared lucide catalog (same geometry that prints).
function IconGlyphSvg({ icon, size = 20 }: { icon: string; size?: number }) {
  const nodes = INVOICE_ICON_NODES[icon] ?? [];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {nodes.map((n, i) => { const { t, ...attrs } = n; return createElement(t, { key: i, ...attrs }); })}
    </svg>
  );
}

// Searchable, categorized icon picker — same ~180-icon catalog the map pins use.
function IconMenu({ label, onPick, categories, searchPlaceholder, noResults }: {
  label: string;
  onPick: (n: string) => void;
  categories: Record<PinIconCategory['i18nKey'], string>;
  searchPlaceholder: string;
  noResults: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = () => { setOpen(false); setQ(''); };
  const query = q.trim().toLowerCase();
  const filtered = query ? ALL_PIN_ICONS.filter(k => k.includes(query)) : null;
  const iconBtn = (n: string) => (
    <button key={n} type="button" title={n} onClick={() => { onPick(n); close(); }}
      className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-border-soft text-ink">
      <IconGlyphSvg icon={n} />
    </button>
  );
  return (
    <div className="relative">
      <button type="button" onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-ink hover:bg-surface">
        <Sparkles size={15} /> {label}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute z-20 mt-1 w-80 bg-card rounded-xl border border-border shadow-lg p-3">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="w-full mb-2 rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary" />
            <div className="max-h-72 overflow-y-auto">
              {filtered ? (
                filtered.length ? (
                  <div className="grid grid-cols-7 gap-1">{filtered.map(iconBtn)}</div>
                ) : <p className="text-xs text-faint py-4 text-center">{noResults}</p>
              ) : (
                PIN_ICON_CATEGORIES.map(cat => (
                  <div key={cat.i18nKey} className="mb-2">
                    <div className="text-[10px] uppercase tracking-wide text-faint font-semibold mb-1 px-0.5">{categories[cat.i18nKey]}</div>
                    <div className="grid grid-cols-7 gap-1">{cat.icons.map(iconBtn)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StylePanel({ value, onChange, el, t, onDeselect }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  el: InvoiceElement;
  t: DesignT;
  onDeselect: () => void;
}) {
  const st = el.style ?? {};
  const setStyle = (patch: Partial<NonNullable<InvoiceElement['style']>>) => onChange(updateElementStyle(value, el.id, patch));
  const isText = el.kind === 'text' || el.kind === 'field' || el.kind === 'customField';
  const name = el.kind === 'text' ? t.elements.textContent
    : el.kind === 'logo' ? t.elements.addLogo
    : el.kind === 'shape' ? t.elements.shapeKinds[el.shape ?? 'rectangle']
    : el.kind === 'icon' ? t.elements.addIcon
    : el.kind === 'customField' ? `◆ ${el.customLabel ?? ''}`
    : t.fields[el.field as InvoiceFieldKey];
  const opacityCtl = (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      {t.elements.opacity}
      <input type="range" min={0.1} max={1} step={0.05} value={st.opacity ?? 1}
        onChange={e => setStyle({ opacity: Number(e.target.value) })} />
    </label>
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{name}</span>
        <button type="button" onClick={() => { onChange(removeElement(value, el.id)); onDeselect(); }}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600">
          <Trash2 size={14} /> {t.elements.deleteEl}
        </button>
      </div>

      {el.kind === 'text' ? (
        <textarea rows={2} value={el.text ?? ''} onChange={e => onChange(updateElement(value, el.id, { text: e.target.value }))}
          placeholder={t.elements.textContent}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y" />
      ) : null}

      {isText ? (
        <div className="flex items-center gap-3 flex-wrap">
          <FontSelect value={st.font} onChange={f => setStyle({ font: f })} t={t} inheritLabel={`${t.elementFont} —`} />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            {t.elements.fontSize}
            <input type="number" min={6} max={72} value={st.fontSize ?? ''} placeholder="—"
              onChange={e => setStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
              className="w-16 rounded-lg border border-border px-2 py-1 text-sm" />
          </label>
          <button type="button" onClick={() => setStyle({ bold: !st.bold })}
            className={`px-2.5 py-1 rounded-lg border text-sm font-bold ${st.bold ? 'bg-primary text-white border-primary' : 'border-border text-muted'}`}>B</button>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            {t.elements.color}
            <input type="color" value={st.color ?? '#1f2937'} onChange={e => setStyle({ color: e.target.value })}
              className="w-7 h-7 rounded border border-border cursor-pointer" />
          </label>
          <Seg<'left' | 'center' | 'right'>
            value={st.align ?? 'left'}
            onChange={a => setStyle({ align: a })}
            options={[
              { value: 'left', label: <AlignLeft size={14} /> },
              { value: 'center', label: <AlignCenter size={14} /> },
              { value: 'right', label: <AlignRight size={14} /> },
            ]}
          />
        </div>
      ) : null}

      {el.kind === 'shape' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            {t.elements.fillColor}
            <input type="color" value={st.fill ?? value.accentColor} onChange={e => setStyle({ fill: e.target.value })}
              className="w-7 h-7 rounded border border-border cursor-pointer" />
          </label>
          {el.shape === 'rectangle' ? (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              {t.elements.cornerRadius}
              <input type="number" min={0} max={80} value={st.radius ?? 0}
                onChange={e => setStyle({ radius: Number(e.target.value) || 0 })}
                className="w-16 rounded-lg border border-border px-2 py-1 text-sm" />
            </label>
          ) : null}
          {opacityCtl}
        </div>
      ) : null}

      {el.kind === 'icon' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            {t.elements.color}
            <input type="color" value={st.color ?? value.accentColor} onChange={e => setStyle({ color: e.target.value })}
              className="w-7 h-7 rounded border border-border cursor-pointer" />
          </label>
          {opacityCtl}
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceDesigner({ value, onChange, branding, customFields = [], onSwitchMode }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  branding: InvoiceBranding;
  /** Per-business custom field templates available to drop onto the canvas. */
  customFields?: { key: string; label: string }[];
  /** Switch the active theme (Structured ↔ Freeform are saved independently).
   *  When omitted, the toggle falls back to flipping layoutMode on this config. */
  onSwitchMode?: (m: InvoiceLayoutMode) => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.invoices.design;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [secOpen, setSecOpen] = useState(false);
  const [, force] = useState(0);

  // Undo/redo history. `change` records a checkpoint per discrete edit; drag
  // records ONE checkpoint at gesture start via pushHistory + raw onChange.
  const past = useRef<InvoiceTemplateConfig[]>([]);
  const future = useRef<InvoiceTemplateConfig[]>([]);
  const pushHistory = () => {
    past.current.push(value);
    if (past.current.length > 60) past.current.shift();
    future.current = [];
  };
  const change = (next: InvoiceTemplateConfig) => { pushHistory(); onChange(next); };
  const undo = () => {
    if (!past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(value);
    setSelectedId(null);
    onChange(prev);
    force(x => x + 1);
  };
  const redo = () => {
    if (!future.current.length) return;
    const nxt = future.current.pop()!;
    past.current.push(value);
    setSelectedId(null);
    onChange(nxt);
    force(x => x + 1);
  };

  const freeform = value.layoutMode === 'freeform';
  const sample = {
    ...SAMPLE_INVOICE,
    language: value.defaultLanguage,
    invoiceNumber: `${invoiceNumberPrefix(value.defaultLanguage)}-0001`,
    // Reflect the business's real custom fields in the preview (placeholder values).
    ...(customFields.length ? { customFields: customFields.map(c => ({ key: c.key, label: c.label, value: 'Ejemplo' })) } : {}),
  };
  const vm = buildInvoiceViewModel(value, sample, branding);
  const selectedEl = freeform ? (value.elements ?? []).find(e => e.id === selectedId) ?? null : null;

  const addCustomFieldEl = (key: string, label: string) => {
    const next = addCustomFieldElement(value, key, label);
    change(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };

  const addFieldEl = (key: InvoiceFieldKey) => {
    const next = addFieldElement(value, key);
    change(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };
  const addTextEl = () => {
    const next = addTextElement(value, '');
    change(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };
  const addLogoEl = () => {
    const next = addLogoElement(value);
    change(next);
    setSelectedId((next.elements ?? []).find(e => e.kind === 'logo')?.id ?? null);
  };
  const addShapeEl = (shape: InvoiceShapeKind) => {
    const next = addShapeElement(value, shape);
    change(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };
  const addIconEl = (icon: InvoiceIconName) => {
    const next = addIconElement(value, icon);
    change(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };

  const accentControl = (
    <Field label={t.accent}>
      <div className="flex items-center gap-2 flex-wrap">
        {ACCENTS.map(c => (
          <button key={c} type="button" aria-label={c} onClick={() => change(setAccent(value, c))}
            className={`w-7 h-7 rounded-full border-2 ${value.accentColor.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent'}`}
            style={{ background: c }} />
        ))}
        <input type="color" value={value.accentColor} onChange={e => change(setAccent(value, e.target.value))}
          className="w-7 h-7 rounded cursor-pointer border border-border" />
      </div>
    </Field>
  );
  const fontControl = (
    <Field label={t.font}>
      <FontSelect value={value.font} onChange={f => change(setFont(value, f ?? 'sans'))} t={t} />
    </Field>
  );
  const densityControl = (
    <Field label={t.density}>
      <Seg<InvoiceDensity> value={value.density} onChange={v => change(setDensity(value, v))}
        options={[{ value: 'comfortable', label: t.densities.comfortable }, { value: 'compact', label: t.densities.compact }]} />
    </Field>
  );
  const columnsControl = (
    <Field label={t.columns}>
      <div className="flex items-center gap-4">
        {(['qty', 'rate', 'total'] as (keyof InvoiceColumns)[]).map(col => (
          <label key={col} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={value.columns[col]} onChange={e => change(setColumn(value, col, e.target.checked))} />
            <span className="text-sm text-muted">{t.columnNames[col]}</span>
          </label>
        ))}
      </div>
    </Field>
  );
  const pageTintControl = (
    <Field label={t.pageTint}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!value.pageTint} onChange={e => change(setPageTint(value, e.target.checked))} />
        <span className="text-sm text-muted">{t.pageTint}</span>
      </label>
    </Field>
  );
  const textBlocksControl = (
    <Field label={t.textBlocks}>
      <div className="flex flex-col gap-3">
        {/* headerNote removed — the per-invoice Notes field covers top-of-invoice
            text; a separate theme-level header note was redundant/confusing. */}
        {([['paymentInstructions', t.paymentInstructionsField], ['footer', t.footerField]] as [keyof InvoiceTextBlocks, string][]).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-muted">{label}</label>
            <textarea rows={2} value={value.text[key] ?? ''} onChange={e => change(setText(value, key, e.target.value))}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y" />
          </div>
        ))}
      </div>
    </Field>
  );

  const undoRedo = (
    <>
      <button type="button" onClick={undo} disabled={past.current.length === 0}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border text-sm text-muted hover:bg-surface disabled:opacity-40">
        <Undo2 size={15} /> {t.undo}
      </button>
      <button type="button" onClick={redo} disabled={future.current.length === 0}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border text-sm text-muted hover:bg-surface disabled:opacity-40">
        <Redo2 size={15} /> {t.redo}
      </button>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* In Structured mode undo/redo lives up top; in Freeform it moves down
          into the add-element toolbar (more convenient while building). */}
      {!freeform ? <div className="flex items-center gap-2">{undoRedo}</div> : null}

      {/* Default language control moved to Ajustes → Facturas (main card). */}

      <Field label={t.layout}>
        <Seg<InvoiceLayoutMode>
          value={freeform ? 'freeform' : 'flow'}
          onChange={m => { setSelectedId(null); if (onSwitchMode) onSwitchMode(m); else change(setLayoutMode(value, m)); }}
          options={[{ value: 'flow', label: t.layoutModes.structured }, { value: 'freeform', label: t.layoutModes.freeform }]}
        />
        {freeform ? <p className="text-xs text-faint">{t.builderHint}</p> : null}
      </Field>

      {freeform ? (
        // ── FREEFORM: element canvas ──────────────────────────────────────
        <div className="flex flex-col gap-4">
          <button type="button" onClick={() => setCopyOpen(true)}
            className="self-start flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-medium text-ink hover:bg-surface">
            <LayoutTemplate size={15} /> {t.copyTheme}
          </button>
          <div className="flex flex-wrap gap-5">
            {accentControl}
            {fontControl}
            {densityControl}
            {columnsControl}
            {pageTintControl}
          </div>

          {/* Element toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={addTextEl} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-ink hover:bg-surface">
              <Type size={15} /> {t.elements.addText}
            </button>
            <select value="" onChange={e => {
                const v = e.target.value;
                if (!v) return;
                if (v.startsWith('custom:')) {
                  const tpl = customFields.find(c => c.key === v.slice(7));
                  if (tpl) addCustomFieldEl(tpl.key, tpl.label);
                } else {
                  addFieldEl(v as InvoiceFieldKey);
                }
              }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink">
              <option value="">＋ {t.elements.addField}</option>
              {FREEFORM_FIELD_KEYS.map(k => <option key={k} value={k}>{t.fields[k]}</option>)}
              {customFields.length ? (
                <optgroup label={t.sectionNames.customFields}>
                  {customFields.map(c => <option key={c.key} value={`custom:${c.key}`}>◆ {c.label}</option>)}
                </optgroup>
              ) : null}
            </select>
            <select value="" onChange={e => { const v = e.target.value; if (v) addShapeEl(v as InvoiceShapeKind); }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink">
              <option value="">◻ {t.elements.addShape}</option>
              {INVOICE_SHAPE_KINDS.map(s => <option key={s} value={s}>{t.elements.shapeKinds[s]}</option>)}
            </select>
            <IconMenu
              label={t.elements.addIcon}
              onPick={addIconEl}
              categories={full.dashboard.modules.map.iconCategories}
              searchPlaceholder={full.dashboard.modules.map.iconSearchPlaceholder}
              noResults={full.dashboard.modules.map.iconSearchNoResults}
            />
            <button type="button" onClick={addLogoEl} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-ink hover:bg-surface">
              <ImageIcon size={15} /> {t.elements.addLogo}
            </button>
            <div className="ml-auto flex items-center gap-2">{undoRedo}</div>
          </div>

          {!selectedEl ? <p className="text-xs text-faint">{t.elements.empty}</p> : null}

          <BuilderCanvas
            value={value}
            onChange={onChange}
            onBeginInteraction={pushHistory}
            vm={vm}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            styleEditor={selectedEl ? <StylePanel value={value} onChange={change} el={selectedEl} t={t} onDeselect={() => setSelectedId(null)} /> : null}
          />

          {/* Text blocks live OUTSIDE the canvas — a separate card so it's clear
              they're document content, not draggable elements. */}
          <div className="mt-1 rounded-xl border border-border bg-surface p-4">
            {textBlocksControl}
          </div>
        </div>
      ) : (
        // ── STRUCTURED: customizer + scaled preview ───────────────────────
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            <Field label={t.preset}>
              <button type="button" onClick={() => setThemesOpen(true)}
                className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:border-border w-full max-w-sm text-left">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-ink">{t.presets[value.presetId]}</div>
                  <div className="text-xs text-primary mt-1">{t.browseThemes}</div>
                </div>
                <ChevronRight className="text-faint" size={20} />
              </button>
            </Field>

            {accentControl}

            <div className="flex flex-wrap gap-5">
              {fontControl}
              {densityControl}
            </div>

            <Field label={t.showLogo}>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={value.showLogo} onChange={e => change(setShowLogo(value, e.target.checked))} />
                  <span className="text-sm text-muted">{t.showLogo}</span>
                </label>
                {value.showLogo ? (
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-muted">{t.logoSize}</span>
                    <input
                      type="range"
                      min={LOGO_PX_MIN}
                      max={LOGO_PX_MAX}
                      step={2}
                      value={effectiveLogoPx(value)}
                      onChange={e => change(setLogoPx(value, Number(e.target.value)))}
                      className="w-40 accent-primary cursor-pointer"
                    />
                    <span className="text-xs text-muted tabular-nums w-9 text-right">{effectiveLogoPx(value)}px</span>
                  </label>
                ) : null}
              </div>
            </Field>

            {columnsControl}

            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setSecOpen(o => !o)} className="flex items-center justify-between text-left">
                <span className="text-sm font-medium text-ink">{t.sections}</span>
                {secOpen ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
              </button>
              {secOpen ? (
                <div className="flex flex-col gap-1.5">
                  {value.sections.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-1.5">
                      <input type="checkbox" checked={s.show} onChange={() => change(toggleSection(value, s.id))} />
                      <span className="text-sm text-ink flex-1">{t.sectionNames[s.id]}</span>
                      <button type="button" disabled={i === 0} onClick={() => change(reorderSections(value, i, i - 1))} className="p-1 text-faint hover:text-ink disabled:opacity-30"><ChevronUp size={16} /></button>
                      <button type="button" disabled={i === value.sections.length - 1} onClick={() => change(reorderSections(value, i, i + 1))} className="p-1 text-faint hover:text-ink disabled:opacity-30"><ChevronDown size={16} /></button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {textBlocksControl}
          </div>

          <div className="lg:w-[420px] shrink-0 lg:sticky lg:top-4 lg:self-start">
            <p className="text-xs font-semibold text-faint uppercase mb-2">{t.preview}</p>
            <div className="rounded-xl border border-border overflow-hidden bg-surface p-3">
              <div className="bg-card rounded-lg border border-border-soft overflow-hidden">
                <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
              </div>
            </div>
          </div>
        </div>
      )}

      <ThemesModal
        open={themesOpen}
        onClose={() => setThemesOpen(false)}
        currentId={value.presetId}
        onSelect={id => { change(applyPreset(id, value)); setThemesOpen(false); }}
        value={value}
        branding={branding}
        sample={sample}
        t={t}
      />

      <CopyThemeModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        onPick={id => {
          setSelectedId(null);
          change(id === 'blank' ? blankFreeform(value) : freeformFromPreset(id, value));
          setCopyOpen(false);
        }}
        value={value}
        branding={branding}
        sample={sample}
        t={t}
      />
    </div>
  );
}

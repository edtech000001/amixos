'use client';

// Invoice theme editor (web): structured customizer + a Canva-style element
// canvas for freeform mode. Both edit one InvoiceTemplateConfig via the shared
// pure helpers; the canvas/preview render the real InvoiceDocument so what you
// design is exactly what prints / shares.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, Plus, Image as ImageIcon, Type, Trash2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import type { InvoiceLang } from '@amixos/shared';
import {
  INVOICE_PRESETS,
  buildInvoiceViewModel,
  applyPreset,
  setAccent,
  setFont,
  setDensity,
  setShowLogo,
  setLogoSize,
  toggleSection,
  reorderSections,
  setColumn,
  setText,
  setLayoutMode,
  setDefaultLanguage,
  FREEFORM_FIELD_KEYS,
  addFieldElement,
  addTextElement,
  addLogoElement,
  updateElement,
  updateElementStyle,
  setElementRect,
  removeElement,
  SAMPLE_INVOICE,
  type InvoiceTemplateConfig,
  type InvoicePresetId,
  type InvoiceBranding,
  type InvoiceFont,
  type InvoiceDensity,
  type InvoiceLogoSize,
  type InvoiceColumns,
  type InvoiceTextBlocks,
  type InvoiceLayoutMode,
  type InvoiceViewModel,
  type InvoiceElement,
  type InvoiceFieldKey,
} from '@amixos/shared/lib/invoiceTemplate';

const PRESET_IDS: InvoicePresetId[] = ['clasica', 'moderna', 'minimalista', 'compacta'];
const ACCENTS = ['#1F2937', '#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777'];
const DOC_W = 720; // fixed render width for the flow preview; scaled to fit

type DesignT = ReturnType<typeof useLang>['t']['dashboard']['settings']['invoices']['design'];

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm ${value === o.value ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </div>
  );
}

// Render children at a fixed width, scaled to fit the container (flow preview).
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

// ── Element canvas (freeform) — the real document + drag/resize/select overlay
function BuilderCanvas({ value, onChange, vm, selectedId, setSelectedId }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  vm: InvoiceViewModel;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  const els = value.elements ?? [];

  const begin = (e: React.PointerEvent, el: InvoiceElement, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, rect: { x: el.x, y: el.y, w: el.w, h: el.h } };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
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
      {/* Real document (visual only) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <InvoiceDocument vm={vm} />
      </div>
      {/* Interaction overlay */}
      {els.map(el => {
        const sel = el.id === selectedId;
        return (
          <div
            key={el.id}
            onPointerDown={e => begin(e, el, 'move')}
            style={{
              position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
              border: sel ? '1.5px solid #4F46E5' : '1px dashed rgba(79,70,229,0.3)',
              background: sel ? 'rgba(79,70,229,0.05)' : 'transparent',
              cursor: 'move', borderRadius: 4,
            }}
          >
            {sel ? (
              <div onPointerDown={e => begin(e, el, 'resize')}
                style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, background: '#4F46E5', borderRadius: 2, cursor: 'nwse-resize' }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── Style panel for the selected element
function StylePanel({ value, onChange, el, t, onDeselect }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  el: InvoiceElement;
  t: DesignT;
  onDeselect: () => void;
}) {
  const st = el.style ?? {};
  const setStyle = (patch: Partial<NonNullable<InvoiceElement['style']>>) => onChange(updateElementStyle(value, el.id, patch));
  const name = el.kind === 'text' ? t.elements.textContent : el.kind === 'logo' ? t.elements.addLogo : t.fields[el.field as InvoiceFieldKey];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{name}</span>
        <button type="button" onClick={() => { onChange(removeElement(value, el.id)); onDeselect(); }}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600">
          <Trash2 size={14} /> {t.elements.deleteEl}
        </button>
      </div>

      {el.kind === 'text' ? (
        <textarea rows={2} value={el.text ?? ''} onChange={e => onChange(updateElement(value, el.id, { text: e.target.value }))}
          placeholder={t.elements.textContent}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y" />
      ) : null}

      {el.kind !== 'logo' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            {t.elements.fontSize}
            <input type="number" min={6} max={72} value={st.fontSize ?? ''} placeholder="—"
              onChange={e => setStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
              className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm" />
          </label>
          <button type="button" onClick={() => setStyle({ bold: !st.bold })}
            className={`px-2.5 py-1 rounded-lg border text-sm font-bold ${st.bold ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'}`}>B</button>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            {t.elements.color}
            <input type="color" value={st.color ?? '#1f2937'} onChange={e => setStyle({ color: e.target.value })}
              className="w-7 h-7 rounded border border-gray-200 cursor-pointer" />
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
    </div>
  );
}

export function InvoiceDesigner({ value, onChange, branding }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  branding: InvoiceBranding;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.invoices.design;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const freeform = value.layoutMode === 'freeform';
  const vm = buildInvoiceViewModel(value, { ...SAMPLE_INVOICE, language: value.defaultLanguage }, branding);
  const selectedEl = freeform ? (value.elements ?? []).find(e => e.id === selectedId) ?? null : null;

  const addField = (key: InvoiceFieldKey) => {
    const next = addFieldElement(value, key);
    onChange(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };
  const addText = () => {
    const next = addTextElement(value, '');
    onChange(next);
    const list = next.elements ?? [];
    setSelectedId(list[list.length - 1]?.id ?? null);
  };
  const addLogo = () => {
    const next = addLogoElement(value);
    onChange(next);
    setSelectedId((next.elements ?? []).find(e => e.kind === 'logo')?.id ?? null);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Default invoice language */}
      <Field label={t.defaultLanguage}>
        <Seg<InvoiceLang>
          value={value.defaultLanguage}
          onChange={l => onChange(setDefaultLanguage(value, l))}
          options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]}
        />
        <p className="text-xs text-gray-400">{t.defaultLanguageHint}</p>
      </Field>

      {/* Layout mode */}
      <Field label={t.layout}>
        <Seg<InvoiceLayoutMode>
          value={freeform ? 'freeform' : 'flow'}
          onChange={m => { onChange(setLayoutMode(value, m)); setSelectedId(null); }}
          options={[{ value: 'flow', label: t.layoutModes.structured }, { value: 'freeform', label: t.layoutModes.freeform }]}
        />
        {freeform ? <p className="text-xs text-gray-400">{t.builderHint}</p> : null}
      </Field>

      {freeform ? (
        // ── FREEFORM: element canvas ──────────────────────────────────────
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-5">
            <Field label={t.accent}>
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENTS.map(c => (
                  <button key={c} type="button" aria-label={c} onClick={() => onChange(setAccent(value, c))}
                    className={`w-7 h-7 rounded-full border-2 ${value.accentColor.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
                <input type="color" value={value.accentColor} onChange={e => onChange(setAccent(value, e.target.value))}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200" />
              </div>
            </Field>
            <Field label={t.font}>
              <Seg<InvoiceFont> value={value.font} onChange={v => onChange(setFont(value, v))}
                options={[{ value: 'sans', label: t.fonts.sans }, { value: 'serif', label: t.fonts.serif }, { value: 'mono', label: t.fonts.mono }]} />
            </Field>
            <Field label={t.columns}>
              <div className="flex items-center gap-4">
                {(['qty', 'rate', 'total'] as (keyof InvoiceColumns)[]).map(col => (
                  <label key={col} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={value.columns[col]} onChange={e => onChange(setColumn(value, col, e.target.checked))} />
                    <span className="text-sm text-gray-600">{t.columnNames[col]}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>

          {/* Element toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={addText} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <Type size={15} /> {t.elements.addText}
            </button>
            <select value="" onChange={e => { if (e.target.value) addField(e.target.value as InvoiceFieldKey); }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              <option value="">＋ {t.elements.addField}</option>
              {FREEFORM_FIELD_KEYS.map(k => <option key={k} value={k}>{t.fields[k]}</option>)}
            </select>
            <button type="button" onClick={addLogo} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <ImageIcon size={15} /> {t.elements.addLogo}
            </button>
          </div>

          {selectedEl ? (
            <StylePanel value={value} onChange={onChange} el={selectedEl} t={t} onDeselect={() => setSelectedId(null)} />
          ) : (
            <p className="text-xs text-gray-400">{t.elements.empty}</p>
          )}

          <BuilderCanvas value={value} onChange={onChange} vm={vm} selectedId={selectedId} setSelectedId={setSelectedId} />
        </div>
      ) : (
        // ── STRUCTURED: customizer + scaled preview ───────────────────────
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 flex flex-col gap-5 min-w-0">
            <Field label={t.preset}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_IDS.map(id => {
                  const active = value.presetId === id;
                  return (
                    <button key={id} type="button" onClick={() => onChange(applyPreset(id))}
                      className={`rounded-xl border p-2 text-left ${active ? 'border-primary ring-1 ring-primary' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="h-10 rounded-md mb-1.5" style={{ background: INVOICE_PRESETS[id].accentColor }} />
                      <span className="text-xs font-medium text-gray-700">{t.presets[id]}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t.accent}>
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENTS.map(c => (
                  <button key={c} type="button" aria-label={c} onClick={() => onChange(setAccent(value, c))}
                    className={`w-7 h-7 rounded-full border-2 ${value.accentColor.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
                <input type="color" value={value.accentColor} onChange={e => onChange(setAccent(value, e.target.value))}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200" />
              </div>
            </Field>

            <div className="flex flex-wrap gap-5">
              <Field label={t.font}>
                <Seg<InvoiceFont> value={value.font} onChange={v => onChange(setFont(value, v))}
                  options={[{ value: 'sans', label: t.fonts.sans }, { value: 'serif', label: t.fonts.serif }, { value: 'mono', label: t.fonts.mono }]} />
              </Field>
              <Field label={t.density}>
                <Seg<InvoiceDensity> value={value.density} onChange={v => onChange(setDensity(value, v))}
                  options={[{ value: 'comfortable', label: t.densities.comfortable }, { value: 'compact', label: t.densities.compact }]} />
              </Field>
            </div>

            <Field label={t.showLogo}>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={value.showLogo} onChange={e => onChange(setShowLogo(value, e.target.checked))} />
                  <span className="text-sm text-gray-600">{t.showLogo}</span>
                </label>
                {value.showLogo ? (
                  <Seg<InvoiceLogoSize> value={value.logoSize} onChange={v => onChange(setLogoSize(value, v))}
                    options={[{ value: 'sm', label: t.logoSizes.sm }, { value: 'md', label: t.logoSizes.md }, { value: 'lg', label: t.logoSizes.lg }]} />
                ) : null}
              </div>
            </Field>

            <Field label={t.columns}>
              <div className="flex items-center gap-4">
                {(['qty', 'rate', 'total'] as (keyof InvoiceColumns)[]).map(col => (
                  <label key={col} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={value.columns[col]} onChange={e => onChange(setColumn(value, col, e.target.checked))} />
                    <span className="text-sm text-gray-600">{t.columnNames[col]}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label={t.sections}>
              <div className="flex flex-col gap-1.5">
                {value.sections.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
                    <input type="checkbox" checked={s.show} onChange={() => onChange(toggleSection(value, s.id))} />
                    <span className="text-sm text-gray-700 flex-1">{t.sectionNames[s.id]}</span>
                    <button type="button" disabled={i === 0} onClick={() => onChange(reorderSections(value, i, i - 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ChevronUp size={16} /></button>
                    <button type="button" disabled={i === value.sections.length - 1} onClick={() => onChange(reorderSections(value, i, i + 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ChevronDown size={16} /></button>
                  </div>
                ))}
              </div>
            </Field>

            <Field label={t.textBlocks}>
              <div className="flex flex-col gap-3">
                {([['headerNote', t.headerNote], ['paymentInstructions', t.paymentInstructionsField], ['footer', t.footerField]] as [keyof InvoiceTextBlocks, string][]).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">{label}</label>
                    <textarea rows={2} value={value.text[key] ?? ''} onChange={e => onChange(setText(value, key, e.target.value))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y" />
                  </div>
                ))}
              </div>
            </Field>
          </div>

          <div className="lg:w-[420px] shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.preview}</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-3">
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

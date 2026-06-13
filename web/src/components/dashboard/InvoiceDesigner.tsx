'use client';

// Invoice theme editor (web): structured customizer + freeform drag-drop
// builder, both editing one InvoiceTemplateConfig via the shared pure helpers.
// The live preview renders the real InvoiceDocument (the same component the
// invoice / PDF / public link use), scaled down from a fixed document width so
// it never cramps (which made the business name wrap one letter per line).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
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
  setSectionRect,
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
  type InvoiceSectionId,
} from '@amixos/shared/lib/invoiceTemplate';

const PRESET_IDS: InvoicePresetId[] = ['clasica', 'moderna', 'minimalista', 'compacta'];
const ACCENTS = ['#1F2937', '#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777'];
const DOC_W = 720; // fixed render width for the preview; scaled to the container

function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
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

// Render children at a fixed width, scaled to fit the container — gives a
// faithful, never-cramped mini preview.
function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  // Track the container width.
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Track the document's natural height — re-measures when content changes
  // (e.g. the logo image finishing loading), so the frame never clips.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
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

// Freeform wireframe: drag to move, corner handle to resize. The labeled boxes
// arrange the layout; the live preview below shows the real output.
function BuilderCanvas({ value, onChange, sectionName }: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  sectionName: (id: InvoiceSectionId) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: InvoiceSectionId; mode: 'move' | 'resize'; sx: number; sy: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);

  const rectOf = (id: InvoiceSectionId) => {
    const s = value.sections.find(x => x.id === id);
    if (!s || s.x == null || s.y == null || s.w == null || s.h == null) return null;
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  };

  const begin = (e: React.PointerEvent, id: InvoiceSectionId, mode: 'move' | 'resize') => {
    const r = rectOf(id);
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, rect: { ...r } };
    // Capture on the CANVAS (not the box) so move/up events keep flowing to the
    // canvas's handlers even when the pointer leaves the small box/handle.
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
    onChange(setSectionRect(value, d.id, next));
  };
  const end = () => { drag.current = null; };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      style={{ position: 'relative', width: '100%', aspectRatio: '8.5 / 11', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', touchAction: 'none' }}
    >
      {value.sections.filter(s => s.show).map(s => {
        const r = rectOf(s.id);
        if (!r) return null;
        return (
          <div
            key={s.id}
            onPointerDown={e => begin(e, s.id, 'move')}
            style={{ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, border: '1.5px dashed rgba(79,70,229,0.7)', background: 'rgba(79,70,229,0.06)', borderRadius: 6, cursor: 'move' }}
          >
            <span style={{ position: 'absolute', top: 3, left: 6, fontSize: 10, fontWeight: 600, color: '#4F46E5' }}>{sectionName(s.id)}</span>
            <div
              onPointerDown={e => begin(e, s.id, 'resize')}
              style={{ position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, background: '#4F46E5', borderRadius: 3, cursor: 'nwse-resize' }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function InvoiceDesigner({
  value,
  onChange,
  branding,
}: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  branding: InvoiceBranding;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.invoices.design;
  const vm = buildInvoiceViewModel(value, SAMPLE_INVOICE, branding);
  const freeform = value.layoutMode === 'freeform';

  return (
    <div className="flex flex-col gap-5">
      {/* Layout mode */}
      <Field label={t.layout}>
        <Seg<InvoiceLayoutMode>
          value={freeform ? 'freeform' : 'flow'}
          onChange={m => onChange(setLayoutMode(value, m))}
          options={[
            { value: 'flow', label: t.layoutModes.structured },
            { value: 'freeform', label: t.layoutModes.freeform },
          ]}
        />
        {freeform ? <p className="text-xs text-gray-400">{t.builderHint}</p> : null}
      </Field>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Controls */}
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
                  {!freeform ? (
                    <>
                      <button type="button" disabled={i === 0} onClick={() => onChange(reorderSections(value, i, i - 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ChevronUp size={16} /></button>
                      <button type="button" disabled={i === value.sections.length - 1} onClick={() => onChange(reorderSections(value, i, i + 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ChevronDown size={16} /></button>
                    </>
                  ) : null}
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

        {/* Builder (freeform) or preview (flow) */}
        <div className="lg:w-[420px] shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{freeform ? t.layoutModes.freeform : t.preview}</p>
          {freeform ? (
            <div className="flex flex-col gap-3">
              <BuilderCanvas value={value} onChange={onChange} sectionName={id => t.sectionNames[id]} />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.preview}</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-3">
                  <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                    <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-3">
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

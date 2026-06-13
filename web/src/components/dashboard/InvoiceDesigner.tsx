'use client';

// Structured invoice-template customizer (web). Edits an InvoiceTemplateConfig
// via the shared pure helpers and shows a live preview using the same
// InvoiceDocument renderer the real invoice / PDF / public link use.

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
  SAMPLE_INVOICE,
  type InvoiceTemplateConfig,
  type InvoicePresetId,
  type InvoiceBranding,
  type InvoiceFont,
  type InvoiceDensity,
  type InvoiceLogoSize,
  type InvoiceColumns,
  type InvoiceTextBlocks,
} from '@amixos/shared/lib/invoiceTemplate';

const PRESET_IDS: InvoicePresetId[] = ['clasica', 'moderna', 'minimalista', 'compacta'];
const ACCENTS = ['#1F2937', '#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777'];

function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm ${value === o.value ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          {o.label}
        </button>
      ))}
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

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Controls */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">
        {/* Preset */}
        <Field label={t.preset}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_IDS.map(id => {
              const active = value.presetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange(applyPreset(id))}
                  className={`rounded-xl border p-2 text-left ${active ? 'border-primary ring-1 ring-primary' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="h-10 rounded-md mb-1.5" style={{ background: INVOICE_PRESETS[id].accentColor }} />
                  <span className="text-xs font-medium text-gray-700">{t.presets[id]}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Accent */}
        <Field label={t.accent}>
          <div className="flex items-center gap-2 flex-wrap">
            {ACCENTS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => onChange(setAccent(value, c))}
                className={`w-7 h-7 rounded-full border-2 ${value.accentColor.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={value.accentColor}
              onChange={e => onChange(setAccent(value, e.target.value))}
              className="w-7 h-7 rounded cursor-pointer border border-gray-200"
            />
          </div>
        </Field>

        <div className="flex flex-wrap gap-5">
          <Field label={t.font}>
            <Seg<InvoiceFont>
              value={value.font}
              onChange={v => onChange(setFont(value, v))}
              options={[
                { value: 'sans', label: t.fonts.sans },
                { value: 'serif', label: t.fonts.serif },
                { value: 'mono', label: t.fonts.mono },
              ]}
            />
          </Field>
          <Field label={t.density}>
            <Seg<InvoiceDensity>
              value={value.density}
              onChange={v => onChange(setDensity(value, v))}
              options={[
                { value: 'comfortable', label: t.densities.comfortable },
                { value: 'compact', label: t.densities.compact },
              ]}
            />
          </Field>
        </div>

        {/* Logo */}
        <Field label={t.showLogo}>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={value.showLogo} onChange={e => onChange(setShowLogo(value, e.target.checked))} />
              <span className="text-sm text-gray-600">{t.showLogo}</span>
            </label>
            {value.showLogo ? (
              <Seg<InvoiceLogoSize>
                value={value.logoSize}
                onChange={v => onChange(setLogoSize(value, v))}
                options={[
                  { value: 'sm', label: t.logoSizes.sm },
                  { value: 'md', label: t.logoSizes.md },
                  { value: 'lg', label: t.logoSizes.lg },
                ]}
              />
            ) : null}
          </div>
        </Field>

        {/* Columns */}
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

        {/* Sections (reorder + show/hide) */}
        <Field label={t.sections}>
          <div className="flex flex-col gap-1.5">
            {value.sections.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
                <input type="checkbox" checked={s.show} onChange={() => onChange(toggleSection(value, s.id))} />
                <span className="text-sm text-gray-700 flex-1">{t.sectionNames[s.id]}</span>
                <button type="button" disabled={i === 0} onClick={() => onChange(reorderSections(value, i, i - 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronUp size={16} />
                </button>
                <button type="button" disabled={i === value.sections.length - 1} onClick={() => onChange(reorderSections(value, i, i + 1))} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                  <ChevronDown size={16} />
                </button>
              </div>
            ))}
          </div>
        </Field>

        {/* Text blocks */}
        <Field label={t.textBlocks}>
          <div className="flex flex-col gap-3">
            {([
              ['headerNote', t.headerNote],
              ['paymentInstructions', t.paymentInstructionsField],
              ['footer', t.footerField],
            ] as [keyof InvoiceTextBlocks, string][]).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{label}</label>
                <textarea
                  rows={2}
                  value={value.text[key] ?? ''}
                  onChange={e => onChange(setText(value, key, e.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
                />
              </div>
            ))}
          </div>
        </Field>
      </div>

      {/* Live preview */}
      <div className="lg:w-[380px] shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.preview}</p>
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-3">
          <div className="bg-white rounded-lg border border-gray-100 overflow-hidden origin-top">
            <InvoiceDocument vm={vm} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </div>
  );
}

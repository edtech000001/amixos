// Structured invoice-template customizer (mobile). Edits an
// InvoiceTemplateConfig via the shared pure helpers; live preview uses the same
// InvoiceDocument renderer as the real invoice / PDF / public link.

import { View, Text, Pressable, TextInput } from 'react-native';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
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
    <View className="flex-row rounded-xl border border-gray-200 overflow-hidden self-start">
      {options.map(o => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`px-3 py-2 ${value === o.value ? 'bg-primary' : 'bg-white'}`}
        >
          <Text className={`text-sm ${value === o.value ? 'text-white' : 'text-gray-600'}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-gray-700">{label}</Text>
      {children}
    </View>
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
    <View className="gap-5">
      {/* Preset */}
      <Field label={t.preset}>
        <View className="flex-row flex-wrap gap-2">
          {PRESET_IDS.map(id => {
            const active = value.presetId === id;
            return (
              <Pressable
                key={id}
                onPress={() => onChange(applyPreset(id))}
                className={`rounded-xl border p-2 w-[72px] ${active ? 'border-primary' : 'border-gray-200'}`}
              >
                <View className="h-8 rounded-md mb-1.5" style={{ backgroundColor: INVOICE_PRESETS[id].accentColor }} />
                <Text className="text-[11px] font-medium text-gray-700">{t.presets[id]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {/* Accent */}
      <Field label={t.accent}>
        <View className="flex-row flex-wrap gap-2">
          {ACCENTS.map(c => (
            <Pressable
              key={c}
              onPress={() => onChange(setAccent(value, c))}
              className={`w-8 h-8 rounded-full ${value.accentColor.toLowerCase() === c.toLowerCase() ? 'border-2 border-gray-900' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </View>
      </Field>

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

      {/* Logo */}
      <Field label={t.showLogo}>
        <View className="gap-2">
          <Pressable onPress={() => onChange(setShowLogo(value, !value.showLogo))} className="flex-row items-center gap-2">
            <View className={`w-5 h-5 rounded border items-center justify-center ${value.showLogo ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
              {value.showLogo ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
            </View>
            <Text className="text-sm text-gray-600">{t.showLogo}</Text>
          </Pressable>
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
        </View>
      </Field>

      {/* Columns */}
      <Field label={t.columns}>
        <View className="flex-row gap-4">
          {(['qty', 'rate', 'total'] as (keyof InvoiceColumns)[]).map(col => (
            <Pressable key={col} onPress={() => onChange(setColumn(value, col, !value.columns[col]))} className="flex-row items-center gap-2">
              <View className={`w-5 h-5 rounded border items-center justify-center ${value.columns[col] ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                {value.columns[col] ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
              </View>
              <Text className="text-sm text-gray-600">{t.columnNames[col]}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      {/* Sections */}
      <Field label={t.sections}>
        <View className="gap-1.5">
          {value.sections.map((s, i) => (
            <View key={s.id} className="flex-row items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
              <Pressable onPress={() => onChange(toggleSection(value, s.id))} className={`w-5 h-5 rounded border items-center justify-center ${s.show ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                {s.show ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
              </Pressable>
              <Text className="text-sm text-gray-700 flex-1">{t.sectionNames[s.id]}</Text>
              <Pressable disabled={i === 0} onPress={() => onChange(reorderSections(value, i, i - 1))} className="p-1">
                <ChevronUp size={16} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
              </Pressable>
              <Pressable disabled={i === value.sections.length - 1} onPress={() => onChange(reorderSections(value, i, i + 1))} className="p-1">
                <ChevronDown size={16} color={i === value.sections.length - 1 ? '#D1D5DB' : '#6B7280'} />
              </Pressable>
            </View>
          ))}
        </View>
      </Field>

      {/* Text blocks */}
      <Field label={t.textBlocks}>
        <View className="gap-3">
          {([
            ['headerNote', t.headerNote],
            ['paymentInstructions', t.paymentInstructionsField],
            ['footer', t.footerField],
          ] as [keyof InvoiceTextBlocks, string][]).map(([key, label]) => (
            <View key={key} className="gap-1">
              <Text className="text-xs text-gray-500">{label}</Text>
              <TextInput
                multiline
                value={value.text[key] ?? ''}
                onChangeText={txt => onChange(setText(value, key, txt))}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                style={{ minHeight: 52, textAlignVertical: 'top' }}
              />
            </View>
          ))}
        </View>
      </Field>

      {/* Preview */}
      <Field label={t.preview}>
        <View className="rounded-xl border border-gray-200 bg-gray-50 p-2">
          <View className="bg-white rounded-lg border border-gray-100 overflow-hidden">
            <InvoiceDocument vm={vm} />
          </View>
        </View>
      </Field>
    </View>
  );
}

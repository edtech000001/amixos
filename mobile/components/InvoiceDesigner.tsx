// Structured invoice-template customizer (mobile). Edits an
// InvoiceTemplateConfig via the shared pure helpers; live preview uses the same
// InvoiceDocument renderer as the real invoice / PDF / public link.

import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, TextInput, Modal, FlatList, ScrollView, useWindowDimensions } from 'react-native';
import { ChevronUp, ChevronDown, ChevronRight, X, Check } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import type { InvoiceLang } from '@amixos/shared';
import {
  INVOICE_PRESET_GROUPS,
  INVOICE_PRESET_IDS,
  ALL_ARCHETYPES,
  buildInvoiceViewModel,
  applyPreset,
  setArchetype,
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
  invoiceNumberPrefix,
  SAMPLE_INVOICE,
  type InvoiceTemplateConfig,
  type InvoiceViewModel,
  type InvoicePresetId,
  type InvoiceDocData,
  type InvoiceBranding,
  type InvoiceFont,
  type InvoiceDensity,
  type InvoiceLogoSize,
  type InvoiceColumns,
  type InvoiceTextBlocks,
  type InvoiceLayoutMode,
} from '@amixos/shared/lib/invoiceTemplate';

const DOC_W = 640; // fixed render width for the preview; scaled to the container

// Render children at a fixed width, scaled to fit — a faithful, never-cramped
// mini preview. transformOrigin needs RN 0.74+ (this app is 0.74.5).
//
// The content is ALWAYS rendered (never gated on width) so its natural height
// is measured immediately; the frame height is `undefined` (auto) until then.
// Gating the content on width + driving the outer height from that height is a
// deadlock — the outer collapses to 0, the content never mounts, height stays 0.
function ScaledPreview({ children }: { children: ReactNode }) {
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const scale = w > 0 ? w / DOC_W : 1;
  return (
    <View
      onLayout={e => setW(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: h > 0 ? h * scale : undefined, overflow: 'hidden' }}
    >
      <View style={{ width: DOC_W, transform: [{ scale }], transformOrigin: 'top left' }}>
        <View
          onLayout={e => {
            const nh = e.nativeEvent.layout.height;
            if (nh > 0) setH(nh);
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const ACCENTS = ['#1F2937', '#4F46E5', '#0EA5E9', '#059669', '#DC2626', '#D97706', '#7C3AED', '#DB2777'];

// A real, scaled-down render of the template for the gallery. Fixed card width
// ⇒ constant scale; clipped height shows the distinctive header.
const PRESET_CARD_W = 142;
function PresetPreview({ vm }: { vm: InvoiceViewModel }) {
  const scale = PRESET_CARD_W / DOC_W;
  return (
    <View style={{ width: PRESET_CARD_W, height: 172, borderRadius: 6, backgroundColor: '#fff', overflow: 'hidden' }}>
      <View style={{ width: DOC_W, transform: [{ scale }], transformOrigin: 'top left' }} pointerEvents="none">
        <InvoiceDocument vm={vm} />
      </View>
    </View>
  );
}

// id → industry group id, for labelling in the theme browser.
const PRESET_GROUP_OF: Record<string, string> = {};
INVOICE_PRESET_GROUPS.forEach(g => g.presetIds.forEach(id => { PRESET_GROUP_OF[id] = g.id; }));

type DesignT = ReturnType<typeof useLang>['t']['dashboard']['settings']['invoices']['design'];

type ThemePickerProps = {
  visible: boolean;
  onClose: () => void;
  currentId: InvoicePresetId;
  onSelect: (id: InvoicePresetId) => void;
  value: InvoiceTemplateConfig;
  branding: InvoiceBranding;
  sample: InvoiceDocData;
  t: DesignT;
};

// Full-screen swipeable browser of every template — one full preview per page,
// swipe left/right to compare, tap to apply. Keeps the settings page compact.
function ThemeCarousel({ pageW, currentId, onSelect, value, branding, sample, t }: ThemePickerProps & { pageW: number }) {
  const start = Math.max(0, INVOICE_PRESET_IDS.indexOf(currentId));
  const [idx, setIdx] = useState(start);
  const activeId = INVOICE_PRESET_IDS[idx] ?? currentId;
  const isCurrent = activeId === currentId;
  return (
    <>
      <FlatList
        data={INVOICE_PRESET_IDS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
        keyExtractor={id => id}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / pageW))}
        renderItem={({ item: id }) => {
          const pvm = buildInvoiceViewModel(applyPreset(id, value), sample, branding);
          return (
            <ScrollView style={{ width: pageW }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', backgroundColor: '#fff' }}>
                <ScaledPreview><InvoiceDocument vm={pvm} /></ScaledPreview>
              </View>
            </ScrollView>
          );
        }}
      />
      <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{t.presets[activeId]}</Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
            {t.presetGroups[PRESET_GROUP_OF[activeId] ?? 'universal']}  ·  {idx + 1}/{INVOICE_PRESET_IDS.length}
          </Text>
        </View>
        <Pressable
          onPress={() => onSelect(activeId)}
          className="rounded-xl bg-primary py-3 flex-row items-center justify-center gap-2"
        >
          {isCurrent ? <Check size={18} color="#fff" /> : null}
          <Text className="text-white font-semibold">{isCurrent ? t.currentTheme : t.useTheme}</Text>
        </Pressable>
      </View>
    </>
  );
}

function ThemePickerModal(props: ThemePickerProps) {
  const { width: winW } = useWindowDimensions();
  const [w, setW] = useState(0);
  const pageW = w > 0 ? w : winW;
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>{props.t.themesTitle}</Text>
          <Pressable onPress={props.onClose} hitSlop={8}><X size={22} color="#6B7280" /></Pressable>
        </View>
        {props.visible && pageW > 0 ? <ThemeCarousel {...props} pageW={pageW} /> : null}
      </View>
    </Modal>
  );
}

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
  const [themeOpen, setThemeOpen] = useState(false);
  // Preview in the chosen default language so the labels + number prefix reflect it.
  const sample = { ...SAMPLE_INVOICE, language: value.defaultLanguage, invoiceNumber: `${invoiceNumberPrefix(value.defaultLanguage)}-0001` };
  const vm = buildInvoiceViewModel(value, sample, branding);
  const freeform = value.layoutMode === 'freeform';

  return (
    <View className="gap-5">
      {/* Default invoice language for new invoices */}
      <Field label={t.defaultLanguage}>
        <Seg<InvoiceLang>
          value={value.defaultLanguage}
          onChange={l => onChange(setDefaultLanguage(value, l))}
          options={[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
        />
        <Text className="text-xs text-gray-400">{t.defaultLanguageHint}</Text>
      </Field>

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
        {freeform ? <Text className="text-xs text-gray-400">{t.builderMobileHint}</Text> : null}
      </Field>

      {/* Template — compact button that opens the swipeable theme browser */}
      <Field label={t.preset}>
        <Pressable
          onPress={() => setThemeOpen(true)}
          className="flex-row items-center gap-3 rounded-xl border border-gray-200 bg-white p-2"
        >
          <PresetPreview vm={vm} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900">{t.presets[value.presetId]}</Text>
            <Text className="text-xs text-gray-400 mt-0.5">{t.presetGroups[PRESET_GROUP_OF[value.presetId] ?? 'universal']}</Text>
            <Text className="text-xs text-primary mt-1">{t.browseThemes}</Text>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>
      </Field>

      <ThemePickerModal
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        currentId={value.presetId}
        onSelect={id => { onChange(applyPreset(id, value)); setThemeOpen(false); }}
        value={value}
        branding={branding}
        sample={sample}
        t={t}
      />

      {/* Header style (archetype) */}
      <Field label={t.archetype}>
        <View className="flex-row flex-wrap gap-2">
          {ALL_ARCHETYPES.map(a => {
            const active = value.archetype === a;
            return (
              <Pressable
                key={a}
                onPress={() => onChange(setArchetype(value, a))}
                className={`rounded-lg border px-3 py-1.5 ${active ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
              >
                <Text className={`text-sm ${active ? 'text-white' : 'text-gray-600'}`}>{t.archetypes[a]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-xs text-gray-400">{t.archetypeHint}</Text>
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
              {!freeform ? (
                <>
                  <Pressable disabled={i === 0} onPress={() => onChange(reorderSections(value, i, i - 1))} className="p-1">
                    <ChevronUp size={16} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
                  </Pressable>
                  <Pressable disabled={i === value.sections.length - 1} onPress={() => onChange(reorderSections(value, i, i + 1))} className="p-1">
                    <ChevronDown size={16} color={i === value.sections.length - 1 ? '#D1D5DB' : '#6B7280'} />
                  </Pressable>
                </>
              ) : null}
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
            <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
          </View>
        </View>
      </Field>
    </View>
  );
}

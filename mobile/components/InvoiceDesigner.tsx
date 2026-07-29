// Structured invoice-template customizer (mobile). Edits an
// InvoiceTemplateConfig via the shared pure helpers; live preview uses the same
// InvoiceDocument renderer as the real invoice / PDF / public link.

import { useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, TextInput, Modal, FlatList, ScrollView, PanResponder, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { ChevronUp, ChevronDown, ChevronRight, X, Check } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { InvoiceDocument } from '@amixos/shared/screens/dashboard/InvoiceDocument';
import {
  INVOICE_PRESET_IDS,
  ALL_FONTS,
  RN_FONTS,
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
  setLogoInvert,
  toggleSection,
  reorderSections,
  setColumn,
  setText,
  setLayoutMode,
  invoiceNumberPrefix,
  hexToHsl,
  hslToHex,
  SAMPLE_INVOICE,
  type InvoiceTemplateConfig,
  type InvoiceViewModel,
  type InvoicePresetId,
  type InvoiceDocData,
  type InvoiceBranding,
  type InvoiceFont,
  type InvoiceDensity,
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

// A real, scaled-down render of the template. The box is a full letter-size page
// (8.5×11) so every template is the same height and reads like a printed sheet.
const PRESET_CARD_W = 142;
const PAGE_RATIO = 11 / 8.5;
function PresetPreview({ vm, width = PRESET_CARD_W }: { vm: InvoiceViewModel; width?: number }) {
  const scale = width / DOC_W;
  return (
    <View style={{ width, height: Math.round(width * PAGE_RATIO), borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' }}>
      <View style={{ width: DOC_W, transform: [{ scale }], transformOrigin: 'top left' }} pointerEvents="none">
        <InvoiceDocument vm={vm} />
      </View>
    </View>
  );
}

type DesignT = ReturnType<typeof useLang>['t']['dashboard']['settings']['invoices']['design'];

const HUE_STOPS = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'];

// A draggable gradient bar (hue or lightness). value/onChange are 0..1.
function Spectrum({ gid, stops, value, onChange }: { gid: string; stops: string[]; value: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;
  const handle = (x: number) => {
    const width = wRef.current;
    if (width > 0) cb.current(Math.max(0, Math.min(1, x / width)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => handle(e.nativeEvent.locationX),
      onPanResponderMove: e => handle(e.nativeEvent.locationX),
    }),
  ).current;
  return (
    <View
      {...pan.panHandlers}
      onLayout={e => { wRef.current = e.nativeEvent.layout.width; setW(e.nativeEvent.layout.width); }}
      style={{ height: 30, borderRadius: 15, overflow: 'hidden', justifyContent: 'center' }}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            {stops.map((c, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 4, left: Math.max(2, Math.min(w - 24, value * w - 11)), width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 }}
      />
    </View>
  );
}

// Compact touch slider (integer values in [min,max]). Mirrors Spectrum's
// measure-once + PanResponder pattern; used for the logo-size control.
function Slider({ value, min, max, onChange, color, track }: {
  value: number; min: number; max: number; onChange: (v: number) => void; color: string; track: string;
}) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const cb = useRef(onChange);
  cb.current = onChange;
  const handle = (x: number) => {
    const width = wRef.current;
    if (width > 0) {
      const t = Math.max(0, Math.min(1, x / width));
      cb.current(Math.round(min + t * (max - min)));
    }
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => handle(e.nativeEvent.locationX),
      onPanResponderMove: e => handle(e.nativeEvent.locationX),
    }),
  ).current;
  const frac = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
  return (
    <View
      {...pan.panHandlers}
      onLayout={e => { wRef.current = e.nativeEvent.layout.width; setW(e.nativeEvent.layout.width); }}
      style={{ height: 30, justifyContent: 'center' }}
    >
      <View style={{ height: 4, borderRadius: 2, backgroundColor: track }} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 13, left: 0, width: Math.max(0, frac * w), height: 4, borderRadius: 2, backgroundColor: color }} />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 4, left: Math.max(0, Math.min(w - 22, frac * w - 11)), width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 3, borderColor: color, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 }}
      />
    </View>
  );
}

// Native font family for previewing a font choice in the picker (matches the
// renderer's mapping; null/undefined ⇒ system font).
function fontFamilyFor(f: InvoiceFont): string | undefined {
  const def = RN_FONTS[f];
  if (!def) return undefined;
  return Platform.select({ ios: def.ios, android: def.android, default: def.android });
}

// Font picker as a dropdown (more options than fit in a segmented control).
function FontDropdown({ value, onChange, t }: { value: InvoiceFont; onChange: (f: InvoiceFont) => void; t: DesignT }) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
        <Text className="text-sm text-ink" style={{ fontFamily: fontFamilyFor(value) }}>{t.fonts[value]}</Text>
        <ChevronDown size={18} color={c.faint} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 bg-black/40 justify-center px-8">
          <Pressable onPress={() => {}} className="bg-card rounded-2xl overflow-hidden" style={{ maxHeight: '75%' }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ALL_FONTS.map(f => (
                <Pressable key={f} onPress={() => { onChange(f); setOpen(false); }} className={`px-4 py-3 border-b border-border-soft ${value === f ? 'bg-primary/10' : ''}`}>
                  <Text className={`text-base ${value === f ? 'text-primary font-semibold' : 'text-ink'}`} style={{ fontFamily: fontFamilyFor(f) }}>{t.fonts[f]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Swatches for quick picks + hue/lightness spectrums for any color.
function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { h, s, l } = hexToHsl(value);
  const sat = Math.max(45, s);
  const lt = Math.min(80, Math.max(22, l));
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {ACCENTS.map(c => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            className={`w-8 h-8 rounded-full ${value.toLowerCase() === c.toLowerCase() ? 'border-2 border-gray-900' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </View>
      <Spectrum gid="cp-hue" stops={HUE_STOPS} value={h / 360} onChange={v => onChange(hslToHex(Math.round(v * 360), sat, lt))} />
      <Spectrum gid="cp-lum" stops={[hslToHex(h, sat, 24), hslToHex(h, sat, 52), hslToHex(h, sat, 82)]} value={(lt - 22) / 58} onChange={v => onChange(hslToHex(h, sat, Math.round(22 + v * 58)))} />
      <View className="flex-row items-center gap-2">
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: value, borderWidth: 1, borderColor: '#E5E7EB' }} />
        <Text className="text-xs text-faint">{value.toUpperCase()}</Text>
      </View>
    </View>
  );
}

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
            <ScrollView style={{ width: pageW }} contentContainerStyle={{ padding: 20, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
              <PresetPreview vm={pvm} width={pageW - 40} />
            </ScrollView>
          );
        }}
      />
      <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{t.presets[activeId]}</Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{idx + 1}/{INVOICE_PRESET_IDS.length}</Text>
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
  const c = useThemeColors();
  const { width: winW } = useWindowDimensions();
  const [w, setW] = useState(0);
  const pageW = w > 0 ? w : winW;
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>{props.t.themesTitle}</Text>
          <Pressable onPress={props.onClose} hitSlop={8}><X size={22} color={c.muted} /></Pressable>
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
    <View className="flex-row rounded-xl border border-border overflow-hidden self-start">
      {options.map(o => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`px-3 py-2 ${value === o.value ? 'bg-primary' : 'bg-card'}`}
        >
          <Text className={`text-sm ${value === o.value ? 'text-white' : 'text-muted'}`}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      {children}
    </View>
  );
}

export function InvoiceDesigner({
  value,
  onChange,
  branding,
  customFields = [],
  onSwitchMode,
}: {
  value: InvoiceTemplateConfig;
  onChange: (c: InvoiceTemplateConfig) => void;
  branding: InvoiceBranding;
  customFields?: { key: string; label: string }[];
  onSwitchMode?: (m: InvoiceLayoutMode) => void;
}) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.settings.invoices.design;
  const [themeOpen, setThemeOpen] = useState(false);
  const [secOpen, setSecOpen] = useState(false);
  // Preview in the chosen default language so the labels + number prefix reflect it.
  const sample = {
    ...SAMPLE_INVOICE,
    language: value.defaultLanguage,
    invoiceNumber: `${invoiceNumberPrefix(value.defaultLanguage)}-0001`,
    ...(customFields.length ? { customFields: customFields.map(c => ({ key: c.key, label: c.label, value: 'Ejemplo' })) } : {}),
  };
  const vm = buildInvoiceViewModel(value, sample, branding);
  const freeform = value.layoutMode === 'freeform';

  return (
    <View className="gap-5">
      {/* Live preview up top so changes are visible immediately */}
      <Field label={t.preview}>
        <View className="rounded-xl border border-border bg-surface p-2">
          <View className="bg-card rounded-lg border border-border-soft overflow-hidden">
            <ScaledPreview><InvoiceDocument vm={vm} /></ScaledPreview>
          </View>
        </View>
      </Field>

      {/* Default language control moved to Ajustes → Facturas (main card). */}

      {/* Layout mode */}
      <Field label={t.layout}>
        <Seg<InvoiceLayoutMode>
          value={freeform ? 'freeform' : 'flow'}
          onChange={m => { if (onSwitchMode) onSwitchMode(m); else onChange(setLayoutMode(value, m)); }}
          options={[
            { value: 'flow', label: t.layoutModes.structured },
            { value: 'freeform', label: t.layoutModes.freeform },
          ]}
        />
        {freeform ? <Text className="text-xs text-faint">{t.builderMobileHint}</Text> : null}
      </Field>

      {/* Template — compact button that opens the swipeable theme browser.
          Presets only apply to the Structured layout, so hide it in Freeform. */}
      {!freeform ? (
        <>
          <Field label={t.preset}>
            <Pressable
              onPress={() => setThemeOpen(true)}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink">{t.presets[value.presetId]}</Text>
                <Text className="text-xs text-primary mt-1">{t.browseThemes}</Text>
              </View>
              <ChevronRight size={20} color={c.faint} />
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
        </>
      ) : null}

      {/* Accent — swatches + spectrum picker for any color */}
      <Field label={t.accent}>
        <ColorPicker value={value.accentColor} onChange={c => onChange(setAccent(value, c))} />
      </Field>

      <Field label={t.font}>
        <FontDropdown value={value.font} onChange={f => onChange(setFont(value, f))} t={t} />
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
            <View className={`w-5 h-5 rounded border items-center justify-center ${value.showLogo ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
              {value.showLogo ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
            </View>
            <Text className="text-sm text-muted">{t.showLogo}</Text>
          </Pressable>
          {value.showLogo ? (
            <View className="flex-row items-center gap-3">
              <Text className="text-sm text-muted">{t.logoSize}</Text>
              <View className="flex-1">
                <Slider
                  value={effectiveLogoPx(value)}
                  min={LOGO_PX_MIN}
                  max={LOGO_PX_MAX}
                  onChange={px => onChange(setLogoPx(value, px))}
                  color={c.primary}
                  track={c.border}
                />
              </View>
              <Text className="text-xs text-muted w-10 text-right">{effectiveLogoPx(value)}px</Text>
            </View>
          ) : null}
          {value.showLogo ? (
            <Pressable onPress={() => onChange(setLogoInvert(value, value.logoInvert !== true))} className="flex-row items-center gap-2">
              <View className={`w-5 h-5 rounded border items-center justify-center ${value.logoInvert ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                {value.logoInvert ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
              </View>
              <Text className="text-sm text-muted">{t.invertLogo}</Text>
            </Pressable>
          ) : null}
        </View>
      </Field>

      {/* Columns */}
      <Field label={t.columns}>
        <View className="flex-row gap-4">
          {(['qty', 'rate', 'total'] as (keyof InvoiceColumns)[]).map(col => (
            <Pressable key={col} onPress={() => onChange(setColumn(value, col, !value.columns[col]))} className="flex-row items-center gap-2">
              <View className={`w-5 h-5 rounded border items-center justify-center ${value.columns[col] ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                {value.columns[col] ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
              </View>
              <Text className="text-sm text-muted">{t.columnNames[col]}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      {/* Sections — collapsible to keep the editor compact */}
      <View className="gap-2">
        <Pressable onPress={() => setSecOpen(o => !o)} className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-ink">{t.sections}</Text>
          {secOpen ? <ChevronUp size={18} color={c.muted} /> : <ChevronDown size={18} color={c.muted} />}
        </Pressable>
        {secOpen ? (
          <View className="gap-1.5">
            {value.sections.map((s, i) => (
              <View key={s.id} className="flex-row items-center gap-2 rounded-lg border border-border-soft px-3 py-1.5">
                <Pressable onPress={() => onChange(toggleSection(value, s.id))} className={`w-5 h-5 rounded border items-center justify-center ${s.show ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                  {s.show ? <Text className="text-white text-[10px] font-bold">✓</Text> : null}
                </Pressable>
                <Text className="text-sm text-ink flex-1">{t.sectionNames[s.id]}</Text>
                {!freeform ? (
                  <>
                    <Pressable disabled={i === 0} onPress={() => onChange(reorderSections(value, i, i - 1))} className="p-1">
                      <ChevronUp size={16} color={i === 0 ? c.faint : c.muted} />
                    </Pressable>
                    <Pressable disabled={i === value.sections.length - 1} onPress={() => onChange(reorderSections(value, i, i + 1))} className="p-1">
                      <ChevronDown size={16} color={i === value.sections.length - 1 ? c.faint : c.muted} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Text blocks */}
      <Field label={t.textBlocks}>
        <View className="gap-3">
          {/* headerNote removed — the per-invoice Notes field covers this; a
              separate theme-level header note was redundant. */}
          {([
            ['paymentInstructions', t.paymentInstructionsField],
            ['footer', t.footerField],
          ] as [keyof InvoiceTextBlocks, string][]).map(([key, label]) => (
            <View key={key} className="gap-1">
              <Text className="text-xs text-muted">{label}</Text>
              <TextInput
                multiline
                value={value.text[key] ?? ''}
                onChangeText={txt => onChange(setText(value, key, txt))}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                style={{ minHeight: 52, textAlignVertical: 'top' }}
              />
            </View>
          ))}
        </View>
      </Field>
    </View>
  );
}

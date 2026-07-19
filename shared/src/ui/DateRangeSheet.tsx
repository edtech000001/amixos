import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatePicker } from './DatePicker';
import type { DateRangePreset } from '../lib/dateRangePresets';

interface Props {
  open: boolean;
  onClose: () => void;
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null }) => void;
  title: string;
  fromLabel: string;
  toLabel: string;
  clearLabel: string;
  applyLabel: string;
  /**
   * Optional quick-fill presets (Hoy / Ayer / Últimos N días) rendered as a
   * chip row above the pickers — build with buildDateRangePresets so web and
   * mobile offer the identical set.
   */
  presets?: DateRangePreset[];
}

/**
 * One-hand-friendly bottom sheet for a date range (mirrors the jobs sort/group
 * sheet). Rendered as an ABSOLUTE OVERLAY rather than an RN <Modal> on purpose:
 * the DatePicker inside opens its OWN iOS modal, and iOS only presents one modal
 * at a time — nesting it in a sheet-modal silently fails (the picker won't show).
 * As an overlay, the DatePicker's modal is the only one, so it works. Place it at
 * the screen ROOT (sibling of the ScrollView) so it covers the whole screen.
 */
export function DateRangeSheet({
  open,
  onClose,
  from,
  to,
  onChange,
  title,
  fromLabel,
  toLabel,
  clearLabel,
  applyLabel,
  presets,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!open) return null;
  const active = !!from || !!to;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} className="justify-end">
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} className="bg-black/40" />
      <View
        className="bg-card rounded-t-3xl px-5 pt-3"
        // Clear the floating dock so the buttons stay tappable.
        style={{ paddingBottom: insets.bottom + 96 }}
      >
        <View className="items-center mb-3">
          <View className="w-10 h-1 rounded-full bg-border" />
        </View>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-ink">{title}</Text>
          {/* Clear sits where Done used to be; disabled when nothing is set. */}
          <Pressable onPress={() => onChange({ from: null, to: null })} disabled={!active} hitSlop={8}>
            <Text className={`text-sm font-semibold ${active ? 'text-red-500' : 'text-faint'}`}>
              {clearLabel}
            </Text>
          </Pressable>
        </View>

        {/* Quick presets — own row above the pickers (mirrors the web modal).
           The chip matching the current range renders selected. */}
        {presets?.length ? (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {presets.map(p => {
              const selected = from === p.from && to === p.to;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => onChange({ from: p.from, to: p.to })}
                  className={`px-3.5 py-1.5 rounded-full border ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                >
                  <Text className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-muted'}`}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View className="gap-3">
          <DatePicker label={fromLabel} value={from ?? ''} onChange={v => onChange({ from: v || null, to })} />
          <DatePicker label={toLabel} value={to ?? ''} onChange={v => onChange({ from, to: v || null })} />
        </View>

        {/* Primary action — applying is just closing (filtering is live). */}
        <Pressable
          onPress={onClose}
          className="mt-4 py-3.5 rounded-2xl bg-primary items-center active:opacity-90"
        >
          <Text className="text-sm font-semibold text-white">{applyLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

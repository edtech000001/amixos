import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatePicker } from './DatePicker';

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
}: Props) {
  const insets = useSafeAreaInsets();
  if (!open) return null;
  const active = !!from || !!to;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} className="justify-end">
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} className="bg-black/40" />
      <View
        className="bg-white rounded-t-3xl px-5 pt-3"
        // Clear the floating dock so the buttons stay tappable.
        style={{ paddingBottom: insets.bottom + 96 }}
      >
        <View className="items-center mb-3">
          <View className="w-10 h-1 rounded-full bg-gray-200" />
        </View>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-gray-900">{title}</Text>
          {/* Clear sits where Done used to be; disabled when nothing is set. */}
          <Pressable onPress={() => onChange({ from: null, to: null })} disabled={!active} hitSlop={8}>
            <Text className={`text-sm font-semibold ${active ? 'text-red-500' : 'text-gray-300'}`}>
              {clearLabel}
            </Text>
          </Pressable>
        </View>

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

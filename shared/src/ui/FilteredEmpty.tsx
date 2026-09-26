// Empty-list state for when FILTERS (search, tabs, status, dates, category…)
// hide everything. A blank list with just "Sin resultados" reads as a broken
// app, so this says why and puts a one-tap "Limpiar filtros" where the eye
// already is. Web twin: FilteredEmpty.web.tsx.
//
// `onClear` must reset only filters that HIDE rows — never sort or grouping,
// which only reorder and so can't be why the list is empty.

import type { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { XCircle } from 'lucide-react-native';
import { useLang } from '../i18n';

export interface FilteredEmptyProps {
  onClear: () => void;
  /** Leading icon (the screen's own empty-state glyph). */
  icon?: ReactNode;
  /** Override the "Sin resultados." line. */
  title?: string;
  /** Tighter vertical padding for inline use (inside cards/sections). */
  compact?: boolean;
}

export function FilteredEmpty({ onClear, icon, title, compact }: FilteredEmptyProps) {
  const { t } = useLang();
  const f = t.common.filteredEmpty;
  return (
    <View className={`items-center px-6 ${compact ? 'py-8' : 'py-20'}`}>
      {icon}
      <Text className={`text-sm text-faint ${icon ? 'mt-3' : ''}`}>{title ?? f.title}</Text>
      <Text className="text-xs text-muted mt-1 text-center">{f.hint}</Text>
      <Pressable
        onPress={onClear}
        className="mt-4 flex-row items-center gap-2 px-5 py-3 rounded-xl bg-primary active:opacity-80"
      >
        <XCircle size={16} color="#FFFFFF" />
        <Text className="text-white text-sm font-semibold">{f.clear}</Text>
      </Pressable>
    </View>
  );
}

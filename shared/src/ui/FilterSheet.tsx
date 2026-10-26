import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, BackHandler, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, SlidersHorizontal, ChevronDown, Search } from 'lucide-react-native';
import { DatePicker } from './DatePicker';
import { SHEET_BACKDROP } from './sheetBackdrop';
import { useThemeColors } from '../theme';
import type { DateRangePreset } from '../lib/dateRangePresets';

type Icon = typeof Check;

// Lift for the selected segment / chip — NativeWind's shadow classes don't
// render reliably on native, so it's a plain style.
const LIFT = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
};

/**
 * The list screens' one "Filters" sheet: sort, group, date and quick filters
 * in one place (invoices + jobs). Filtering is live — the footer button just
 * closes, labelled with the current result count.
 *
 * An ABSOLUTE OVERLAY, not an RN <Modal>: it holds DatePickers, which open
 * their own iOS modal, and iOS presents only one modal at a time (same reason
 * as DateRangeSheet). Render it at the screen ROOT so it covers the screen.
 */
export function FilterSheet({
  open,
  onClose,
  title,
  resetLabel,
  onReset,
  canReset,
  showLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  resetLabel: string;
  onReset: () => void;
  canReset: boolean;
  /** Footer button, e.g. "Show 24 results". */
  showLabel: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Android back closes the sheet instead of leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);
  if (!open) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} className="justify-end">
      <Pressable onPress={onClose} style={SHEET_BACKDROP} />
      <View
        className="bg-card rounded-t-3xl"
        // Clear the floating dock so the footer stays tappable.
        style={{ maxHeight: '92%', paddingBottom: insets.bottom + 96 }}
      >
        <View className="items-center pt-3 mb-2">
          <View className="w-10 h-1 rounded-full bg-border" />
        </View>
        <View className="flex-row items-center justify-between px-5 mb-1">
          <Text className="text-2xl font-bold text-ink">{title}</Text>
          <Pressable
            onPress={onReset}
            disabled={!canReset}
            className={`px-4 h-9 rounded-full border items-center justify-center ${canReset ? 'border-border active:bg-surface' : 'border-border-soft'}`}
          >
            <Text className={`text-sm font-semibold ${canReset ? 'text-ink' : 'text-faint'}`}>{resetLabel}</Text>
          </Pressable>
        </View>
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        <View className="px-5 pt-3 border-t border-border-soft">
          <Pressable onPress={onClose} className="h-14 rounded-2xl bg-primary items-center justify-center active:opacity-90">
            <Text className="text-base font-semibold text-white">{showLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** A titled block inside the sheet. `right` = an aside (e.g. a caption). */
export function FilterSection({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View className="mt-5">
      <View className="flex-row items-center justify-between mb-2.5">
        <Text className="text-sm font-semibold text-muted">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Rounded segmented switch — the selected option is a lifted card. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; Icon?: Icon }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const c = useThemeColors();
  return (
    <View className="flex-row p-1 rounded-2xl bg-border-soft">
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            className={`flex-1 h-10 flex-row gap-1.5 rounded-xl items-center justify-center ${on ? 'bg-card' : ''}`}
            style={on ? LIFT : undefined}
          >
            {o.Icon ? <o.Icon size={15} color={on ? c.ink : c.faint} /> : null}
            <Text className={`text-sm ${on ? 'text-ink font-semibold' : 'text-muted'}`} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Pill chip. `check` (multi-select toggles) shows a filled check when on;
 * `leading` overrides the leading icon (e.g. a sort's ↑/↓ arrow).
 */
export function FilterChip({
  label,
  on,
  onPress,
  Icon,
  check,
  leading,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  Icon?: Icon;
  check?: boolean;
  leading?: ReactNode;
}) {
  const c = useThemeColors();
  const lead = leading ?? (check && on ? (
    <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
      <Check size={12} color="#FFFFFF" strokeWidth={3} />
    </View>
  ) : Icon ? <Icon size={15} color={on ? c.primary : c.muted} /> : null);
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-2 h-10 rounded-full border ${lead ? 'pl-2.5 pr-4' : 'px-4'} ${
        on ? 'border-primary bg-primary/10' : 'border-border bg-card active:bg-surface'
      }`}
      style={on ? LIFT : undefined}
    >
      {lead}
      <Text className={`text-sm ${on ? 'text-primary font-semibold' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export function ChipWrap({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

/** Preset chips + From/To pickers side by side. */
export function DateRangeFields({
  presets,
  from,
  to,
  onChange,
  fromLabel,
  toLabel,
}: {
  presets: DateRangePreset[];
  from: string | null;
  to: string | null;
  onChange: (next: { from: string | null; to: string | null; preset?: DateRangePreset }) => void;
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <View className="gap-3">
      <ChipWrap>
        {presets.map(p => (
          <FilterChip
            key={p.key}
            label={p.label}
            on={from === p.from && to === p.to}
            // Tapping the selected preset again clears it.
            onPress={() => (from === p.from && to === p.to
              ? onChange({ from: null, to: null })
              : onChange({ from: p.from, to: p.to, preset: p }))}
          />
        ))}
      </ChipWrap>
      <View className="flex-row gap-3">
        <DatePicker containerClassName="flex-1" label={fromLabel} value={from ?? ''} onChange={v => onChange({ from: v || null, to })} />
        <DatePicker containerClassName="flex-1" label={toLabel} value={to ?? ''} onChange={v => onChange({ from, to: v || null })} />
      </View>
    </View>
  );
}

/** Header button that opens the sheet; badge = number of active filters. */
export function FilterButton({ count, onPress, label }: { count: number; onPress: () => void; label: string }) {
  const c = useThemeColors();
  const on = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
        on ? 'bg-primary/10 border-primary' : 'bg-card border-border'
      }`}
    >
      <SlidersHorizontal size={16} color={on ? c.primary : c.muted} />
      {on ? (
        <View className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary items-center justify-center">
          <Text className="text-[10px] font-bold text-white">{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** "Show N results" from the common filters dict. */
export function showResultsLabel(t: { show: string; showOne: string; showNone: string }, n: number | null | undefined): string {
  if (n == null) return t.show.replace('{{count}}', '…');
  if (n === 0) return t.showNone;
  if (n === 1) return t.showOne;
  return t.show.replace('{{count}}', n.toLocaleString());
}

/**
 * A field whose values load on demand (jobs field filters): collapsed it shows
 * the field name + what's picked; tap to expand → values with counts as check
 * chips (search once there are many). Values load on first expand.
 */
export function AsyncValuesSection({
  title,
  picked,
  load,
  labelOf,
  onToggle,
  labels,
}: {
  title: string;
  /** Picked values (+ labels saved with them). */
  picked: { v: string; l: string }[];
  load: () => Promise<{ value: string; label: string; count: number }[]>;
  /** Display label for a value (handles '' / translations). */
  labelOf: (value: string, label: string) => string;
  onToggle: (value: string, label: string) => void;
  labels: { loading: string; none: string; search: string; more: (n: number) => string };
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(picked.length > 0);
  const [values, setValues] = useState<{ value: string; label: string; count: number }[] | null>(null);
  // The load error's text, shown instead of "no values" (see the web twin).
  const [failed, setFailed] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open || values) return;
    let active = true;
    load().then(v => { if (active) setValues(v); }).catch((e: unknown) => {
      if (active) setFailed(e instanceof Error ? e.message : String(e));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pickedSet = new Set(picked.map(p => p.v));
  const LIMIT = 12;
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtered = (values ?? []).filter(v => !q.trim() || norm(labelOf(v.value, v.label)).includes(norm(q.trim())));
  const shown = showAll || q.trim() ? filtered : filtered.slice(0, LIMIT);
  return (
    <View className="mt-5">
      <Pressable onPress={() => setOpen(o => !o)} className="flex-row items-center gap-2 py-1 active:opacity-70">
        <Text className={`text-sm font-semibold ${picked.length ? 'text-primary' : 'text-muted'}`}>{title}</Text>
        {picked.length ? (
          <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary items-center justify-center">
            <Text className="text-[10px] font-bold text-white">{picked.length}</Text>
          </View>
        ) : null}
        <View className="flex-1" />
        {!open && picked.length ? (
          <Text className="text-xs text-muted max-w-[55%]" numberOfLines={1}>{picked.map(p => labelOf(p.v, p.l)).join(', ')}</Text>
        ) : null}
        <ChevronDown size={16} color={c.faint} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>
      {open ? (
        <View className="mt-2.5">
          {values === null ? (
            failed ? <Text className="text-xs text-red-500">{failed}</Text> : (
              <View className="flex-row items-center gap-2 py-2">
                <ActivityIndicator size="small" color={c.primary} />
                <Text className="text-xs text-faint">{labels.loading}</Text>
              </View>
            )
          ) : values.length === 0 ? (
            <Text className="text-xs text-faint">{labels.none}</Text>
          ) : (
            <>
              {values.length > LIMIT ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 mb-2.5">
                  <Search size={14} color={c.faint} />
                  <TextInput value={q} onChangeText={setQ} placeholder={labels.search} placeholderTextColor={c.faint}
                    autoCapitalize="none" autoCorrect={false} className="flex-1 py-2 text-ink" style={{ fontSize: 14 }} />
                </View>
              ) : null}
              <ChipWrap>
                {shown.map(v => (
                  <FilterChip
                    key={v.value || '(empty)'}
                    check
                    label={`${labelOf(v.value, v.label)} · ${v.count}`}
                    on={pickedSet.has(v.value)}
                    onPress={() => onToggle(v.value, v.label)}
                  />
                ))}
                {!showAll && !q.trim() && filtered.length > LIMIT ? (
                  <FilterChip label={labels.more(filtered.length - LIMIT)} on={false} onPress={() => setShowAll(true)} />
                ) : null}
              </ChipWrap>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

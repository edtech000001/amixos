// Payroll history → Compare: one worker (or everyone) month by month, each
// month vs the month before and the same month last year; or year over year.
// Web twin: PayrollCompare.web.tsx — keep both in sync.

import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { payrollByMonth, monthRows, yearRows, pctChange, payrollWorkers, type CompareRow } from '../../lib/payrollCompare';
import type { PayrollHistoryEntry } from './PayrollHistoryScreen';
import { Select } from '../../ui/Select';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const delta = (cur: number, prev: number) => {
  const p = pctChange(cur, prev);
  return p === null ? '—' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%`;
};

export function PayrollCompare({ entries }: { entries: PayrollHistoryEntry[] }) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.reports.payroll.compare;
  const dateLocale = full.dashboard.dateLocale;
  const workers = useMemo(() => payrollWorkers(entries), [entries]);
  const [worker, setWorker] = useState<string | null>(null);
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const byMonth = useMemo(() => payrollByMonth(entries, worker), [entries, worker]);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const nowKey = new Date().toISOString().slice(0, 7);

  // Month view: hide months still ahead this year; newest first.
  const rows: CompareRow[] = mode === 'month'
    ? monthRows(byMonth, year).filter(r => r.key <= nowKey).reverse()
    : yearRows(byMonth);
  const max = Math.max(1, ...rows.map(r => r.cur.gross));
  const yearCur = monthRows(byMonth, year).reduce((s, r) => s + r.cur.gross, 0);
  const yearPrev = monthRows(byMonth, year).reduce((s, r) => s + r.prevYear.gross, 0);
  const label = (r: CompareRow) => mode === 'year' ? r.key
    : new Date(`${r.key}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'long' });

  return (
    <ScrollView contentContainerClassName="px-5 py-4 pb-24">
      <Select
        value={worker ?? ''}
        onValueChange={v => setWorker(v || null)}
        options={[{ value: '', label: t.all }, ...workers.map(w => ({ value: w.id, label: w.name }))]}
        searchable
        searchPlaceholder={t.searchWorker}
        searchEmptyText={t.noMatch}
        containerClassName="mb-3"
      />

      <View className="flex-row gap-2 mb-3">
        {(['month', 'year'] as const).map(m => (
          <Pressable key={m} onPress={() => setMode(m)}
            className={`flex-1 py-2 rounded-xl border items-center ${mode === m ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
            <Text className={`text-sm font-semibold ${mode === m ? 'text-white' : 'text-muted'}`}>{m === 'month' ? t.monthly : t.yearly}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'month' ? (
        <View className="flex-row items-center justify-between bg-card rounded-2xl border border-border-soft shadow-sm px-4 py-3 mb-3">
          <Pressable onPress={() => setYear(y => y - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={String(year - 1)}>
            <ChevronLeft size={20} color={c.muted} />
          </Pressable>
          <View className="items-center">
            <Text className="text-xs text-faint">{t.yearTotal} {year}</Text>
            <Text className="text-xl font-bold text-primary tabular-nums">{fmt(yearCur)}</Text>
            <Text className="text-xs text-muted">{delta(yearCur, yearPrev)} {t.vsPrevYear} ({fmt(yearPrev)})</Text>
          </View>
          <Pressable onPress={() => setYear(y => Math.min(thisYear, y + 1))} disabled={year >= thisYear} hitSlop={10}
            accessibilityRole="button" accessibilityLabel={String(year + 1)} style={{ opacity: year >= thisYear ? 0.3 : 1 }}>
            <ChevronRight size={20} color={c.muted} />
          </Pressable>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text className="text-sm text-faint text-center py-12">{t.empty}</Text>
      ) : (
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
          {rows.map((r, i) => (
            <View key={r.key} className={`px-4 py-3 ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-ink capitalize">{label(r)}</Text>
                <Text className="text-sm font-bold text-ink tabular-nums">{fmt(r.cur.gross)}</Text>
              </View>
              <View className="h-1.5 rounded-full bg-surface mt-1.5 overflow-hidden">
                <View className="h-full rounded-full bg-primary" style={{ width: `${(r.cur.gross / max) * 100}%` }} />
              </View>
              <Text className="text-xs text-faint mt-1.5">
                {Math.round(r.cur.hours * 100) / 100} h
                {mode === 'month' ? ` · ${delta(r.cur.gross, r.prev.gross)} ${t.vsPrevMonth}` : ''}
                {` · ${delta(r.cur.gross, r.prevYear.gross)} ${t.vsPrevYear} (${fmt(r.prevYear.gross)})`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// Payment history — its own screen (grew out of the Payroll sheet): every
// saved payroll check, grouped by pay period, newest first. These are the
// PERMANENT records (immune to job edits/deletes) — the screen is the audit
// trail and the landing spot for future features (filters, export…).

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useLang } from '../../i18n';

export interface PayrollHistoryEntry {
  periodStart: string;
  periodEnd: string;
  name: string;
  hours: number;
  driverHours: number;
  bonus: number | null;
  grossPay: number;
  method: string;
  checkNumber: string | null;
  paidAt: string | null;
  /** Formula job-field counts this check paid for (label → number). */
  components?: Record<string, number> | null;
}

export interface PayrollHistoryScreenProps {
  loading: boolean;
  entries: PayrollHistoryEntry[];
  onBack: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function PayrollHistoryScreen({ loading, entries, onBack }: PayrollHistoryScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports.payroll;
  const dateLocale = full.dashboard.dateLocale;
  const fmtDay = (d: string) =>
    new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
  const methodLabel: Record<string, string> = {
    cash: t.methodCash,
    check: t.methodCheck,
    wire: t.methodWire,
  };
  const componentsText = (c: Record<string, number> | null | undefined) =>
    c ? Object.entries(c).filter(([, v]) => v).map(([l, v]) => `${v} × ${l}`).join(' · ') : '';

  const groups = useMemo(() => {
    const by = new Map<string, PayrollHistoryEntry[]>();
    entries.forEach(h => {
      const list = by.get(h.periodStart) ?? [];
      list.push(h);
      by.set(h.periodStart, list);
    });
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100 bg-white">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-base font-semibold text-gray-900">{t.historyTitle}</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4F46E5" />
        </View>
      ) : groups.length === 0 ? (
        <Text className="text-sm text-gray-400 text-center py-16 px-6">{t.historyEmpty}</Text>
      ) : (
        <ScrollView contentContainerClassName="px-5 py-5 pb-24">
          {groups.map(([periodStart, list]) => (
            <View key={periodStart} className="mb-5">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm font-semibold text-gray-600">
                  {fmtDay(periodStart)} – {fmtDay(list[0].periodEnd)}
                </Text>
                <Text className="text-sm font-bold text-gray-800">
                  {fmt(list.reduce((sum, e) => sum + e.grossPay, 0))}
                </Text>
              </View>
              <View className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {list.map((h, i) => (
                  <View key={`${h.name}-${i}`} className={`px-4 py-3 flex-row items-center gap-3 ${i < list.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{h.name}</Text>
                      <Text className="text-xs text-gray-400">
                        {Math.round(h.hours * 100) / 100} h
                        {h.driverHours > 0 ? ` · ${Math.round(h.driverHours * 100) / 100} h ${t.driveShort}` : ''}
                        {h.bonus ? ` · ${t.historyBonus} ${fmt(h.bonus)}` : ''}
                        {' · '}
                        {h.method === 'check' && h.checkNumber ? `${t.checkPrefix}${h.checkNumber}` : (methodLabel[h.method] ?? h.method)}
                        {h.paidAt ? ` · ${fmtDay(h.paidAt)}` : ''}
                        {componentsText(h.components) ? ` · ${componentsText(h.components)}` : ''}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-900">{fmt(h.grossPay)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

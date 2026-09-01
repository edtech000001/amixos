// Jobs-list summary (native) — totals for every job matching the current
// filters, not just the loaded page (jobs_summary RPC, migration 210).
//
// Presentational only; the caller fetches and computes. Mirrors
// JobsSummarySheet.web.tsx exactly so the two platforms report the same
// numbers.

import { View, Text, Pressable, ScrollView, Modal as RNModal, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import type { JobsSummaryTotals } from '../../lib/jobsSummary';

export interface JobsSummarySheetProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  /** null + !loading = the tab selection can't be summarized server-side. */
  totals: JobsSummaryTotals | null;
  filtered: boolean;
  statusLabels: Record<string, string>;
  formatMoney: (n: number) => string;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4 py-2.5 border-b border-border-soft">
      <Text className="text-sm text-muted flex-1">{label}</Text>
      <Text className={`text-sm font-semibold ${muted ? 'text-muted' : 'text-ink'}`}>{value}</Text>
    </View>
  );
}

export function JobsSummarySheet({
  open, onClose, loading, totals, filtered, statusLabels, formatMoney,
}: JobsSummarySheetProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.jobs.summary;
  const hours = (n: number) => `${Math.round(n * 10) / 10} h`;

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop is an absolute FIRST child and the card a plain sibling, per
          the sheet contract in CLAUDE.md — nesting the card inside the
          backdrop Pressable breaks ScrollView dragging. */}
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />
        <View className="bg-card rounded-t-3xl pt-3 pb-10" style={{ maxHeight: '85%' }}>
          <View className="items-center pb-2"><View className="w-10 h-1 bg-border rounded-full" /></View>

          <View className="flex-row items-start justify-between px-5 pb-3 border-b border-border-soft">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-ink">{t.title}</Text>
              <Text className="text-xs text-muted mt-0.5">
                {filtered ? t.subtitleFiltered : t.subtitleAll}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} className="p-1 -mr-1 active:opacity-60">
              <X size={22} color={c.faint} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            {loading ? (
              <View className="py-10 items-center"><ActivityIndicator color={c.primary} /></View>
            ) : !totals ? (
              <Text className="text-sm text-muted py-4">{t.unavailable}</Text>
            ) : totals.jobCount === 0 ? (
              <Text className="text-sm text-muted py-4">{t.empty}</Text>
            ) : (
              <>
                <View className="flex-row items-baseline">
                  <Text className="text-3xl font-black text-ink">{totals.jobCount}</Text>
                  <Text className="text-sm text-muted ml-2">{t.jobs}</Text>
                </View>

                <View className="mt-4">
                  <Row label={t.totalValue} value={formatMoney(totals.totalAmount)} />
                  {totals.avgAmount != null ? (
                    <Row label={t.avgPerJob} value={formatMoney(totals.avgAmount)} />
                  ) : null}
                  <Row label={t.crewHours} value={hours(totals.totalHours)} />
                  {totals.totalDriverHours > 0 ? (
                    <Row label={t.driverHours} value={hours(totals.totalDriverHours)} />
                  ) : null}
                </View>
                <Text className="text-[11px] text-faint mt-2">{t.moneyNote}</Text>

                {/* Absent (not zeroed) for roles that can't see pay data. */}
                {totals.estimatedPayroll != null ? (
                  <View className="mt-5">
                    <Row label={t.estPayroll} value={formatMoney(totals.estimatedPayroll)} />
                    <Row label={t.workers} value={String(totals.workerCount ?? 0)} muted />
                    <Text className="text-[11px] text-faint mt-2">{t.payrollNote}</Text>
                    {totals.salariedCount ? (
                      <Text className="text-[11px] text-amber-600 mt-1">
                        {t.salariedNote.replace('{{count}}', String(totals.salariedCount))}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {totals.byStatus.length > 0 ? (
                  <View className="mt-5">
                    <Text className="text-xs font-bold text-faint uppercase tracking-wide mb-1">{t.byStatus}</Text>
                    {totals.byStatus.map((r) => (
                      <Row key={r.status} label={statusLabels[r.status] ?? r.status} value={String(r.count)} />
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

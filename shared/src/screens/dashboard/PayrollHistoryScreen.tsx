// Payment history — its own screen (grew out of the Payroll sheet): every
// saved payroll check, grouped by pay period, newest first. These are the
// PERMANENT records (immune to job edits/deletes) — the screen is the audit
// trail and the landing spot for future features (filters, export…).

import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Alert, Modal as RNModal } from 'react-native';
import { ChevronLeft, Search, Check, Trash2, Calendar, X, Wrench, Truck, Clock } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import type { PayrollBreakdown } from '../../lib/payroll';

export interface PayrollHistoryEntry {
  id: string;
  employeeId: string | null;
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
  /** Pay-time hours-breakdown snapshot (136). Null on old records/imports. */
  breakdown?: PayrollBreakdown | null;
}

export interface PayrollHistoryScreenProps {
  loading: boolean;
  entries: PayrollHistoryEntry[];
  onBack: () => void;
  /** Bulk delete (admin) — the page reloads entries afterwards. */
  onDeleteEntries?: (ids: string[]) => void | Promise<void>;
  /** Business payroll settings — enables the this/last pay-period presets. */
  payPeriod?: { frequency: unknown; anchorDate: unknown };
  /** Loads the hours breakdown (jobs/timesheets of the record's period) for
   *  the in-place detail sheet — same content as the live Payroll view. */
  onLoadBreakdown?: (entry: PayrollHistoryEntry) => Promise<PayrollBreakdown | null>;
  /** Opens a job from the breakdown's job list. */
  onJobPress?: (jobId: string) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function PayrollHistoryScreen({ loading, entries, onBack, onDeleteEntries, payPeriod, onLoadBreakdown, onJobPress }: PayrollHistoryScreenProps) {
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
  const fullDate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  const tSel = full.dashboard.jobs.batchInvoice; // reuse the jobs selection-bar labels
  const componentsText = (c: Record<string, number> | null | undefined) =>
    c ? Object.entries(c).filter(([, v]) => v).map(([l, v]) => `${v} × ${l}`).join(' · ') : '';

  // Search + date-range filter. Range matches by PERIOD OVERLAP so a period
  // straddling the boundary still counts.
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const dateActive = !!(dateFrom || dateTo);
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return entries.filter(h => {
      if (dateFrom && h.periodEnd.slice(0, 10) < dateFrom) return false;
      if (dateTo && h.periodStart.slice(0, 10) > dateTo) return false;
      if (!q) return true;
      return norm([
        h.name,
        h.checkNumber ?? '',
        methodLabel[h.method] ?? h.method,
        h.grossPay.toFixed(2),
        String(h.grossPay),
        componentsText(h.components),
      ].join(' ')).includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search, dateFrom, dateTo]);
  // In-place record detail — the check header + that period's hours
  // breakdown, without leaving the history screen.
  const [detail, setDetail] = useState<{ entry: PayrollHistoryEntry; breakdown: PayrollBreakdown | null; loading: boolean } | null>(null);
  const openDetail = (entry: PayrollHistoryEntry) => {
    // Snapshot-first: what the check actually paid for, frozen at pay time.
    // Old records (pre-136) fall back to a live recomputation.
    if (entry.breakdown) {
      setDetail({ entry, breakdown: entry.breakdown, loading: false });
      return;
    }
    if (!onLoadBreakdown) return;
    setDetail({ entry, breakdown: null, loading: true });
    void onLoadBreakdown(entry)
      .then(b => setDetail(d => (d && d.entry.id === entry.id ? { entry, breakdown: b, loading: false } : d)))
      .catch(() => setDetail(d => (d && d.entry.id === entry.id ? { entry, breakdown: null, loading: false } : d)));
  };

  const groups = useMemo(() => {
    const by = new Map<string, PayrollHistoryEntry[]>();
    filtered.forEach(h => {
      const list = by.get(h.periodStart) ?? [];
      list.push(h);
      by.set(h.periodStart, list);
    });
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Summary of whatever is currently shown — "worker X earned $Y all time"
  // is just: search the worker, read this line. Add dates for a range.
  const shownTotal = filtered.reduce((sum, h) => sum + h.grossPay, 0);
  const shownHours = filtered.reduce((sum, h) => sum + h.hours + h.driverHours, 0);

  // Multi-select + bulk delete.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const allSelected = filtered.length > 0 && filtered.every(h => selected.has(h.id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map(h => h.id)));
  const deleteSelected = () => {
    if (!onDeleteEntries || selected.size === 0) return;
    Alert.alert(
      t.historyDeleteBtn,
      t.historyDeleteConfirm.replace('{{count}}', String(selected.size)),
      [
        { text: full.common.buttons.cancel, style: 'cancel' },
        {
          text: t.historyDeleteBtn,
          style: 'destructive',
          onPress: () => { void Promise.resolve(onDeleteEntries(Array.from(selected))).then(exitSelect); },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100 bg-white">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 text-base font-semibold text-gray-900">{t.historyTitle}</Text>
      </View>

      {/* Search + select */}
      <View className="px-5 pt-4 flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center rounded-2xl border border-gray-200 bg-white px-3.5">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.historySearchPlaceholder}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 px-2.5 py-2.5 text-sm text-gray-900"
          />
        </View>
        {/* Date range — same calendar sheet as the invoices list. */}
        <Pressable
          onPress={() => setDateOpen(true)}
          className={`p-2.5 rounded-2xl border ${dateActive ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}
        >
          <Calendar size={16} color={dateActive ? '#4F46E5' : '#6B7280'} />
        </Pressable>
        {onDeleteEntries ? (
          <Pressable
            onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`px-3 py-2.5 rounded-2xl border ${selectMode ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'}`}
          >
            <Text className={`text-sm font-semibold ${selectMode ? 'text-primary' : 'text-gray-600'}`}>
              {selectMode ? t.historyCancelSelect : t.historySelect}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Shown-total summary — reflects the current search + date range. */}
      <View className="mx-5 mt-3 flex-row items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <Text className="text-xs text-gray-500">
          {t.historyTotalLabel} · {t.historyPaymentsCount.replace('{{count}}', String(filtered.length))} · {Math.round(shownHours * 100) / 100} h
        </Text>
        <Text className="text-base font-bold text-primary">{fmt(shownTotal)}</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4F46E5" />
        </View>
      ) : groups.length === 0 ? (
        <Text className="text-sm text-gray-400 text-center py-16 px-6">{search ? t.historyNoResults : t.historyEmpty}</Text>
      ) : (
        <ScrollView contentContainerClassName={`px-5 py-5 ${selectMode ? 'pb-40' : 'pb-24'}`}>
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
                  <Pressable
                    key={h.id}
                    disabled={selectMode ? false : !(h.breakdown || (onLoadBreakdown && h.employeeId))}
                    onPress={() => (selectMode ? toggleSelected(h.id) : openDetail(h))}
                    className={`px-4 py-3 flex-row items-center gap-3 ${i < list.length - 1 ? 'border-b border-gray-50' : ''} ${selectMode ? 'active:bg-gray-50' : ''} ${selectMode && selected.has(h.id) ? 'bg-primary/5' : ''}`}
                  >
                    {selectMode ? (
                      <View className={`w-5 h-5 rounded-md border items-center justify-center ${selected.has(h.id) ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}>
                        {selected.has(h.id) ? <Check size={13} color="#fff" /> : null}
                      </View>
                    ) : null}
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
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* In-place record detail — mirrors the live Payroll breakdown. */}
      <RNModal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable onPress={() => setDetail(null)} className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]" onStartShouldSetResponder={() => true}>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-gray-900">{detail?.entry.name}</Text>
                <Text className="text-sm text-gray-500">
                  {fmt(detail?.entry.grossPay ?? 0)} · {Math.round((detail?.entry.hours ?? 0) * 100) / 100} h
                  {' · '}
                  {detail?.entry.method === 'check' && detail?.entry.checkNumber ? `${t.checkPrefix}${detail.entry.checkNumber}` : (methodLabel[detail?.entry.method ?? ''] ?? detail?.entry.method)}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {detail ? `${fmtDay(detail.entry.periodStart)} – ${fmtDay(detail.entry.periodEnd)}` : ''}
                  {detail && componentsText(detail.entry.components) ? ` · ${componentsText(detail.entry.components)}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setDetail(null)} hitSlop={10} className="p-1">
                <X size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            {detail?.loading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#4F46E5" />
              </View>
            ) : detail?.breakdown ? (
              <>
                <View className="flex-row gap-2 mb-4">
                  {([[Wrench, t.hoursWorked, detail.breakdown.workedHours], [Truck, t.hoursDriven, detail.breakdown.drivenHours], [Clock, t.hoursLogged, detail.breakdown.loggedHours]] as const).map(([Icon, label, val], i) => (
                    <View key={i} className="flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-3 items-center">
                      <Icon size={15} color="#9CA3AF" />
                      <Text className="text-base font-bold text-gray-900 mt-1">{val}</Text>
                      <Text className="text-[11px] text-gray-400">{label}</Text>
                    </View>
                  ))}
                </View>
                {detail.breakdown.jobs.length > 0 ? (
                  <>
                    <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.projectsHeading}</Text>
                    <ScrollView className="max-h-72" nestedScrollEnabled>
                      <View className="gap-2">
                        {detail.breakdown.jobs.map((j, i) => (
                          <View key={j.jobId ?? i} className="flex-row items-center gap-3 rounded-2xl border border-gray-100 px-3 py-2.5">
                            <Pressable
                              disabled={!j.jobId || !onJobPress}
                              onPress={() => { if (j.jobId && onJobPress) { setDetail(null); onJobPress(j.jobId); } }}
                              className="flex-1 min-w-0 active:opacity-60"
                            >
                              <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{j.title || t.untitledJob}</Text>
                              {j.date ? <Text className="text-[11px] text-gray-400">{fmtDay(j.date)}</Text> : null}
                            </Pressable>
                            <View className="items-end">
                              {j.workedHours > 0 ? (
                                <View className="flex-row items-center gap-1">
                                  <Wrench size={11} color="#9CA3AF" />
                                  <Text className="text-xs text-gray-600">{j.workedHours} h</Text>
                                </View>
                              ) : null}
                              {j.drivenHours > 0 ? (
                                <View className="flex-row items-center gap-1">
                                  <Truck size={11} color="#9CA3AF" />
                                  <Text className="text-xs text-gray-600">{j.drivenHours} h</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                ) : null}
              </>
            ) : (
              <Text className="text-sm text-gray-400 text-center py-8">{t.historyNoResults}</Text>
            )}
          </View>
        </Pressable>
      </RNModal>

      <DateRangeSheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        from={dateFrom || null}
        to={dateTo || null}
        onChange={({ from, to }) => { setDateFrom(from ?? ''); setDateTo(to ?? ''); }}
        title={fullDate.title}
        fromLabel={fullDate.from}
        toLabel={fullDate.to}
        clearLabel={fullDate.clear}
        applyLabel={fullDate.apply}
        presets={buildHistoryRangePresets(t.historyPresets, payPeriod)}
      />

      {/* Select-mode floating pills — same scheme as the jobs list. */}
      {selectMode ? (
        <>
          <Pressable
            onPress={toggleSelectAll}
            className="absolute bottom-48 left-5 flex-row items-center gap-2 px-5 h-12 rounded-full"
            style={{
              backgroundColor: '#374151',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Check size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {allSelected ? tSel.deselectAll : tSel.selectAll}
            </Text>
          </Pressable>
          <Pressable
            onPress={deleteSelected}
            disabled={selected.size === 0}
            className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
            style={{
              backgroundColor: selected.size === 0 ? '#D1D5DB' : '#DC2626',
              elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Trash2 size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {t.historyDeleteBtn}{selected.size > 0 ? ` · ${selected.size}` : ''}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

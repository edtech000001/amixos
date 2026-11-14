// Payment history — its own screen (grew out of the Payroll sheet): every
// saved payroll check, grouped by pay period, newest first. These are the
// PERMANENT records (immune to job edits/deletes) — the screen is the audit
// trail and the landing spot for future features (filters, export…).

import { useEffect, useMemo, useState } from 'react';
import { SkeletonList, SkeletonCard } from '../../ui/Skeleton';
import { View, Text, Pressable, ScrollView, TextInput, Alert, Modal as RNModal, useWindowDimensions } from 'react-native';
import { ChevronLeft, Search, Check, Trash2, Calendar, X, Wrench, Truck, Clock } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { FilteredEmpty } from '../../ui/FilteredEmpty';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import type { PayrollBreakdown } from '../../lib/payroll';
import { formatNumberGrouped } from '../../lib/format';
import { useSheetSides } from '../../ui/useSheetSides';

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
  payPeriod?: { frequency: unknown; anchorDate: unknown; customDays?: unknown };
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
  const sheetSides = useSheetSides();
  const { t: full } = useLang();
  const c = useThemeColors();
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
  const [search, setSearch] = usePersistedSearch('search.payrollHistory');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  // Row-hiding filters (search + a user-picked range) — drives the
  // FilteredEmpty "clear filters" prompt.
  const narrowed = search.trim() !== '' || !!dateFrom || !!dateTo;
  const clearNarrowing = () => { setSearch(''); setDateFrom(''); setDateTo(''); };
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

  // iPad / iPhone Duo open: payments left, the picked payment right (same
  // breakpoint + pane width as Payroll).
  const { width: winW } = useWindowDimensions();
  const split = winW >= 600;
  const listPaneW = Math.round(Math.min(400, Math.max(300, winW * 0.36)));
  const paneDetail = split ? detail : null;
  // Split: open the newest shown payment until one is picked (and again when
  // a search / date filter hides the open one), so the pane is never blank.
  const firstShownId = groups[0]?.[1][0]?.id ?? null;
  useEffect(() => {
    if (!split || !firstShownId) return;
    if (detail && filtered.some(h => h.id === detail.entry.id)) return;
    const first = groups[0][1][0];
    openDetail(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, firstShownId, filtered]);

  // Payment detail — the bottom sheet on phones, the right pane in split.
  const detailView = (d: { entry: PayrollHistoryEntry; breakdown: PayrollBreakdown | null; loading: boolean }, inPane: boolean) => (
          <>
            <View className="flex-row items-start justify-between mb-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-ink">{d.entry.name}</Text>
                <Text className="text-sm text-muted">
                  {fmt(d.entry.grossPay ?? 0)} · {Math.round((d.entry.hours ?? 0) * 100) / 100} h
                  {' · '}
                  {d.entry.method === 'check' && d.entry.checkNumber ? `${t.checkPrefix}${d.entry.checkNumber}` : (methodLabel[d.entry.method ?? ''] ?? d.entry.method)}
                </Text>
                <Text className="text-xs text-faint mt-0.5">
                  {true ? `${fmtDay(d.entry.periodStart)} – ${fmtDay(d.entry.periodEnd)}` : ''}
                  {true && componentsText(d.entry.components) ? ` · ${componentsText(d.entry.components)}` : ''}
                </Text>
              </View>
              {inPane ? null : (
                <Pressable onPress={() => setDetail(null)} hitSlop={10} className="p-1">
                  <X size={20} color={c.faint} />
                </Pressable>
              )}
            </View>

            {d.loading ? (
              <View className="py-2">
                <SkeletonCard lines={4} />
              </View>
            ) : d.breakdown ? (
              <>
                <View className="flex-row gap-2 mb-4">
                  {([[Wrench, t.hoursWorked, d.breakdown.workedHours], [Truck, t.hoursDriven, d.breakdown.drivenHours], [Clock, t.hoursLogged, d.breakdown.loggedHours]] as const).map(([Icon, label, val], i) => (
                    inPane ? (
                      <View key={i} className="flex-1 flex-row items-center gap-2 rounded-xl border border-border-soft bg-surface px-3 py-2">
                        <Icon size={14} color={c.faint} />
                        <Text className="text-base font-bold text-ink">{val}</Text>
                        <Text className="text-xs text-faint" numberOfLines={1}>{label}</Text>
                      </View>
                    ) : (
                      <View key={i} className="flex-1 rounded-2xl border border-border-soft bg-surface p-3 items-center">
                        <Icon size={15} color={c.faint} />
                        <Text className="text-base font-bold text-ink mt-1">{val}</Text>
                        <Text className="text-[11px] text-faint">{label}</Text>
                      </View>
                    )
                  ))}
                </View>
                {d.breakdown.jobs.length > 0 ? (
                  <>
                    <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide mb-2">{t.projectsHeading}</Text>
                    <ScrollView className={inPane ? undefined : 'max-h-72'} nestedScrollEnabled scrollEnabled={!inPane}
                      automaticallyAdjustKeyboardInsets
                      keyboardDismissMode="interactive"
                    >
                      <View className="gap-2">
                        {d.breakdown.jobs.map((j, i) => (
                          <View key={j.jobId ?? i} className="flex-row items-center gap-3 rounded-2xl border border-border-soft px-3 py-2.5">
                            <Pressable
                              disabled={!j.jobId || !onJobPress}
                              onPress={() => { if (j.jobId && onJobPress) { if (!inPane) setDetail(null); onJobPress(j.jobId); } }}
                              className="flex-1 min-w-0 active:opacity-60"
                            >
                              <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{j.title || t.untitledJob}</Text>
                              {j.date || j.lead ? (
                                <Text className="text-[11px] text-faint" numberOfLines={1}>
                                  {[j.date ? fmtDay(j.date) : null, j.lead].filter(Boolean).join(' · ')}
                                </Text>
                              ) : null}
                            </Pressable>
                            <View className="items-end">
                              {j.workedHours > 0 ? (
                                <View className="flex-row items-center gap-1">
                                  <Wrench size={11} color={c.faint} />
                                  <Text className="text-xs text-muted">{j.workedHours} h</Text>
                                </View>
                              ) : null}
                              {j.drivenHours > 0 ? (
                                <View className="flex-row items-center gap-1">
                                  <Truck size={11} color={c.faint} />
                                  <Text className="text-xs text-muted">{j.drivenHours} h</Text>
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
              <Text className="text-sm text-faint text-center py-8">{t.historyNoResults}</Text>
            )}
          </>
  );

  const controlsRow = (
    <>
      {/* Search + select */}
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center rounded-2xl border border-border bg-card px-3.5">
          <Search size={16} color={c.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.historySearchPlaceholder}
            placeholderTextColor={c.faint}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 px-2.5 py-2.5 text-ink" style={{ fontSize: 14 }} />
        </View>
        {/* Date range — same calendar sheet as the invoices list. */}
        <Pressable
          onPress={() => setDateOpen(true)}
          className={`p-2.5 rounded-2xl border ${dateActive ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}
        >
          <Calendar size={16} color={dateActive ? c.primary : c.muted} />
        </Pressable>
        {onDeleteEntries ? (
          <Pressable
            onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`px-3 py-2.5 rounded-2xl border ${selectMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'}`}
          >
            <Text className={`text-sm font-semibold ${selectMode ? 'text-primary' : 'text-muted'}`}>
              {selectMode ? t.historyCancelSelect : t.historySelect}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
  // Split: totals as cards in the full-width band (same look as Payroll).
  const paymentsWord = t.historyPaymentsCount.replace('{{count}}', '').trim();
  const summaryCards = (
    <View className="flex-row gap-3">
      {([
        [t.historyTotalLabel, fmt(shownTotal), 'text-primary'],
        [paymentsWord.charAt(0).toUpperCase() + paymentsWord.slice(1), formatNumberGrouped(filtered.length), 'text-ink'],
        [t.totalHours, formatNumberGrouped(Math.round(shownHours * 100) / 100), 'text-ink'],
      ] as const).map(([label, value, tone]) => (
        <View key={label} className="flex-1 bg-card rounded-2xl border border-border-soft shadow-sm" style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text className="text-xs text-faint" numberOfLines={1}>{label}</Text>
          <Text className={`text-xl font-bold ${tone} tabular-nums`} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
        </View>
      ))}
    </View>
  );

  const listArea = (
    <View style={{ flex: 1 }}>
      {split ? null : <View className="px-5 pt-4">{controlsRow}</View>}

      {/* Shown-total summary — reflects the current search + date range. */}
      {split ? null : <View className="mx-5 mt-3 flex-row items-center justify-between bg-card rounded-2xl border border-border-soft shadow-sm px-4 py-3">
        <Text className="text-xs text-muted">
          {t.historyTotalLabel} · {t.historyPaymentsCount.replace('{{count}}', String(filtered.length))} · {Math.round(shownHours * 100) / 100} h
        </Text>
        <Text className="text-base font-bold text-primary tabular-nums">{fmt(shownTotal)}</Text>
      </View>}

      {loading ? (
        <View className="px-4 pt-2">
          <SkeletonList rows={6} />
        </View>
      ) : groups.length === 0 && narrowed ? (
        <FilteredEmpty onClear={clearNarrowing} title={t.historyNoResults} />
      ) : groups.length === 0 ? (
        <Text className="text-sm text-faint text-center py-16 px-6">{t.historyEmpty}</Text>
      ) : (
        <ScrollView contentContainerClassName={`px-5 py-5 ${selectMode ? 'pb-40' : 'pb-24'}`}
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
        >
          {groups.map(([periodStart, list]) => (
            <View key={periodStart} className="mb-5">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm font-semibold text-muted">
                  {fmtDay(periodStart)} – {fmtDay(list[0].periodEnd)}
                </Text>
                <Text className="text-sm font-bold text-ink">
                  {fmt(list.reduce((sum, e) => sum + e.grossPay, 0))}
                </Text>
              </View>
              <View className="bg-card rounded-2xl border border-border-soft shadow-sm overflow-hidden">
                {list.map((h, i) => (
                  <Pressable
                    key={h.id}
                    disabled={selectMode ? false : !(h.breakdown || (onLoadBreakdown && h.employeeId))}
                    onPress={() => (selectMode ? toggleSelected(h.id) : openDetail(h))}
                    className={`px-4 py-3 flex-row items-center gap-3 ${i < list.length - 1 ? 'border-b border-border-soft' : ''} ${selectMode ? 'active:bg-surface' : ''} ${selectMode && selected.has(h.id) ? 'bg-primary/5' : ''}`}
                    style={split && !selectMode && h.id === paneDetail?.entry.id ? { backgroundColor: `${c.primary}1F` } : undefined}
                  >
                    {selectMode ? (
                      <View className={`w-5 h-5 rounded-md border items-center justify-center ${selected.has(h.id) ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                        {selected.has(h.id) ? <Check size={13} color="#fff" /> : null}
                      </View>
                    ) : null}
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{h.name}</Text>
                      <Text className="text-xs text-faint">
                        {Math.round(h.hours * 100) / 100} h
                        {h.driverHours > 0 ? ` · ${Math.round(h.driverHours * 100) / 100} h ${t.driveShort}` : ''}
                        {h.bonus ? ` · ${t.historyBonus} ${fmt(h.bonus)}` : ''}
                        {' · '}
                        {h.method === 'check' && h.checkNumber ? `${t.checkPrefix}${h.checkNumber}` : (methodLabel[h.method] ?? h.method)}
                        {h.paidAt ? ` · ${fmtDay(h.paidAt)}` : ''}
                        {componentsText(h.components) ? ` · ${componentsText(h.components)}` : ''}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-ink tabular-nums">{fmt(h.grossPay)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-1 text-base font-semibold text-ink">{t.historyTitle}</Text>
      </View>

      {split ? (
        <View className="px-5 pt-3 pb-3 gap-3 border-b border-border-soft">
          {controlsRow}
          {summaryCards}
        </View>
      ) : null}
      {split ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: listPaneW, borderRightWidth: 1, borderRightColor: c.border }}>{listArea}</View>
          <ScrollView style={{ flex: 1 }} contentContainerClassName="px-5 py-5 pb-32">
            {paneDetail ? detailView(paneDetail, true) : null}
          </ScrollView>
        </View>
      ) : listArea}

      {/* In-place record detail — mirrors the live Payroll breakdown. */}
      <RNModal visible={!!detail && !split} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 justify-end">
                  <Pressable
                    onPress={() => setDetail(null)}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
                  />
          <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]" style={sheetSides}>
            {detail ? detailView(detail, false) : null}
          </View>
        </View>
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

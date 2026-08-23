import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, ScrollView, SectionList, Modal as RNModal } from 'react-native';
import { FileText, Search, Calendar, Layers, XCircle, List, Building2, MapPin, Check, ListChecks, Trash2, X, DollarSign } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { buildHistoryRangePresets } from '../../lib/dateRangePresets';
import { Fab } from '../../ui/Fab';
import { formatDateLong, daysOverdue, daysSince } from '../../lib/format';
import { usStateName } from '../../lib/usStates';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { SkeletonList, SkeletonRow } from '../../ui/Skeleton';
import { ChipScroll } from '../../ui/ChipScroll';
import { INVOICES_FILTERS_KEY, parseInvoicesFilters } from '../../lib/invoicesFilters';
import { useThemeColors } from '../../theme';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  totalAmount: number;
  dueDate: string | null;
  /** When the invoice was sent (ISO timestamp) — drives "sent N days ago". */
  sentAt: string | null;
  clientNames: string | null;
  /** Primary client's company + state (for the company/state filters). */
  company: string | null;
  state: string | null;
  /** Invoice issue date (yyyy-mm-dd) — drives the date-range filter. */
  issueDate: string | null;
  /** Extra search text: line-item names + linked jobs' Project IDs. */
  searchExtra?: string;
}

export interface InvoicesListScreenProps {
  /** Business payroll config — powers the pay-period presets in the date
   *  filter (same quick chips as the jobs list). */
  payPeriod?: { frequency: unknown; anchorDate: unknown; customDays?: unknown };
  loading: boolean;
  invoices: InvoiceListItem[];
  onInvoicePress: (id: string) => void;
  /** Omit to hide the New-invoice FAB + empty-state create link — no create permission. */
  onNewInvoicePress?: () => void;
  /** Opens the price sheet (autopricing catalog). Shows a header button. */
  onPriceSheetPress?: () => void;
  onUpdateStatus: (id: string, status: 'sent' | 'paid') => Promise<void> | void;
  /** Bulk delete for selection mode. Pass ONLY when the role can delete
   *  invoices — its presence shows the Select tool. Caller owns the confirm
   *  + the actual delete (incl. reverting linked jobs). */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /** Scopes the persisted group-by preference per business. */
  businessId?: string;
  // ── Server mode (opt-in) — the wrapper does the search/status/counts/paging in
  // the DB. On: this screen skips its own filtering, uses `serverCounts` for the
  // badges + `serverTotal` for the header, reports filter changes via
  // `onFiltersChange`, and asks for more via `onLoadMore` near the bottom.
  serverMode?: boolean;
  serverCounts?: Record<string, number>;
  /** Total invoices matching the active filters (for the header count). */
  serverTotal?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onFiltersChange?: (f: {
    search: string;
    statuses: string[];
    groupBy: GroupKey;
    dateFrom: string | null;
    dateTo: string | null;
  }) => void;
}

// Selectable status filters (multi-select). "All" is the icon reset, not a key.
const STATUS_KEYS = ['draft', 'sent', 'overdue', 'paid', 'total_loss'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
type GroupKey = 'none' | 'status' | 'company' | 'state';

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-border-soft',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-border-soft',
  total_loss: 'bg-border-soft',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-muted',
  sent: 'text-blue-600',
  paid: 'text-emerald-700',
  overdue: 'text-red-600',
  cancelled: 'text-faint',
  total_loss: 'text-muted',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoicesListScreen({
  payPeriod,
  loading,
  invoices,
  onInvoicePress,
  onNewInvoicePress,
  onPriceSheetPress,
  onUpdateStatus,
  onBulkDelete,
  businessId,
  serverMode = false,
  serverCounts,
  serverTotal,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onFiltersChange,
}: InvoicesListScreenProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.invoices;
  const tg = t.group;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  const tStatus = full.dashboard.invoiceStatus;

  // Multi-select status filters. Empty = all.
  const [statuses, setStatuses] = useState<StatusKey[]>([]);
  const statusSet = useMemo(() => new Set<string>(statuses), [statuses]);
  const toggleStatus = (k: StatusKey) =>
    setStatuses(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const [search, setSearch, debouncedSearch] = usePersistedSearch(businessId ? `search.invoices.${businessId}` : null);
  // Issue-date range filter.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // Group the list into sections — persisted per device+business, like the
  // jobs list, so leaving the screen keeps the chosen grouping.
  const groupStoreKey = businessId ? `amixos.invoicesGroupBy.v1.${businessId}` : 'amixos.invoicesGroupBy.v1';
  const [groupBy, setGroupByState] = useState<GroupKey>('none');
  // Gate the server-mode filter report until after the group-by restore, so the
  // first query uses the saved grouping. AsyncStorage is async, so this is a
  // state flag (not a synchronous read like web).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(groupStoreKey)
      .then(saved => {
        if (saved === 'status' || saved === 'company' || saved === 'state' || saved === 'none') setGroupByState(saved as GroupKey);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [groupStoreKey]);
  const setGroupBy = (g: GroupKey) => {
    setGroupByState(g);
    void AsyncStorage.setItem(groupStoreKey, g).catch(() => {});
  };
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  // Status + date filters persist per device+business (like the jobs list) so
  // navigating into an invoice and back keeps them, not just the search/group.
  const filtersKey = businessId ? `${INVOICES_FILTERS_KEY}.${businessId}` : INVOICES_FILTERS_KEY;
  const filtersHydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    filtersHydrated.current = false; // gate persist until this business's filters load
    AsyncStorage.getItem(filtersKey)
      .then(raw => {
        if (cancelled) return;
        const f = parseInvoicesFilters(raw);
        setStatuses(Array.isArray(f?.statuses) ? f!.statuses.filter((k): k is StatusKey => (STATUS_KEYS as readonly string[]).includes(k)) : []);
        setDateFrom(f?.dateFrom ?? null);
        setDateTo(f?.dateTo ?? null);
        filtersHydrated.current = true;
      })
      .catch(() => { filtersHydrated.current = true; });
    return () => { cancelled = true; };
  }, [filtersKey]);
  useEffect(() => {
    if (!filtersHydrated.current) return;
    void AsyncStorage.setItem(filtersKey, JSON.stringify({ statuses, dateFrom, dateTo })).catch(() => {});
  }, [filtersKey, statuses, dateFrom, dateTo]);

  const statusLabels: Record<StatusKey, string> = {
    draft: t.filters.drafts,
    sent: t.filters.sent,
    paid: t.filters.paid,
    overdue: t.filters.overdue,
    total_loss: t.filters.totalLoss,
  };
  const groupOptions: { key: GroupKey; label: string; Icon: typeof List }[] = [
    { key: 'none', label: tg.none, Icon: List },
    { key: 'status', label: tg.status, Icon: ListChecks },
    { key: 'company', label: tg.company, Icon: Building2 },
    { key: 'state', label: tg.state, Icon: MapPin },
  ];

  // Per-status counts for the tab badges.
  const computedCounts = useMemo(() => {
    const cc: Record<StatusKey, number> = { draft: 0, sent: 0, paid: 0, overdue: 0, total_loss: 0 };
    for (const inv of invoices) if (inv.status in cc) cc[inv.status as StatusKey]++;
    return cc;
  }, [invoices]);
  // Server mode gets exact counts from the DB (a partial page can't be counted
  // client-side); client mode counts the full array.
  const counts = serverMode && serverCounts
    ? (serverCounts as Record<StatusKey, number>)
    : computedCounts;

  const dateActive = !!dateFrom || !!dateTo;
  const clearDate = () => { setDateFrom(null); setDateTo(null); };

  const inDateRange = (d: string | null) => {
    if (!dateFrom && !dateTo) return true;
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  // In server mode `invoices` is ALREADY the search/status/date-filtered page(s)
  // from the DB in newest-first order, so we don't re-filter or re-sort — we only
  // group the loaded rows. In client mode we filter + sort the full array.
  const filtered = useMemo(() => {
    if (serverMode) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(inv => {
      if (statuses.length && !statusSet.has(inv.status)) return false;
      if (!inDateRange(inv.issueDate)) return false;
      const cn = (inv.clientNames ?? '').toLowerCase();
      // Amount search: digits (with optional $ , .) match against the total.
      const qAmount = q.replace(/[$,\s]/g, '');
      const amountHit = qAmount !== '' && /^[\d.]+$/.test(qAmount) && inv.totalAmount.toFixed(2).includes(qAmount);
      return amountHit || `${inv.invoiceNumber} ${cn} ${inv.searchExtra ?? ''}`.toLowerCase().includes(q);
    })
      // Newest first, by issue date (fallback: keep the fetch order).
      .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, statuses, search, dateFrom, dateTo, serverMode]);

  // Sections for the chosen grouping. 'none' = one untitled section.
  const sections = useMemo(() => {
    if (groupBy === 'none') return [{ title: '', data: filtered }];
    if (groupBy === 'status') {
      // Actionable first: overdue → sent (awaiting payment) → draft → paid.
      const ORDER = ['overdue', 'sent', 'draft', 'paid', 'total_loss'];
      const map = new Map<string, InvoiceListItem[]>();
      for (const inv of filtered) {
        const arr = map.get(inv.status);
        if (arr) arr.push(inv); else map.set(inv.status, [inv]);
      }
      return Array.from(map.entries())
        .sort((a, b) => {
          const ia = ORDER.indexOf(a[0]); const ib = ORDER.indexOf(b[0]);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        })
        .map(([key, data]) => ({ title: (tStatus as Record<string, string>)[key] ?? key, data }));
    }

    const noVal = '—';
    const map = new Map<string, InvoiceListItem[]>();
    for (const inv of filtered) {
      const raw = groupBy === 'company' ? inv.company : inv.state;
      const key = raw && raw.trim() ? raw : noVal;
      const arr = map.get(key);
      if (arr) arr.push(inv); else map.set(key, [inv]);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === noVal ? 1 : b[0] === noVal ? -1 : a[0].localeCompare(b[0])))
      .map(([key, data]) => ({
        title: key === noVal ? noVal : groupBy === 'state' ? usStateName(key, locale) : key,
        data,
      }));
  }, [filtered, groupBy, locale]);

  // Raw sum, rounded ONCE to the cent (decimal-aware: float .665 stores as
  // .66499…, the toFixed pass restores the intended half-up → .67).
  const total = Math.round(Number((filtered.reduce((s, i) => s + i.totalAmount, 0) * 100).toFixed(3))) / 100;
  // In server mode the loaded rows are only part of the match set, so the sum is
  // only meaningful once everything for the current filter is loaded.
  const showTotal = filtered.length > 0 && (!serverMode || !hasMore);

  // Server mode: report filter changes UP so the wrapper re-queries. Search is
  // debounced so we don't fire a query per keystroke. Gated on `ready` so the
  // first query uses the restored group-by, not the pre-restore default.
  // debouncedSearch comes from usePersistedSearch (restore-aware).
  useEffect(() => {
    if (!serverMode || !onFiltersChange || !ready) return;
    onFiltersChange({ search: debouncedSearch, statuses, groupBy, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, ready, debouncedSearch, statuses, groupBy, dateFrom, dateTo]);

  // ── Selection mode (mass delete) — jobs/clients mobile pattern.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const visibleOrder = sections.flatMap(sec => sec.data);
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = visibleOrder.length > 0 && visibleOrder.every(i => selectedIds.has(i.id));
  const toggleSelectAll = () =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (visibleOrder.every(i => prev.has(i.id))) visibleOrder.forEach(i => next.delete(i.id));
      else visibleOrder.forEach(i => next.add(i.id));
      return next;
    });
  const runBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    await onBulkDelete(Array.from(selectedIds));
    setBulkDeleting(false);
    exitSelect();
  };
  const selectedCountText = (selectedIds.size === 1 ? t.selectedCountSingle : t.selectedCountPlural)
    .replace('{{count}}', String(selectedIds.size));

  // Header (title, filters, search, status tabs, selection banner, summary)
  // rides as the SectionList header so the whole screen scrolls as one while
  // invoice rows virtualize.
  const listHeader = (
    <>
      <View className="flex-row items-start justify-between mb-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-ink">{t.title}</Text>
          <Text className="text-sm text-muted mt-0.5">
            {search.trim() || statuses.length || dateFrom || dateTo
              ? t.countFound.replace('{{count}}', String(serverMode ? (serverTotal ?? filtered.length) : filtered.length))
              : t.countTotal.replace('{{count}}', String(serverMode ? (serverTotal ?? invoices.length) : invoices.length))}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 ml-2">
          {onPriceSheetPress ? (
            <Pressable
              onPress={onPriceSheetPress}
              accessibilityLabel={full.dashboard.settings.priceSheet.title}
              className="w-11 h-11 rounded-xl border border-border bg-card items-center justify-center active:opacity-80"
            >
              <DollarSign size={16} color={c.muted} />
            </Pressable>
          ) : null}
          {dateActive ? (
            <Pressable
              onPress={clearDate}
              accessibilityLabel={tdate.clear}
              className="w-11 h-11 rounded-xl border border-red-200 bg-red-500/10 items-center justify-center active:opacity-80"
            >
              <XCircle size={16} color={c.danger} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setDateOpen(o => !o)}
            accessibilityLabel={tdate.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              dateActive ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <Calendar size={16} color={dateActive ? c.primary : c.muted} />
          </Pressable>
          {onBulkDelete ? (
            <Pressable
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              accessibilityLabel={t.selectButton}
              className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
                selectMode ? 'bg-primary/10 border-primary' : 'bg-card border-border'
              }`}
            >
              <ListChecks size={16} color={selectMode ? c.primary : c.muted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setGroupMenuOpen(true)}
            accessibilityLabel={tg.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              groupBy !== 'none' ? 'bg-primary/10 border-primary' : 'bg-card border-border'
            }`}
          >
            <Layers size={16} color={groupBy !== 'none' ? c.primary : c.muted} />
          </Pressable>
        </View>
      </View>

      {/* Search — full width. */}
      <View className="mb-3">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          leftIcon={<Search size={16} color={c.faint} />}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Date-range filter now lives in a bottom sheet (DateRangeSheet at the
          screen root) for one-hand reach. */}

      {/* Status tabs — multi-select chips; "all" is an icon reset. */}
      <ChipScroll className="mb-4" contentContainerClassName="gap-1 pb-1">
        <Pressable
          onPress={() => setStatuses([])}
          accessibilityLabel={t.filters.all}
          className={`flex-row items-center justify-center px-2.5 py-1.5 rounded-xl ${
            statuses.length === 0 ? 'bg-primary' : 'bg-border-soft'
          }`}
        >
          <List size={15} color={statuses.length === 0 ? '#FFFFFF' : c.muted} />
        </Pressable>
        {STATUS_KEYS.map(k => {
          const on = statusSet.has(k);
          return (
            <Pressable
              key={k}
              onPress={() => toggleStatus(k)}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${on ? 'bg-primary' : 'bg-border-soft'}`}
            >
              <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-muted'}`}>{statusLabels[k]}</Text>
              {counts[k] > 0 ? (
                <View className={`px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20' : 'bg-border'}`}>
                  <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-muted'}`}>{counts[k]}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ChipScroll>

      {/* Selection banner — ✕ / count / Todas (clients mobile pattern). */}
      {selectMode ? (
        <View className="flex-row items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-3">
          <Pressable onPress={exitSelect} hitSlop={8}>
            <X size={16} color={c.primary} />
          </Pressable>
          <Text className="text-sm font-medium text-primary flex-1">{selectedCountText}</Text>
          {visibleOrder.length > 0 ? (
            <Pressable onPress={toggleSelectAll} hitSlop={8}>
              <Text className="text-xs font-semibold text-primary">
                {allSelected ? full.dashboard.jobs.batchInvoice.deselectAll : t.selectAll}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Summary */}
      {showTotal ? (
        <Text className="text-xs text-muted mb-3">
          {t.summaryTotal}:{' '}
          <Text className="text-ink font-bold">{fmt(total)}</Text>
        </Text>
      ) : null}
    </>
  );

  return (
    <View className="flex-1 bg-surface">
      <SectionList
        className="flex-1"
        sections={filtered.length === 0 ? [] : sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text className="text-xs font-semibold text-faint uppercase tracking-wide mt-4 mb-2 px-1">
              {section.title} · {section.data.length}
            </Text>
          ) : null
        }
        renderItem={({ item: inv, index, section }) => {
          // Recreate the "one rounded card per section" look: round the first
          // and last rows and draw side borders so the group reads as a card.
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const statusKey = inv.status as keyof typeof tStatus;
          const statusLabel = tStatus[statusKey] ?? inv.status;
          const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-border-soft';
          const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-muted';
          const client = inv.clientNames ?? t.noClient;
          const due = inv.dueDate ? formatDateLong(inv.dueDate, t.dateLocale) : null;
          const sentAgo = inv.status === 'sent' && inv.sentAt
            ? (() => { const n = daysSince(inv.sentAt); return n === 0 ? t.sentToday : t.sentAgo.replace('{{n}}', String(n)); })()
            : null;
          const overdueAgo = inv.status === 'overdue' && daysOverdue(inv.dueDate) > 0
            ? t.overdueAgo.replace('{{n}}', String(daysOverdue(inv.dueDate)))
            : null;
          return (
            <Pressable
              onPress={() => (selectMode ? toggleSelect(inv.id) : onInvoicePress(inv.id))}
              className={`flex-row items-center gap-4 px-5 py-4 border-x border-border-soft ${isFirst ? 'rounded-t-2xl border-t' : ''} ${isLast ? 'rounded-b-2xl border-b' : 'border-b'} ${
                selectMode && selectedIds.has(inv.id) ? 'bg-primary/5' : 'bg-card active:bg-surface'
              }`}
            >
              {selectMode ? (
                <View className={`w-5 h-5 rounded-md border items-center justify-center ${
                  selectedIds.has(inv.id) ? 'bg-primary border-primary' : 'border-border'
                }`}>
                  {selectedIds.has(inv.id) ? <Text className="text-white text-[11px] font-bold">✓</Text> : null}
                </View>
              ) : null}
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="text-sm font-semibold text-ink">{inv.invoiceNumber}</Text>
                  <View className={`px-2 py-0.5 rounded-full ${pillBg}`}>
                    <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                  </View>
                </View>
                <Text className="text-xs text-faint mt-0.5">
                  {client}
                  {inv.company ? ` · ${inv.company}` : ''}
                  {due ? ` · ${t.dueShort.replace('{{date}}', due)}` : ''}
                  {sentAgo ? ` · ${sentAgo}` : ''}
                  {overdueAgo ? ` · ${overdueAgo}` : ''}
                </Text>
              </View>
              <Text className="text-sm font-bold text-ink">{fmt(inv.totalAmount)}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <SkeletonList rows={8} />
          ) : (
            <View className="items-center py-20">
              <FileText size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">{t.empty}</Text>
              {onNewInvoicePress ? (
                <Pressable onPress={onNewInvoicePress} className="mt-1">
                  <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: selectMode ? 256 : 176 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        maxToRenderPerBatch={10}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (serverMode && hasMore && !loadingMore) onLoadMore?.(); }}
        ListFooterComponent={
          serverMode && loadingMore ? (
            <View>
              {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
            </View>
          ) : null
        }
      />

    {/* Bulk-delete pill — screen-anchored (bottom-left), aligned with the FAB. */}
    {selectMode && onBulkDelete ? (
      <Pressable
        onPress={runBulkDelete}
        disabled={selectedIds.size === 0 || bulkDeleting}
        className="absolute bottom-32 left-5 flex-row items-center gap-2 px-5 h-14 rounded-full"
        style={{
          backgroundColor: selectedIds.size === 0 || bulkDeleting ? '#D1D5DB' : '#DC2626',
          elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Trash2 size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold">
          {`${t.bulkDelete}${selectedIds.size > 0 ? ` · ${selectedIds.size}` : ''}`}
        </Text>
      </Pressable>
    ) : null}

    {/* Group-by bottom sheet — mirrors the equipment "Agrupar por" menu. */}
    <RNModal
      visible={groupMenuOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setGroupMenuOpen(false)}
    >
      <Pressable onPress={() => setGroupMenuOpen(false)} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={() => {}} className="bg-card rounded-t-3xl px-4 pt-3 pb-10">
          <View className="items-center mb-3">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-ink px-1">{tg.title}</Text>
            <Pressable onPress={() => setGroupMenuOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
              <X size={22} color={c.faint} />
            </Pressable>
          </View>
          <View className="gap-1">
            {groupOptions.map(o => {
              const active = groupBy === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                  className={`flex-row items-center gap-3 px-3 py-3 rounded-2xl ${active ? 'bg-primary/10' : 'active:bg-surface'}`}
                >
                  <View className={`w-9 h-9 rounded-xl items-center justify-center ${active ? 'bg-primary' : 'bg-border-soft'}`}>
                    <o.Icon size={18} color={active ? '#FFFFFF' : c.muted} />
                  </View>
                  <Text className={`flex-1 text-base ${active ? 'text-primary font-semibold' : 'text-ink'}`}>
                    {o.label}
                  </Text>
                  {active ? <Check size={20} color={c.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>

    {/* New invoice — floating action, bottom-right thumb reach. Hidden when the
       caller can't create invoices. */}
    {onNewInvoicePress ? <Fab onPress={onNewInvoicePress} /> : null}

    <DateRangeSheet
      open={dateOpen}
      onClose={() => setDateOpen(false)}
      from={dateFrom}
      to={dateTo}
      onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
      title={tdate.title}
      fromLabel={tdate.from}
      toLabel={tdate.to}
      clearLabel={tdate.clear}
      applyLabel={tdate.apply}
      presets={buildHistoryRangePresets(full.dashboard.reports.payroll.historyPresets, payPeriod)}
    />
    </View>
  );
}

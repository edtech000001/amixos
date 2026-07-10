import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, ScrollView, Modal as RNModal } from 'react-native';
import { FileText, Search, Calendar, Layers, XCircle, List, Building2, MapPin, Check, ListChecks, Trash2, X } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import { Fab } from '../../ui/Fab';
import { formatDateLong } from '../../lib/format';
import { usStateName } from '../../lib/usStates';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  totalAmount: number;
  dueDate: string | null;
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
  loading: boolean;
  invoices: InvoiceListItem[];
  onInvoicePress: (id: string) => void;
  onNewInvoicePress: () => void;
  onUpdateStatus: (id: string, status: 'sent' | 'paid') => Promise<void> | void;
  /** Bulk delete for selection mode. Pass ONLY when the role can delete
   *  invoices — its presence shows the Select tool. Caller owns the confirm
   *  + the actual delete (incl. reverting linked jobs). */
  onBulkDelete?: (ids: string[]) => Promise<void> | void;
  /** Scopes the persisted group-by preference per business. */
  businessId?: string;
}

// Selectable status filters (multi-select). "All" is the icon reset, not a key.
const STATUS_KEYS = ['draft', 'sent', 'paid', 'overdue'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
type GroupKey = 'none' | 'status' | 'company' | 'state';

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-gray-100',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-gray-100',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-gray-500',
  sent: 'text-blue-600',
  paid: 'text-emerald-700',
  overdue: 'text-red-600',
  cancelled: 'text-gray-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoicesListScreen({
  loading,
  invoices,
  onInvoicePress,
  onNewInvoicePress,
  onUpdateStatus,
  onBulkDelete,
  businessId,
}: InvoicesListScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.invoices;
  const tg = t.group;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the jobs date-filter labels
  const tStatus = full.dashboard.invoiceStatus;

  // Multi-select status filters. Empty = all.
  const [statuses, setStatuses] = useState<StatusKey[]>([]);
  const statusSet = useMemo(() => new Set<string>(statuses), [statuses]);
  const toggleStatus = (k: StatusKey) =>
    setStatuses(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  const [search, setSearch] = useState('');
  // Issue-date range filter.
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  // Group the list into sections — persisted per device+business, like the
  // jobs list, so leaving the screen keeps the chosen grouping.
  const groupStoreKey = businessId ? `amixos.invoicesGroupBy.v1.${businessId}` : 'amixos.invoicesGroupBy.v1';
  const [groupBy, setGroupByState] = useState<GroupKey>('none');
  useEffect(() => {
    AsyncStorage.getItem(groupStoreKey)
      .then(saved => {
        if (saved === 'status' || saved === 'company' || saved === 'state' || saved === 'none') setGroupByState(saved as GroupKey);
      })
      .catch(() => {});
  }, [groupStoreKey]);
  const setGroupBy = (g: GroupKey) => {
    setGroupByState(g);
    void AsyncStorage.setItem(groupStoreKey, g).catch(() => {});
  };
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  const statusLabels: Record<StatusKey, string> = {
    draft: t.filters.drafts,
    sent: t.filters.sent,
    paid: t.filters.paid,
    overdue: t.filters.overdue,
  };
  const groupOptions: { key: GroupKey; label: string; Icon: typeof List }[] = [
    { key: 'none', label: tg.none, Icon: List },
    { key: 'status', label: tg.status, Icon: ListChecks },
    { key: 'company', label: tg.company, Icon: Building2 },
    { key: 'state', label: tg.state, Icon: MapPin },
  ];

  // Per-status counts for the tab badges.
  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { draft: 0, sent: 0, paid: 0, overdue: 0 };
    for (const inv of invoices) if (inv.status in c) c[inv.status as StatusKey]++;
    return c;
  }, [invoices]);

  const dateActive = !!dateFrom || !!dateTo;
  const clearDate = () => { setDateFrom(null); setDateTo(null); };

  const inDateRange = (d: string | null) => {
    if (!dateFrom && !dateTo) return true;
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const filtered = useMemo(() => {
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
  }, [invoices, statuses, search, dateFrom, dateTo]);

  // Sections for the chosen grouping. 'none' = one untitled section.
  const sections = useMemo(() => {
    if (groupBy === 'none') return [{ title: '', data: filtered }];
    if (groupBy === 'status') {
      // Actionable first: overdue → sent (awaiting payment) → draft → paid.
      const ORDER = ['overdue', 'sent', 'draft', 'paid'];
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

  return (
    <View className="flex-1 bg-surface">
    <ScrollView className="flex-1" contentContainerClassName={`px-6 pt-6 ${selectMode ? 'pb-64' : 'pb-36'}`}>
      {/* Header — filter controls live up here so the search bar gets the full
          width (mirrors the jobs list). */}
      <View className="flex-row items-start justify-between mb-5">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {search.trim() || statuses.length || dateFrom || dateTo
              ? t.countFound.replace('{{count}}', String(filtered.length))
              : t.countTotal.replace('{{count}}', String(invoices.length))}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 ml-2">
          {dateActive ? (
            <Pressable
              onPress={clearDate}
              accessibilityLabel={tdate.clear}
              className="w-11 h-11 rounded-xl border border-red-200 bg-red-50 items-center justify-center active:opacity-80"
            >
              <XCircle size={16} color="#DC2626" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setDateOpen(o => !o)}
            accessibilityLabel={tdate.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              dateActive ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <Calendar size={16} color={dateActive ? '#4F46E5' : '#6B7280'} />
          </Pressable>
          {onBulkDelete ? (
            <Pressable
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              accessibilityLabel={t.selectButton}
              className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
                selectMode ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
              }`}
            >
              <ListChecks size={16} color={selectMode ? '#4F46E5' : '#6B7280'} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setGroupMenuOpen(true)}
            accessibilityLabel={tg.button}
            className={`w-11 h-11 rounded-xl border items-center justify-center active:opacity-80 ${
              groupBy !== 'none' ? 'bg-primary/10 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <Layers size={16} color={groupBy !== 'none' ? '#4F46E5' : '#6B7280'} />
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
          leftIcon={<Search size={16} color="#9CA3AF" />}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Date-range filter now lives in a bottom sheet (DateRangeSheet at the
          screen root) for one-hand reach. */}

      {/* Status tabs — multi-select chips; "all" is an icon reset. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerClassName="gap-1 pb-1"
      >
        <Pressable
          onPress={() => setStatuses([])}
          accessibilityLabel={t.filters.all}
          className={`flex-row items-center justify-center px-2.5 py-1.5 rounded-xl ${
            statuses.length === 0 ? 'bg-primary' : 'bg-gray-100'
          }`}
        >
          <List size={15} color={statuses.length === 0 ? '#FFFFFF' : '#6B7280'} />
        </Pressable>
        {STATUS_KEYS.map(k => {
          const on = statusSet.has(k);
          return (
            <Pressable
              key={k}
              onPress={() => toggleStatus(k)}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${on ? 'bg-primary' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-gray-500'}`}>{statusLabels[k]}</Text>
              {counts[k] > 0 ? (
                <View className={`px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20' : 'bg-gray-200'}`}>
                  <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-gray-600'}`}>{counts[k]}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

    {/* Bulk-delete pill — floating left, like the jobs list. */}
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

      {/* Selection banner — ✕ / count / Todas (clients mobile pattern). */}
      {selectMode ? (
        <View className="flex-row items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 mb-3">
          <Pressable onPress={exitSelect} hitSlop={8}>
            <X size={16} color="#4F46E5" />
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
      {filtered.length > 0 ? (
        <Text className="text-xs text-gray-500 mb-3">
          {t.summaryTotal}:{' '}
          <Text className="text-gray-900 font-bold">{fmt(total)}</Text>
        </Text>
      ) : null}

      {/* List */}
      {loading ? (
        <View className="items-center py-20">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <FileText size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">{t.empty}</Text>
          <Pressable onPress={onNewInvoicePress} className="mt-1">
            <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4">
          {sections.map(section => (
            <View key={section.title || '__all'}>
              {section.title ? (
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                  {section.title} · {section.data.length}
                </Text>
              ) : null}
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {section.data.map((inv, i) => {
                  const statusKey = inv.status as keyof typeof tStatus;
                  const statusLabel = tStatus[statusKey] ?? inv.status;
                  const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-gray-100';
                  const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-gray-500';
                  const client = inv.clientNames ?? t.noClient;
                  const due = inv.dueDate ? formatDateLong(inv.dueDate, t.dateLocale) : null;
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={() => (selectMode ? toggleSelect(inv.id) : onInvoicePress(inv.id))}
                      className={`flex-row items-center gap-4 px-5 py-4 ${
                        selectMode && selectedIds.has(inv.id) ? 'bg-primary/5' : 'active:bg-gray-50'
                      } ${i < section.data.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      {selectMode ? (
                        <View className={`w-5 h-5 rounded-md border items-center justify-center ${
                          selectedIds.has(inv.id) ? 'bg-primary border-primary' : 'border-gray-300'
                        }`}>
                          {selectedIds.has(inv.id) ? <Text className="text-white text-[11px] font-bold">✓</Text> : null}
                        </View>
                      ) : null}
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className="text-sm font-semibold text-gray-900">
                            {inv.invoiceNumber}
                          </Text>
                          <View className={`px-2 py-0.5 rounded-full ${pillBg}`}>
                            <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                          </View>
                        </View>
                        <Text className="text-xs text-gray-400 mt-0.5">
                          {client}
                          {due ? ` · ${t.dueShort.replace('{{date}}', due)}` : ''}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-gray-900">
                        {fmt(inv.totalAmount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>

    {/* Group-by bottom sheet — mirrors the equipment "Agrupar por" menu. */}
    <RNModal
      visible={groupMenuOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setGroupMenuOpen(false)}
    >
      <Pressable onPress={() => setGroupMenuOpen(false)} className="flex-1 justify-end bg-black/40">
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pt-3 pb-10">
          <View className="items-center mb-3">
            <View className="w-10 h-1 bg-gray-200 rounded-full" />
          </View>
          <Text className="text-lg font-bold text-gray-900 px-1 mb-3">{tg.title}</Text>
          <View className="gap-1">
            {groupOptions.map(o => {
              const active = groupBy === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => { setGroupBy(o.key); setGroupMenuOpen(false); }}
                  className={`flex-row items-center gap-3 px-3 py-3 rounded-2xl ${active ? 'bg-primary/10' : 'active:bg-gray-50'}`}
                >
                  <View className={`w-9 h-9 rounded-xl items-center justify-center ${active ? 'bg-primary' : 'bg-gray-100'}`}>
                    <o.Icon size={18} color={active ? '#FFFFFF' : '#6B7280'} />
                  </View>
                  <Text className={`flex-1 text-base ${active ? 'text-primary font-semibold' : 'text-gray-900'}`}>
                    {o.label}
                  </Text>
                  {active ? <Check size={20} color="#4F46E5" /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>

    {/* New invoice — floating action, bottom-right thumb reach */}
    <Fab onPress={onNewInvoicePress} />

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
    />
    </View>
  );
}

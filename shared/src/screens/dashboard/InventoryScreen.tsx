import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import {
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { usePersistedSearch } from '../../lib/usePersistedSearch';
import { Input } from '../../ui/Input';
import { Fab } from '../../ui/Fab';

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  category: string | null;
  lowStockThreshold: number;
}

export interface InventoryScreenProps {
  loading: boolean;
  items: InventoryItem[];
  /** Resolve the localized unit label for a stored DB value. */
  unitLabel: (dbValue: string) => string;
  // Write callbacks are optional: a caller that omits one (e.g. a read-only
  // role gated in the wrapper) hides the matching action button entirely.
  onAddItem?: () => void;
  onEditItem?: (id: string) => void;
  onAdjustItem?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  modalsSlot?: ReactNode;
  // ── Server mode (opt-in) — the wrapper does the search/segment/paging in the
  // DB and passes whole-scope stats. On: this screen skips its own filtering,
  // uses `serverStats` for the summary, reports filter changes via
  // `onFiltersChange`, and asks for more via `onLoadMore`.
  serverMode?: boolean;
  serverStats?: { count: number; value: number; lowStockCount: number };
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onFiltersChange?: (f: { search: string; lowStockOnly: boolean }) => void;
}

type Filter = 'todos' | 'bajo_stock';

export function InventoryScreen({
  loading,
  items,
  unitLabel,
  onAddItem,
  onEditItem,
  onAdjustItem,
  onDeleteItem,
  modalsSlot,
  serverMode = false,
  serverStats,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onFiltersChange,
}: InventoryScreenProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.inventory;

  const [search, setSearch, debouncedSearch] = usePersistedSearch('search.inventory');
  const [filter, setFilter] = useState<Filter>('todos');

  // In server mode `items` is ALREADY the search/segment-filtered page(s), so we
  // don't re-filter. In client mode we filter the full array.
  const filtered = useMemo(() => {
    if (serverMode) return items;
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchSearch = `${i.name} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
      if (filter === 'bajo_stock') return matchSearch && i.quantity <= i.lowStockThreshold;
      return matchSearch;
    });
  }, [items, search, filter, serverMode]);

  // Server mode: report search + segment UP (debounced) so the wrapper re-queries.
  // debouncedSearch comes from usePersistedSearch (restore-aware).
  useEffect(() => {
    if (!serverMode || !onFiltersChange) return;
    onFiltersChange({ search: debouncedSearch, lowStockOnly: filter === 'bajo_stock' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, debouncedSearch, filter]);

  // Summary sums EVERY item in scope — from serverStats when paginating, else
  // computed over the full loaded array.
  const summaryCount = serverMode && serverStats ? serverStats.count : items.length;
  const lowStockCount = serverMode && serverStats ? serverStats.lowStockCount : items.filter(i => i.quantity <= i.lowStockThreshold).length;
  const totalValue = serverMode && serverStats ? serverStats.value : items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const valueFormatted = `$${totalValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const summaryText = t.summary
    .replace('{{count}}', String(summaryCount))
    .replace('{{value}}', valueFormatted);
  const summaryLowStockText = t.summaryLowStock.replace('{{count}}', String(lowStockCount));
  const lowStockBannerText = (lowStockCount > 1
    ? t.lowStockBannerPlural
    : t.lowStockBannerSingle
  ).replace('{{count}}', String(lowStockCount));

  // Header (title/summary, low-stock banner, search, filters) rides as the
  // FlatList header so the whole screen scrolls as one but rows virtualize.
  const header = (
    <>
      <View className="mb-5">
        <Text className="text-2xl font-bold text-ink">{t.title}</Text>
        <Text className="text-sm text-muted mt-0.5">
          {summaryText}
          {lowStockCount > 0 ? (
            <Text className="text-orange-500 font-medium"> · {summaryLowStockText}</Text>
          ) : null}
        </Text>
      </View>

      {lowStockCount > 0 ? (
        <View className="flex-row items-center gap-3 bg-orange-500/10 border border-orange-200 rounded-2xl px-5 py-3 mb-4">
          <AlertTriangle size={18} color={c.warning} />
          <Text className="text-sm text-orange-700 flex-1">
            <Text className="font-semibold">{lowStockBannerText}</Text> {t.lowStockBannerSuffix}
            <Text onPress={() => setFilter('bajo_stock')} className="font-medium text-orange-700">
              {' '}{t.lowStockBannerCta}
            </Text>
          </Text>
        </View>
      ) : null}

      <View className="mb-3">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          leftIcon={<Search size={16} color={c.faint} />}
        />
      </View>

      <View className="flex-row gap-1 bg-border-soft p-1 rounded-xl self-start mb-4">
        {(['todos', 'bajo_stock'] as const).map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-card' : ''}`}
          >
            <Text className={`text-xs font-semibold ${filter === f ? 'text-ink' : 'text-muted'}`}>
              {f === 'todos' ? t.filters.all : t.filters.lowStock}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const low = item.quantity <= item.lowStockThreshold;
    const meta = [
      item.category,
      item.sku ? t.itemMeta.skuPrefix.replace('{{sku}}', item.sku) : null,
    ].filter(Boolean).join(' · ');
    return (
      <View className="bg-card rounded-2xl border border-border-soft p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-base font-semibold text-ink shrink" numberOfLines={1}>
                {item.name}
              </Text>
              {low ? <AlertTriangle size={14} color={c.warning} /> : null}
            </View>
            {meta ? (
              <Text className="text-xs text-faint mt-0.5" numberOfLines={1}>{meta}</Text>
            ) : null}
          </View>
          <View className="items-end">
            <Text className={`text-xl font-bold ${low ? 'text-orange-500' : 'text-ink'}`}>
              {item.quantity}
            </Text>
            <Text className="text-[11px] text-faint">{unitLabel(item.unit)}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border-soft">
          <Text className="text-xs text-muted">
            ${item.unitCost.toFixed(2)} · {t.itemMeta.minPrefix.replace('{{min}}', String(item.lowStockThreshold))}
          </Text>
          <View className="flex-row items-center gap-1">
            {onAdjustItem ? (
              <Pressable onPress={() => onAdjustItem(item.id)} className="p-2 rounded-lg active:bg-primary/10">
                <TrendingUp size={16} color={c.primary} />
              </Pressable>
            ) : null}
            {onEditItem ? (
              <Pressable onPress={() => onEditItem(item.id)} className="p-2 rounded-lg active:bg-border-soft">
                <Pencil size={16} color={c.faint} />
              </Pressable>
            ) : null}
            {onDeleteItem ? (
              <Pressable onPress={() => onDeleteItem(item.id)} className="p-2 rounded-lg active:bg-red-500/10">
                <Trash2 size={16} color={c.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-20">
              <View className="flex-row gap-1">
                {[0, 1, 2].map(i => (
                  <View key={i} className="w-2 h-2 rounded-full bg-primary" />
                ))}
              </View>
            </View>
          ) : (
            <View className="items-center py-20">
              <Package size={40} color={c.faint} />
              <Text className="text-sm text-faint mt-3">
                {search || filter !== 'todos' ? t.emptyNoMatch : t.emptyAll}
              </Text>
              {onAddItem && !search && filter === 'todos' ? (
                <Pressable onPress={onAddItem} className="mt-1">
                  <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 176 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        windowSize={7}
        maxToRenderPerBatch={10}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (serverMode && hasMore && !loadingMore) onLoadMore?.(); }}
        ListFooterComponent={
          serverMode && loadingMore ? (
            <View className="items-center py-6">
              <View className="flex-row gap-1">
                {[0, 1, 2].map(i => (<View key={i} className="w-2 h-2 rounded-full bg-primary" />))}
              </View>
            </View>
          ) : null
        }
      />

      {onAddItem ? <Fab onPress={onAddItem} /> : null}
      {modalsSlot}
    </View>
  );
}

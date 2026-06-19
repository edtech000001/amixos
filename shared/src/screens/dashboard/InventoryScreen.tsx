import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
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
  onAddItem: () => void;
  onEditItem: (id: string) => void;
  onAdjustItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  modalsSlot?: ReactNode;
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
}: InventoryScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.inventory;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchSearch = `${i.name} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
      if (filter === 'bajo_stock') return matchSearch && i.quantity <= i.lowStockThreshold;
      return matchSearch;
    });
  }, [items, search, filter]);

  const lowStockCount = items.filter(i => i.quantity <= i.lowStockThreshold).length;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const valueFormatted = `$${totalValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const summaryText = t.summary
    .replace('{{count}}', String(items.length))
    .replace('{{value}}', valueFormatted);
  const summaryLowStockText = t.summaryLowStock.replace('{{count}}', String(lowStockCount));
  const lowStockBannerText = (lowStockCount > 1
    ? t.lowStockBannerPlural
    : t.lowStockBannerSingle
  ).replace('{{count}}', String(lowStockCount));

  return (
    <View className="flex-1 bg-surface">
    <ScrollView contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header — the "add item" action lives in the bottom-right FAB. */}
      <View className="mb-5">
        <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          {summaryText}
          {lowStockCount > 0 ? (
            <Text className="text-orange-500 font-medium"> · {summaryLowStockText}</Text>
          ) : null}
        </Text>
      </View>

      {/* Low stock banner */}
      {lowStockCount > 0 ? (
        <View className="flex-row items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 mb-4">
          <AlertTriangle size={18} color="#F97316" />
          <Text className="text-sm text-orange-700 flex-1">
            <Text className="font-semibold">{lowStockBannerText}</Text> {t.lowStockBannerSuffix}
            <Text
              onPress={() => setFilter('bajo_stock')}
              className="font-medium text-orange-700"
            >
              {' '}{t.lowStockBannerCta}
            </Text>
          </Text>
        </View>
      ) : null}

      {/* Search — its own full-width line. */}
      <View className="mb-3">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          leftIcon={<Search size={16} color="#9CA3AF" />}
        />
      </View>

      {/* Filters — below the search. */}
      <View className="flex-row gap-1 bg-gray-100 p-1 rounded-xl self-start mb-4">
        {(['todos', 'bajo_stock'] as const).map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg ${filter === f ? 'bg-white' : ''}`}
          >
            <Text
              className={`text-xs font-semibold ${
                filter === f ? 'text-gray-900' : 'text-gray-500'
              }`}
            >
              {f === 'todos' ? t.filters.all : t.filters.lowStock}
            </Text>
          </Pressable>
        ))}
      </View>

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
          <Package size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">
            {search || filter !== 'todos' ? t.emptyNoMatch : t.emptyAll}
          </Text>
          {!search && filter === 'todos' ? (
            <Pressable onPress={onAddItem} className="mt-1">
              <Text className="text-primary text-sm font-medium">{t.addFirst}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="gap-3">
          {filtered.map(item => {
            const low = item.quantity <= item.lowStockThreshold;
            const meta = [
              item.category,
              item.sku ? t.itemMeta.skuPrefix.replace('{{sku}}', item.sku) : null,
            ].filter(Boolean).join(' · ');
            return (
              <View key={item.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                {/* Name + prominent stock */}
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-base font-semibold text-gray-900 shrink" numberOfLines={1}>
                        {item.name}
                      </Text>
                      {low ? <AlertTriangle size={14} color="#FB923C" /> : null}
                    </View>
                    {meta ? (
                      <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>{meta}</Text>
                    ) : null}
                  </View>
                  <View className="items-end">
                    <Text className={`text-xl font-bold ${low ? 'text-orange-500' : 'text-gray-900'}`}>
                      {item.quantity}
                    </Text>
                    <Text className="text-[11px] text-gray-400">{unitLabel(item.unit)}</Text>
                  </View>
                </View>
                {/* Cost + min + actions */}
                <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-50">
                  <Text className="text-xs text-gray-500">
                    ${item.unitCost.toFixed(2)} · {t.itemMeta.minPrefix.replace('{{min}}', String(item.lowStockThreshold))}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Pressable onPress={() => onAdjustItem(item.id)} className="p-2 rounded-lg active:bg-primary/10">
                      <TrendingUp size={16} color="#4F46E5" />
                    </Pressable>
                    <Pressable onPress={() => onEditItem(item.id)} className="p-2 rounded-lg active:bg-gray-100">
                      <Pencil size={16} color="#9CA3AF" />
                    </Pressable>
                    <Pressable onPress={() => onDeleteItem(item.id)} className="p-2 rounded-lg active:bg-red-50">
                      <Trash2 size={16} color="#F87171" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>

      <Fab onPress={onAddItem} />
      {modalsSlot}
    </View>
  );
}

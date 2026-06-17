import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';

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
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6 flex-wrap gap-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {summaryText}
            {lowStockCount > 0 ? (
              <Text className="text-orange-500 font-medium"> · {summaryLowStockText}</Text>
            ) : null}
          </Text>
        </View>
        <Pressable
          onPress={onAddItem}
          className="flex-row items-center gap-1.5 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
        >
          <Plus size={15} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">{t.addItem}</Text>
        </Pressable>
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

      {/* Filter + Search */}
      <View className="flex-row gap-3 mb-4 flex-wrap">
        <View className="flex-row gap-1 bg-gray-100 p-1 rounded-xl">
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
        <View className="flex-1 min-w-[180px]">
          <Input
            placeholder={t.searchPlaceholder}
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            leftIcon={<Search size={16} color="#9CA3AF" />}
          />
        </View>
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
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <View className="flex-row px-5 py-3 border-b border-gray-50">
            <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase">
              {t.cols.item}
            </Text>
            <Text className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">
              {t.cols.stock}
            </Text>
            <Text className="w-16 text-xs font-semibold text-gray-400 uppercase text-center">
              {t.cols.unit}
            </Text>
            <Text className="w-20 text-xs font-semibold text-gray-400 uppercase text-right">
              {t.cols.unitCost}
            </Text>
            <Text className="w-24 text-xs font-semibold text-gray-400 uppercase text-right">
              {t.cols.actions}
            </Text>
          </View>
          {filtered.map((item, i) => {
            const low = item.quantity <= item.lowStockThreshold;
            return (
              <View
                key={item.id}
                className={`flex-row items-center px-5 py-3.5 ${
                  i < filtered.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {low ? <AlertTriangle size={13} color="#FB923C" /> : null}
                  </View>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {item.category ? item.category : ''}
                    {item.sku ? ` · ${t.itemMeta.skuPrefix.replace('{{sku}}', item.sku)}` : ''}
                    {` · ${t.itemMeta.minPrefix.replace('{{min}}', String(item.lowStockThreshold))}`}
                  </Text>
                </View>
                <Text
                  className={`w-16 text-center text-sm font-bold ${
                    low ? 'text-orange-500' : 'text-gray-900'
                  }`}
                >
                  {item.quantity}
                </Text>
                <Text className="w-16 text-center text-xs text-gray-500">
                  {unitLabel(item.unit)}
                </Text>
                <Text className="w-20 text-right text-sm text-gray-700">
                  ${item.unitCost.toFixed(2)}
                </Text>
                <View className="w-24 flex-row items-center justify-end gap-1">
                  <Pressable
                    onPress={() => onAdjustItem(item.id)}
                    className="p-1.5 rounded-lg active:bg-primary/10"
                  >
                    <TrendingUp size={14} className="text-primary" />
                  </Pressable>
                  <Pressable
                    onPress={() => onEditItem(item.id)}
                    className="p-1.5 rounded-lg active:bg-gray-100"
                  >
                    <Pencil size={14} color="#9CA3AF" />
                  </Pressable>
                  <Pressable
                    onPress={() => onDeleteItem(item.id)}
                    className="p-1.5 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#F87171" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {modalsSlot}
    </ScrollView>
  );
}

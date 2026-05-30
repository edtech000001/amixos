import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  InventoryScreen as SharedInventoryScreen,
  type InventoryItem as ScreenItem,
} from '@amixos/shared/screens/dashboard/InventoryScreen';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';

interface RawItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  category: string | null;
  low_stock_threshold: number;
}

const UNIT_KEYS = ['unidad', 'pieza', 'kg', 'lb', 'metro', 'pie', 'litro', 'galon', 'caja', 'rollo', 'bolsa'] as const;
const UNIT_DB_VALUES: Record<typeof UNIT_KEYS[number], string> = {
  unidad: 'unidad', pieza: 'pieza', kg: 'kg', lb: 'lb', metro: 'metro', pie: 'pie',
  litro: 'litro', galon: 'galón', caja: 'caja', rollo: 'rollo', bolsa: 'bolsa',
};

export default function InventoryModuleScreen() {
  const { t: full } = useLang();
  const t = full.dashboard.inventory;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [items, setItems] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    const businessId = business.id;
    fetchAll<RawItem>((from, to) =>
      supabase.from('inventory_items').select('*').eq('business_id', businessId)
        .order('name').range(from, to))
      .then(data => {
        setItems(data);
        setLoading(false);
      });
  }, [business]);

  const screenItems: ScreenItem[] = useMemo(() => items.map(i => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    quantity: i.quantity,
    unit: i.unit,
    unitCost: i.unit_cost,
    category: i.category,
    lowStockThreshold: i.low_stock_threshold,
  })), [items]);

  const unitLabel = (dbValue: string): string => {
    const entry = (Object.entries(UNIT_DB_VALUES) as [typeof UNIT_KEYS[number], string][])
      .find(([, v]) => v === dbValue);
    return entry ? t.units[entry[0]] : dbValue;
  };

  const remove = (id: string) => {
    Alert.alert('Eliminar', t.confirmDelete, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('inventory_items').delete().eq('id', id);
          setItems(prev => prev.filter(i => i.id !== id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <SharedInventoryScreen
        loading={loading}
        items={screenItems}
        unitLabel={unitLabel}
        onAddItem={() => Alert.alert('Coming soon', 'Add item from mobile not yet built')}
        onEditItem={() => Alert.alert('Coming soon', 'Edit item from mobile not yet built')}
        onAdjustItem={() => Alert.alert('Coming soon', 'Adjust stock from mobile not yet built')}
        onDeleteItem={remove}
      />
    </SafeAreaView>
  );
}

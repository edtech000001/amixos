import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, Modal as RNModal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, ScanLine, Sparkles, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { createSupabaseClient } from '@/lib/supabase';
import { loadCached, writeCached } from '@/lib/offline/cache';
import { queuedInsert, queuedUpdate, queuedDelete } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { useApp } from '@/lib/AppContext';
import { useThemeColors } from '@/lib/ThemeProvider';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import { useLang } from '@/lib/i18n/LangProvider';
import { Button, Input, Modal, Select, AutocompleteInput } from '@amixos/shared/ui';
import {
  InventoryScreen as SharedInventoryScreen,
  type InventoryItem as ScreenItem,
} from '@amixos/shared/screens/dashboard/InventoryScreen';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { can } from '@amixos/shared/lib/permissions';

interface RawItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  category: string | null;
  low_stock_threshold: number;
  location_id: string | null;
}

const EMPTY: Omit<RawItem, 'id'> = {
  name: '', sku: '', quantity: 0, unit: 'unidad', unit_cost: 0, category: '', low_stock_threshold: 5, location_id: null,
};

const UNIT_KEYS = ['unidad', 'pieza', 'kg', 'lb', 'metro', 'pie', 'litro', 'galon', 'caja', 'rollo', 'bolsa'] as const;
const UNIT_DB_VALUES: Record<typeof UNIT_KEYS[number], string> = {
  unidad: 'unidad', pieza: 'pieza', kg: 'kg', lb: 'lb', metro: 'metro', pie: 'pie',
  litro: 'litro', galon: 'galón', caja: 'caja', rollo: 'rollo', bolsa: 'bolsa',
};

export default function InventoryModuleScreen() {
  const { t: full, locale } = useLang();
  const t = full.dashboard.inventory;
  const tc = full.common;
  const supabase = createSupabaseClient();
  const { business, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  const c = useThemeColors();
  // Read-only / non-writer roles keep view access; the add/edit/adjust/delete
  // buttons are gated off (RLS blocks the writes server-side either way).
  const canEdit = can.editInventory(currentRole);

  const [items, setItems] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | 'adjust' | null>(null);
  const [selected, setSelected] = useState<RawItem | null>(null);
  const [form, setForm] = useState<Omit<RawItem, 'id'>>(EMPTY);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const res = await loadCached(`inventory_${businessId}_${activeLocationId ?? 'all'}`, () =>
      fetchAllById<RawItem>((afterId, pageSize) => {
        let q = supabase.from('inventory_items').select('*').eq('business_id', businessId);
        if (activeLocationId) q = q.eq('location_id', activeLocationId);
        q = q.order('id', { ascending: true }).limit(pageSize);
        if (afterId) q = q.gt('id', afterId);
        return q;
      }));
    setItems(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, activeLocationId]);

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

  // Previously-used categories — suggested while typing a new item's category.
  const categorySuggestions = useMemo(
    () => [...new Set(items.map(i => i.category).filter((cl): cl is string => !!cl && cl.trim() !== ''))].sort(),
    [items],
  );

  // Auto-generate a SKU: a short prefix from the name + a unique 4-digit suffix.
  const genSku = () => {
    const base = form.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'SKU';
    const existing = new Set(items.map(i => i.sku).filter(Boolean));
    let sku = '';
    do { sku = `${base}-${Math.floor(1000 + Math.random() * 9000)}`; } while (existing.has(sku));
    setForm(f => ({ ...f, sku }));
  };

  const openScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert('', t.modal.cameraDenied); return; }
    }
    scannedRef.current = false;
    setScanOpen(true);
  };

  // Barcode fires repeatedly — take the first hit, fill the SKU, close.
  const onScanned = (res: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setForm(f => ({ ...f, sku: res.data }));
    setScanOpen(false);
  };

  const openAdd = () => {
    setForm({ ...EMPTY, location_id: activeLocationId ?? myHomeLocationId ?? null }); setError(''); setSelected(null); setModal('add');
  };
  const openEdit = (id: string) => {
    const item = items.find(it => it.id === id);
    if (!item) return;
    setSelected(item);
    setForm({
      name: item.name, sku: item.sku ?? '', quantity: item.quantity, unit: item.unit,
      unit_cost: item.unit_cost, category: item.category ?? '', low_stock_threshold: item.low_stock_threshold,
      location_id: item.location_id ?? null,
    });
    setError('');
    setModal('edit');
  };
  const openAdjust = (id: string) => {
    const item = items.find(it => it.id === id);
    if (!item) return;
    setSelected(item);
    setAdjustQty(0);
    setAdjustType('add');
    setError('');
    setModal('adjust');
  };

  const save = async () => {
    if (!form.name.trim()) { setError(t.modal.errorNameRequired); return; }
    if (!business) return;
    setSaving(true);
    setError('');
    const payload = { ...form, name: form.name.trim(), sku: form.sku || null, category: form.category || null };
    const isEdit = modal === 'edit' && !!selected;
    const id = isEdit ? selected!.id : newUuid();
    try {
      if (isEdit) {
        await queuedUpdate({ table: 'inventory_items', match: { id }, payload, businessId: business.id, label: `Inventario: ${payload.name}` });
      } else {
        await queuedInsert({ table: 'inventory_items', payload: { ...payload, id, business_id: business.id }, businessId: business.id, label: `Inventario: ${payload.name}` });
      }
    } catch { setError(t.modal.errorSave); setSaving(false); return; }
    // Optimistic local + cache so the change shows offline.
    setItems(prev => {
      const next = isEdit
        ? prev.map(i => (i.id === id ? ({ ...i, ...payload } as RawItem) : i))
        : [{ ...payload, id, business_id: business.id } as RawItem, ...prev];
      void writeCached(`inventory_${business.id}`, next);
      return next;
    });
    setSaving(false);
    setModal(null);
  };

  const adjust = async () => {
    if (!selected || adjustQty <= 0) { setError(t.adjustModal.errorInvalidQty); return; }
    setSaving(true);
    const newQty = adjustType === 'add'
      ? selected.quantity + adjustQty
      : Math.max(0, selected.quantity - adjustQty);
    try {
      await queuedUpdate({ table: 'inventory_items', match: { id: selected.id }, payload: { quantity: newQty }, businessId: business?.id ?? null, label: `Inventario: ${selected.name}` });
    } catch { setSaving(false); return; }
    setItems(prev => {
      const next = prev.map(i => (i.id === selected.id ? { ...i, quantity: newQty } : i));
      if (business) void writeCached(`inventory_${business.id}`, next);
      return next;
    });
    setSaving(false);
    setModal(null);
  };

  const remove = (id: string) => {
    Alert.alert(t.modal.editTitle, t.confirmDelete, [
      { text: tc.buttons.cancel, style: 'cancel' },
      {
        text: tc.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await queuedDelete({ table: 'inventory_items', match: { id }, businessId: business?.id ?? null, label: 'Eliminar inventario' });
          } catch { return; }
          setItems(prev => {
            const next = prev.filter(i => i.id !== id);
            if (business) void writeCached(`inventory_${business.id}`, next);
            return next;
          });
        },
      },
    ]);
  };

  const unitOptions = UNIT_KEYS.map(k => ({ value: UNIT_DB_VALUES[k], label: t.units[k] }));

  const modals = (
    <>
      {/* Add / Edit */}
      <Modal
        open={modal === 'add' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? t.modal.editTitle : t.modal.addTitle}
      >
        <View className="gap-4">
          <Input
            label={t.modal.nameLabel}
            placeholder={t.modal.namePlaceholder}
            value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))}
          />
          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-ink">{t.modal.skuLabel}</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={openScan}
                  accessibilityLabel={t.modal.scanSku}
                  className="w-9 h-9 rounded-lg border border-border bg-card items-center justify-center active:bg-surface"
                >
                  <ScanLine size={16} color={c.primary} />
                </Pressable>
                <Pressable
                  onPress={genSku}
                  accessibilityLabel={t.modal.generateSku}
                  className="w-9 h-9 rounded-lg border border-border bg-card items-center justify-center active:bg-surface"
                >
                  <Sparkles size={16} color={c.primary} />
                </Pressable>
              </View>
            </View>
            <Input
              placeholder={t.modal.skuPlaceholder}
              value={form.sku ?? ''}
              onChangeText={v => setForm(f => ({ ...f, sku: v }))}
              autoCapitalize="characters"
            />
          </View>
          <AutocompleteInput
            label={t.modal.categoryLabel}
            placeholder={t.modal.categoryPlaceholder}
            value={form.category ?? ''}
            onChangeText={v => setForm(f => ({ ...f, category: v }))}
            suggestions={categorySuggestions}
          />
          {/* Branch — only when the business runs multiple locations. */}
          {locations.length >= 2 ? (
            <Select
              label={locale === 'en' ? 'Location' : 'Ubicación'}
              value={form.location_id ?? ''}
              onValueChange={v => setForm(f => ({ ...f, location_id: v || null }))}
              options={[{ value: '', label: locale === 'en' ? 'No location' : 'Sin ubicación' }, ...locations.map(l => ({ value: l.id, label: l.name }))]}
            />
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={t.modal.quantityLabel}
                keyboardType="number-pad"
                value={form.quantity ? String(form.quantity) : ''}
                onChangeText={v => setForm(f => ({ ...f, quantity: parseInt(v, 10) || 0 }))}
              />
            </View>
            <View className="flex-1">
              <Select
                label={t.modal.unitLabel}
                value={form.unit}
                onValueChange={v => setForm(f => ({ ...f, unit: v }))}
                options={unitOptions}
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={t.modal.unitCostLabel}
                keyboardType="decimal-pad"
                value={form.unit_cost ? String(form.unit_cost) : ''}
                onChangeText={v => setForm(f => ({ ...f, unit_cost: parseFloat(v) || 0 }))}
              />
            </View>
            <View className="flex-1">
              <Input
                label={t.modal.lowStockThresholdLabel}
                keyboardType="number-pad"
                value={form.low_stock_threshold ? String(form.low_stock_threshold) : ''}
                onChangeText={v => setForm(f => ({ ...f, low_stock_threshold: parseInt(v, 10) || 0 }))}
              />
            </View>
          </View>
          {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
          <View className="flex-row gap-3 pt-2">
            <Button variant="secondary" onPress={() => setModal(null)} className="flex-1">{tc.buttons.cancel}</Button>
            <Button onPress={save} loading={saving} className="flex-1">{tc.buttons.save}</Button>
          </View>
        </View>
      </Modal>

      {/* Adjust stock */}
      <Modal
        open={modal === 'adjust'}
        onClose={() => setModal(null)}
        title={t.adjustModal.title.replace('{{name}}', selected?.name ?? '')}
        size="sm"
      >
        <View className="gap-4">
          <Text className="text-sm text-muted">
            {t.adjustModal.currentStock}{' '}
            <Text className="font-bold text-ink">
              {selected?.quantity} {selected ? unitLabel(selected.unit) : ''}
            </Text>
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setAdjustType('add')}
              className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl border-2 ${
                adjustType === 'add' ? 'border-emerald-500 bg-emerald-500/10' : 'border-border'
              }`}
            >
              <TrendingUp size={15} color={adjustType === 'add' ? c.success : c.faint} />
              <Text className={`text-sm font-semibold ${adjustType === 'add' ? 'text-emerald-600' : 'text-muted'}`}>
                {t.adjustModal.addOption}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAdjustType('remove')}
              className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl border-2 ${
                adjustType === 'remove' ? 'border-red-400 bg-red-500/10' : 'border-border'
              }`}
            >
              <TrendingDown size={15} color={adjustType === 'remove' ? c.danger : c.faint} />
              <Text className={`text-sm font-semibold ${adjustType === 'remove' ? 'text-red-500' : 'text-muted'}`}>
                {t.adjustModal.removeOption}
              </Text>
            </Pressable>
          </View>
          <Input
            label={t.adjustModal.quantityLabel}
            keyboardType="number-pad"
            placeholder={t.adjustModal.quantityPlaceholder}
            value={adjustQty ? String(adjustQty) : ''}
            onChangeText={v => setAdjustQty(parseInt(v, 10) || 0)}
          />
          {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
          <View className="flex-row gap-3 pt-2">
            <Button variant="secondary" onPress={() => setModal(null)} className="flex-1">{tc.buttons.cancel}</Button>
            <Button onPress={adjust} loading={saving} className="flex-1">
              {`${adjustType === 'add' ? '+' : '-'}${adjustQty || 0} ${selected ? unitLabel(selected.unit) : ''}`}
            </Button>
          </View>
        </View>
      </Modal>

      {/* Barcode / SKU scanner */}
      <RNModal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View className="flex-1 bg-black">
          {scanOpen ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr'] }}
              onBarcodeScanned={onScanned}
            />
          ) : null}
          <SafeAreaView edges={['top', 'bottom']} className="absolute inset-0 justify-between" pointerEvents="box-none">
            <View className="flex-row justify-end p-4">
              <Pressable onPress={() => setScanOpen(false)} className="w-10 h-10 rounded-full bg-black/50 items-center justify-center">
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>
            <View className="items-center pb-12 px-8">
              <Text className="text-white text-center text-sm">{t.modal.scanHint}</Text>
            </View>
          </SafeAreaView>
        </View>
      </RNModal>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <LocationSwitcher />
      <SharedInventoryScreen
        loading={loading}
        items={screenItems}
        unitLabel={unitLabel}
        onAddItem={canEdit ? openAdd : undefined}
        onEditItem={canEdit ? openEdit : undefined}
        onAdjustItem={canEdit ? openAdjust : undefined}
        onDeleteItem={canEdit ? remove : undefined}
        modalsSlot={canEdit ? modals : undefined}
      />
    </SafeAreaView>
  );
}

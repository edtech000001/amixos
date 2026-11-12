import { useEffect, useMemo, useRef, useState } from 'react';
import { useRefreshOnRefocus } from '@/lib/useRefreshOnRefocus';
import { usePullRefresh } from '@amixos/shared/ui/usePullRefresh';
import { View, Text, Pressable, Alert, Modal as RNModal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, ScanLine, Sparkles, X, ChevronLeft, Pencil, Trash2, AlertTriangle, Package } from 'lucide-react-native';
import { SplitEmpty, SplitView, useSplitView } from '@/components/SplitView';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { createSupabaseClient } from '@/lib/supabase';
import { useSwr, swrPatch } from '@amixos/shared/lib/swrCache';
import { queuedInsert, queuedUpdate, queuedDelete } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { useApp } from '@/lib/AppContext';
import { useThemeColors } from '@/lib/ThemeProvider';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import { useLang } from '@/lib/i18n/LangProvider';
import { Button, Input, Select, AutocompleteInput } from '@amixos/shared/ui';
import {
  InventoryScreen as SharedInventoryScreen,
  type InventoryItem as ScreenItem,
} from '@amixos/shared/screens/dashboard/InventoryScreen';
import {
  fetchInventoryPage,
  fetchInventoryStats,
  type InventoryCursor,
  type InventoryStats,
} from '@amixos/shared/lib/inventoryQuery';
import { can } from '@amixos/shared/lib/permissions';
import { useMoreBack } from '@/lib/useMoreBack';

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
  // ← back to Más when opened from there; hidden when pinned to the dock.
  const moreBack = useMoreBack('inventory');
  const { t: full, locale } = useLang();
  const t = full.dashboard.inventory;
  const tc = full.common;
  const supabase = createSupabaseClient();
  const { business, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  const c = useThemeColors();
  // Read-only / non-writer roles keep view access; the add/edit/adjust/delete
  // buttons are gated off (RLS blocks the writes server-side either way).
  const canEdit = can.editInventory(currentRole);
  const { split, listWidth } = useSplitView();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | 'adjust' | null>(null);
  const [selected, setSelected] = useState<RawItem | null>(null);
  // Item whose details are showing (a page on phones, the right pane in split).
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<RawItem, 'id'>>(EMPTY);
  // Raw text for the unit-cost input — parsing per keystroke ate the decimal
  // point ('15.' → 15), making cents impossible to type. Parsed into form.
  const [unitCostText, setUnitCostText] = useState('');
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  // What a scan is for: filling the form's SKU, or finding an item by code.
  const scanForRef = useRef<'sku' | 'find'>('sku');

  // ── Server-side pagination + search + segment + whole-scope stats ───────────
  const [serverStats, setServerStats] = useState<InventoryStats>({ count: 0, value: 0, lowStockCount: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<InventoryCursor | null>(null);
  const paramsRef = useRef<{ search: string; lowStockOnly: boolean } | null>(null);

  const runQuery = async (base: { search: string; lowStockOnly: boolean }) => {
    paramsRef.current = base;
    if (!business) return;
    const businessId = business.id;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const params = { businessId, locationId: activeLocationId ?? null, ...base };
    try {
      const [page, stats] = await Promise.all([
        fetchInventoryPage<RawItem>(supabase, '*', { ...params, pageSize: 50 }),
        fetchInventoryStats(supabase, { businessId, locationId: activeLocationId ?? null }),
      ]);
      if (seq !== loadSeqRef.current) return;
      setItems(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      setServerStats(stats);
    } catch { /* offline / error — keep what's loaded */ }
    finally { if (seq === loadSeqRef.current) setLoading(false); }
  };

  // ── SWR default view (no search/segment): instant from cache ──────────────
  const [invFilters, setInvFilters] = useState<{ search: string; lowStockOnly: boolean } | null>(null);
  const defaultActive = !!business && !!invFilters && !invFilters.search && !invFilters.lowStockOnly;
  type InvPayload = { items: RawItem[]; nextCursor: InventoryCursor | null; stats: InventoryStats };
  // The list snapshot key; optimistic writes patch it even while a filter is on.
  const invCacheKey = `inventory_v2_${business?.id ?? ''}_${activeLocationId ?? 'all'}`;
  const swrKey = defaultActive ? invCacheKey : null;
  const swr = useSwr<InvPayload>(
    swrKey,
    async () => {
      const [page, stats] = await Promise.all([
        fetchInventoryPage<RawItem>(supabase, '*', { businessId: business!.id, locationId: activeLocationId ?? null, search: '', lowStockOnly: false, pageSize: 50 }),
        fetchInventoryStats(supabase, { businessId: business!.id, locationId: activeLocationId ?? null }),
      ]);
      return { items: page.items, nextCursor: page.nextCursor, stats };
    },
    {
      cacheKey: swrKey,
      resetKey: `${business?.id ?? ''}_${activeLocationId ?? 'all'}`,
      focusThrottleMs: 3_000,
      cacheTrim: (d) => ({ ...d, items: d.items.slice(0, 50), nextCursor: null }),
    },
  );
  useEffect(() => {
    if (!swrKey || !swr.data) return;
    ++loadSeqRef.current;
    paramsRef.current = { search: '', lowStockOnly: false };
    setItems(swr.data.items);
    cursorRef.current = swr.data.nextCursor;
    setHasMore(!!swr.data.nextCursor);
    setServerStats(swr.data.stats);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swr.data, swrKey]);


  const loadMore = async () => {
    if (loadingMore || !paramsRef.current || !cursorRef.current || !business) return;
    const seq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchInventoryPage<RawItem>(supabase, '*', { businessId: business.id, locationId: activeLocationId ?? null, ...paramsRef.current, cursor: cursorRef.current, pageSize: 50 });
      if (seq !== loadSeqRef.current) return;
      setItems(prev => [...prev, ...page.items]);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
    } catch { /* offline / error — keep what's loaded */ }
    finally { setLoadingMore(false); }
  };

  const reRun = (): Promise<unknown> => {
    if (defaultActive) return swr.refresh({ force: true });
    return paramsRef.current ? runQuery(paramsRef.current) : Promise.resolve();
  };
  const pull = usePullRefresh(reRun);
  useRefreshOnRefocus(() => (defaultActive ? swr.refresh() : reRun()));
  const handleFiltersChange = (f: { search: string; lowStockOnly: boolean }) => {
    setInvFilters(f);
    if (!f.search && !f.lowStockOnly) return; // SWR owns the default view
    void runQuery(f);
  };
  // Re-query when business finally loads or the branch changes (the SWR key
  // covers the default view).
  useEffect(() => { if (!defaultActive) reRun(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [business, activeLocationId]);

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

  const openScan = async (mode: 'sku' | 'find' = 'sku') => {
    scanForRef.current = mode;
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
    setScanOpen(false);
    // Wait out the scanner's slide-down — iOS drops an Alert raised mid-dismiss.
    if (scanForRef.current === 'find') { const code = res.data.trim(); setTimeout(() => void findByCode(code), 400); }
    else setForm(f => ({ ...f, sku: res.data }));
  };

  // Scan-to-find: exact SKU match — the loaded page first, then the whole
  // business (the item may be on an unloaded page or another branch).
  const findByCode = async (code: string) => {
    if (!code || !business) return;
    let hit = items.find(i => i.sku === code) ?? null;
    if (!hit) {
      const { data } = await supabase.from('inventory_items').select('*')
        .eq('business_id', business.id).eq('sku', code).limit(1).maybeSingle();
      hit = (data as RawItem | null) ?? null;
      if (hit) { const row = hit; setItems(prev => [row, ...prev.filter(i => i.id !== row.id)]); }
    }
    if (hit) { setModal(null); setOpenId(hit.id); return; }
    Alert.alert(t.scanFind, t.scanNotFound.replace('{{code}}', code), [
      { text: tc.buttons.cancel, style: 'cancel' },
      ...(canEdit ? [{ text: t.addItem, onPress: () => { openAdd(); setForm(f => ({ ...f, sku: code })); } }] : []),
    ]);
  };

  const openAdd = () => {
    setForm({ ...EMPTY, location_id: activeLocationId ?? myHomeLocationId ?? null }); setUnitCostText(''); setError(''); setSelected(null); setModal('add');
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
    setUnitCostText(item.unit_cost ? String(item.unit_cost) : '');
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
    const row = { ...payload, id, business_id: business.id } as RawItem;
    const apply = (list: RawItem[]) => isEdit
      ? list.map(i => (i.id === id ? ({ ...i, ...payload } as RawItem) : i))
      : [row, ...list];
    setItems(apply);
    void swrPatch<InvPayload>(invCacheKey, d => ({ ...d, items: apply(d.items) }));
    setSaving(false);
    setModal(null);
    if (!isEdit && split) setOpenId(id);
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
    const adjustOne = (list: RawItem[]) => list.map(i => (i.id === selected.id ? { ...i, quantity: newQty } : i));
    setItems(adjustOne);
    void swrPatch<InvPayload>(invCacheKey, d => ({ ...d, items: adjustOne(d.items) }));
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
          setItems(prev => prev.filter(i => i.id !== id));
          setOpenId(prev => (prev === id ? null : prev));
          void swrPatch<InvPayload>(invCacheKey, d => ({ ...d, items: d.items.filter(i => i.id !== id) }));
        },
      },
    ]);
  };

  const unitOptions = UNIT_KEYS.map(k => ({ value: UNIT_DB_VALUES[k], label: t.units[k] }));

  const formOpen = modal === 'add' || modal === 'edit';
  // Add / edit — a full page on phones, the right pane in split view.
  const formContent = (
    <>
      <View className="flex-row items-center px-3 pt-2 pb-3 border-b border-border-soft bg-card">
        {split ? null : (
          <Pressable onPress={() => setModal(null)} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
            <ChevronLeft size={22} color={c.ink} />
          </Pressable>
        )}
        <Text className={`text-lg font-bold text-ink flex-1 ${split ? 'ml-2' : 'mx-1'}`} numberOfLines={1}>
          {modal === 'edit' ? t.modal.editTitle : t.modal.addTitle}
        </Text>
        {split ? (
          <Pressable onPress={() => setModal(null)} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
            <X size={20} color={c.faint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerClassName="px-5 py-5 pb-44 gap-4" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
                onPress={() => openScan('sku')}
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
              value={unitCostText}
              onChangeText={v => {
                let clean = v.replace(/[^0-9.]/g, '');
                const dot = clean.indexOf('.');
                if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
                setUnitCostText(clean);
                setForm(f => ({ ...f, unit_cost: parseFloat(clean) || 0 }));
              }}
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
      </ScrollView>
    </>
  );

  const openItem = items.find(i => i.id === openId) ?? null;
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Details — a full page on phones (not a modal, so the adjust sheet and
  // delete alert present cleanly above it); the right pane in split view.
  const detailView = !openItem ? null : (() => {
    const low = openItem.quantity <= openItem.low_stock_threshold;
    const rows: [string, string][] = [
      [t.modal.skuLabel, openItem.sku || '—'],
      [t.modal.categoryLabel, openItem.category || '—'],
      ...(locations.length >= 2 ? [[t.detail.location, locations.find(l => l.id === openItem.location_id)?.name ?? '—'] as [string, string]] : []),
      [t.modal.unitCostLabel, money(openItem.unit_cost)],
      [t.detail.minStock, `${openItem.low_stock_threshold} ${unitLabel(openItem.unit)}`],
    ];
    return (
      <View
        style={split
          ? { flex: 1, backgroundColor: c.surface }
          : [StyleSheet.absoluteFill, { backgroundColor: c.surface, zIndex: 30, elevation: 30, paddingTop: insets.top }]}
      >
        <View className="flex-row items-center px-3 pt-2 pb-3 border-b border-border-soft bg-card">
          {split ? null : (
            <Pressable onPress={() => setOpenId(null)} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
              <ChevronLeft size={22} color={c.ink} />
            </Pressable>
          )}
          <Text className={`text-lg font-bold text-ink flex-1 ${split ? 'ml-2' : 'mx-1'}`} numberOfLines={1}>{openItem.name}</Text>
          {canEdit ? (
            <>
              <Pressable onPress={() => openEdit(openItem.id)} hitSlop={8} accessibilityLabel={tc.buttons.edit} className="p-2 rounded-lg active:bg-border-soft">
                <Pencil size={18} color={c.muted} />
              </Pressable>
              <Pressable onPress={() => remove(openItem.id)} hitSlop={8} accessibilityLabel={tc.buttons.delete} className="p-2 rounded-lg active:bg-red-500/10">
                <Trash2 size={18} color={c.danger} />
              </Pressable>
            </>
          ) : null}
        </View>
        <ScrollView contentContainerClassName="px-4 py-4 pb-44 gap-3">
          <View className="flex-row gap-3">
            <View
              className="flex-1 rounded-2xl border p-4"
              style={low ? { borderColor: `${c.warning}55`, backgroundColor: `${c.warning}1A` } : { borderColor: c.borderSoft, backgroundColor: c.card }}
            >
              <Text className="text-xs font-semibold text-faint uppercase">{t.detail.stock}</Text>
              <Text className="text-2xl font-bold mt-1" style={{ color: low ? c.warning : c.ink }}>
                {openItem.quantity} <Text className="text-sm font-medium text-muted">{unitLabel(openItem.unit)}</Text>
              </Text>
              {low ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <AlertTriangle size={12} color={c.warning} />
                  <Text className="text-xs font-semibold" style={{ color: c.warning }}>{t.detail.lowStock}</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-1 rounded-2xl border border-border-soft bg-card p-4">
              <Text className="text-xs font-semibold text-faint uppercase">{t.detail.totalValue}</Text>
              <Text className="text-2xl font-bold text-ink mt-1" numberOfLines={1} adjustsFontSizeToFit>
                {money(openItem.quantity * openItem.unit_cost)}
              </Text>
            </View>
          </View>
          <View className="rounded-2xl border border-border-soft bg-card">
            {rows.map(([k, v], i) => (
              <View key={k} className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                <Text className="text-sm text-muted">{k}</Text>
                <Text className="text-sm font-medium text-ink ml-4 flex-shrink text-right" numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </View>
          {canEdit ? (
            <Button onPress={() => openAdjust(openItem.id)} className="mt-1">
              {t.actions.adjustStock}
            </Button>
          ) : null}
        </ScrollView>
      </View>
    );
  })();

  const modals = (
    <>

      {/* Adjust stock — bottom sheet (CLAUDE.md structure: backdrop first, card sibling). */}
      <RNModal visible={modal === 'adjust'} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <Pressable onPress={() => setModal(null)} style={SHEET_BACKDROP} />
          <View
            className="bg-card rounded-t-3xl px-5 pt-3 gap-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8, marginLeft: insets.left, marginRight: insets.right }}
          >
            <View className="items-center"><View className="w-10 h-1 bg-border rounded-full" /></View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-bold text-ink flex-1" numberOfLines={1}>
                {t.adjustModal.title.replace('{{name}}', selected?.name ?? '')}
              </Text>
              <Pressable onPress={() => setModal(null)} hitSlop={8} className="p-1.5 rounded-lg active:bg-border-soft">
                <X size={18} color={c.muted} />
              </Pressable>
            </View>
            <Text className="text-sm text-muted">
              {t.adjustModal.currentStock}{' '}
              <Text className="font-bold text-ink">
                {selected?.quantity} {selected ? unitLabel(selected.unit) : ''}
              </Text>
            </Text>
            <View className="flex-row gap-2">
              {(['add', 'remove'] as const).map(kind => {
                const on = adjustType === kind;
                const tint = kind === 'add' ? c.success : c.danger;
                const Icon = kind === 'add' ? TrendingUp : TrendingDown;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setAdjustType(kind)}
                    className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ borderWidth: 2, borderColor: on ? tint : c.border, backgroundColor: on ? `${tint}1A` : 'transparent' }}
                  >
                    <Icon size={15} color={on ? tint : c.faint} />
                    <Text className="text-sm font-semibold" style={{ color: on ? tint : c.muted }}>
                      {kind === 'add' ? t.adjustModal.addOption : t.adjustModal.removeOption}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Input
              label={t.adjustModal.quantityLabel}
              keyboardType="number-pad"
              placeholder={t.adjustModal.quantityPlaceholder}
              value={adjustQty ? String(adjustQty) : ''}
              onChangeText={v => setAdjustQty(parseInt(v, 10) || 0)}
              autoFocus
            />
            {error ? <Text className="text-xs text-red-500">{error}</Text> : null}
            <View className="flex-row gap-3">
              <Button variant="secondary" onPress={() => setModal(null)} className="flex-1">{tc.buttons.cancel}</Button>
              <Button onPress={adjust} loading={saving} disabled={adjustQty <= 0} className="flex-1">
                {`${adjustType === 'add' ? '+' : '-'}${adjustQty || 0} ${selected ? unitLabel(selected.unit) : ''}`}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

    </>
  );

  const scanner = (
    <>
      {/* Barcode / SKU scanner */}
      <RNModal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        {scanOpen ? (
          <BarcodeScanner
            barcodeTypes={['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr']}
            onScanned={onScanned}
            onClose={() => setScanOpen(false)}
            hint={t.modal.scanHint}
          />
        ) : null}
      </RNModal>
    </>
  );

  const listPane = (
    <SharedInventoryScreen
      refreshControl={pull.control}
      onBack={moreBack}
      loading={loading}
      items={screenItems}
      unitLabel={unitLabel}
      onAddItem={canEdit ? openAdd : undefined}
      onAdjustItem={canEdit ? openAdjust : undefined}
      onOpenItem={(id) => { setModal(null); setOpenId(id); }}
      activeId={split ? openId : null}
      addInHeader={split}
      onScan={() => openScan('find')}
      serverMode
      serverStats={serverStats}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      onFiltersChange={handleFiltersChange}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <LocationSwitcher />
      {split ? (
        <SplitView
          listWidth={listWidth}
          list={listPane}
          detail={formOpen ? (
            // key: fresh pane per item, so the form never keeps another's scroll.
            <View key={`form-${selected?.id ?? 'new'}`} style={{ flex: 1, backgroundColor: c.card }}>{formContent}</View>
          ) : detailView ?? <SplitEmpty icon={Package} text={t.splitEmpty} />}
        />
      ) : listPane}
      {!split ? detailView : null}
      {/* Phones: add / edit is a full-screen page over the list / details. */}
      {!split && formOpen ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface, zIndex: 31, elevation: 31, paddingTop: insets.top }]}>
          {formContent}
        </View>
      ) : null}
      {canEdit ? modals : null}
      {scanner}
    </SafeAreaView>
  );
}

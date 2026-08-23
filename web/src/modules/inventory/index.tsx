'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { TrendingDown, TrendingUp, Sparkles } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useSwr } from '@amixos/shared/lib/swrCache';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import {
  InventoryScreen,
  type InventoryItem as ScreenItem,
} from '@amixos/shared/screens/dashboard/InventoryScreen';
import {
  fetchInventoryPage,
  fetchInventoryStats,
  type InventoryCursor,
  type InventoryQueryParams,
  type InventoryStats,
} from '@amixos/shared/lib/inventoryQuery';
import { can } from '@amixos/shared/lib/permissions';
import { Tooltip } from '@amixos/shared/ui/Tooltip';

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

export default function InventoryModule() {
  const { t: full, locale } = useLang();
  const t = full.dashboard.inventory;
  const tc = full.common;

  const supabase = createSupabaseClient();
  const { business, locations, activeLocationId, myHomeLocationId, currentRole } = useApp();
  // Read-only / non-writer roles keep view access; the add/edit/adjust/delete
  // buttons are gated off (RLS blocks the writes server-side either way).
  const canEdit = can.editInventory(currentRole);
  const [items, setItems] = useState<RawItem[]>([]);
  const [modal, setModal] = useState<'add' | 'edit' | 'adjust' | null>(null);
  const [selected, setSelected] = useState<RawItem | null>(null);
  const [form, setForm] = useState<Omit<RawItem, 'id'>>(EMPTY);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // ── Server-side pagination + search + segment + whole-scope stats ───────────
  const [serverStats, setServerStats] = useState<InventoryStats>({ count: 0, value: 0, lowStockCount: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSeqRef = useRef(0);
  const cursorRef = useRef<InventoryCursor | null>(null);
  const paramsRef = useRef<{ search: string; lowStockOnly: boolean } | null>(null);

  const runQuery = async (base: { search: string; lowStockOnly: boolean }) => {
    if (!business) return;
    const seq = ++loadSeqRef.current;
    paramsRef.current = base;
    setLoading(true);
    cursorRef.current = null;
    setHasMore(false);
    const params: InventoryQueryParams = { businessId: business.id, locationId: activeLocationId ?? null, ...base };
    try {
      const [page, stats] = await Promise.all([
        fetchInventoryPage<RawItem>(supabase, '*', { ...params, pageSize: 50 }),
        fetchInventoryStats(supabase, { businessId: business.id, locationId: activeLocationId ?? null }),
      ]);
      if (seq !== loadSeqRef.current) return;
      setItems(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(!!page.nextCursor);
      setServerStats(stats);
    } catch (e) {
      console.error('Inventory query failed', e);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  // ── SWR default view (no search/segment): instant from cache ──────────────
  const [invFilters, setInvFilters] = useState<{ search: string; lowStockOnly: boolean } | null>(null);
  const defaultActive = !!business && !!invFilters && !invFilters.search && !invFilters.lowStockOnly;
  type InvPayload = { items: RawItem[]; nextCursor: InventoryCursor | null; stats: InventoryStats };
  const swrKey = defaultActive ? `inventory_v2_${business.id}_${activeLocationId ?? 'all'}` : null;
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
    } catch (e) {
      console.error('Inventory load-more failed', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const reRun = () => {
    if (defaultActive) { swr.refresh({ force: true }); return; }
    if (paramsRef.current) void runQuery(paramsRef.current);
  };
  const handleFiltersChange = (f: { search: string; lowStockOnly: boolean }) => {
    setInvFilters(f);
    if (!f.search && !f.lowStockOnly) return; // SWR owns the default view
    void runQuery(f);
  };
  // Re-query on branch change (the SWR key covers the default view).
  useEffect(() => { if (!defaultActive) reRun(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeLocationId]);

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

  // Previously-used categories — offered as a datalist while typing.
  const categorySuggestions = useMemo(
    () => Array.from(new Set(items.map(i => i.category).filter((c): c is string => !!c && c.trim() !== ''))).sort(),
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

  const openAdd = () => {
    // New stock defaults to the active branch, or the business default.
    setForm({ ...EMPTY, location_id: activeLocationId ?? myHomeLocationId ?? null }); setError(''); setModal('add');
  };
  const openEdit = (id: string) => {
    const item = items.find(it => it.id === id); if (!item) return;
    setSelected(item);
    setForm({ name: item.name, sku: item.sku ?? '', quantity: item.quantity, unit: item.unit, unit_cost: item.unit_cost, category: item.category ?? '', low_stock_threshold: item.low_stock_threshold, location_id: item.location_id ?? null });
    setError(''); setModal('edit');
  };
  const openAdjust = (id: string) => {
    const item = items.find(it => it.id === id); if (!item) return;
    setSelected(item); setAdjustQty(0); setAdjustType('add'); setModal('adjust');
  };

  const save = async () => {
    if (!form.name.trim()) { setError(t.modal.errorNameRequired); return; }
    setSaving(true); setError('');
    const payload = { ...form, sku: form.sku || null, category: form.category || null };
    if (modal === 'add') {
      const { error: e } = await supabase.from('inventory_items').insert({ ...payload, business_id: business!.id });
      if (e) { setError(t.modal.errorSave); setSaving(false); return; }
    } else if (modal === 'edit' && selected) {
      const { error: e } = await supabase.from('inventory_items').update(payload).eq('id', selected.id);
      if (e) { setError(t.modal.errorSave); setSaving(false); return; }
    }
    reRun(); setSaving(false); setModal(null);
  };

  const adjust = async () => {
    if (!selected || adjustQty <= 0) { setError(t.adjustModal.errorInvalidQty); return; }
    setSaving(true);
    const newQty = adjustType === 'add'
      ? selected.quantity + adjustQty
      : Math.max(0, selected.quantity - adjustQty);
    await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', selected.id);
    setItems(prev => prev.map(i => i.id === selected.id ? { ...i, quantity: newQty } : i));
    setSaving(false); setModal(null);
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: t.confirmDelete, destructive: true }))) return;
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const modals = (
    <>
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'add' ? t.modal.addTitle : t.modal.editTitle}>
        <div className="flex flex-col gap-4">
          <Input label={t.modal.nameLabel} placeholder={t.modal.namePlaceholder} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t.modal.skuLabel}
              placeholder={t.modal.skuPlaceholder}
              value={form.sku ?? ''}
              onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              rightIcon={
                <Tooltip tip="generateSku">
                  <button type="button" onClick={genSku} className="p-1 text-primary hover:opacity-70">
                    <Sparkles size={16} />
                  </button>
                </Tooltip>
              }
            />
            <Input label={t.modal.categoryLabel} placeholder={t.modal.categoryPlaceholder} value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} list="inventory-categories" />
          </div>
          <datalist id="inventory-categories">
            {categorySuggestions.map(c => <option key={c} value={c} />)}
          </datalist>
          {/* Branch — only when the business runs multiple locations. */}
          {locations.length >= 2 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{locale === 'en' ? 'Location' : 'Ubicación'}</label>
              <select value={form.location_id ?? ''} onChange={e => setForm(f => ({ ...f, location_id: e.target.value || null }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                <option value="">{locale === 'en' ? 'No location' : 'Sin ubicación'}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.quantityLabel} type="number" min="0" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">{t.modal.unitLabel}</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                {UNIT_KEYS.map(k => <option key={k} value={UNIT_DB_VALUES[k]}>{t.units[k]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.unitCostLabel} type="number" min="0" step="0.01" value={form.unit_cost || ''} onChange={e => setForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))} />
            <Input label={t.modal.lowStockThresholdLabel} type="number" min="0" value={form.low_stock_threshold || ''} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'adjust'} onClose={() => setModal(null)} title={t.adjustModal.title.replace('{{name}}', selected?.name ?? '')} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t.adjustModal.currentStock} <span className="font-bold text-ink">{selected?.quantity} {selected ? unitLabel(selected.unit) : ''}</span></p>
          <div className="flex gap-2">
            <button onClick={() => setAdjustType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'add' ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10' : 'border-border text-muted'}`}>
              <TrendingUp size={15}/> {t.adjustModal.addOption}
            </button>
            <button onClick={() => setAdjustType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'remove' ? 'border-red-400 text-red-500 bg-red-500/10' : 'border-border text-muted'}`}>
              <TrendingDown size={15}/> {t.adjustModal.removeOption}
            </button>
          </div>
          <Input label={t.adjustModal.quantityLabel} type="number" min="1" placeholder={t.adjustModal.quantityPlaceholder} value={adjustQty || ''} onChange={e => setAdjustQty(parseFloat(e.target.value) || 0)} autoFocus />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={adjust} loading={saving} fullWidth>
              {adjustType === 'add' ? `+${adjustQty || 0}` : `-${adjustQty || 0}`} {selected ? unitLabel(selected.unit) : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );

  return (
    <InventoryScreen
      loading={loading}
      items={screenItems}
      unitLabel={unitLabel}
      onAddItem={canEdit ? openAdd : undefined}
      onEditItem={canEdit ? openEdit : undefined}
      onAdjustItem={canEdit ? openAdjust : undefined}
      onDeleteItem={canEdit ? remove : undefined}
      modalsSlot={canEdit ? modals : undefined}
      serverMode
      serverStats={serverStats}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      onFiltersChange={handleFiltersChange}
    />
  );
}

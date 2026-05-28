'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import {
  InventoryScreen,
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

const EMPTY: Omit<RawItem, 'id'> = {
  name: '', sku: '', quantity: 0, unit: 'unidad', unit_cost: 0, category: '', low_stock_threshold: 5,
};

const UNIT_KEYS = ['unidad', 'pieza', 'kg', 'lb', 'metro', 'pie', 'litro', 'galon', 'caja', 'rollo', 'bolsa'] as const;
const UNIT_DB_VALUES: Record<typeof UNIT_KEYS[number], string> = {
  unidad: 'unidad', pieza: 'pieza', kg: 'kg', lb: 'lb', metro: 'metro', pie: 'pie',
  litro: 'litro', galon: 'galón', caja: 'caja', rollo: 'rollo', bolsa: 'bolsa',
};

export default function InventarioPage() {
  const { t: full } = useLang();
  const t = full.dashboard.inventory;
  const tc = full.common;

  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [items, setItems] = useState<RawItem[]>([]);
  const [modal, setModal] = useState<'add' | 'edit' | 'adjust' | null>(null);
  const [selected, setSelected] = useState<RawItem | null>(null);
  const [form, setForm] = useState<Omit<RawItem, 'id'>>(EMPTY);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business) return;
    const businessId = business.id;
    const data = await fetchAll<RawItem>((from, to) =>
      supabase.from('inventory_items').select('*').eq('business_id', businessId)
        .order('name').range(from, to));
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

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

  const openAdd = () => { setForm({ ...EMPTY }); setError(''); setModal('add'); };
  const openEdit = (id: string) => {
    const item = items.find(it => it.id === id); if (!item) return;
    setSelected(item);
    setForm({ name: item.name, sku: item.sku ?? '', quantity: item.quantity, unit: item.unit, unit_cost: item.unit_cost, category: item.category ?? '', low_stock_threshold: item.low_stock_threshold });
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
    await load(); setSaving(false); setModal(null);
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
    if (!confirm(t.confirmDelete)) return;
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const modals = (
    <>
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'add' ? t.modal.addTitle : t.modal.editTitle}>
        <div className="flex flex-col gap-4">
          <Input label={t.modal.nameLabel} placeholder={t.modal.namePlaceholder} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.skuLabel} placeholder={t.modal.skuPlaceholder} value={form.sku ?? ''} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            <Input label={t.modal.categoryLabel} placeholder={t.modal.categoryPlaceholder} value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.quantityLabel} type="number" min="0" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.modal.unitLabel}</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
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
          <p className="text-sm text-gray-500">{t.adjustModal.currentStock} <span className="font-bold text-gray-900">{selected?.quantity} {selected ? unitLabel(selected.unit) : ''}</span></p>
          <div className="flex gap-2">
            <button onClick={() => setAdjustType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'add' ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-gray-200 text-gray-500'}`}>
              <TrendingUp size={15}/> {t.adjustModal.addOption}
            </button>
            <button onClick={() => setAdjustType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'remove' ? 'border-red-400 text-red-500 bg-red-50' : 'border-gray-200 text-gray-500'}`}>
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
      onAddItem={openAdd}
      onEditItem={openEdit}
      onAdjustItem={openAdjust}
      onDeleteItem={remove}
      modalsSlot={modals}
    />
  );
}

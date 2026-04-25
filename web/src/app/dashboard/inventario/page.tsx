'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, Package, AlertTriangle, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';

interface Item {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  category: string | null;
  low_stock_threshold: number;
}

const EMPTY: Omit<Item, 'id'> = {
  name: '', sku: '', quantity: 0, unit: 'unidad', unit_cost: 0, category: '', low_stock_threshold: 5,
};

const UNIT_KEYS = ['unidad', 'pieza', 'kg', 'lb', 'metro', 'pie', 'litro', 'galon', 'caja', 'rollo', 'bolsa'] as const;
// Map t.units key -> stored DB value (preserves existing data: e.g. 'galón' in DB)
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
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'bajo_stock'>('todos');
  const [modal, setModal] = useState<'add' | 'edit' | 'adjust' | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, 'id'>>(EMPTY);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business) return;
    const { data } = await supabase.from('inventory_items').select('*').eq('business_id', business.id).order('name');
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const openAdd = () => { setForm({ ...EMPTY }); setError(''); setModal('add'); };
  const openEdit = (item: Item) => {
    setSelected(item);
    setForm({ name: item.name, sku: item.sku ?? '', quantity: item.quantity, unit: item.unit, unit_cost: item.unit_cost, category: item.category ?? '', low_stock_threshold: item.low_stock_threshold });
    setError(''); setModal('edit');
  };
  const openAdjust = (item: Item) => { setSelected(item); setAdjustQty(0); setAdjustType('add'); setModal('adjust'); };

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

  // Look up the localized unit label for a stored DB value; fall back to raw value
  const unitLabel = (dbValue: string): string => {
    const entry = (Object.entries(UNIT_DB_VALUES) as [typeof UNIT_KEYS[number], string][])
      .find(([, v]) => v === dbValue);
    return entry ? t.units[entry[0]] : dbValue;
  };

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = `${i.name} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
    if (filter === 'bajo_stock') return matchSearch && i.quantity <= i.low_stock_threshold;
    return matchSearch;
  });

  const lowStockCount = items.filter(i => i.quantity <= i.low_stock_threshold).length;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  const valueFormatted = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const summaryText = t.summary
    .replace('{{count}}', String(items.length))
    .replace('{{value}}', valueFormatted);
  const summaryLowStockText = t.summaryLowStock.replace('{{count}}', String(lowStockCount));
  const lowStockBannerText = (lowStockCount > 1 ? t.lowStockBannerPlural : t.lowStockBannerSingle)
    .replace('{{count}}', String(lowStockCount));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {summaryText}
            {lowStockCount > 0 && <span className="ml-2 text-orange-500 font-medium">· {summaryLowStockText}</span>}
          </p>
        </div>
        <Button onClick={openAdd} size="md"><Plus size={15} className="mr-1.5"/> {t.addItem}</Button>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 mb-4">
          <AlertTriangle size={18} className="text-orange-500 shrink-0"/>
          <p className="text-sm text-orange-700">
            <span className="font-semibold">{lowStockBannerText}</span> {t.lowStockBannerSuffix}
            <button onClick={() => setFilter('bajo_stock')} className="ml-1.5 underline font-medium">{t.lowStockBannerCta}</button>
          </p>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['todos', 'bajo_stock'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'todos' ? t.filters.all : t.filters.lowStock}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Input placeholder={t.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>}/>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">{search || filter !== 'todos' ? t.emptyNoMatch : t.emptyAll}</p>
          {!search && filter === 'todos' && <button onClick={openAdd} className="text-primary text-sm font-medium hover:underline mt-1">{t.addFirst}</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px_90px_100px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3 border-b border-gray-50">
            <span>{t.cols.item}</span><span className="text-center">{t.cols.stock}</span><span className="text-center">{t.cols.unit}</span><span className="text-right">{t.cols.unitCost}</span><span className="text-right">{t.cols.actions}</span>
          </div>
          {filtered.map((item, i) => {
            const low = item.quantity <= item.low_stock_threshold;
            return (
              <div key={item.id} className={`grid grid-cols-[1fr_80px_80px_90px_100px] items-center px-5 py-3.5 ${i < filtered.length-1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                    {low && <AlertTriangle size={13} className="text-orange-400 shrink-0"/>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.category ? `${item.category}` : ''}
                    {item.sku ? ` · ${t.itemMeta.skuPrefix.replace('{{sku}}', item.sku)}` : ''}
                    {` · ${t.itemMeta.minPrefix.replace('{{min}}', String(item.low_stock_threshold))}`}
                  </p>
                </div>
                <div className={`text-center text-sm font-bold ${low ? 'text-orange-500' : 'text-gray-900'}`}>{item.quantity}</div>
                <div className="text-center text-xs text-gray-500">{unitLabel(item.unit)}</div>
                <div className="text-right text-sm text-gray-700">${item.unit_cost.toFixed(2)}</div>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => openAdjust(item)} title={t.actions.adjustStock} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors">
                    <TrendingUp size={14} className="text-primary"/>
                  </button>
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                    <Pencil size={14} className="text-gray-400"/>
                  </button>
                  <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={14} className="text-red-400"/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
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

      {/* Adjust stock modal */}
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
    </div>
  );
}

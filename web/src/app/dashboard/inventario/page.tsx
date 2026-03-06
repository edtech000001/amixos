'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, Package, AlertTriangle, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

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

const UNITS = ['unidad', 'pieza', 'kg', 'lb', 'metro', 'pie', 'litro', 'galón', 'caja', 'rollo', 'bolsa'];

export default function InventarioPage() {
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
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    const payload = { ...form, sku: form.sku || null, category: form.category || null };
    if (modal === 'add') {
      const { error: e } = await supabase.from('inventory_items').insert({ ...payload, business_id: business!.id });
      if (e) { setError('Error al guardar.'); setSaving(false); return; }
    } else if (modal === 'edit' && selected) {
      const { error: e } = await supabase.from('inventory_items').update(payload).eq('id', selected.id);
      if (e) { setError('Error al guardar.'); setSaving(false); return; }
    }
    await load(); setSaving(false); setModal(null);
  };

  const adjust = async () => {
    if (!selected || adjustQty <= 0) { setError('Ingresa una cantidad válida'); return; }
    setSaving(true);
    const newQty = adjustType === 'add'
      ? selected.quantity + adjustQty
      : Math.max(0, selected.quantity - adjustQty);
    await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', selected.id);
    setItems(prev => prev.map(i => i.id === selected.id ? { ...i, quantity: newQty } : i));
    setSaving(false); setModal(null);
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este artículo?')) return;
    await supabase.from('inventory_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = `${i.name} ${i.sku ?? ''} ${i.category ?? ''}`.toLowerCase().includes(q);
    if (filter === 'bajo_stock') return matchSearch && i.quantity <= i.low_stock_threshold;
    return matchSearch;
  });

  const lowStockCount = items.filter(i => i.quantity <= i.low_stock_threshold).length;
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {items.length} artículos · Valor: ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {lowStockCount > 0 && <span className="ml-2 text-orange-500 font-medium">· {lowStockCount} bajo stock</span>}
          </p>
        </div>
        <Button onClick={openAdd} size="md"><Plus size={15} className="mr-1.5"/> Agregar artículo</Button>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 mb-4">
          <AlertTriangle size={18} className="text-orange-500 shrink-0"/>
          <p className="text-sm text-orange-700">
            <span className="font-semibold">{lowStockCount} artículo{lowStockCount > 1 ? 's' : ''}</span> por debajo del nivel mínimo.
            <button onClick={() => setFilter('bajo_stock')} className="ml-1.5 underline font-medium">Ver ahora</button>
          </p>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['todos', 'bajo_stock'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'todos' ? 'Todos' : '⚠️ Bajo stock'}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Input placeholder="Buscar por nombre, SKU o categoría..." value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>}/>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">{search || filter !== 'todos' ? 'Sin resultados.' : 'Tu inventario está vacío.'}</p>
          {!search && filter === 'todos' && <button onClick={openAdd} className="text-primary text-sm font-medium hover:underline mt-1">Agrega el primer artículo →</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_80px_90px_100px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3 border-b border-gray-50">
            <span>Artículo</span><span className="text-center">Stock</span><span className="text-center">Unidad</span><span className="text-right">Costo/u</span><span className="text-right">Acciones</span>
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
                    {item.sku ? ` · SKU: ${item.sku}` : ''}
                    {` · Mín: ${item.low_stock_threshold}`}
                  </p>
                </div>
                <div className={`text-center text-sm font-bold ${low ? 'text-orange-500' : 'text-gray-900'}`}>{item.quantity}</div>
                <div className="text-center text-xs text-gray-500">{item.unit}</div>
                <div className="text-right text-sm text-gray-700">${item.unit_cost.toFixed(2)}</div>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => openAdjust(item)} title="Ajustar stock" className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors">
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
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'add' ? 'Nuevo artículo' : 'Editar artículo'}>
        <div className="flex flex-col gap-4">
          <Input label="Nombre *" placeholder='ej. Tubo galvanizado 2"' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU / Código" placeholder="TG-001" value={form.sku ?? ''} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            <Input label="Categoría" placeholder="Materiales, Herramientas..." value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cantidad inicial" type="number" min="0" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Unidad</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Costo por unidad ($)" type="number" min="0" step="0.01" value={form.unit_cost || ''} onChange={e => setForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))} />
            <Input label="Stock mínimo (alerta)" type="number" min="0" value={form.low_stock_threshold || ''} onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>Cancelar</Button>
            <Button onClick={save} loading={saving} fullWidth>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Adjust stock modal */}
      <Modal open={modal === 'adjust'} onClose={() => setModal(null)} title={`Ajustar stock — ${selected?.name}`} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">Stock actual: <span className="font-bold text-gray-900">{selected?.quantity} {selected?.unit}</span></p>
          <div className="flex gap-2">
            <button onClick={() => setAdjustType('add')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'add' ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-gray-200 text-gray-500'}`}>
              <TrendingUp size={15}/> Entrada
            </button>
            <button onClick={() => setAdjustType('remove')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${adjustType === 'remove' ? 'border-red-400 text-red-500 bg-red-50' : 'border-gray-200 text-gray-500'}`}>
              <TrendingDown size={15}/> Salida
            </button>
          </div>
          <Input label="Cantidad" type="number" min="1" placeholder="0" value={adjustQty || ''} onChange={e => setAdjustQty(parseFloat(e.target.value) || 0)} autoFocus />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>Cancelar</Button>
            <Button onClick={adjust} loading={saving} fullWidth>
              {adjustType === 'add' ? `+${adjustQty || 0}` : `-${adjustQty || 0}`} {selected?.unit}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Search, Phone, Mail, Pencil, Trash2, User } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

const EMPTY: Omit<Client, 'id' | 'created_at'> = {
  first_name: '', last_name: '', email: '', phone: '', address: '', notes: '',
};

export default function ClientesPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    setClients(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const openAdd = () => { setForm(EMPTY); setError(''); setModal('add'); };
  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({ first_name: c.first_name, last_name: c.last_name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    setError('');
    setModal('edit');
  };

  const save = async () => {
    if (!form.first_name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    if (modal === 'add') {
      const { error: e } = await supabase.from('clients').insert({ ...form, business_id: business!.id });
      if (e) { setError('Error al guardar. Intenta de nuevo.'); setSaving(false); return; }
    } else if (modal === 'edit' && selected) {
      const { error: e } = await supabase.from('clients').update(form).eq('id', selected.id);
      if (e) { setError('Error al guardar. Intenta de nuevo.'); setSaving(false); return; }
    }
    await load(); setSaving(false); setModal(null);
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este cliente?')) return;
    await supabase.from('clients').delete().eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return `${c.first_name} ${c.last_name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} en total</p>
        </div>
        <Button onClick={openAdd} size="md">
          <Plus size={16} className="mr-2" /> Nuevo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Buscar por nombre, teléfono o correo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          leftIcon={<Search size={16} />}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-1">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <User size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Sin resultados' : 'Aún no tienes clientes.'}</p>
          {!search && <button onClick={openAdd} className="text-primary text-sm font-medium hover:underline mt-1">Agrega el primero →</button>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((c, i) => (
            <div key={c.id} className={`flex items-center justify-between px-5 py-4 ${i < filtered.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary text-sm font-semibold">
                    {c.first_name.charAt(0).toUpperCase()}{c.last_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.first_name} {c.last_name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={11}/>{c.phone}</span>}
                    {c.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={11}/>{c.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-4">
                <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <Pencil size={15} className="text-gray-400" />
                </button>
                <button onClick={() => remove(c.id)} className="p-2 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={15} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'add' ? 'Nuevo cliente' : 'Editar cliente'}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *" placeholder="Juan" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label="Apellido" placeholder="Pérez" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <Input label="Teléfono" placeholder="+1 (555) 000-0000" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} leftIcon={<Phone size={15}/>} />
          <Input label="Correo" type="email" placeholder="juan@correo.com" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} leftIcon={<Mail size={15}/>} />
          <Input label="Dirección" placeholder="123 Calle Principal" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Notas</label>
            <textarea
              rows={3}
              placeholder="Notas internas sobre este cliente..."
              value={form.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)} fullWidth>Cancelar</Button>
            <Button onClick={save} loading={saving} fullWidth>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

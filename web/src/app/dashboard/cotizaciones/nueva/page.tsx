'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Client { id: string; first_name: string; last_name: string; company: string | null; }
interface LineItem { id: string; description: string; quantity: number; unit_price: number; }

const newItem = (): LineItem => ({ id: Math.random().toString(36).slice(2), description: '', quantity: 1, unit_price: 0 });

export default function NuevaCotizacionPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([newItem()]);

  useEffect(() => {
    if (!business) return;
    const clientParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') ?? '' : '';
    if (clientParam) setClientId(clientParam);
    supabase.from('clients').select('id, first_name, last_name, company').eq('business_id', business.id).order('first_name')
      .then(({ data }) => setClients(data ?? []));
  }, [business]);

  const updateItem = (id: string, field: keyof LineItem, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmt   = subtotal * (taxRate / 100);
  const total    = subtotal + taxAmt - discount;

  const save = async () => {
    if (!title.trim()) { setError('El título es requerido'); return; }
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length === 0) { setError('Agrega al menos un ítem'); return; }
    setSaving(true); setError('');

    const { count } = await supabase.from('estimates').select('*', { count: 'exact', head: true }).eq('business_id', business!.id);
    const estNum = `COT-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const lineItems = validItems.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: +(i.quantity * i.unit_price).toFixed(2),
    }));

    const { data, error: err } = await supabase.from('estimates').insert({
      business_id: business!.id,
      client_id: clientId || null,
      estimate_number: estNum,
      title: title.trim(),
      status: 'draft',
      issue_date: issueDate,
      expiry_date: expiryDate || null,
      line_items: lineItems,
      subtotal_amount: +subtotal.toFixed(2),
      tax_rate: taxRate,
      tax_amount: +taxAmt.toFixed(2),
      discount: +discount.toFixed(2),
      total_amount: +total.toFixed(2),
      notes: notes.trim() || null,
      internal_notes: internalNotes.trim() || null,
    }).select().single();

    if (err || !data) { setError('Error al guardar'); setSaving(false); return; }
    window.location.href = `/dashboard/cotizaciones/${data.id}`;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/cotizaciones" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500"/>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nueva cotización</h1>
          <p className="text-xs text-gray-400">Crea una propuesta de precio para tu cliente</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Header info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Información general</p>
          <div className="flex flex-col gap-3">
            <Input label="Título *" placeholder="ej. Instalación sistema de riego — Lote Norte"
              value={title} onChange={e => setTitle(e.target.value)}/>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                <option value="">— Sin cliente —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company ? ` · ${c.company}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Fecha de emisión" type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}/>
              <Input label="Válida hasta" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ítems / Servicios</p>
            <button onClick={() => setItems(prev => [...prev, newItem()])}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <Plus size={13}/> Agregar ítem
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-1">
              <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio/u</span><span className="text-right">Total</span><span/>
            </div>
            {items.map(item => (
              <div key={item.id} className="grid grid-cols-[1fr_70px_90px_80px_32px] gap-2 items-center">
                <input type="text" placeholder="Descripción del servicio o material"
                  value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"/>
                <input type="number" min="0" step="0.5" value={item.quantity || ''}
                  onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                  className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-primary"/>
                <input type="number" min="0" step="0.01" value={item.unit_price || ''}
                  onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                  className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
                <p className="text-sm font-semibold text-gray-900 text-right pr-1">
                  ${(item.quantity * item.unit_price).toFixed(2)}
                </p>
                <button onClick={() => items.length > 1 && setItems(p => p.filter(i => i.id !== item.id))}
                  disabled={items.length === 1}
                  className="p-1 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={13} className={items.length === 1 ? 'text-gray-200' : 'text-red-400'}/>
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-end">
            <div className="w-52 flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-gray-500 whitespace-nowrap">Impuesto (%)</span>
                <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                  placeholder="0" onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
              </div>
              <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-gray-500">Descuento ($)</span>
                <input type="number" min="0" step="0.01" value={discount || ''}
                  placeholder="0" onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-20 rounded-xl border border-gray-200 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"/>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notas</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Nota para el cliente</label>
              <textarea rows={2} placeholder="Términos, condiciones, detalles adicionales para el cliente..."
                value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Nota interna</label>
              <textarea rows={2} placeholder="Notas privadas (no visibles para el cliente)..."
                value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"/>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        <div className="flex gap-3 pb-6">
          <Link href="/dashboard/cotizaciones" className="flex-1">
            <Button variant="secondary" fullWidth>Cancelar</Button>
          </Link>
          <Button onClick={save} loading={saving} fullWidth>Crear cotización</Button>
        </div>
      </div>
    </div>
  );
}

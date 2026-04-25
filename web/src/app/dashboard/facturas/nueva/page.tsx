'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Trash2, ArrowLeft, X, Send } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { InvoiceLang } from '@/lib/invoice-i18n';
import { useLang } from '@/i18n/LangProvider';

interface LineItem { description: string; qty: number; rate: number; }
interface Client { id: string; first_name: string; last_name: string; }

const EMPTY_LINE: LineItem = { description: '', qty: 1, rate: 0 };

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function genInvoiceNumber() {
  const now = new Date();
  return `FAC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;
}

export default function NuevaFacturaPage() {
  const { t: full } = useLang();
  const t = full.dashboard.invoices.new;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [clients, setClients] = useState<Client[]>([]);
  const initialClient = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('client') : null;
  const [clientIds, setClientIds] = useState<string[]>(initialClient ? [initialClient] : []);
  const [invoiceNumber, setInvoiceNumber] = useState(genInvoiceNumber());
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [language, setLanguage] = useState<InvoiceLang>('es');
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!business) return;
    supabase.from('clients').select('id, first_name, last_name').eq('business_id', business.id)
      .order('first_name').then(({ data }) => setClients(data ?? []));
  }, [business]);

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      // Auto-add a new row when the last row's description is filled
      if (field === 'description' && i === updated.length - 1 && (value as string).trim()) {
        updated.push({ ...EMPTY_LINE });
      }
      return updated;
    });
  };
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + (l.qty * l.rate), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const save = async (status: 'draft' | 'sent') => {
    if (!business) return;
    if (lines.every(l => !l.description.trim())) { setError(t.errorAtLeastOne); return; }
    setSaving(true); setError('');

    const validLines = lines.filter(l => l.description.trim());

    const { data, error: e } = await supabase.from('invoices').insert({
      business_id: business.id,
      client_id: clientIds[0] || null,
      invoice_number: invoiceNumber,
      status,
      issue_date: issueDate,
      due_date: dueDate || null,
      line_items: validLines,
      subtotal_amount: subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: notes || null,
      language,
    }).select().single();

    if (e) { setError(t.errorSave); setSaving(false); return; }

    if (clientIds.length > 0) {
      await supabase.from('invoice_clients').insert(
        clientIds.map(cid => ({ invoice_id: data.id, client_id: cid }))
      );
    }

    window.location.href = `/dashboard/facturas/${data.id}`;
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/facturas" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.heading}</h1>
          <p className="text-sm text-gray-400">{invoiceNumber}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Client + dates */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-700">{t.generalInfo}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">{t.clientsLabel}</label>
              {clientIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clientIds.map(cid => {
                    const c = clients.find(cl => cl.id === cid);
                    if (!c) return null;
                    return (
                      <span key={cid} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg">
                        {c.first_name} {c.last_name}
                        <button type="button" onClick={() => setClientIds(prev => prev.filter(id => id !== cid))} className="hover:text-red-500 transition-colors">
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                value=""
                onChange={e => {
                  const val = e.target.value;
                  if (val && !clientIds.includes(val)) setClientIds(prev => [...prev, val]);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition appearance-none"
              >
                <option value="">{clientIds.length === 0 ? t.selectClient : t.addAnotherClient}</option>
                {clients.filter(c => !clientIds.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <Input label={t.invoiceNumberLabel} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            <Input label={t.issueDateLabel} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            <Input label={t.dueDateLabel} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.languageLabel}</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as InvoiceLang)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition appearance-none"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t.itemsHeading}</h2>
          <div className="flex flex-col gap-2">
            <div className="hidden md:grid grid-cols-[1fr_80px_100px_32px] gap-2 text-xs font-medium text-gray-400 px-1">
              <span>{t.colDescription}</span><span className="text-center">{t.colQty}</span><span className="text-right">{t.colRate}</span><span/>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                <input
                  type="text"
                  placeholder={t.itemPlaceholder}
                  value={line.description}
                  onChange={e => updateLine(i, 'description', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="number"
                  min="1"
                  value={line.qty}
                  onChange={e => updateLine(i, 'qty', parseFloat(e.target.value) || 1)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={line.rate || ''}
                  onChange={e => updateLine(i, 'rate', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
                <button onClick={() => removeLine(i)} disabled={lines.length === 1} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-20">
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-5 border-t border-gray-50 pt-4 flex flex-col items-end gap-1">
            <div className="flex items-center gap-8 text-sm">
              <span className="text-gray-500">{t.subtotal}</span>
              <span className="font-medium text-gray-900 w-24 text-right">{fmt(subtotal)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">{t.taxPercent}</span>
              <input
                type="number" min="0" max="100" step="0.1"
                value={taxRate || ''}
                placeholder="0"
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="font-medium text-gray-900 w-24 text-right">{fmt(taxAmount)}</span>
            </div>
            <div className="flex items-center gap-8 text-base font-bold border-t border-gray-100 pt-2 mt-1">
              <span className="text-gray-900">{t.total}</span>
              <span className="text-primary w-24 text-right">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="text-sm font-semibold text-gray-700 block mb-2">{t.notesLabel}</label>
          <textarea
            rows={3}
            placeholder={t.notesPlaceholder}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => save('draft')} loading={saving} fullWidth size="lg">
            Guardar borrador
          </Button>
          <Button onClick={() => save('sent')} loading={saving} fullWidth size="lg">
            Crear y enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, XCircle, Send, RefreshCw,
  FileText, Briefcase, Phone, Mail, Building2, Calendar,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface LineItem { description: string; quantity: number; unit_price: number; total: number; }
interface Estimate {
  id: string; estimate_number: string; title: string; status: string;
  issue_date: string; expiry_date: string | null;
  subtotal_amount: number; tax_rate: number; tax_amount: number;
  discount: number; total_amount: number;
  line_items: LineItem[]; notes: string | null; internal_notes: string | null;
  client_id: string | null; job_id: string | null; invoice_id: string | null;
  accepted_at: string | null; declined_at: string | null; sent_at: string | null;
  clients: {
    id: string; first_name: string; last_name: string; company: string | null;
    phone_cell: string | null; phone: string | null; email_office: string | null; email: string | null;
  } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Borrador',   color: 'text-gray-600',   bg: 'bg-gray-100' },
  sent:      { label: 'Enviada',    color: 'text-blue-600',   bg: 'bg-blue-100' },
  accepted:  { label: 'Aceptada',   color: 'text-emerald-700',bg: 'bg-emerald-100' },
  declined:  { label: 'Rechazada',  color: 'text-red-600',    bg: 'bg-red-100' },
  expired:   { label: 'Vencida',    color: 'text-orange-600', bg: 'bg-orange-100' },
  converted: { label: 'Convertida', color: 'text-purple-700', bg: 'bg-purple-100' },
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function CotizacionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [convertModal, setConvertModal] = useState(false);
  const [convertTo, setConvertTo] = useState<'job' | 'invoice'>('job');
  const [converting, setConverting] = useState(false);

  // Open convert modal from URL param
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'convert') {
      setTimeout(() => setConvertModal(true), 500);
    }
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from('estimates')
      .select('*, clients(id, first_name, last_name, company, phone_cell, phone, email_office, email)')
      .eq('id', params.id).single();
    if (data) setEstimate(data as Estimate);
    setLoading(false);
  };

  useEffect(() => { load(); }, [params.id]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    const update: any = { status };
    if (status === 'sent') update.sent_at = new Date().toISOString();
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    await supabase.from('estimates').update(update).eq('id', params.id);
    setEstimate(prev => prev ? { ...prev, ...update } : prev);
    setUpdating(false);
  };

  const handleConvert = async () => {
    if (!estimate || !business) return;
    setConverting(true);

    if (convertTo === 'invoice') {
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('business_id', business.id);
      const invNum = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;
      const { data: inv } = await supabase.from('invoices').insert({
        business_id: business.id,
        client_id: estimate.client_id,
        invoice_number: invNum,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        line_items: estimate.line_items,
        subtotal_amount: estimate.subtotal_amount,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        discount: estimate.discount,
        total_amount: estimate.total_amount,
        notes: `Cotización: ${estimate.estimate_number}`,
      }).select().single();

      if (inv) {
        await supabase.from('estimates').update({ status: 'converted', invoice_id: inv.id }).eq('id', params.id);
        window.location.href = `/dashboard/facturas/${inv.id}`;
        return;
      }
    } else {
      // Convert to job
      const { data: job } = await supabase.from('jobs').insert({
        business_id: business.id,
        client_id: estimate.client_id,
        title: estimate.title,
        status: 'scheduled',
        priority: 'normal',
        total_amount: estimate.total_amount,
        internal_notes: estimate.internal_notes,
        job_items: estimate.line_items,
      }).select().single();

      if (job) {
        // Insert job items
        if (estimate.line_items.length > 0) {
          await supabase.from('job_items').insert(
            estimate.line_items.map(li => ({
              job_id: job.id,
              item_type: 'other',
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
            }))
          );
        }
        await supabase.from('estimates').update({ status: 'converted', job_id: job.id }).eq('id', params.id);
        window.location.href = `/dashboard/trabajos/${job.id}`;
        return;
      }
    }
    setConverting(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );
  if (!estimate) return <div className="p-6 text-gray-400">Cotización no encontrada.</div>;

  const isExpired = estimate.expiry_date && estimate.status === 'sent' && new Date(estimate.expiry_date) < new Date();
  const effectiveStatus = isExpired ? 'expired' : estimate.status;
  const st = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
  const clientName = estimate.clients ? `${estimate.clients.first_name} ${estimate.clients.last_name}` : null;
  const clientPhone = estimate.clients?.phone_cell ?? estimate.clients?.phone;
  const clientEmail = estimate.clients?.email_office ?? estimate.clients?.email;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/cotizaciones" className="p-2 rounded-xl hover:bg-gray-100 transition-colors mt-0.5">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{estimate.estimate_number}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{estimate.title}</p>
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex gap-2 flex-wrap shrink-0">
          {estimate.status === 'draft' && (
            <Button size="sm" onClick={() => updateStatus('sent')} loading={updating}>
              <Send size={14} className="mr-1.5"/> Marcar enviada
            </Button>
          )}
          {estimate.status === 'sent' && !isExpired && (
            <>
              <Button size="sm" variant="secondary" onClick={() => updateStatus('declined')} loading={updating}>
                <XCircle size={14} className="mr-1.5"/> Rechazada
              </Button>
              <Button size="sm" onClick={() => updateStatus('accepted')} loading={updating}>
                <CheckCircle2 size={14} className="mr-1.5"/> Aceptada
              </Button>
            </>
          )}
          {estimate.status === 'accepted' && (
            <Button size="sm" onClick={() => setConvertModal(true)}>
              <RefreshCw size={14} className="mr-1.5"/> Convertir
            </Button>
          )}
          {estimate.job_id && (
            <Link href={`/dashboard/trabajos/${estimate.job_id}`}>
              <Button size="sm" variant="secondary">
                <Briefcase size={14} className="mr-1.5"/> Ver trabajo
              </Button>
            </Link>
          )}
          {estimate.invoice_id && (
            <Link href={`/dashboard/facturas/${estimate.invoice_id}`}>
              <Button size="sm" variant="secondary">
                <FileText size={14} className="mr-1.5"/> Ver factura
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Left */}
        <div className="flex flex-col gap-4">
          {/* Client card */}
          {estimate.clients && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cliente</h2>
              <div className="flex flex-col gap-2.5">
                <Link href={`/dashboard/clientes/${estimate.clients.id}`}
                  className="text-sm font-semibold text-primary hover:underline">{clientName}</Link>
                {estimate.clients.company && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Building2 size={13} className="text-gray-400"/>{estimate.clients.company}
                  </div>
                )}
                {clientPhone && (
                  <a href={`tel:${clientPhone}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary transition-colors">
                    <Phone size={13} className="text-gray-400"/>{clientPhone}
                  </a>
                )}
                {clientEmail && (
                  <a href={`mailto:${clientEmail}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary transition-colors">
                    <Mail size={13} className="text-gray-400"/>{clientEmail}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Dates card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fechas</h2>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-gray-400 shrink-0"/>
                <div>
                  <p className="text-xs text-gray-400">Emitida</p>
                  <p className="font-medium text-gray-900">
                    {new Date(estimate.issue_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              {estimate.expiry_date && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className={`shrink-0 ${isExpired ? 'text-orange-400' : 'text-gray-400'}`}/>
                  <div>
                    <p className="text-xs text-gray-400">Válida hasta</p>
                    <p className={`font-medium ${isExpired ? 'text-orange-600' : 'text-gray-900'}`}>
                      {new Date(estimate.expiry_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {isExpired && ' ⚠ Vencida'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {estimate.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nota para cliente</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{estimate.notes}</p>
            </div>
          )}
          {estimate.internal_notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">📝 Nota interna</h2>
              <p className="text-sm text-amber-800">{estimate.internal_notes}</p>
            </div>
          )}
        </div>

        {/* Right — line items + totals */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Detalle de servicios</h2>
            </div>
            <div className="grid grid-cols-[1fr_60px_80px_80px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-2 border-b border-gray-50">
              <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">P/u</span><span className="text-right">Total</span>
            </div>
            <div className="divide-y divide-gray-50">
              {estimate.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_80px] items-center px-5 py-3 hover:bg-gray-50">
                  <span className="text-sm text-gray-900 pr-2">{item.description}</span>
                  <span className="text-sm text-center text-gray-600">{item.quantity}</span>
                  <span className="text-sm text-right text-gray-600">${item.unit_price.toFixed(2)}</span>
                  <span className="text-sm text-right font-semibold text-gray-900">${item.total.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <div className="w-52 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{fmt(estimate.subtotal_amount)}</span>
                </div>
                {estimate.tax_rate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Impuesto ({estimate.tax_rate}%)</span>
                    <span>{fmt(estimate.tax_amount)}</span>
                  </div>
                )}
                {estimate.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Descuento</span>
                    <span className="text-emerald-600">-{fmt(estimate.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span className="text-primary">{fmt(estimate.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Convert CTA */}
            {estimate.status === 'accepted' && !estimate.job_id && !estimate.invoice_id && (
              <div className="px-5 pb-5">
                <Button onClick={() => setConvertModal(true)} fullWidth>
                  <RefreshCw size={15} className="mr-2"/> Convertir cotización aceptada
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert Modal */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="Convertir cotización" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">¿A qué quieres convertir esta cotización aceptada?</p>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConvertTo('job')}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                convertTo === 'job' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <Briefcase size={24} className={convertTo === 'job' ? 'text-primary' : 'text-gray-400'}/>
              <div className="text-center">
                <p className={`text-sm font-semibold ${convertTo === 'job' ? 'text-primary' : 'text-gray-700'}`}>Trabajo</p>
                <p className="text-xs text-gray-400 mt-0.5">Crea un trabajo para asignar empleados y rastrear el progreso</p>
              </div>
            </button>
            <button onClick={() => setConvertTo('invoice')}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                convertTo === 'invoice' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <FileText size={24} className={convertTo === 'invoice' ? 'text-primary' : 'text-gray-400'}/>
              <div className="text-center">
                <p className={`text-sm font-semibold ${convertTo === 'invoice' ? 'text-primary' : 'text-gray-700'}`}>Factura</p>
                <p className="text-xs text-gray-400 mt-0.5">Convierte directamente en una factura lista para cobrar</p>
              </div>
            </button>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
            {convertTo === 'job'
              ? '✓ Los ítems de la cotización se copian al trabajo. Después del trabajo, generas la factura.'
              : '✓ Se crea una factura en borrador con todos los ítems de la cotización. Lista para editar y enviar.'}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setConvertModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={handleConvert} loading={converting} fullWidth>
              Convertir a {convertTo === 'job' ? 'trabajo' : 'factura'} →
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

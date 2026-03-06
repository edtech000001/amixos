'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Calendar, Users, DollarSign,
  FileText, CheckCircle2, Clock, AlertTriangle,
  XCircle, Send, ArrowRight, Trash2, Pencil,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface Job {
  id: string; business_id: string;
  client_id: string | null; invoice_id: string | null;
  title: string; description: string | null; status: string; priority: string;
  job_address: string | null; job_city: string | null; job_state: string | null;
  scheduled_date: string | null; time_start: string | null; time_end: string | null;
  completed_date: string | null; total_amount: number; internal_notes: string | null;
  estimate_number: string | null; notes: string | null;
  issue_date: string | null; expiry_date: string | null;
  subtotal_amount: number; tax_rate: number; tax_amount: number; discount: number;
  sent_at: string | null; accepted_at: string | null; declined_at: string | null;
  created_at: string; updated_at: string;
  clients: { id: string; first_name: string; last_name: string; company: string | null; phone_cell: string | null } | null;
}
interface Assignment {
  id: string; worker_name: string | null;
  employees: { id: string; first_name: string; last_name: string } | null;
}
interface JobItem {
  id: string; item_type: string; description: string; quantity: number; unit_price: number; total: number;
}

const PROPOSAL_PIPELINE = [
  { key: 'proposal',    label: 'Propuesta',   icon: Clock,         color: 'text-gray-600',    bg: 'bg-gray-100' },
  { key: 'sent',        label: 'Enviada',     icon: Send,          color: 'text-blue-600',    bg: 'bg-blue-100' },
  { key: 'accepted',    label: 'Aceptada',    icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { key: 'scheduled',   label: 'Programado',  icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-100' },
  { key: 'in_progress', label: 'En progreso', icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-100' },
  { key: 'completed',   label: 'Completado',  icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { key: 'invoiced',    label: 'Facturado',   icon: FileText,      color: 'text-purple-600',  bg: 'bg-purple-100' },
];

const WORK_PIPELINE = [
  { key: 'scheduled',   label: 'Programado',  icon: Clock,         color: 'text-blue-600',    bg: 'bg-blue-100' },
  { key: 'in_progress', label: 'En progreso', icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-100' },
  { key: 'completed',   label: 'Completado',  icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { key: 'invoiced',    label: 'Facturado',   icon: FileText,      color: 'text-purple-600',  bg: 'bg-purple-100' },
];

const ITEM_TYPE_LABELS: Record<string, string> = {
  labor: 'Mano de obra', material: 'Material', equipment: 'Equipo', other: 'Otro',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function TrabajoDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [job, setJob] = useState<Job | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('action') === 'invoice') {
      setTimeout(() => setInvoiceModal(true), 500);
    }
  }, []);

  const load = async () => {
    if (!business) return;
    const [{ data: j }, { data: a }, { data: it }] = await Promise.all([
      supabase.from('jobs').select('*, clients(id, first_name, last_name, company, phone_cell)').eq('id', id).single(),
      supabase.from('job_assignments').select('*, employees(id, first_name, last_name)').eq('job_id', id),
      supabase.from('job_items').select('*').eq('job_id', id).order('created_at'),
    ]);
    if (j) {
      setJob(j as Job);
      if (j.tax_rate > 0) setTaxRate(j.tax_rate);
    }
    setAssignments(a ?? []);
    setItems(it ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, business]);

  const updateStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    const update: any = { status: newStatus };
    if (newStatus === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    if (newStatus === 'sent') update.sent_at = new Date().toISOString();
    if (newStatus === 'accepted') update.accepted_at = new Date().toISOString();
    if (newStatus === 'declined') update.declined_at = new Date().toISOString();
    await supabase.from('jobs').update(update).eq('id', id);
    setJob(prev => prev ? { ...prev, ...update } : prev);
    setUpdatingStatus(false);
  };

  const generateInvoice = async () => {
    if (!job || !business) return;
    setInvoicing(true);

    const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
    // Use stored financial fields if available (from proposal), otherwise compute from items
    const useStoredFinancials = job.estimate_number && job.subtotal_amount > 0;
    const invoiceSubtotal = useStoredFinancials ? job.subtotal_amount : itemSubtotal;
    const invoiceTaxRate = useStoredFinancials ? job.tax_rate : taxRate;
    const invoiceTaxAmt = useStoredFinancials ? job.tax_amount : invoiceSubtotal * (taxRate / 100);
    const invoiceDiscount = useStoredFinancials ? job.discount : 0;
    const invoiceTotal = invoiceSubtotal + invoiceTaxAmt - invoiceDiscount;

    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('business_id', business.id);
    const invNum = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const lineItems = items.map(i => ({
      description: `${ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}: ${i.description}`,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total,
    }));

    const { data: invoice, error } = await supabase.from('invoices').insert({
      business_id: business.id,
      client_id: job.client_id,
      invoice_number: invNum,
      status: 'draft',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      line_items: lineItems,
      subtotal_amount: invoiceSubtotal,
      tax_rate: invoiceTaxRate,
      tax_amount: invoiceTaxAmt,
      discount: invoiceDiscount,
      total_amount: invoiceTotal,
      notes: job.estimate_number ? `Propuesta: ${job.estimate_number} — ${job.title}` : `Trabajo: ${job.title}`,
    }).select().single();

    if (!error && invoice) {
      await supabase.from('jobs').update({ status: 'invoiced', invoice_id: invoice.id }).eq('id', id);
      setInvoicing(false);
      window.location.href = `/dashboard/facturas/${invoice.id}`;
    } else {
      setInvoicing(false);
    }
  };

  const deleteJob = async () => {
    setDeleting(true);
    // Delete related records first, then the job
    await supabase.from('job_items').delete().eq('job_id', id);
    await supabase.from('job_assignments').delete().eq('job_id', id);
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (!error) {
      window.location.href = '/dashboard/trabajos';
    }
    setDeleting(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );
  if (!job) return <div className="p-6 text-gray-400">Trabajo no encontrado.</div>;

  const isProposal = !!job.estimate_number;
  const pipeline = isProposal ? PROPOSAL_PIPELINE : WORK_PIPELINE;
  const pipelineIdx = pipeline.findIndex(s => s.key === job.status);
  const itemSubtotal = items.reduce((s, i) => s + i.total, 0);
  const hasFinancials = (job.tax_rate > 0 || job.discount > 0) && isProposal;
  const clientName = job.clients ? `${job.clients.first_name} ${job.clients.last_name}` : null;
  const clientPhone = job.clients?.phone_cell;
  const isExpired = job.expiry_date && job.status === 'sent' && new Date(job.expiry_date) < new Date();
  const canInvoice = (job.status === 'completed' || job.status === 'accepted') && !job.invoice_id;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/trabajos" className="p-2 rounded-xl hover:bg-gray-100 transition-colors mt-0.5">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div>
            {isProposal && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono text-gray-400">{job.estimate_number}</span>
                {isExpired && <span className="text-xs text-orange-500 font-medium">⚠ Vencida</span>}
              </div>
            )}
            <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
            {clientName && (
              <Link href={`/dashboard/clientes/${job.client_id}`}
                className="text-sm text-primary hover:underline font-medium">
                {clientName}{job.clients?.company ? ` · ${job.clients.company}` : ''}
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canInvoice && (
            <Button onClick={() => setInvoiceModal(true)} size="sm">
              <FileText size={14} className="mr-1.5"/> Generar factura
            </Button>
          )}
          {job.invoice_id && (
            <Link href={`/dashboard/facturas/${job.invoice_id}`}>
              <Button variant="secondary" size="sm">
                <FileText size={14} className="mr-1.5"/> Ver factura <ArrowRight size={13} className="ml-1"/>
              </Button>
            </Link>
          )}
          <Link href={`/dashboard/trabajos/nuevo?edit=${job.id}`}
            className="p-2 rounded-xl text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
            title="Editar trabajo">
            <Pencil size={16}/>
          </Link>
          <button
            onClick={() => setDeleteModal(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Eliminar trabajo"
          >
            <Trash2 size={16}/>
          </button>
        </div>
      </div>

      {/* Status pipeline */}
      {job.status !== 'cancelled' && job.status !== 'declined' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between">
            {pipeline.map((s, i) => {
              const Icon = s.icon;
              const isPast = i < pipelineIdx;
              const isCurrent = i === pipelineIdx;
              const isFuture = i > pipelineIdx;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center gap-1.5 flex-1 transition-all ${
                    isFuture ? 'opacity-40' : ''
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isCurrent ? `${s.bg} ring-2 ring-offset-2 ring-current ${s.color}` :
                      isPast ? 'bg-gray-100' : 'bg-gray-50'
                    }`}>
                      <Icon size={18} className={isCurrent ? s.color : isPast ? 'text-gray-400' : 'text-gray-300'}/>
                    </div>
                    <span className={`text-xs font-semibold ${isCurrent ? s.color : isPast ? 'text-gray-400' : 'text-gray-300'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < pipeline.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 rounded transition-colors ${i < pipelineIdx ? 'bg-gray-300' : 'bg-gray-100'}`}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next action buttons */}
          <div className="mt-4 pt-4 border-t border-gray-50 flex justify-center gap-3 flex-wrap">
            {/* Proposal phase actions */}
            {job.status === 'proposal' && (
              <Button onClick={() => updateStatus('sent')} loading={updatingStatus} size="sm">
                <Send size={14} className="mr-1.5"/> Marcar enviada
              </Button>
            )}
            {job.status === 'sent' && !isExpired && (
              <>
                <Button variant="secondary" size="sm" onClick={() => updateStatus('declined')} loading={updatingStatus}>
                  <XCircle size={14} className="mr-1.5"/> Rechazada
                </Button>
                <Button size="sm" onClick={() => updateStatus('accepted')} loading={updatingStatus}>
                  <CheckCircle2 size={14} className="mr-1.5"/> Aceptada
                </Button>
              </>
            )}
            {job.status === 'accepted' && (
              <>
                <Button size="sm" onClick={() => updateStatus('scheduled')} loading={updatingStatus}>
                  <Calendar size={14} className="mr-1.5"/> Programar trabajo
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setInvoiceModal(true)}>
                  <FileText size={14} className="mr-1.5"/> Facturar directamente
                </Button>
              </>
            )}

            {/* Work phase actions */}
            {job.status === 'scheduled' && (
              <Button onClick={() => updateStatus('in_progress')} loading={updatingStatus} size="sm">
                ▶ Iniciar trabajo
              </Button>
            )}
            {job.status === 'in_progress' && (
              <Button onClick={() => updateStatus('completed')} loading={updatingStatus} size="sm">
                ✓ Marcar como completado
              </Button>
            )}
            {job.status === 'completed' && !job.invoice_id && (
              <Button onClick={() => setInvoiceModal(true)} size="sm">
                <FileText size={14} className="mr-1.5"/> Generar factura
              </Button>
            )}

            {/* Cancel (available in all non-terminal states) */}
            {!['cancelled', 'declined', 'invoiced'].includes(job.status) && (
              <Button variant="secondary" size="sm" onClick={() => updateStatus('cancelled')} loading={updatingStatus}>
                <XCircle size={14} className="mr-1.5"/> Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Cancelled / Declined banner */}
      {(job.status === 'cancelled' || job.status === 'declined') && (
        <div className={`rounded-2xl p-4 mb-5 border ${
          job.status === 'cancelled' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-100'
        }`}>
          <p className={`text-sm font-semibold ${job.status === 'cancelled' ? 'text-gray-500' : 'text-red-600'}`}>
            {job.status === 'cancelled' ? 'Este trabajo fue cancelado.' : 'Esta propuesta fue rechazada.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="flex flex-col gap-4">

          {/* Proposal details card */}
          {isProposal && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Propuesta</h2>
              <div className="flex flex-col gap-2.5">
                {job.issue_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className="text-gray-400 shrink-0"/>
                    <div>
                      <p className="text-xs text-gray-400">Emitida</p>
                      <p className="font-medium text-gray-900">
                        {new Date(job.issue_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )}
                {job.expiry_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className={`shrink-0 ${isExpired ? 'text-orange-400' : 'text-gray-400'}`}/>
                    <div>
                      <p className="text-xs text-gray-400">Válida hasta</p>
                      <p className={`font-medium ${isExpired ? 'text-orange-600' : 'text-gray-900'}`}>
                        {new Date(job.expiry_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {isExpired && ' ⚠ Vencida'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Detalles</h2>
            <div className="flex flex-col gap-3">
              {job.scheduled_date && (
                <div className="flex items-start gap-2.5">
                  <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Fecha programada</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(job.scheduled_date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    {(job.time_start || job.time_end) && (
                      <p className="text-xs text-gray-400">
                        {job.time_start?.slice(0,5)}{job.time_end ? ` — ${job.time_end.slice(0,5)}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {(job.job_address || job.job_city) && (
                <div className="flex items-start gap-2.5">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0"/>
                  <div>
                    <p className="text-xs text-gray-400">Ubicación</p>
                    {job.job_address && <p className="text-sm font-medium text-gray-900">{job.job_address}</p>}
                    {(job.job_city || job.job_state) && (
                      <p className="text-sm text-gray-600">{[job.job_city, job.job_state].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
              )}
              {clientPhone && (
                <a href={`tel:${clientPhone}`} className="flex items-center gap-2 text-xs text-primary font-medium hover:underline">
                  📞 Llamar a cliente
                </a>
              )}
              {job.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Descripción</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{job.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Client-facing notes */}
          {job.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nota para cliente</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{job.notes}</p>
            </div>
          )}

          {/* Internal notes */}
          {job.internal_notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">📝 Nota interna</h2>
              <p className="text-xs text-amber-800">{job.internal_notes}</p>
            </div>
          )}

          {/* Workers card */}
          {assignments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Trabajadores</h2>
              <div className="flex flex-col gap-2">
                {assignments.map(a => {
                  const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.worker_name ?? '—';
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-xs font-bold">{name.charAt(0)}</span>
                      </div>
                      <span className="text-sm text-gray-900 font-medium">{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right — Line items */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {isProposal ? 'Detalle de servicios' : 'Materiales y mano de obra'}
              </h2>
              <span className="text-sm font-bold text-gray-900">{fmt(hasFinancials ? job.total_amount : itemSubtotal)}</span>
            </div>

            {items.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400">
                <DollarSign size={28} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Sin ítems registrados.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[80px_1fr_60px_80px_80px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-2 border-b border-gray-50">
                  <span>Tipo</span><span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">P/u</span><span className="text-right">Total</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map(item => (
                    <div key={item.id} className="grid grid-cols-[80px_1fr_60px_80px_80px] items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className="text-xs text-gray-400">{ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}</span>
                      <span className="text-sm text-gray-900 truncate pr-2">{item.description}</span>
                      <span className="text-sm text-center text-gray-600">{item.quantity}</span>
                      <span className="text-sm text-right text-gray-600">${item.unit_price.toFixed(2)}</span>
                      <span className="text-sm text-right font-semibold text-gray-900">${item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
                  {hasFinancials ? (
                    <div className="w-52 flex flex-col gap-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span>{fmt(job.subtotal_amount)}</span>
                      </div>
                      {job.tax_rate > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Impuesto ({job.tax_rate}%)</span>
                          <span>{fmt(job.tax_amount)}</span>
                        </div>
                      )}
                      {job.discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Descuento</span>
                          <span className="text-emerald-600">-{fmt(job.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100">
                        <span>Total</span>
                        <span className="text-primary">{fmt(job.total_amount)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center w-full">
                      <span className="text-sm text-gray-500">Total estimado</span>
                      <span className="text-base font-bold text-gray-900">{fmt(itemSubtotal)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {canInvoice && (
              <div className="px-5 pb-5">
                <Button onClick={() => setInvoiceModal(true)} fullWidth>
                  <FileText size={15} className="mr-2"/> Convertir en factura
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate Invoice Modal */}
      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title="Generar factura" size="sm">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-2">Resumen</p>
            <p className="text-sm font-semibold text-gray-900 mb-1">{job.title}</p>
            {job.estimate_number && <p className="text-xs text-gray-400 mb-1">{job.estimate_number}</p>}
            {clientName && <p className="text-xs text-gray-500">Cliente: {clientName}</p>}
            <p className="text-xs text-gray-500">{items.length} ítem{items.length !== 1 ? 's' : ''}</p>
          </div>

          {!hasFinancials && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Impuesto (%)</label>
              <input type="number" min="0" max="30" step="0.5" value={taxRate || ''}
                placeholder="0"
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"/>
            </div>
          )}

          <div className="bg-primary/5 rounded-xl p-4 space-y-1">
            {hasFinancials ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">{fmt(job.subtotal_amount)}</span>
                </div>
                {job.tax_rate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Impuesto ({job.tax_rate}%)</span>
                    <span className="font-medium">{fmt(job.tax_amount)}</span>
                  </div>
                )}
                {job.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Descuento</span>
                    <span className="font-medium text-emerald-600">-{fmt(job.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-primary/10">
                  <span>Total</span>
                  <span className="text-primary">{fmt(job.total_amount)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">{fmt(itemSubtotal)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Impuesto ({taxRate}%)</span>
                    <span className="font-medium">{fmt(itemSubtotal * taxRate / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-primary/10">
                  <span>Total</span>
                  <span className="text-primary">{fmt(itemSubtotal * (1 + taxRate / 100))}</span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-gray-400">La factura se creará en estado <strong>Borrador</strong>. Puedes editarla antes de enviarla.</p>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setInvoiceModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={generateInvoice} loading={invoicing} fullWidth>
              Crear factura →
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Eliminar trabajo" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            ¿Estás seguro de que deseas eliminar <strong>{job.title}</strong>? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(false)} fullWidth>Cancelar</Button>
            <button
              onClick={deleteJob}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

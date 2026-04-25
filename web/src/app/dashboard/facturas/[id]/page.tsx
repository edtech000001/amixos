'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, CheckCircle, Send, DollarSign, Calendar, FileText } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { getInvoiceLabels, getDateLocale, type InvoiceLang } from '@/lib/invoice-i18n';
import { useLang } from '@/i18n/LangProvider';

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  line_items: { description: string; qty: number; rate: number }[];
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  language: InvoiceLang;
  clients: { first_name: string; last_name: string; email: string | null; phone_cell: string | null } | null;
  invoice_clients: { clients: { first_name: string; last_name: string; email: string | null; phone_cell: string | null } }[];
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-500',
  sent:     'bg-blue-100 text-blue-600',
  paid:     'bg-emerald-100 text-emerald-700',
  overdue:  'bg-red-100 text-red-600',
  cancelled:'bg-gray-100 text-gray-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export default function FacturaDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { t: ui } = useLang();
  const tInv = ui.dashboard.invoices;
  const tStatus = ui.dashboard.invoiceStatus;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!business) return;
    supabase.from('invoices')
      .select('*, clients(first_name, last_name, email, phone_cell), invoice_clients(clients(first_name, last_name, email, phone_cell))')
      .eq('id', id)
      .single()
      .then(({ data }) => { setInvoice(data as Invoice); setLoading(false); });
  }, [id, business]);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    setInvoice(prev => prev ? { ...prev, status } : prev);
    setUpdating(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
    </div>
  );
  if (!invoice) return <div className="p-6 text-gray-400">{tInv.notFound}</div>;

  const lang = invoice.language ?? 'es';
  const t = getInvoiceLabels(lang);
  const dateLoc = getDateLocale(lang);
  const statusKey = invoice.status as keyof typeof tStatus;
  const statusLabel = tStatus[statusKey] ?? invoice.status;
  const statusColor = STATUS_COLORS[invoice.status] ?? 'bg-gray-100 text-gray-500';

  const invoiceClients = invoice.invoice_clients?.length
    ? invoice.invoice_clients.map(ic => ic.clients)
    : invoice.clients ? [invoice.clients] : [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/facturas" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-500"/>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
            </div>
            {invoice.due_date && (
              <p className="text-xs text-gray-400 mt-0.5">
                {t.expires}: {new Date(invoice.due_date).toLocaleDateString(dateLoc, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <Button size="sm" onClick={() => updateStatus('sent')} loading={updating}>
              <Send size={14} className="mr-1.5"/> {tInv.markSent}
            </Button>
          )}
          {invoice.status === 'sent' && (
            <Button size="sm" onClick={() => updateStatus('paid')} loading={updating}>
              <CheckCircle size={14} className="mr-1.5"/> {tInv.markPaid}
            </Button>
          )}
          <button onClick={() => window.print()} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <Printer size={18} className="text-gray-500"/>
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary"/>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Total</p>
            <p className="text-lg font-bold text-gray-900">{fmt(invoice.total_amount)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Calendar size={18} className="text-blue-500"/>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.issueDate}</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(invoice.issue_date).toLocaleDateString(dateLoc, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <FileText size={18} className="text-amber-500"/>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.dueDate}</p>
            <p className="text-sm font-semibold text-gray-900">
              {invoice.due_date
                ? new Date(invoice.due_date).toLocaleDateString(dateLoc, { year: 'numeric', month: 'short', day: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main invoice card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-6">
          {/* Business + Client header */}
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t.from}</p>
              <p className="text-sm font-semibold text-gray-900">{business?.name}</p>
              <p className="text-xs text-gray-400">{business?.city}{business?.state ? `, ${business.state}` : ''}</p>
            </div>
            {invoiceClients.length > 0 && (
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t.billTo}</p>
                {invoiceClients.map((c, i) => (
                  <div key={i} className={i > 0 ? 'mt-2' : ''}>
                    <p className="text-sm font-semibold text-gray-900">{c.first_name} {c.last_name}</p>
                    {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                    {c.phone_cell && <p className="text-xs text-gray-400">{c.phone_cell}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Line items table */}
          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-[1fr_60px_90px_100px] text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-2">
              <span>{t.item}</span><span className="text-center">{t.qty}</span><span className="text-right">{t.rate}</span><span className="text-right">{t.total}</span>
            </div>
            <div className="flex flex-col">
              {(invoice.line_items ?? []).map((l, i) => {
                const qty = Number(l.qty) || 0;
                const rate = Number(l.rate) || 0;
                return (
                  <div key={i} className="grid grid-cols-[1fr_60px_90px_100px] items-center text-sm py-3 px-2 border-b border-gray-50 last:border-0 even:bg-gray-50/50 rounded-lg">
                    <span className="text-gray-800 font-medium">{l.description}</span>
                    <span className="text-center text-gray-500">{qty}</span>
                    <span className="text-right text-gray-500">{fmt(rate)}</span>
                    <span className="text-right font-semibold text-gray-900">{fmt(qty * rate)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="flex flex-col items-end gap-2 border-t border-gray-100 pt-4">
            <div className="flex gap-12 text-sm">
              <span className="text-gray-500">{t.subtotal}</span>
              <span className="font-medium text-gray-900 w-28 text-right">{fmt(invoice.subtotal_amount)}</span>
            </div>
            {invoice.tax_rate > 0 && (
              <div className="flex gap-12 text-sm">
                <span className="text-gray-500">{t.tax} ({invoice.tax_rate}%)</span>
                <span className="font-medium text-gray-900 w-28 text-right">{fmt(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="flex gap-12 text-lg font-bold border-t-2 border-gray-200 pt-3 mt-1">
              <span className="text-gray-900">{t.total}</span>
              <span className="text-primary w-28 text-right">{fmt(invoice.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Status card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Estado</p>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusColor}`}>{statusLabel}</span>
            </div>
            {invoice.status === 'draft' && (
              <Button size="sm" onClick={() => updateStatus('sent')} loading={updating} fullWidth className="mt-3">
                <Send size={14} className="mr-1.5"/> Marcar enviada
              </Button>
            )}
            {invoice.status === 'sent' && (
              <Button size="sm" onClick={() => updateStatus('paid')} loading={updating} fullWidth className="mt-3">
                <CheckCircle size={14} className="mr-1.5"/> Marcar pagada
              </Button>
            )}
          </div>

          {/* Client info card */}
          {invoiceClients.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cliente</p>
              {invoiceClients.map((c, i) => (
                <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-gray-50' : ''}>
                  <p className="text-sm font-semibold text-gray-900">{c.first_name} {c.last_name}</p>
                  {c.email && <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>}
                  {c.phone_cell && <p className="text-xs text-gray-400 mt-0.5">{c.phone_cell}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Notes card */}
          {invoice.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.notes}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

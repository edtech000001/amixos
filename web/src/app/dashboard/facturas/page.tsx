'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Search } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface InvoiceClient { first_name: string; last_name: string }
interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_date: string | null;
  created_at: string;
  clients: InvoiceClient | null;
  invoice_clients: { clients: InvoiceClient }[];
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Borrador',   color: 'bg-gray-100 text-gray-500' },
  sent:      { label: 'Enviada',    color: 'bg-blue-100 text-blue-600' },
  paid:      { label: 'Pagada',     color: 'bg-emerald-100 text-emerald-700' },
  overdue:   { label: 'Vencida',    color: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Cancelada',  color: 'bg-gray-100 text-gray-400' },
};

const FILTERS = ['todas', 'draft', 'sent', 'paid', 'overdue'];
const FILTER_LABELS: Record<string, string> = {
  todas: 'Todas', draft: 'Borradores', sent: 'Enviadas', paid: 'Pagadas', overdue: 'Vencidas',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function getClientNames(inv: Invoice): string {
  const list = inv.invoice_clients?.length
    ? inv.invoice_clients.map(ic => `${ic.clients.first_name} ${ic.clients.last_name}`)
    : inv.clients ? [`${inv.clients.first_name} ${inv.clients.last_name}`] : [];
  return list.join(', ') || 'Sin cliente';
}

export default function FacturasPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business) return;
    let q = supabase.from('invoices')
      .select('id, invoice_number, status, total_amount, due_date, created_at, clients(first_name, last_name), invoice_clients(clients(first_name, last_name))')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    const { data } = await q;
    setInvoices((data ?? []) as unknown as Invoice[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'paid') update.paid_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('invoices').update(update).eq('id', id);
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
  };

  const filtered = invoices.filter(inv => {
    if (filter !== 'todas' && inv.status !== filter) return false;
    const q = search.toLowerCase();
    const cn = getClientNames(inv).toLowerCase();
    return `${inv.invoice_number} ${cn}`.includes(q);
  });

  const total = filtered.reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{invoices.length} en total</p>
        </div>
        <Link href="/dashboard/facturas/nueva">
          <Button size="md"><Plus size={16} className="mr-2" /> Nueva factura</Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input placeholder="Buscar factura o cliente..." value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>} />
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          {filtered.length} factura{filtered.length !== 1 ? 's' : ''} · Total: <strong className="text-gray-900">{fmt(total)}</strong>
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">Sin facturas.</p>
          <Link href="/dashboard/facturas/nueva" className="text-primary text-sm font-medium hover:underline mt-1 inline-block">Crea la primera →</Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((inv, i) => {
            const st = STATUS[inv.status] ?? { label: inv.status, color: 'bg-gray-100 text-gray-500' };
            const client = getClientNames(inv);
            const due = inv.due_date ? new Date(inv.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;
            return (
              <div key={inv.id} className={`flex items-center gap-4 px-5 py-4 ${i < filtered.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                <Link href={`/dashboard/facturas/${inv.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{inv.invoice_number}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {client}{due ? ` · Vence ${due}` : ''}
                  </p>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-gray-900">{fmt(inv.total_amount)}</span>
                  {/* Quick status actions */}
                  {inv.status === 'draft' && (
                    <button onClick={() => updateStatus(inv.id, 'sent')} className="text-xs text-blue-600 font-medium hover:underline">Marcar enviada</button>
                  )}
                  {inv.status === 'sent' && (
                    <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs text-emerald-600 font-medium hover:underline">Marcar pagada</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

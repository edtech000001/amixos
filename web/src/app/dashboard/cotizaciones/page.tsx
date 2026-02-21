'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, ClipboardList, ChevronRight,
  CheckCircle2, XCircle, Clock, Send, RefreshCw, FileText,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Estimate {
  id: string;
  estimate_number: string;
  title: string;
  status: string;
  total_amount: number;
  issue_date: string;
  expiry_date: string | null;
  clients: { first_name: string; last_name: string; company: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: 'Borrador',   color: 'bg-gray-100 text-gray-500',      icon: Clock },
  sent:      { label: 'Enviada',    color: 'bg-blue-100 text-blue-600',      icon: Send },
  accepted:  { label: 'Aceptada',   color: 'bg-emerald-100 text-emerald-700',icon: CheckCircle2 },
  declined:  { label: 'Rechazada',  color: 'bg-red-100 text-red-600',        icon: XCircle },
  expired:   { label: 'Vencida',    color: 'bg-orange-100 text-orange-600',  icon: Clock },
  converted: { label: 'Convertida', color: 'bg-purple-100 text-purple-700',  icon: RefreshCw },
};

const TABS = [
  { key: 'all',       label: 'Todas' },
  { key: 'draft',     label: 'Borrador' },
  { key: 'sent',      label: 'Enviadas' },
  { key: 'accepted',  label: 'Aceptadas' },
  { key: 'declined',  label: 'Rechazadas' },
  { key: 'converted', label: 'Convertidas' },
] as const;
type TabKey = typeof TABS[number]['key'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function isExpired(estimate: Estimate) {
  if (!estimate.expiry_date || estimate.status !== 'sent') return false;
  return new Date(estimate.expiry_date) < new Date();
}

export default function CotizacionesPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

  const load = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('estimates')
      .select('id, estimate_number, title, status, total_amount, issue_date, expiry_date, clients(first_name, last_name, company)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    setEstimates((data ?? []) as unknown as Estimate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business]);

  const updateStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === 'accepted') update.accepted_at = new Date().toISOString();
    if (status === 'declined') update.declined_at = new Date().toISOString();
    if (status === 'sent') update.sent_at = new Date().toISOString();
    await supabase.from('estimates').update(update).eq('id', id);
    setEstimates(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  };

  const filtered = estimates.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = [e.estimate_number, e.title, e.clients?.first_name, e.clients?.last_name, e.clients?.company]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
    const effectiveStatus = isExpired(e) ? 'expired' : e.status;
    const matchTab = tab === 'all' || effectiveStatus === tab;
    return matchSearch && matchTab;
  });

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === 'all'
      ? estimates.length
      : estimates.filter(e => (isExpired(e) ? 'expired' : e.status) === t.key).length;
    return acc;
  }, {} as Record<TabKey, number>);

  const pendingValue = estimates.filter(e => e.status === 'sent' && !isExpired(e))
    .reduce((s, e) => s + e.total_amount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {estimates.length} en total
            {pendingValue > 0 && <span className="ml-2 text-blue-600 font-medium">· {fmt(pendingValue)} pendiente de respuesta</span>}
          </p>
        </div>
        <Link href="/dashboard/cotizaciones/nueva">
          <Button size="md"><Plus size={15} className="mr-1.5"/> Nueva cotización</Button>
        </Link>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col gap-3 mb-5">
        <Input placeholder="Buscar por número, título o cliente..." value={search}
          onChange={e => setSearch(e.target.value)} leftIcon={<Search size={16}/>}/>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                tab === t.key ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{counts[t.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="flex gap-1">{[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
          ))}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">{search || tab !== 'all' ? 'Sin resultados.' : 'No tienes cotizaciones aún.'}</p>
          {!search && tab === 'all' && (
            <Link href="/dashboard/cotizaciones/nueva" className="text-primary text-sm font-medium hover:underline mt-1 inline-block">
              Crear la primera →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((est, i) => {
            const effectiveStatus = isExpired(est) ? 'expired' : est.status;
            const st = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
            const clientName = est.clients
              ? `${est.clients.first_name} ${est.clients.last_name}`
              : null;
            const expired = isExpired(est);

            return (
              <div key={est.id} className={`${i < filtered.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                  <Link href={`/dashboard/cotizaciones/${est.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{est.estimate_number}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        {expired && <span className="text-xs text-orange-500 font-medium">⚠ Vencida</span>}
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 truncate">{est.title}</p>
                      {clientName && <p className="text-xs text-gray-400 mt-0.5">{clientName}{est.clients?.company ? ` · ${est.clients.company}` : ''}</p>}
                    </div>
                  </Link>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(est.total_amount)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(est.issue_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        {est.expiry_date && ` · Vence ${new Date(est.expiry_date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <Link href={`/dashboard/cotizaciones/${est.id}`}>
                      <ChevronRight size={16} className="text-gray-400"/>
                    </Link>
                  </div>
                </div>

                {/* Quick actions */}
                {(['draft','sent','accepted'].includes(est.status)) && !expired && (
                  <div className="border-t border-gray-50 px-5 py-2 flex gap-2">
                    {est.status === 'draft' && (
                      <button onClick={() => updateStatus(est.id, 'sent')}
                        className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                        <Send size={11}/> Marcar enviada
                      </button>
                    )}
                    {est.status === 'sent' && (
                      <>
                        <button onClick={() => updateStatus(est.id, 'accepted')}
                          className="text-xs font-semibold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                          <CheckCircle2 size={11}/> Aceptada
                        </button>
                        <button onClick={() => updateStatus(est.id, 'declined')}
                          className="text-xs font-semibold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                          <XCircle size={11}/> Rechazada
                        </button>
                      </>
                    )}
                    {est.status === 'accepted' && (
                      <Link href={`/dashboard/cotizaciones/${est.id}?action=convert`}
                        className="text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                        <RefreshCw size={11}/> Convertir
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

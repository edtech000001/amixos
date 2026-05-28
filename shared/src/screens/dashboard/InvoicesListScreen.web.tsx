'use client';

// Web-only InvoicesListScreen — plain HTML + Tailwind (see auth/LoginScreen.web
// for the rationale). Same exported API as InvoicesListScreen.tsx so the web
// page wrapper is untouched and the bundler resolves this .web.tsx variant.

import { useMemo, useState } from 'react';
import { Plus, FileText, Search } from 'lucide-react';
import { useLang } from '../../i18n';
import { formatDateLong } from '../../lib/format';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  totalAmount: number;
  dueDate: string | null;
  clientNames: string | null;
}

export interface InvoicesListScreenProps {
  loading: boolean;
  invoices: InvoiceListItem[];
  onInvoicePress: (id: string) => void;
  onNewInvoicePress: () => void;
  onUpdateStatus: (id: string, status: 'sent' | 'paid') => Promise<void> | void;
}

const FILTERS = ['todas', 'draft', 'sent', 'paid', 'overdue'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  sent: 'bg-blue-100 text-blue-600',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoicesListScreen({
  loading,
  invoices,
  onInvoicePress,
  onNewInvoicePress,
  onUpdateStatus,
}: InvoicesListScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.invoices;
  const tStatus = full.dashboard.invoiceStatus;

  const [filter, setFilter] = useState<Filter>('todas');
  const [search, setSearch] = useState('');

  const filterLabels: Record<Filter, string> = {
    todas: t.filters.all,
    draft: t.filters.drafts,
    sent: t.filters.sent,
    paid: t.filters.paid,
    overdue: t.filters.overdue,
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      if (filter !== 'todas' && inv.status !== filter) return false;
      const cn = (inv.clientNames ?? '').toLowerCase();
      return `${inv.invoiceNumber} ${cn}`.toLowerCase().includes(q);
    });
  }, [invoices, filter, search]);

  const total = filtered.reduce((s, i) => s + i.totalAmount, 0);
  const summaryText = (filtered.length === 1 ? t.summarySingle : t.summaryPlural).replace(
    '{{count}}',
    String(filtered.length),
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t.countTotal.replace('{{count}}', String(invoices.length))}</p>
        </div>
        <button onClick={onNewInvoicePress} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90">
          <Plus size={16} /> {t.newInvoice}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="inline-flex bg-gray-100 p-1 rounded-xl gap-1 mb-4 max-w-full overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Summary */}
      {filtered.length > 0 ? (
        <p className="text-xs text-gray-500 mb-3">
          {summaryText} · {t.summaryTotal}: <span className="text-gray-900 font-bold">{fmt(total)}</span>
        </p>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <FileText size={40} className="text-gray-300" />
          <p className="text-sm text-gray-400 mt-3">{t.empty}</p>
          <button onClick={onNewInvoicePress} className="text-primary text-sm font-medium mt-1 hover:underline">{t.createFirst}</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map((inv) => {
            const statusKey = inv.status as keyof typeof tStatus;
            const statusLabel = tStatus[statusKey] ?? inv.status;
            const pill = STATUS_PILL[inv.status] ?? 'bg-gray-100 text-gray-500';
            const client = inv.clientNames ?? t.noClient;
            const due = inv.dueDate ? formatDateLong(inv.dueDate, t.dateLocale) : null;
            return (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-b-0">
                <button onClick={() => onInvoicePress(inv.id)} className="flex-1 min-w-0 text-left hover:opacity-70">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{inv.invoiceNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill}`}>{statusLabel}</span>
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5 truncate">
                    {client}
                    {due ? ` · ${t.dueShort.replace('{{date}}', due)}` : ''}
                  </span>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-gray-900">{fmt(inv.totalAmount)}</span>
                  {inv.status === 'draft' ? (
                    <button onClick={() => onUpdateStatus(inv.id, 'sent')} className="text-xs text-blue-600 font-medium hover:underline">{t.markSent}</button>
                  ) : null}
                  {inv.status === 'sent' ? (
                    <button onClick={() => onUpdateStatus(inv.id, 'paid')} className="text-xs text-emerald-600 font-medium hover:underline">{t.markPaid}</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

// Web-only InvoiceDetailScreen — plain HTML + Tailwind. Same exported API as
// InvoiceDetailScreen.tsx so the web page wrapper is untouched and the bundler
// resolves this .web.tsx variant automatically.

import {
  ArrowLeft,
  Printer,
  Link2,
  CheckCircle,
  Send,
  DollarSign,
  Calendar,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useLang } from '../../i18n';
import {
  getInvoiceLabels,
  getInvoiceDateLocale,
  type InvoiceLang,
} from '../../i18n/invoice';
import { formatDateLong } from '../../lib/format';
import { InvoiceDocument } from './InvoiceDocument';
import {
  buildInvoiceViewModel,
  type InvoiceBranding,
  type InvoiceTemplateConfig,
} from '../../lib/invoiceTemplate';

export interface InvoiceDetailClient {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCell: string | null;
}

export interface InvoiceDetailLineItem {
  description: string;
  qty: number;
  rate: number;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  issueDate: string;
  dueDate: string | null;
  lineItems: InvoiceDetailLineItem[];
  subtotalAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  language: InvoiceLang;
  clients: InvoiceDetailClient[];
}

export interface InvoiceDetailScreenProps {
  loading: boolean;
  invoice: InvoiceDetail | null;
  /** Business branding for the invoice document header (logo, contact, tax id). */
  branding: InvoiceBranding;
  /** Resolved template config (per-invoice override → business default → app default). */
  templateConfig: InvoiceTemplateConfig;
  updating: boolean;
  onBack: () => void;
  onUpdateStatus: (status: 'sent' | 'paid') => Promise<void> | void;
  /** Print / download PDF. Hidden if not provided. */
  onPrint?: () => void;
  /** Copy/share the public invoice link. Hidden if not provided. */
  onShareLink?: () => void;
  /** Optional: open the edit form. Pencil icon hidden when not provided. */
  onEdit?: () => void;
  /** Optional: trigger delete (caller handles confirm). Trash hidden when not provided. */
  onDelete?: () => void;
}

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-gray-100',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-gray-100',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-gray-500',
  sent: 'text-blue-600',
  paid: 'text-emerald-700',
  overdue: 'text-red-600',
  cancelled: 'text-gray-400',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoiceDetailScreen({
  loading,
  invoice,
  branding,
  templateConfig,
  updating,
  onBack,
  onUpdateStatus,
  onPrint,
  onShareLink,
  onEdit,
  onDelete,
}: InvoiceDetailScreenProps) {
  const { t: ui } = useLang();
  const tInv = ui.dashboard.invoices;
  const tStatus = ui.dashboard.invoiceStatus;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <p className="text-gray-400">{tInv.notFound}</p>
      </div>
    );
  }

  const lang: InvoiceLang = invoice.language ?? 'es';
  const t = getInvoiceLabels(lang);
  const dateLoc = getInvoiceDateLocale(lang);
  const statusKey = invoice.status as keyof typeof tStatus;
  const statusLabel = tStatus[statusKey] ?? invoice.status;
  const pillBg = STATUS_PILL_BG[invoice.status] ?? 'bg-gray-100';
  const pillText = STATUS_PILL_TEXT[invoice.status] ?? 'text-gray-500';

  const formatDate = (iso: string) => formatDateLong(iso, dateLoc);
  const vm = buildInvoiceViewModel(templateConfig, invoice, branding);

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${pillBg} ${pillText}`}>
                {statusLabel}
              </span>
            </div>
            {invoice.dueDate ? (
              <p className="text-xs text-gray-400 mt-0.5">
                {t.expires}: {formatDate(invoice.dueDate)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' ? (
            <button
              type="button"
              onClick={() => onUpdateStatus('sent')}
              disabled={updating}
              className="flex items-center gap-1.5 bg-primary px-3 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Send size={14} className="text-white" />
              {tInv.markSent}
            </button>
          ) : null}
          {invoice.status === 'sent' ? (
            <button
              type="button"
              onClick={() => onUpdateStatus('paid')}
              disabled={updating}
              className="flex items-center gap-1.5 bg-primary px-3 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <CheckCircle size={14} className="text-white" />
              {tInv.markPaid}
            </button>
          ) : null}
          {onShareLink ? (
            <button type="button" onClick={onShareLink} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <Link2 size={18} className="text-gray-500" />
            </button>
          ) : null}
          {onPrint ? (
            <button type="button" onClick={onPrint} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <Printer size={18} className="text-gray-500" />
            </button>
          ) : null}
          {onEdit ? (
            <button type="button" onClick={onEdit} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <Pencil size={18} className="text-gray-500" />
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="p-2 rounded-xl hover:bg-red-50 transition-colors">
              <Trash2 size={18} className="text-red-500" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Summary cards */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">Total</p>
            <p className="text-lg font-bold text-gray-900">{fmt(invoice.totalAmount)}</p>
          </div>
        </div>
        <div className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Calendar size={18} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.issueDate}</p>
            <p className="text-sm font-semibold text-gray-900">{formatDate(invoice.issueDate)}</p>
          </div>
        </div>
        <div className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <FileText size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.dueDate}</p>
            <p className="text-sm font-semibold text-gray-900">
              {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Invoice document — config-driven, what prints / shares / the client sees */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <InvoiceDocument vm={vm} />
      </div>
    </div>
  );
}

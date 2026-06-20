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
import { formatDateLong, formatDateTimeLong } from '../../lib/format';
import {
  type InvoiceBranding,
  type InvoiceTemplateConfig,
} from '../../lib/invoiceTemplate';

export interface InvoiceDetailClient {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneCell: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface InvoiceDetailLineItem {
  description: string;
  qty: number;
  rate: number;
  /** Source job (job-backed invoices) — drives the inline Move/Remove. */
  job_id?: string | null;
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
  /** Row audit timestamps (ISO). createdAt → header; updatedAt → footer. */
  createdAt: string;
  updatedAt: string | null;
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
  // Inline job management — Move / Remove on each job-backed line, Add job below.
  onMoveJob?: (jobId: string) => void;
  onRemoveJob?: (jobId: string) => void;
  onAddJob?: () => void;
  /** Remove a hand-entered (manual) line item by its index. */
  onRemoveManualItem?: (index: number) => void;
  /** Edit a hand-entered (manual) line item by its index. */
  onEditManualItem?: (index: number) => void;
  /** Open a job's detail (line-item title becomes a link). */
  onJobPress?: (jobId: string) => void;
  jobBusy?: boolean;
  /** Email the invoice out (draft → opens the mail client + marks sent). */
  onSendInvoice?: () => void;
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
  updating,
  onBack,
  onUpdateStatus,
  onPrint,
  onShareLink,
  onEdit,
  onDelete,
  onMoveJob,
  onRemoveJob,
  onAddJob,
  onRemoveManualItem,
  onEditManualItem,
  onJobPress,
  jobBusy,
  onSendInvoice,
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
            <p className="text-xs text-gray-400 mt-0.5">
              {tInv.createdLabel}: {formatDateTimeLong(invoice.createdAt, dateLoc)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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

      <div className="max-w-2xl flex flex-col gap-4">
        {/* Quick total */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium">{t.total}</p>
            <p className="text-xl font-bold text-gray-900">{fmt(invoice.totalAmount)}</p>
          </div>
        </div>

        {/* Client — name, business, address */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{t.billTo}</p>
          {invoice.clients.length ? invoice.clients.map((c, i) => {
            const cityStateZip = [[c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(' ');
            const loc = [c.address, cityStateZip].filter(Boolean).join(' · ');
            return (
              <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-gray-50' : ''}>
                <p className="text-base font-semibold text-gray-900">{c.firstName} {c.lastName}</p>
                {c.company ? <p className="text-sm text-gray-600 mt-0.5">{c.company}</p> : null}
                {loc ? <p className="text-sm text-gray-500 mt-0.5">{loc}</p> : null}
                {c.phoneCell ? <p className="text-sm text-gray-500 mt-0.5">{c.phoneCell}</p> : null}
              </div>
            );
          }) : <p className="text-sm text-gray-400">—</p>}
        </div>

        {/* Dates — combined */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">{t.issueDate}</p>
              <p className="text-sm font-semibold text-gray-900">{formatDate(invoice.issueDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileText size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">{t.dueDate}</p>
              <p className="text-sm font-semibold text-gray-900">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t.notes}</p>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        ) : null}

        {/* Line items / jobs (inline manage) + totals below. The styled FACTURA
           document is only built for print / share (PDF). */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {(() => {
            const seen = new Set<string>();
            return invoice.lineItems.map((li, idx) => {
              const q = Number(li.qty) || 0;
              const r = Number(li.rate) || 0;
              const jid = li.job_id ?? null;
              const showActions = !!jid && !!onRemoveJob && !seen.has(jid);
              if (jid) seen.add(jid);
              return (
                <div key={idx} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-200">
                  <div className="flex-1 pr-3 min-w-0">
                    {jid && onJobPress ? (
                      <button onClick={() => onJobPress(jid)} className="block text-sm font-medium text-primary hover:underline truncate text-left max-w-full">
                        {li.description}
                      </button>
                    ) : (
                      <p className="text-sm text-gray-900 truncate">{li.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{q} × {fmt(r)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {showActions ? (
                      <>
                        {onMoveJob ? (
                          <button onClick={() => onMoveJob(jid!)} disabled={jobBusy} className="text-xs font-semibold text-gray-500 hover:text-primary disabled:opacity-40">
                            {tInv.jobsSection.moveBtn}
                          </button>
                        ) : null}
                        <button onClick={() => onRemoveJob!(jid!)} disabled={jobBusy} className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40">
                          {tInv.jobsSection.removeBtn}
                        </button>
                      </>
                    ) : !jid && (onEditManualItem || onRemoveManualItem) ? (
                      <>
                        {onEditManualItem ? (
                          <button onClick={() => onEditManualItem(idx)} disabled={jobBusy} className="text-xs font-semibold text-gray-500 hover:text-primary disabled:opacity-40">
                            {ui.common.buttons.edit}
                          </button>
                        ) : null}
                        {onRemoveManualItem ? (
                          <button onClick={() => onRemoveManualItem(idx)} disabled={jobBusy} className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40">
                            {tInv.jobsSection.removeBtn}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <p className="text-sm font-semibold text-gray-900 w-24 text-right">{fmt(q * r)}</p>
                  </div>
                </div>
              );
            });
          })()}

          {onAddJob ? (
            <button onClick={onAddJob} disabled={jobBusy} className="mt-3 text-sm font-semibold text-primary hover:underline disabled:opacity-40">
              + {tInv.jobsSection.addBtn}
            </button>
          ) : null}

          {/* Totals — below the items */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">{t.subtotal}</span>
              <span className="text-sm text-gray-900">{fmt(invoice.subtotalAmount)}</span>
            </div>
            {invoice.taxAmount > 0 ? (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t.tax}</span>
                <span className="text-sm text-gray-900">{fmt(invoice.taxAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-base font-bold text-gray-900">{t.total}</span>
              <span className="text-base font-bold text-primary">{fmt(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Primary action — Send invoice (draft) / Mark paid (sent) */}
        {invoice.status === 'draft' && onSendInvoice ? (
          <button onClick={onSendInvoice} disabled={updating} className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-semibold hover:opacity-90 disabled:opacity-60">
            <Send size={16} /> {tInv.sendInvoice}
          </button>
        ) : null}
        {invoice.status === 'sent' ? (
          <button onClick={() => onUpdateStatus('paid')} disabled={updating} className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-semibold hover:opacity-90 disabled:opacity-60">
            <CheckCircle size={16} /> {tInv.markPaid}
          </button>
        ) : null}

        {/* Last edited — bottom of the page. */}
        {invoice.updatedAt && invoice.updatedAt !== invoice.createdAt ? (
          <p className="text-xs text-gray-400 text-center mt-1">
            {tInv.lastEditedLabel}: {formatDateTimeLong(invoice.updatedAt, dateLoc)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

'use client';

// Web-only InvoiceDetailScreen — plain HTML + Tailwind. Same exported API as
// InvoiceDetailScreen.tsx so the web page wrapper is untouched and the bundler
// resolves this .web.tsx variant automatically.

import { useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Printer,
  Link2,
  CheckCircle,
  Send,
  DollarSign,
  Eraser,
  Calendar,
  FileText,
  Pencil,
  Trash2,
  Undo2,
  Ban,
} from 'lucide-react';
import { useLang } from '../../i18n';
import {
  getInvoiceLabels,
  getInvoiceDateLocale,
  type InvoiceLang,
} from '../../i18n/invoice';
import { formatDateLong, formatDateTimeLong, daysOverdue, daysSince } from '../../lib/format';
import {
  type InvoiceBranding,
  type InvoiceTemplateConfig,
} from '../../lib/invoiceTemplate';

export interface InvoiceDetailClient {
  /** clients.id — enables the name → client detail link. */
  id?: string | null;
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
  /** A split-off flat add-on line (loading fee, etc.): shows its own name
   *  rather than the job title, and has no separate Move/Remove of its own. */
  addon?: boolean;
  /** Per-unit add-ons folded into this line's rate, as a small indicator. */
  addonNote?: string | null;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  issueDate: string;
  dueDate: string | null;
  /** When the invoice was sent (ISO timestamp) — drives "sent N days ago". */
  sentAt: string | null;
  /** When the invoice was marked paid (ISO). Shown on the payment summary. */
  paidAt: string | null;
  /** Rolled-up payment-method summary (invoices.payment_method). */
  paymentMethod: string | null;
  lineItems: InvoiceDetailLineItem[];
  subtotalAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  /** Private to the business — never rendered on the client-facing document. */
  internalNotes: string | null;
  language: InvoiceLang;
  /** Custom fields (invoice_field_templates), pre-formatted for display. */
  customFields?: { label: string; value: string; key?: string }[];
  /** Row audit timestamps (ISO). createdAt → header; updatedAt → footer. */
  createdAt: string;
  updatedAt: string | null;
  /** Auditing user ids (migration 150) + their resolved display names. */
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  clients: InvoiceDetailClient[];
}

export interface InvoicePaymentRow {
  id: string;
  amount: number;
  method: string | null;
  /** ISO date (YYYY-MM-DD). */
  paidOn: string;
  /** Storage path of an optional payment photo (e.g. a check picture). */
  photoPath?: string | null;
  /** Signed URL for the photo, resolved by the caller for display. */
  photoUrl?: string | null;
  /** Display rotation in degrees (0/90/180/270), migration 190. */
  photoRotation?: number;
}

export interface InvoiceDetailScreenProps {
  loading: boolean;
  invoice: InvoiceDetail | null;
  /** Business branding for the invoice document header (logo, contact, tax id). */
  branding: InvoiceBranding;
  /** Resolved template config (per-invoice override → business default → app default). */
  templateConfig: InvoiceTemplateConfig;
  /** Gate the edit-class write actions (Edit, Send, Record/Edit/Delete payment,
   *  Undo, Autoprice, add/remove/edit jobs & line items, and the ordinary
   *  Mark-sent / Mark-paid / Undo-sent status buttons). Defaults to true. */
  canEdit?: boolean;
  /** Gate the write-off / total-loss / reinstate status buttons. Defaults to true. */
  canWriteOff?: boolean;
  updating: boolean;
  onBack: () => void;
  onUpdateStatus: (status: 'sent' | 'paid' | 'draft' | 'total_loss') => Promise<void> | void;
  /** Print / download PDF. Hidden if not provided. */
  onPrint?: () => void;
  /** Copy/share the public invoice link. Hidden if not provided. */
  onShareLink?: () => void;
  /** Optional: open the edit form. Pencil icon hidden when not provided. */
  onEdit?: () => void;
  /** Optional: trigger delete (caller handles confirm). Trash hidden when not provided. */
  onDelete?: () => void;
  /** Autoprice: fill in unpriced ($0) lines from the price sheet. Button hidden
   *  when not provided (e.g. no price-sheet items or a sent/paid invoice). */
  onAutoprice?: () => void;
  /** Autoname (gated pilot): normalize the linked jobs' titles. */
  onAutoname?: () => void;
  /** Reset all lines to unpriced ($0) so Autoprice can re-run clean (e.g. after
   *  fixing a state price). Shown next to Autoprice. */
  onClearPrices?: () => void;
  /** Show the amber "please verify pricing" note after an autoprice run. */
  autopriceVerify?: boolean;
  // Inline job management — Move / Remove on each job-backed line, Add job below.
  onMoveJob?: (jobId: string) => void;
  onRemoveJob?: (jobId: string) => void;
  onAddJob?: () => void;
  /** Remove a hand-entered (manual) line item by its index. */
  onRemoveManualItem?: (index: number) => void;
  /** Edit a hand-entered (manual) line item by its index. */
  onEditManualItem?: (index: number) => void;
  /** Link an imported/manual line (no job) to an existing job. */
  onLinkLine?: (index: number) => void;
  /** Open a job's detail (line-item title becomes a link). */
  onJobPress?: (jobId: string) => void;
  jobBusy?: boolean;
  /** Email the invoice out (draft → opens the mail client + marks sent). */
  onSendInvoice?: () => void;
  /** Recorded payments (partial or full). Rendered under the totals. */
  payments?: InvoicePaymentRow[];
  /** Open the record-payment dialog. Falls back to onUpdateStatus('paid'). */
  onRecordPayment?: () => void;
  /** Edit a recorded payment (opens the record sheet pre-filled). */
  onEditPayment?: (payment: InvoicePaymentRow) => void;
  /** View a payment's photo full-size (thumbnail clicked in the ledger). */
  onViewPaymentPhoto?: (payment: InvoicePaymentRow) => void;
  /** Delete a recorded payment (caller confirms + reverts status if needed). */
  onDeletePayment?: (payment: InvoicePaymentRow) => void;
  /** Revert a paid invoice to sent (caller confirms + clears payments). */
  onUndoPaid?: () => void;
  /** Open a client's detail (the billed name becomes a link). */
  onClientPress?: (clientId: string) => void;
  /** jobId → job title. Job-backed lines display the JOB NAME instead of the
   *  stored line description (imports can glue description+name together);
   *  the printed document still uses the stored description. */
  jobTitles?: Record<string, string>;
}

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-border-soft',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-border-soft',
  total_loss: 'bg-border-soft',
};
const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-muted',
  sent: 'text-blue-600',
  paid: 'text-emerald-700',
  overdue: 'text-red-600',
  cancelled: 'text-faint',
  total_loss: 'text-muted',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function InvoiceDetailScreen({
  loading,
  invoice,
  canEdit = true,
  canWriteOff = true,
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
  onAutoprice,
  onAutoname,
  onClearPrices,
  autopriceVerify,
  onRemoveManualItem,
  onEditManualItem,
  onLinkLine,
  onJobPress,
  jobBusy,
  onSendInvoice,
  payments = [],
  onRecordPayment,
  onEditPayment,
  onDeletePayment,
  onViewPaymentPhoto,
  onUndoPaid,
  onClientPress,
  jobTitles,
}: InvoiceDetailScreenProps) {
  const { t: ui, locale } = useLang();
  const tInv = ui.dashboard.invoices;
  const tStatus = ui.dashboard.invoiceStatus;
  // Hooks must run before the early returns below (Rules of Hooks).
  // null = auto (expand short lists, collapse 3+); a click pins the choice.
  const [paymentsToggle, setPaymentsToggle] = useState<boolean | null>(null);

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
        <p className="text-faint">{tInv.notFound}</p>
      </div>
    );
  }

  // SCREEN labels/dates follow the APP language. invoice.language is the
  // PRINTED document's language (client-facing PDF / public link) and only
  // applies there — mixing it into the screen made an English app show
  // "Fecha de emisión" on imported Spanish-language invoices.
  const uiLang: InvoiceLang = locale === 'en' ? 'en' : 'es';
  const t = getInvoiceLabels(uiLang);
  const dateLoc = getInvoiceDateLocale(uiLang);
  const statusKey = invoice.status as keyof typeof tStatus;
  const statusLabel = tStatus[statusKey] ?? invoice.status;
  const pillBg = STATUS_PILL_BG[invoice.status] ?? 'bg-border-soft';
  const pillText = STATUS_PILL_TEXT[invoice.status] ?? 'text-muted';
  // Elapsed note shown next to the due date (not in the pill): "overdue by Nd"
  // for overdue, "sent Nd ago" for still-open sent invoices.
  const dateNote = invoice.status === 'overdue' && daysOverdue(invoice.dueDate) > 0
    ? tInv.overdueAgo.replace('{{n}}', String(daysOverdue(invoice.dueDate)))
    : invoice.status === 'sent' && invoice.sentAt
    ? (daysSince(invoice.sentAt) === 0 ? tInv.sentToday : tInv.sentAgo.replace('{{n}}', String(daysSince(invoice.sentAt))))
    : null;
  const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
  const paymentsExpanded = paymentsToggle ?? payments.length <= 2;
  const balanceDue = Math.max(0, invoice.totalAmount - paidSoFar);
  // Overdue is just a sent invoice past its due date — it still needs the
  // Mark paid / Undo actions and the partial-payment UI.
  const sentLike = invoice.status === 'sent' || invoice.status === 'overdue';
  const isPartial = sentLike && paidSoFar > 0;
  // Line items are only editable while the invoice is a Draft. Once sent/paid
  // the document is frozen — hide Edit/Move/Remove/Add job (Undo sent re-opens it).
  const editable = invoice.status === 'draft';

  const formatDate = (iso: string) => formatDateLong(iso, dateLoc);

  return (
    <div className="px-6 lg:px-8 pt-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="p-2 rounded-xl hover:bg-border-soft transition-colors">
            <ArrowLeft size={18} className="text-muted" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{invoice.invoiceNumber}</h1>
              <span className={`px-3.5 py-1.5 rounded-full text-sm font-bold ${pillBg} ${pillText}`}>
                {statusLabel}
              </span>
              {isPartial ? (
                <span className="px-3.5 py-1.5 rounded-full text-sm font-bold bg-amber-100 text-amber-700">
                  {tInv.payments.partialPill}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-faint mt-0.5">
              {tInv.createdLabel}: {formatDateTimeLong(invoice.createdAt, dateLoc)}
              {invoice.createdByName ? ` · ${tInv.byUser.replace('{{name}}', invoice.createdByName)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onAutoprice && canEdit ? (
            <button type="button" onClick={onAutoprice} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-surface text-sm font-semibold text-primary transition-colors mr-1">
              <DollarSign size={15} /> {ui.dashboard.jobs.detail.autopriceBtn}
            </button>
          ) : null}
          {onAutoname && canEdit ? (
            <button type="button" onClick={onAutoname} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-surface text-sm font-semibold text-primary transition-colors mr-1">
              {tInv.autonameBtn}
            </button>
          ) : null}
          {onClearPrices && canEdit ? (
            <button type="button" onClick={onClearPrices} title={tInv.jobsSection.clearPricesBtn} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-surface text-sm font-semibold text-muted transition-colors mr-1">
              <Eraser size={15} /> {tInv.jobsSection.clearPricesBtn}
            </button>
          ) : null}
          {onShareLink ? (
            <button type="button" onClick={onShareLink} className="p-2 rounded-xl hover:bg-border-soft transition-colors">
              <Link2 size={18} className="text-muted" />
            </button>
          ) : null}
          {onPrint ? (
            <button type="button" onClick={onPrint} className="p-2 rounded-xl hover:bg-border-soft transition-colors">
              <Printer size={18} className="text-muted" />
            </button>
          ) : null}
          {onEdit && canEdit ? (
            <button type="button" onClick={onEdit} className="p-2 rounded-xl hover:bg-border-soft transition-colors">
              <Pencil size={18} className="text-muted" />
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="p-2 rounded-xl hover:bg-red-500/10 transition-colors">
              <Trash2 size={18} className="text-red-500" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Two-column grid on wide screens: summary cards left, line items +
         actions right — mirrors the job detail layout. Stacks on small. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="flex flex-col gap-4">
        {/* Quick total */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-faint font-medium">{t.total}</p>
            <p className="text-xl font-bold text-ink">{fmt(invoice.totalAmount)}</p>
          </div>
        </div>

        {/* Client — name, business, address */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          <p className="text-[11px] text-faint font-semibold uppercase tracking-wide mb-1">{t.billTo}</p>
          {invoice.clients.length ? invoice.clients.map((c, i) => {
            const cityStateZip = [[c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(' ');
            const loc = [c.address, cityStateZip].filter(Boolean).join(' · ');
            return (
              <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-border-soft' : ''}>
                {onClientPress && c.id ? (
                  <button type="button" onClick={() => onClientPress(c.id!)} className="text-base font-semibold text-primary hover:underline text-left">
                    {c.firstName} {c.lastName}
                  </button>
                ) : (
                  <p className="text-base font-semibold text-ink">{c.firstName} {c.lastName}</p>
                )}
                {c.company ? <p className="text-sm text-muted mt-0.5">{c.company}</p> : null}
                {loc ? <p className="text-sm text-muted mt-0.5">{loc}</p> : null}
                {c.phoneCell ? <p className="text-sm text-muted mt-0.5">{c.phoneCell}</p> : null}
              </div>
            );
          }) : <p className="text-sm text-faint">—</p>}
        </div>

        {/* Dates — combined */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-faint font-medium">{t.issueDate}</p>
              <p className="text-sm font-semibold text-ink">{formatDate(invoice.issueDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-border-soft">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <FileText size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-faint font-medium">{t.dueDate}</p>
              <p className="text-sm font-semibold text-ink">
                {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                {dateNote ? <span className="text-xs font-medium text-muted">{`  ·  ${dateNote}`}</span> : null}
              </p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes ? (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <p className="text-[11px] text-faint font-semibold uppercase tracking-wide">{t.notes}</p>
            <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        ) : null}

        {/* Internal notes — app-only, tinted amber to signal it's private and
           never shown to the client. */}
        {invoice.internalNotes ? (
          <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 shadow-sm p-5">
            <p className="text-[11px] text-amber-600 font-semibold uppercase tracking-wide">{t.internalNotes}</p>
            <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{invoice.internalNotes}</p>
          </div>
        ) : null}

        {/* Payment summary for a paid invoice with no itemized ledger rows
           (legacy / imported / simple mark-paid) — the ledger card inside the
           totals already covers rows with method/date/photo. */}
        {/* Standard card (not a tinted panel) so it reads like every other
           section; the emerald lives only in the heading, like the ledger. */}
        {invoice.status === 'paid' && payments.length === 0 && (invoice.paidAt || invoice.paymentMethod) ? (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <p className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">{tInv.payments.title}</p>
            <p className="mt-1.5 text-sm text-ink">
              {[invoice.paymentMethod, invoice.paidAt ? formatDate(invoice.paidAt) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        ) : null}

        {/* Custom fields (invoice_field_templates) — read-only. */}
        {invoice.customFields && invoice.customFields.length > 0 ? (
          <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
            <p className="text-[11px] text-faint font-semibold uppercase tracking-wide mb-2">{ui.dashboard.employees.modal.customFieldsHeading}</p>
            <div className="flex flex-col gap-2">
              {invoice.customFields.map(f => (
                <div key={f.key ?? f.label} className="flex justify-between gap-3">
                  <span className="text-xs text-faint">{f.label}</span>
                  <span className="text-sm text-ink text-right">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Line items / jobs (inline manage) + totals below. The styled FACTURA
           document is only built for print / share (PDF). */}
        <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
          {(() => {
            const seen = new Set<string>();
            return invoice.lineItems.map((li, idx) => {
              const q = Number(li.qty) || 0;
              const r = Number(li.rate) || 0;
              const jid = li.job_id ?? null;
              // Split-off flat add-on lines (e.g. a loading fee) keep the job_id
              // so they move/remove with the job, but show their own name.
              const isAddon = !!li.addon;
              const title = (jid && !isAddon && jobTitles?.[jid]) || li.description;
              const showActions = editable && canEdit && !!jid && !isAddon && !!onRemoveJob && !seen.has(jid);
              if (jid) seen.add(jid);
              return (
                <div key={idx} className="flex items-center justify-between gap-3 py-2.5 border-b border-border">
                  <div className="flex-1 pr-3 min-w-0">
                    {jid && onJobPress && !isAddon ? (
                      <button onClick={() => onJobPress(jid)} className="block text-sm font-medium text-primary hover:underline truncate text-left max-w-full">
                        {title}
                      </button>
                    ) : (
                      <p className={isAddon ? 'text-sm text-muted truncate' : 'text-sm text-ink truncate'}>{isAddon ? `+ ${title}` : title}</p>
                    )}
                    <p className="text-xs text-faint mt-0.5">{q} × {fmt(r)}</p>
                    {li.addonNote ? <p className="text-[11px] text-faint mt-0.5">{li.addonNote}</p> : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Link is safe on ANY status (no total change) — so imported
                        paid/sent invoices can be tied to a job without unlocking. */}
                    {onLinkLine && canEdit && !jid && !isAddon ? (
                      <button onClick={() => onLinkLine(idx)} disabled={jobBusy} className="text-xs font-semibold text-muted hover:text-primary disabled:opacity-40">
                        {tInv.jobsSection.linkBtn}
                      </button>
                    ) : null}
                    {showActions ? (
                      <>
                        {onEditManualItem ? (
                          <button onClick={() => onEditManualItem(idx)} disabled={jobBusy} className="text-xs font-semibold text-muted hover:text-primary disabled:opacity-40">
                            {ui.common.buttons.edit}
                          </button>
                        ) : null}
                        {onMoveJob ? (
                          <button onClick={() => onMoveJob(jid!)} disabled={jobBusy} className="text-xs font-semibold text-muted hover:text-primary disabled:opacity-40">
                            {tInv.jobsSection.moveBtn}
                          </button>
                        ) : null}
                        <button onClick={() => onRemoveJob!(jid!)} disabled={jobBusy} className="text-xs font-semibold text-red-500 hover:text-red-600 disabled:opacity-40">
                          {tInv.jobsSection.removeBtn}
                        </button>
                      </>
                    ) : editable && canEdit && (!jid || isAddon) && (onEditManualItem || onRemoveManualItem) ? (
                      // Manual lines AND split-off add-on lines (loading fee, etc.):
                      // per-line Edit/Remove by index so a stray fee can be deleted.
                      <>
                        {onEditManualItem ? (
                          <button onClick={() => onEditManualItem(idx)} disabled={jobBusy} className="text-xs font-semibold text-muted hover:text-primary disabled:opacity-40">
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
                    <p className="text-sm font-semibold text-ink w-24 text-right">{fmt(q * r)}</p>
                  </div>
                </div>
              );
            });
          })()}

          {editable && onAddJob && canEdit ? (
            <button onClick={onAddJob} disabled={jobBusy} className="mt-3 text-sm font-semibold text-primary hover:underline disabled:opacity-40">
              + {tInv.jobsSection.addBtn}
            </button>
          ) : null}

          {autopriceVerify ? (
            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              {ui.dashboard.jobs.detail.autopriceVerify}
            </div>
          ) : null}

          {/* Totals — below the items */}
          <div className="mt-3 pt-3 border-t border-border-soft flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-sm text-muted">{t.subtotal}</span>
              <span className="text-sm text-ink">{fmt(invoice.subtotalAmount)}</span>
            </div>
            {/* Shown whenever a rate is set — even if the amount is $0 (e.g.
               no line prices yet), so the configured tax is always visible. */}
            {invoice.taxRate > 0 ? (
              <div className="flex justify-between">
                <span className="text-sm text-muted">{`${t.tax} (${invoice.taxRate}%)`}</span>
                <span className="text-sm text-ink">{fmt(invoice.taxAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 border-t border-border-soft">
              <span className="text-base font-bold text-ink">{t.total}</span>
              <span className="text-base font-bold text-primary">{fmt(invoice.totalAmount)}</span>
            </div>
            {payments.length > 0 ? (
              <div className="pt-2 border-t border-border-soft flex flex-col gap-1.5">
                {/* Summary row toggles the detail rows so many partials don't
                   swamp the totals card. */}
                <button
                  type="button"
                  onClick={() => setPaymentsToggle(!paymentsExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <span className="flex items-center gap-1 text-sm font-medium text-muted">
                    {tInv.payments.title} ({payments.length})
                    <ChevronDown size={14} className={`text-faint transition-transform ${paymentsExpanded ? 'rotate-180' : ''}`} />
                  </span>
                  <span className="text-sm font-medium text-emerald-700">−{fmt(paidSoFar)}</span>
                </button>
                {paymentsExpanded ? payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between group pl-2">
                    <span className="text-sm text-muted">
                      {p.method ?? '—'} · {formatDate(p.paidOn)}
                    </span>
                    <span className="flex items-center gap-2">
                      {p.photoUrl && onViewPaymentPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" onClick={() => onViewPaymentPhoto(p)}
                          style={{ transform: `rotate(${p.photoRotation ?? 0}deg)` }}
                          className="w-8 h-8 rounded object-cover cursor-pointer border border-border" />
                      ) : null}
                      <span className="text-sm text-emerald-700">−{fmt(p.amount)}</span>
                      {onEditPayment && canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEditPayment(p)}
                          disabled={updating}
                          className="p-1 rounded-lg text-faint hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Pencil size={13} />
                        </button>
                      ) : null}
                      {onDeletePayment && canEdit ? (
                        <button
                          type="button"
                          onClick={() => onDeletePayment(p)}
                          disabled={updating}
                          className="p-1 rounded-lg text-faint hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </span>
                  </div>
                )) : null}
                {invoice.status !== 'paid' ? (
                  <div className="flex justify-between pt-1">
                    <span className="text-sm font-semibold text-amber-700">{tInv.payments.remaining}</span>
                    <span className="text-sm font-semibold text-amber-700">{fmt(balanceDue)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Primary actions — draft: Send + Mark sent (no email) · sent: Mark paid + Undo */}
        {invoice.status === 'draft' && canEdit ? (
          <div className="flex flex-col gap-2">
            {onSendInvoice ? (
              <button onClick={onSendInvoice} disabled={updating} className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-semibold hover:opacity-90 disabled:opacity-60">
                <Send size={16} /> {tInv.sendInvoice}
              </button>
            ) : null}
            <button onClick={() => onUpdateStatus('sent')} disabled={updating} className="flex items-center justify-center gap-2 border border-border bg-card text-ink py-3 rounded-2xl font-semibold hover:bg-surface disabled:opacity-60">
              <CheckCircle size={16} /> {tInv.markSent}
            </button>
          </div>
        ) : null}
        {sentLike && (canEdit || canWriteOff) ? (
          <div className="flex flex-col gap-2">
            {canEdit ? (
              <button onClick={() => (onRecordPayment ? onRecordPayment() : onUpdateStatus('paid'))} disabled={updating} className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-semibold hover:opacity-90 disabled:opacity-60">
                <CheckCircle size={16} /> {paidSoFar > 0 ? tInv.payments.recordBtn : tInv.markPaid}
              </button>
            ) : null}
            {canEdit ? (
              <button onClick={() => onUpdateStatus('draft')} disabled={updating} className="flex items-center justify-center gap-2 border border-border bg-card text-muted py-3 rounded-2xl font-semibold hover:bg-surface disabled:opacity-60">
                <Undo2 size={16} /> {tInv.undoSent}
              </button>
            ) : null}
            {/* Write-off: an invoice the client will never pay. Drops out of overdue. */}
            {canWriteOff ? (
              <button onClick={() => onUpdateStatus('total_loss')} disabled={updating} className="flex items-center justify-center gap-2 text-muted py-2 rounded-2xl font-semibold text-sm hover:opacity-70 disabled:opacity-60">
                <Ban size={15} /> {tInv.markTotalLoss}
              </button>
            ) : null}
          </div>
        ) : null}
        {invoice.status === 'total_loss' && canWriteOff ? (
          <button onClick={() => onUpdateStatus('sent')} disabled={updating} className="w-full flex items-center justify-center gap-2 border border-border bg-card text-muted py-3 rounded-2xl font-semibold hover:bg-surface disabled:opacity-60">
            <Undo2 size={16} /> {tInv.reinstateInvoice}
          </button>
        ) : null}
        {invoice.status === 'paid' && onUndoPaid && canEdit ? (
          <button onClick={onUndoPaid} disabled={updating} className="flex items-center justify-center gap-2 border border-border bg-card text-muted py-3 rounded-2xl font-semibold hover:bg-surface disabled:opacity-60">
            <Undo2 size={16} /> {tInv.payments.undoPaid}
          </button>
        ) : null}

        {/* Last edited — bottom of the page. */}
        {invoice.updatedAt && invoice.updatedAt !== invoice.createdAt ? (
          <p className="text-xs text-faint text-center mt-1">
            {tInv.lastEditedLabel}: {formatDateTimeLong(invoice.updatedAt, dateLoc)}
            {invoice.updatedByName ? ` · ${tInv.byUser.replace('{{name}}', invoice.updatedByName)}` : ''}
          </p>
        ) : null}
        </div>
      </div>
    </div>
  );
}

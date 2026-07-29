import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
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
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
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
  /** Auditing user ids (migration 150) + their resolved display names. */
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  clients: InvoiceDetailClient[];
  /** Resolved custom fields (label + display value), already ordered and
   *  filtered to non-empty entries by the caller. */
  customFields?: { label: string; value: string; key?: string }[];
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
  /** Print / export PDF (mobile: share sheet). Hidden if not provided. */
  onPrint?: () => void;
  /** Copy/share the public invoice link. Hidden if not provided. */
  onShareLink?: () => void;
  /** Optional: open the edit form. Pencil icon hidden when not provided. */
  onEdit?: () => void;
  /** Optional: trigger delete (caller handles confirm). Trash hidden when not provided. */
  onDelete?: () => void;
  /** Autoprice: fill in unpriced ($0) lines from the price sheet. Hidden when
   *  not provided (no price-sheet items or a sent/paid invoice). */
  onAutoprice?: () => void;
  /** Reset all lines to unpriced ($0) so Autoprice can re-run clean. */
  onClearPrices?: () => void;
  /** Show the amber "please verify pricing" note after an autoprice run. */
  autopriceVerify?: boolean;
  /** Optional content rendered at the bottom of the scroll (e.g. jobs-on-invoice management). */
  footerSlot?: ReactNode;
  // Inline job management — Move / Remove appear on each job-backed line item,
  // Add job below the items. Wrapper owns the pickers + the actual mutations.
  onMoveJob?: (jobId: string) => void;
  onRemoveJob?: (jobId: string) => void;
  onAddJob?: () => void;
  /** Remove a hand-entered (manual) line item by its index. */
  onRemoveManualItem?: (index: number) => void;
  /** Edit a hand-entered (manual) line item by its index. */
  onEditManualItem?: (index: number) => void;
  /** Link an imported/manual line (no job) to an existing job. */
  onLinkLine?: (index: number) => void;
  /** Open a job's detail (line-item title becomes tappable). */
  onJobPress?: (jobId: string) => void;
  jobBusy?: boolean;
  /** Email the invoice out (draft → opens the mail client + marks sent). */
  onSendInvoice?: () => void;
  /** Recorded payments (partial or full). Rendered under the totals. */
  payments?: InvoicePaymentRow[];
  /** Open the record-payment sheet. Falls back to onUpdateStatus('paid'). */
  onRecordPayment?: () => void;
  /** Edit a recorded payment (opens the record sheet pre-filled). */
  onEditPayment?: (payment: InvoicePaymentRow) => void;
  /** Delete a recorded payment (caller confirms + reverts status if needed). */
  onDeletePayment?: (payment: InvoicePaymentRow) => void;
  /** View a payment's photo full-size (thumbnail tapped in the ledger). */
  onViewPaymentPhoto?: (url: string) => void;
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
  onAutoprice,
  onClearPrices,
  autopriceVerify,
  onEdit,
  onDelete,
  footerSlot,
  onMoveJob,
  onRemoveJob,
  onAddJob,
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
  const c = useThemeColors();
  const tInv = ui.dashboard.invoices;
  const tStatus = ui.dashboard.invoiceStatus;
  // Hooks must run before the early returns below (Rules of Hooks).
  // null = auto (expand short lists, collapse 3+); a tap pins the choice.
  const [paymentsToggle, setPaymentsToggle] = useState<boolean | null>(null);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface py-20">
        <View className="flex-row gap-1">
          {[0, 1, 2].map(i => (
            <View key={i} className="w-2 h-2 rounded-full bg-primary" />
          ))}
        </View>
      </View>
    );
  }

  if (!invoice) {
    return (
      <View className="p-6">
        <Text className="text-faint">{tInv.notFound}</Text>
      </View>
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
  // Overdue = a sent invoice past due; keep the Mark paid / Undo actions + partial UI.
  const sentLike = invoice.status === 'sent' || invoice.status === 'overdue';
  const isPartial = sentLike && paidSoFar > 0;
  // Line items are editable only while Draft; frozen once sent/paid (Undo sent re-opens).
  const editable = invoice.status === 'draft';

  // All invoice dates render as "Mayo 24, 2026" for consistency with the
  // rest of the app. Locale comes from the invoice's printed-language
  // setting (es-MX / en-US) so the PDF view matches.
  const formatDate = (iso: string) => formatDateLong(iso, dateLoc);

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-44">
      {/* Header — title left, utility actions top-right (jobs/equipment pattern) */}
      <View className="flex-row items-start justify-between mb-4 gap-3">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <Pressable onPress={onBack} className="p-2 -ml-2 rounded-xl active:bg-border-soft">
            <ArrowLeft size={18} color={c.muted} />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-xl font-bold text-ink">{invoice.invoiceNumber}</Text>
            {/* Pills on their own row — inline they collide with the header
               action icons on narrow screens. */}
            <View className="flex-row items-center gap-2 flex-wrap mt-1">
              <View className={`px-3.5 py-1.5 rounded-full ${pillBg}`}>
                <Text className={`text-sm font-bold ${pillText}`}>
                  {statusLabel}
                </Text>
              </View>
              {isPartial ? (
                <View className="px-3.5 py-1.5 rounded-full bg-amber-100">
                  <Text className="text-sm font-bold text-amber-700">{tInv.payments.partialPill}</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-faint mt-1">
              {tInv.createdLabel}: {formatDateTimeLong(invoice.createdAt, dateLoc)}
              {invoice.createdByName ? ` · ${tInv.byUser.replace('{{name}}', invoice.createdByName)}` : ''}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-0.5 shrink-0">
          {onAutoprice && canEdit ? (
            <Pressable onPress={onAutoprice} className="p-2 rounded-xl bg-primary/10 active:opacity-80 mr-0.5" accessibilityLabel={ui.dashboard.jobs.detail.autopriceBtn}><DollarSign size={18} color={c.primary} /></Pressable>
          ) : null}
          {onClearPrices && canEdit ? (
            <Pressable onPress={onClearPrices} className="p-2 rounded-xl active:bg-border-soft mr-0.5" accessibilityLabel={tInv.jobsSection.clearPricesBtn}><Eraser size={18} color={c.muted} /></Pressable>
          ) : null}
          {onShareLink ? (
            <Pressable onPress={onShareLink} className="p-2 rounded-xl active:bg-border-soft"><Link2 size={18} color={c.muted} /></Pressable>
          ) : null}
          {onPrint ? (
            <Pressable onPress={onPrint} className="p-2 rounded-xl active:bg-border-soft"><Printer size={18} color={c.muted} /></Pressable>
          ) : null}
          {onEdit && canEdit ? (
            <Pressable onPress={onEdit} className="p-2 rounded-xl active:bg-border-soft"><Pencil size={18} color={c.muted} /></Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete} className="p-2 rounded-xl active:bg-red-500/10"><Trash2 size={18} color={c.danger} /></Pressable>
          ) : null}
        </View>
      </View>

      {/* Quick total */}
      <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 flex-row items-center gap-3 mb-4">
        <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
          <DollarSign size={18} className="text-primary" />
        </View>
        <View>
          <Text className="text-xs text-faint font-medium">{t.total}</Text>
          <Text className="text-xl font-bold text-ink">{fmt(invoice.totalAmount)}</Text>
        </View>
      </View>

      {/* Client — name, business, address */}
      <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
        <Text className="text-[11px] text-faint font-semibold uppercase tracking-wide mb-1">{t.billTo}</Text>
        {invoice.clients.length ? invoice.clients.map((c, i) => {
          const cityStateZip = [[c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(' ');
          const loc = [c.address, cityStateZip].filter(Boolean).join(' · ');
          return (
            <View key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-border-soft' : ''}>
              {onClientPress && c.id ? (
                  <Pressable onPress={() => onClientPress(c.id!)} hitSlop={4}>
                    <Text className="text-base font-semibold text-primary">{c.firstName} {c.lastName}</Text>
                  </Pressable>
                ) : (
                  <Text className="text-base font-semibold text-ink">{c.firstName} {c.lastName}</Text>
                )}
              {c.company ? <Text className="text-sm text-muted mt-0.5">{c.company}</Text> : null}
              {loc ? <Text className="text-sm text-muted mt-0.5">{loc}</Text> : null}
              {c.phoneCell ? <Text className="text-sm text-muted mt-0.5">{c.phoneCell}</Text> : null}
            </View>
          );
        }) : <Text className="text-sm text-faint">—</Text>}
      </View>

      {/* Dates — combined */}
      <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-blue-500/10 items-center justify-center">
            <Calendar size={18} className="text-blue-500" />
          </View>
          <View>
            <Text className="text-xs text-faint font-medium">{t.issueDate}</Text>
            <Text className="text-sm font-semibold text-ink">{formatDate(invoice.issueDate)}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-border-soft">
          <View className="w-10 h-10 rounded-xl bg-amber-500/10 items-center justify-center">
            <FileText size={18} className="text-amber-500" />
          </View>
          <View>
            <Text className="text-xs text-faint font-medium">{t.dueDate}</Text>
            <Text className="text-sm font-semibold text-ink">
              {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
              {dateNote ? <Text className="text-xs font-medium text-muted">{`  ·  ${dateNote}`}</Text> : null}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes ? (
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
          <Text className="text-[11px] text-faint font-semibold uppercase tracking-wide">{t.notes}</Text>
          <Text className="text-sm text-ink mt-1">{invoice.notes}</Text>
        </View>
      ) : null}

      {/* Custom fields (invoice_field_templates) — read-only. */}
      {invoice.customFields && invoice.customFields.length > 0 ? (
        <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
          <Text className="text-[11px] text-faint font-semibold uppercase tracking-wide mb-2">{ui.dashboard.employees.modal.customFieldsHeading}</Text>
          <View className="gap-2">
            {invoice.customFields.map(f => (
              <View key={f.key ?? f.label} className="flex-row justify-between gap-3">
                <Text className="text-xs text-faint flex-1">{f.label}</Text>
                <Text className="text-sm text-ink text-right flex-1">{f.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Line items / jobs (inline manage) + totals below. The styled FACTURA
         document is only built for print / share (PDF). */}
      <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 mb-4">
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
              <View key={idx} className="py-2.5 border-b border-border">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    {jid && onJobPress && !isAddon ? (
                      <Pressable onPress={() => onJobPress(jid)} hitSlop={4}>
                        <Text className="text-sm font-medium text-primary">{title}</Text>
                      </Pressable>
                    ) : (
                      <Text className={isAddon ? 'text-sm text-muted' : 'text-sm text-ink'}>{isAddon ? `+ ${title}` : title}</Text>
                    )}
                    <Text className="text-xs text-faint mt-0.5">{q} × {fmt(r)}</Text>
                    {li.addonNote ? <Text className="text-[11px] text-faint mt-0.5">{li.addonNote}</Text> : null}
                  </View>
                  <Text className="text-sm font-semibold text-ink">{fmt(q * r)}</Text>
                </View>
                {showActions ? (
                  <View className="flex-row justify-end gap-4 mt-1.5">
                    {onEditManualItem ? (
                      <Pressable onPress={() => onEditManualItem(idx)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-muted">{ui.common.buttons.edit}</Text>
                      </Pressable>
                    ) : null}
                    {onMoveJob ? (
                      <Pressable onPress={() => onMoveJob(jid!)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-muted">{tInv.jobsSection.moveBtn}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => onRemoveJob!(jid!)} disabled={jobBusy} hitSlop={6}>
                      <Text className="text-xs font-semibold text-red-500">{tInv.jobsSection.removeBtn}</Text>
                    </Pressable>
                  </View>
                ) : canEdit && (!jid || isAddon) && ((onLinkLine && !jid && !isAddon) || (editable && (onEditManualItem || onRemoveManualItem))) ? (
                  // Manual lines AND split-off add-on lines. Link is safe on ANY
                  // status (no total change) so imported paid/sent invoices can be
                  // tied to a job; Edit/Remove stay draft-only.
                  <View className="flex-row justify-end gap-4 mt-1.5">
                    {onLinkLine && !jid && !isAddon ? (
                      <Pressable onPress={() => onLinkLine(idx)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-muted">{tInv.jobsSection.linkBtn}</Text>
                      </Pressable>
                    ) : null}
                    {editable && onEditManualItem ? (
                      <Pressable onPress={() => onEditManualItem(idx)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-muted">{ui.common.buttons.edit}</Text>
                      </Pressable>
                    ) : null}
                    {editable && onRemoveManualItem ? (
                      <Pressable onPress={() => onRemoveManualItem(idx)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-red-500">{tInv.jobsSection.removeBtn}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          });
        })()}

        {editable && onAddJob && canEdit ? (
          <Pressable onPress={onAddJob} disabled={jobBusy} className="self-start py-2 mt-1" hitSlop={6}>
            <Text className="text-sm font-semibold text-primary">+ {tInv.jobsSection.addBtn}</Text>
          </Pressable>
        ) : null}

        {autopriceVerify ? (
          <View className="mt-2 rounded-xl bg-amber-500/10 border border-amber-100 px-3 py-2">
            <Text className="text-xs text-amber-700">{ui.dashboard.jobs.detail.autopriceVerify}</Text>
          </View>
        ) : null}

        {/* Totals — below the items */}
        <View className="mt-3 pt-3 border-t border-border-soft gap-1.5">
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">{t.subtotal}</Text>
            <Text className="text-sm text-ink">{fmt(invoice.subtotalAmount)}</Text>
          </View>
          {/* Shown whenever a rate is set — even if the amount is $0 (e.g.
             no line prices yet), so the configured tax is always visible. */}
          {invoice.taxRate > 0 ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">{`${t.tax} (${invoice.taxRate}%)`}</Text>
              <Text className="text-sm text-ink">{fmt(invoice.taxAmount)}</Text>
            </View>
          ) : null}
          <View className="flex-row justify-between pt-2 border-t border-border-soft">
            <Text className="text-base font-bold text-ink">{t.total}</Text>
            <Text className="text-base font-bold text-primary">{fmt(invoice.totalAmount)}</Text>
          </View>
          {payments.length > 0 ? (
            <View className="pt-2 border-t border-border-soft gap-1.5">
              {/* Summary row toggles the detail rows so many partials don't
                 swamp the totals card. */}
              <Pressable
                onPress={() => setPaymentsToggle(!paymentsExpanded)}
                className="flex-row items-center justify-between active:opacity-70"
                hitSlop={4}
              >
                <View className="flex-row items-center gap-1">
                  <Text className="text-sm font-medium text-muted">
                    {tInv.payments.title} ({payments.length})
                  </Text>
                  <ChevronDown size={14} color={c.faint} style={{ transform: [{ rotate: paymentsExpanded ? '180deg' : '0deg' }] }} />
                </View>
                <Text className="text-sm font-medium text-emerald-700">−{fmt(paidSoFar)}</Text>
              </Pressable>
              {paymentsExpanded ? payments.map(p => (
                <View key={p.id} className="flex-row items-center justify-between pl-2">
                  <Text className="text-sm text-muted flex-1 pr-2" numberOfLines={1}>
                    {p.method ?? '—'} · {formatDate(p.paidOn)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {p.photoUrl && onViewPaymentPhoto ? (
                      <Pressable onPress={() => onViewPaymentPhoto(p.photoUrl!)} hitSlop={6} className="active:opacity-60">
                        <Image source={{ uri: p.photoUrl }} style={{ width: 22, height: 22, borderRadius: 4 }} />
                      </Pressable>
                    ) : null}
                    <Text className="text-sm text-emerald-700">−{fmt(p.amount)}</Text>
                    {onEditPayment && canEdit ? (
                      <Pressable onPress={() => onEditPayment(p)} disabled={updating} className="p-1 active:opacity-60" hitSlop={8}>
                        <Pencil size={13} color={c.faint} />
                      </Pressable>
                    ) : null}
                    {onDeletePayment && canEdit ? (
                      <Pressable onPress={() => onDeletePayment(p)} disabled={updating} className="p-1 active:opacity-60" hitSlop={8}>
                        <Trash2 size={13} color={c.faint} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )) : null}
              {invoice.status !== 'paid' ? (
                <View className="flex-row justify-between pt-1">
                  <Text className="text-sm font-semibold text-amber-700">{tInv.payments.remaining}</Text>
                  <Text className="text-sm font-semibold text-amber-700">{fmt(balanceDue)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Primary actions — draft: Send + Mark sent (no email) · sent: Mark paid + Undo */}
      {invoice.status === 'draft' && canEdit ? (
        <View className="gap-2.5 mb-4">
          {onSendInvoice ? (
            <Pressable onPress={onSendInvoice} disabled={updating} className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-2xl active:opacity-90">
              <Send size={16} color="#FFFFFF" />
              <Text className="text-white font-semibold">{tInv.sendInvoice}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => onUpdateStatus('sent')} disabled={updating} className="flex-row items-center justify-center gap-2 border border-border bg-card py-3.5 rounded-2xl active:bg-surface">
            <CheckCircle size={16} color={c.ink} />
            <Text className="text-ink font-semibold">{tInv.markSent}</Text>
          </Pressable>
        </View>
      ) : null}
      {sentLike && (canEdit || canWriteOff) ? (
        <View className="gap-2.5 mb-4">
          {canEdit ? (
            <Pressable onPress={() => (onRecordPayment ? onRecordPayment() : onUpdateStatus('paid'))} disabled={updating} className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-2xl active:opacity-90">
              <CheckCircle size={16} color="#FFFFFF" />
              <Text className="text-white font-semibold">{paidSoFar > 0 ? tInv.payments.recordBtn : tInv.markPaid}</Text>
            </Pressable>
          ) : null}
          {canEdit ? (
            <Pressable onPress={() => onUpdateStatus('draft')} disabled={updating} className="flex-row items-center justify-center gap-2 border border-border bg-card py-3.5 rounded-2xl active:bg-surface">
              <Undo2 size={16} color={c.muted} />
              <Text className="text-muted font-semibold">{tInv.undoSent}</Text>
            </Pressable>
          ) : null}
          {/* Write-off: an invoice the client will never pay. Drops out of overdue. */}
          {canWriteOff ? (
            <Pressable onPress={() => onUpdateStatus('total_loss')} disabled={updating} className="flex-row items-center justify-center gap-2 py-2 rounded-2xl active:opacity-70">
              <Ban size={15} color={c.muted} />
              <Text className="text-muted font-semibold text-sm">{tInv.markTotalLoss}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {invoice.status === 'total_loss' && canWriteOff ? (
        <Pressable onPress={() => onUpdateStatus('sent')} disabled={updating} className="flex-row items-center justify-center gap-2 border border-border bg-card py-3.5 rounded-2xl active:bg-surface mb-4">
          <Undo2 size={16} color={c.muted} />
          <Text className="text-muted font-semibold">{tInv.reinstateInvoice}</Text>
        </Pressable>
      ) : null}
      {invoice.status === 'paid' && onUndoPaid && canEdit ? (
        <Pressable onPress={onUndoPaid} disabled={updating} className="flex-row items-center justify-center gap-2 border border-border bg-card py-3.5 rounded-2xl active:bg-surface mb-4">
          <Undo2 size={16} color={c.muted} />
          <Text className="text-muted font-semibold">{tInv.payments.undoPaid}</Text>
        </Pressable>
      ) : null}

      {footerSlot}

      {/* Last edited — bottom of the page. */}
      {invoice.updatedAt && invoice.updatedAt !== invoice.createdAt ? (
        <Text className="text-xs text-faint text-center mt-2">
          {tInv.lastEditedLabel}: {formatDateTimeLong(invoice.updatedAt, dateLoc)}
          {invoice.updatedByName ? ` · ${tInv.byUser.replace('{{name}}', invoice.updatedByName)}` : ''}
        </Text>
      ) : null}
    </ScrollView>
  );
}

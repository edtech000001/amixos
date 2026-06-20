import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
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
} from 'lucide-react-native';
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
  /** Resolved custom fields (label + display value), already ordered and
   *  filtered to non-empty entries by the caller. */
  customFields?: { label: string; value: string; key?: string }[];
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
  /** Print / export PDF (mobile: share sheet). Hidden if not provided. */
  onPrint?: () => void;
  /** Copy/share the public invoice link. Hidden if not provided. */
  onShareLink?: () => void;
  /** Optional: open the edit form. Pencil icon hidden when not provided. */
  onEdit?: () => void;
  /** Optional: trigger delete (caller handles confirm). Trash hidden when not provided. */
  onDelete?: () => void;
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
  /** Open a job's detail (line-item title becomes tappable). */
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
  footerSlot,
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
        <Text className="text-gray-400">{tInv.notFound}</Text>
      </View>
    );
  }

  const lang: InvoiceLang = invoice.language ?? 'es';
  const t = getInvoiceLabels(lang);
  const dateLoc = getInvoiceDateLocale(lang);
  const statusKey = invoice.status as keyof typeof tStatus;
  const statusLabel = tStatus[statusKey] ?? invoice.status;
  const pillBg = STATUS_PILL_BG[invoice.status] ?? 'bg-gray-100';
  const pillText = STATUS_PILL_TEXT[invoice.status] ?? 'text-gray-500';

  // All invoice dates render as "Mayo 24, 2026" for consistency with the
  // rest of the app. Locale comes from the invoice's printed-language
  // setting (es-MX / en-US) so the PDF view matches.
  const formatDate = (iso: string) => formatDateLong(iso, dateLoc);

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header — title left, utility actions top-right (jobs/equipment pattern) */}
      <View className="flex-row items-start justify-between mb-4 gap-3">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <Pressable onPress={onBack} className="p-2 -ml-2 rounded-xl active:bg-gray-100">
            <ArrowLeft size={18} color="#6B7280" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2">
              <Text className="text-xl font-bold text-gray-900">{invoice.invoiceNumber}</Text>
              <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                <Text className={`text-xs font-semibold ${pillText}`}>{statusLabel}</Text>
              </View>
            </View>
            <Text className="text-xs text-gray-400 mt-0.5">{tInv.createdLabel}: {formatDateTimeLong(invoice.createdAt, dateLoc)}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-0.5 shrink-0">
          {onShareLink ? (
            <Pressable onPress={onShareLink} className="p-2 rounded-xl active:bg-gray-100"><Link2 size={18} color="#6B7280" /></Pressable>
          ) : null}
          {onPrint ? (
            <Pressable onPress={onPrint} className="p-2 rounded-xl active:bg-gray-100"><Printer size={18} color="#6B7280" /></Pressable>
          ) : null}
          {onEdit ? (
            <Pressable onPress={onEdit} className="p-2 rounded-xl active:bg-gray-100"><Pencil size={18} color="#6B7280" /></Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete} className="p-2 rounded-xl active:bg-red-50"><Trash2 size={18} color="#EF4444" /></Pressable>
          ) : null}
        </View>
      </View>

      {/* Quick total */}
      <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-row items-center gap-3 mb-4">
        <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
          <DollarSign size={18} className="text-primary" />
        </View>
        <View>
          <Text className="text-xs text-gray-400 font-medium">{t.total}</Text>
          <Text className="text-xl font-bold text-gray-900">{fmt(invoice.totalAmount)}</Text>
        </View>
      </View>

      {/* Client — name, business, address */}
      <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <Text className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{t.billTo}</Text>
        {invoice.clients.length ? invoice.clients.map((c, i) => {
          const cityStateZip = [[c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(' ');
          const loc = [c.address, cityStateZip].filter(Boolean).join(' · ');
          return (
            <View key={i} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-50' : ''}>
              <Text className="text-base font-semibold text-gray-900">{c.firstName} {c.lastName}</Text>
              {c.company ? <Text className="text-sm text-gray-600 mt-0.5">{c.company}</Text> : null}
              {loc ? <Text className="text-sm text-gray-500 mt-0.5">{loc}</Text> : null}
              {c.phoneCell ? <Text className="text-sm text-gray-500 mt-0.5">{c.phoneCell}</Text> : null}
            </View>
          );
        }) : <Text className="text-sm text-gray-400">—</Text>}
      </View>

      {/* Dates — combined */}
      <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
            <Calendar size={18} className="text-blue-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.issueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">{formatDate(invoice.issueDate)}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-gray-50">
          <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
            <FileText size={18} className="text-amber-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.dueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes ? (
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
          <Text className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t.notes}</Text>
          <Text className="text-sm text-gray-700 mt-1">{invoice.notes}</Text>
        </View>
      ) : null}

      {/* Line items / jobs (inline manage) + totals below. The styled FACTURA
         document is only built for print / share (PDF). */}
      <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        {(() => {
          const seen = new Set<string>();
          return invoice.lineItems.map((li, idx) => {
            const q = Number(li.qty) || 0;
            const r = Number(li.rate) || 0;
            const jid = li.job_id ?? null;
            const showActions = !!jid && !!onRemoveJob && !seen.has(jid);
            if (jid) seen.add(jid);
            return (
              <View key={idx} className="py-2.5 border-b border-gray-200">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    {jid && onJobPress ? (
                      <Pressable onPress={() => onJobPress(jid)} hitSlop={4}>
                        <Text className="text-sm font-medium text-primary">{li.description}</Text>
                      </Pressable>
                    ) : (
                      <Text className="text-sm text-gray-900">{li.description}</Text>
                    )}
                    <Text className="text-xs text-gray-400 mt-0.5">{q} × {fmt(r)}</Text>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">{fmt(q * r)}</Text>
                </View>
                {showActions ? (
                  <View className="flex-row justify-end gap-4 mt-1.5">
                    {onMoveJob ? (
                      <Pressable onPress={() => onMoveJob(jid!)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-gray-500">{tInv.jobsSection.moveBtn}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => onRemoveJob!(jid!)} disabled={jobBusy} hitSlop={6}>
                      <Text className="text-xs font-semibold text-red-500">{tInv.jobsSection.removeBtn}</Text>
                    </Pressable>
                  </View>
                ) : !jid && (onEditManualItem || onRemoveManualItem) ? (
                  <View className="flex-row justify-end gap-4 mt-1.5">
                    {onEditManualItem ? (
                      <Pressable onPress={() => onEditManualItem(idx)} disabled={jobBusy} hitSlop={6}>
                        <Text className="text-xs font-semibold text-gray-500">{ui.common.buttons.edit}</Text>
                      </Pressable>
                    ) : null}
                    {onRemoveManualItem ? (
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

        {onAddJob ? (
          <Pressable onPress={onAddJob} disabled={jobBusy} className="self-start py-2 mt-1" hitSlop={6}>
            <Text className="text-sm font-semibold text-primary">+ {tInv.jobsSection.addBtn}</Text>
          </Pressable>
        ) : null}

        {/* Totals — below the items */}
        <View className="mt-3 pt-3 border-t border-gray-100 gap-1.5">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-500">{t.subtotal}</Text>
            <Text className="text-sm text-gray-900">{fmt(invoice.subtotalAmount)}</Text>
          </View>
          {invoice.taxAmount > 0 ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-500">{t.tax}</Text>
              <Text className="text-sm text-gray-900">{fmt(invoice.taxAmount)}</Text>
            </View>
          ) : null}
          <View className="flex-row justify-between pt-2 border-t border-gray-100">
            <Text className="text-base font-bold text-gray-900">{t.total}</Text>
            <Text className="text-base font-bold text-primary">{fmt(invoice.totalAmount)}</Text>
          </View>
        </View>
      </View>

      {/* Primary action — Send invoice (draft) / Mark paid (sent) */}
      {invoice.status === 'draft' && onSendInvoice ? (
        <Pressable onPress={onSendInvoice} disabled={updating} className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-2xl active:opacity-90 mb-4">
          <Send size={16} color="#FFFFFF" />
          <Text className="text-white font-semibold">{tInv.sendInvoice}</Text>
        </Pressable>
      ) : null}
      {invoice.status === 'sent' ? (
        <Pressable onPress={() => onUpdateStatus('paid')} disabled={updating} className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-2xl active:opacity-90 mb-4">
          <CheckCircle size={16} color="#FFFFFF" />
          <Text className="text-white font-semibold">{tInv.markPaid}</Text>
        </Pressable>
      ) : null}

      {footerSlot}

      {/* Last edited — bottom of the page. */}
      {invoice.updatedAt && invoice.updatedAt !== invoice.createdAt ? (
        <Text className="text-xs text-gray-400 text-center mt-2">
          {tInv.lastEditedLabel}: {formatDateTimeLong(invoice.updatedAt, dateLoc)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

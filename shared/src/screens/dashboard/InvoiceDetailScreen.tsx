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
  const vm = buildInvoiceViewModel(templateConfig, invoice, branding);

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6 flex-wrap gap-3">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={onBack} className="p-2 rounded-xl active:bg-gray-100">
            <ArrowLeft size={18} color="#6B7280" />
          </Pressable>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-xl font-bold text-gray-900">{invoice.invoiceNumber}</Text>
              <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                <Text className={`text-xs font-semibold ${pillText}`}>{statusLabel}</Text>
              </View>
            </View>
            {invoice.dueDate ? (
              <Text className="text-xs text-gray-400 mt-0.5">
                {t.expires}: {formatDate(invoice.dueDate)}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {invoice.status === 'draft' ? (
            <Pressable
              onPress={() => onUpdateStatus('sent')}
              disabled={updating}
              className="flex-row items-center gap-1.5 bg-primary px-3 py-2 rounded-xl active:opacity-80"
            >
              <Send size={14} color="#FFFFFF" />
              <Text className="text-white text-xs font-semibold">{tInv.markSent}</Text>
            </Pressable>
          ) : null}
          {invoice.status === 'sent' ? (
            <Pressable
              onPress={() => onUpdateStatus('paid')}
              disabled={updating}
              className="flex-row items-center gap-1.5 bg-primary px-3 py-2 rounded-xl active:opacity-80"
            >
              <CheckCircle size={14} color="#FFFFFF" />
              <Text className="text-white text-xs font-semibold">{tInv.markPaid}</Text>
            </Pressable>
          ) : null}
          {onShareLink ? (
            <Pressable onPress={onShareLink} className="p-2 rounded-xl active:bg-gray-100">
              <Link2 size={18} color="#6B7280" />
            </Pressable>
          ) : null}
          {onPrint ? (
            <Pressable onPress={onPrint} className="p-2 rounded-xl active:bg-gray-100">
              <Printer size={18} color="#6B7280" />
            </Pressable>
          ) : null}
          {onEdit ? (
            <Pressable onPress={onEdit} className="p-2 rounded-xl active:bg-gray-100">
              <Pencil size={18} color="#6B7280" />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable onPress={onDelete} className="p-2 rounded-xl active:bg-red-50">
              <Trash2 size={18} color="#EF4444" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Summary cards */}
      <View className="flex-row flex-wrap gap-4 mb-6">
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">Total</Text>
            <Text className="text-lg font-bold text-gray-900">{fmt(invoice.totalAmount)}</Text>
          </View>
        </View>
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
            <Calendar size={18} className="text-blue-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.issueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">
              {formatDate(invoice.issueDate)}
            </Text>
          </View>
        </View>
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
            <FileText size={18} className="text-amber-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.dueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">
              {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Invoice document — config-driven, what prints / shares / the client sees */}
      <View className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
        <View className="rounded-2xl overflow-hidden">
          <InvoiceDocument vm={vm} />
        </View>
      </View>
    </ScrollView>
  );
}

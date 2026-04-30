import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  ArrowLeft,
  Printer,
  CheckCircle,
  Send,
  DollarSign,
  Calendar,
  FileText,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import {
  getInvoiceLabels,
  getInvoiceDateLocale,
  type InvoiceLang,
} from '../../i18n/invoice';

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
  businessName: string;
  businessLocation: string;
  updating: boolean;
  onBack: () => void;
  onUpdateStatus: (status: 'sent' | 'paid') => Promise<void> | void;
  /** Web-only: print/download. Hidden if not provided. */
  onPrint?: () => void;
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
  businessName,
  businessLocation,
  updating,
  onBack,
  onUpdateStatus,
  onPrint,
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

  const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleDateString(dateLoc, opts);

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="p-6">
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
                {t.expires}:{' '}
                {formatDate(invoice.dueDate, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
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
          {onPrint ? (
            <Pressable onPress={onPrint} className="p-2 rounded-xl active:bg-gray-100">
              <Printer size={18} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Summary cards */}
      <View className="flex-row flex-wrap gap-4 mb-6">
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">Total</Text>
            <Text className="text-lg font-bold text-gray-900">{fmt(invoice.totalAmount)}</Text>
          </View>
        </View>
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
            <Calendar size={18} className="text-blue-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.issueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">
              {formatDate(invoice.issueDate, { year: 'numeric', month: 'short', day: 'numeric' })}
            </Text>
          </View>
        </View>
        <View className="flex-1 min-w-[240px] bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-50 items-center justify-center">
            <FileText size={18} className="text-amber-500" />
          </View>
          <View>
            <Text className="text-xs text-gray-400 font-medium">{t.dueDate}</Text>
            <Text className="text-sm font-semibold text-gray-900">
              {invoice.dueDate
                ? formatDate(invoice.dueDate, { year: 'numeric', month: 'short', day: 'numeric' })
                : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Main invoice card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-6 gap-6 mb-4">
        {/* From + Bill To */}
        <View className="flex-row justify-between flex-wrap gap-4">
          <View>
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{t.from}</Text>
            <Text className="text-sm font-semibold text-gray-900">{businessName}</Text>
            <Text className="text-xs text-gray-400">{businessLocation}</Text>
          </View>
          {invoice.clients.length > 0 ? (
            <View className="items-end">
              <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{t.billTo}</Text>
              {invoice.clients.map((c, i) => (
                <View key={i} className={i > 0 ? 'mt-2 items-end' : 'items-end'}>
                  <Text className="text-sm font-semibold text-gray-900">
                    {c.firstName} {c.lastName}
                  </Text>
                  {c.email ? <Text className="text-xs text-gray-400">{c.email}</Text> : null}
                  {c.phoneCell ? <Text className="text-xs text-gray-400">{c.phoneCell}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Line items */}
        <View className="border-t border-gray-100 pt-4">
          <View className="flex-row mb-3 px-2">
            <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase">{t.item}</Text>
            <Text className="w-12 text-xs font-semibold text-gray-400 uppercase text-center">
              {t.qty}
            </Text>
            <Text className="w-20 text-xs font-semibold text-gray-400 uppercase text-right">
              {t.rate}
            </Text>
            <Text className="w-24 text-xs font-semibold text-gray-400 uppercase text-right">
              {t.total}
            </Text>
          </View>
          {invoice.lineItems.map((l, i) => {
            const qty = Number(l.qty) || 0;
            const rate = Number(l.rate) || 0;
            return (
              <View
                key={i}
                className={`flex-row items-center py-3 px-2 rounded-lg ${
                  i < invoice.lineItems.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Text className="flex-1 text-sm text-gray-800 font-medium">{l.description}</Text>
                <Text className="w-12 text-sm text-gray-500 text-center">{qty}</Text>
                <Text className="w-20 text-sm text-gray-500 text-right">{fmt(rate)}</Text>
                <Text className="w-24 text-sm font-semibold text-gray-900 text-right">
                  {fmt(qty * rate)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View className="border-t border-gray-100 pt-4 items-end gap-2">
          <View className="flex-row gap-12">
            <Text className="text-sm text-gray-500">{t.subtotal}</Text>
            <Text className="text-sm font-medium text-gray-900 w-28 text-right">
              {fmt(invoice.subtotalAmount)}
            </Text>
          </View>
          {invoice.taxRate > 0 ? (
            <View className="flex-row gap-12">
              <Text className="text-sm text-gray-500">
                {t.tax} ({invoice.taxRate}%)
              </Text>
              <Text className="text-sm font-medium text-gray-900 w-28 text-right">
                {fmt(invoice.taxAmount)}
              </Text>
            </View>
          ) : null}
          <View className="flex-row gap-12 border-t-2 border-gray-200 pt-3 mt-1">
            <Text className="text-lg font-bold text-gray-900">{t.total}</Text>
            <Text className="text-lg font-bold text-primary w-28 text-right">
              {fmt(invoice.totalAmount)}
            </Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      {invoice.notes ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-5">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.notes}</Text>
          <Text className="text-sm text-gray-600 leading-relaxed">{invoice.notes}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

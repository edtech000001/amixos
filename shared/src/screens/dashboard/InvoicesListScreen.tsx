import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Plus, FileText, Search } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';
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
    return invoices.filter(inv => {
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
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {t.countTotal.replace('{{count}}', String(invoices.length))}
          </Text>
        </View>
        <Pressable
          onPress={onNewInvoicePress}
          className="flex-row items-center gap-2 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
        >
          <Plus size={16} color="#FFFFFF" />
          <Text className="text-white text-sm font-semibold">{t.newInvoice}</Text>
        </Pressable>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-4"
        contentContainerClassName="bg-gray-100 p-1 rounded-xl gap-1"
      >
        {FILTERS.map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg ${
              filter === f ? 'bg-white' : ''
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                filter === f ? 'text-gray-900' : 'text-gray-500'
              }`}
            >
              {filterLabels[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Search */}
      <View className="mb-4">
        <Input
          placeholder={t.searchPlaceholder}
          value={search}
          onChangeText={setSearch}
          leftIcon={<Search size={16} color="#9CA3AF" />}
        />
      </View>

      {/* Summary */}
      {filtered.length > 0 ? (
        <Text className="text-xs text-gray-500 mb-3">
          {summaryText} · {t.summaryTotal}:{' '}
          <Text className="text-gray-900 font-bold">{fmt(total)}</Text>
        </Text>
      ) : null}

      {/* List */}
      {loading ? (
        <View className="items-center py-20">
          <View className="flex-row gap-1">
            {[0, 1, 2].map(i => (
              <View key={i} className="w-2 h-2 rounded-full bg-primary" />
            ))}
          </View>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center py-20">
          <FileText size={40} color="#D1D5DB" />
          <Text className="text-sm text-gray-400 mt-3">{t.empty}</Text>
          <Pressable onPress={onNewInvoicePress} className="mt-1">
            <Text className="text-primary text-sm font-medium">{t.createFirst}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {filtered.map((inv, i) => {
            const statusKey = inv.status as keyof typeof tStatus;
            const statusLabel = tStatus[statusKey] ?? inv.status;
            const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-gray-100';
            const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-gray-500';
            const client = inv.clientNames ?? t.noClient;
            const due = inv.dueDate ? formatDateLong(inv.dueDate, t.dateLocale) : null;
            return (
              <View
                key={inv.id}
                className={`flex-row items-center gap-4 px-5 py-4 ${
                  i < filtered.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <Pressable
                  onPress={() => onInvoicePress(inv.id)}
                  className="flex-1 min-w-0 active:opacity-70"
                >
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-sm font-semibold text-gray-900">
                      {inv.invoiceNumber}
                    </Text>
                    <View className={`px-2 py-0.5 rounded-full ${pillBg}`}>
                      <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {client}
                    {due ? ` · ${t.dueShort.replace('{{date}}', due)}` : ''}
                  </Text>
                </Pressable>
                <View className="flex-row items-center gap-3">
                  <Text className="text-sm font-bold text-gray-900">
                    {fmt(inv.totalAmount)}
                  </Text>
                  {inv.status === 'draft' ? (
                    <Pressable onPress={() => onUpdateStatus(inv.id, 'sent')}>
                      <Text className="text-xs text-blue-600 font-medium">{t.markSent}</Text>
                    </Pressable>
                  ) : null}
                  {inv.status === 'sent' ? (
                    <Pressable onPress={() => onUpdateStatus(inv.id, 'paid')}>
                      <Text className="text-xs text-emerald-600 font-medium">{t.markPaid}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

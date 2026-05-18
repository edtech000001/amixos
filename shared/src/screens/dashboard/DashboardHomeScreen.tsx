import { View, Text, Pressable, ScrollView } from 'react-native';
import {
  DollarSign,
  Users,
  FileText,
  AlertCircle,
  Clock,
  TrendingUp,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '../../i18n';

export interface DashboardStats {
  earningsMonth: number;
  earningsYear: number;
  invoicesPending: number;
  invoicesOverdue: number;
  clientsTotal: number;
  clockedInNow: number;
}

export interface DashboardRecentInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | string;
  clientName: string | null;
}

export interface DashboardHomeScreenProps {
  loading: boolean;
  businessName: string;
  stats: DashboardStats | null;
  recent: DashboardRecentInvoice[];
  onNewInvoicePress: () => void;
  onInvoicePress: (id: string) => void;
  onViewAllInvoicesPress: () => void;
  onCreateFirstInvoicePress: () => void;
}

const STATUS_PILL_BG: Record<string, string> = {
  draft: 'bg-gray-100',
  sent: 'bg-blue-100',
  paid: 'bg-emerald-100',
  overdue: 'bg-red-100',
  cancelled: 'bg-gray-100',
};

const STATUS_PILL_TEXT: Record<string, string> = {
  draft: 'text-gray-600',
  sent: 'text-blue-600',
  paid: 'text-emerald-600',
  overdue: 'text-red-600',
  cancelled: 'text-gray-400',
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardHomeScreen({
  loading,
  businessName,
  stats,
  recent,
  onNewInvoicePress,
  onInvoicePress,
  onViewAllInvoicesPress,
  onCreateFirstInvoicePress,
}: DashboardHomeScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface py-20">
        <View className="flex-row gap-1">
          {[0, 1, 2].map(i => (
            <View
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
            />
          ))}
        </View>
      </View>
    );
  }

  const yearStr = String(new Date().getFullYear());
  const yearAmount = formatCurrency(stats?.earningsYear ?? 0);

  type Widget = {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color: string;
    bg: string;
    sub: string;
  };

  const widgets: Widget[] = [
    {
      label: t.home.widgets.earningsMonthLabel,
      value: formatCurrency(stats?.earningsMonth ?? 0),
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      sub: t.home.widgets.earningsMonthSub.replace('{{amount}}', yearAmount),
    },
    {
      label: t.home.widgets.invoicesPendingLabel,
      value: stats?.invoicesPending ?? 0,
      icon: FileText,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: t.home.widgets.invoicesPendingSub,
    },
    {
      label: t.home.widgets.clientsLabel,
      value: stats?.clientsTotal ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      sub: t.home.widgets.clientsSub,
    },
    {
      label: t.home.widgets.invoicesOverdueLabel,
      value: stats?.invoicesOverdue ?? 0,
      icon: AlertCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
      sub: t.home.widgets.invoicesOverdueSub,
    },
    {
      label: t.home.widgets.clockedInLabel,
      value: stats?.clockedInNow ?? 0,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      sub: t.home.widgets.clockedInSub,
    },
    {
      label: t.home.widgets.earningsYearLabel,
      value: yearAmount,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      sub: t.home.widgets.earningsYearSub.replace('{{year}}', yearStr),
    },
  ];

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-6 pt-6 pb-36">
      {/* Header */}
      <View className="mb-8 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-gray-900">{t.home.welcome}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">{businessName}</Text>
        </View>
        <Pressable
          onPress={onNewInvoicePress}
          className="flex-row items-center gap-2 bg-primary px-4 py-2.5 rounded-xl active:opacity-80"
        >
          <Plus size={16} color="#FFFFFF" />
          <Text className="text-white text-sm font-semibold">{t.home.newInvoice}</Text>
        </Pressable>
      </View>

      {/* Stat widgets — 2 cols mobile, 3 cols web (md:) */}
      <View className="flex-row flex-wrap gap-4 mb-8">
        {widgets.map(({ label, value, icon: Icon, color, bg, sub }) => (
          <View
            key={label}
            className="bg-white rounded-2xl border border-gray-100 p-5 flex-1 min-w-[45%] md:min-w-[30%]"
          >
            <View className={`w-9 h-9 rounded-xl ${bg} items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </View>
            <Text className="text-2xl font-bold text-gray-900">{String(value)}</Text>
            <Text className="text-xs font-medium text-gray-700 mt-0.5">{label}</Text>
            <Text className="text-xs text-gray-400 mt-0.5">{sub}</Text>
          </View>
        ))}
      </View>

      {/* Recent invoices */}
      <View className="bg-white rounded-2xl border border-gray-100">
        <View className="px-6 py-4 border-b border-gray-50 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-900">{t.home.recent.title}</Text>
          <Pressable onPress={onViewAllInvoicesPress}>
            <Text className="text-xs text-primary font-medium">{t.home.recent.viewAll}</Text>
          </Pressable>
        </View>
        {recent.length === 0 ? (
          <View className="px-6 py-12 items-center">
            <FileText size={32} color="#D1D5DB" />
            <Text className="text-gray-400 text-sm mt-3">{t.home.recent.empty}</Text>
            <Pressable onPress={onCreateFirstInvoicePress} className="mt-1">
              <Text className="text-primary font-medium text-sm">
                {t.home.recent.createFirst}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View>
            {recent.map((inv, idx) => {
              const statusKey = inv.status as keyof typeof t.invoiceStatus;
              const statusLabel = t.invoiceStatus[statusKey] ?? inv.status;
              const pillBg = STATUS_PILL_BG[inv.status] ?? 'bg-gray-100';
              const pillText = STATUS_PILL_TEXT[inv.status] ?? 'text-gray-500';
              const clientName = inv.clientName ?? t.home.recent.noClient;
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => onInvoicePress(inv.id)}
                  className={`flex-row items-center justify-between px-6 py-3.5 active:bg-gray-50 ${
                    idx > 0 ? 'border-t border-gray-50' : ''
                  }`}
                >
                  <View>
                    <Text className="text-sm font-medium text-gray-900">{inv.invoiceNumber}</Text>
                    <Text className="text-xs text-gray-400">{clientName}</Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <View className={`px-2.5 py-1 rounded-full ${pillBg}`}>
                      <Text className={`text-xs font-medium ${pillText}`}>{statusLabel}</Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900">
                      {formatCurrency(inv.totalAmount)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

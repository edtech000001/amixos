import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { DollarSign, FileText, ClipboardList, Clock, BarChart3, CalendarRange } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { DateRangeSheet } from '../../ui/DateRangeSheet';
import {
  REPORT_RANGE_KEYS,
  INVOICE_PIE_COLORS,
  type ReportRange,
  type ReportsMetrics,
} from '../../lib/reports';

export interface ReportsScreenProps {
  loading: boolean;
  range: ReportRange;
  onRangeChange: (r: ReportRange) => void;
  metrics: ReportsMetrics | null;
  inventoryEnabled: boolean;
  // Custom date range (YYYY-MM-DD). When either is set it overrides the preset
  // range. Selecting a preset chip clears it (handled by the wrapper).
  customFrom: string | null;
  customTo: string | null;
  onCustomChange: (next: { from: string | null; to: string | null }) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const KPI_BG: Record<string, string> = {
  emerald: 'bg-emerald-50', amber: 'bg-amber-50', indigo: 'bg-indigo-50', purple: 'bg-purple-50',
};
const KPI_COLOR: Record<string, string> = {
  emerald: '#059669', amber: '#D97706', indigo: '#4F46E5', purple: '#7C3AED',
};

export function ReportsScreen({ loading, range, onRangeChange, metrics, inventoryEnabled, customFrom, customTo, onCustomChange }: ReportsScreenProps) {
  const { t: full } = useLang();
  const t = full.dashboard.reports;
  const jobsTabs = full.dashboard.jobs.tabs;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the date-filter labels
  const dateLocale = full.dashboard.dateLocale;
  const [dateOpen, setDateOpen] = useState(false);
  const customActive = !!customFrom || !!customTo;

  if (loading || !metrics) {
    return (
      <View className="flex-1 items-center justify-center bg-surface py-20">
        <View className="flex-row gap-1">{[0, 1, 2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}</View>
      </View>
    );
  }
  const m = metrics;

  const invoiceLabel = (status: string): string => {
    const k = status as keyof typeof t.pieStatuses;
    return t.pieStatuses[k] ?? status;
  };
  const jobLabel = (status: string): string => {
    const k = status as keyof typeof jobsTabs;
    return jobsTabs[k] ?? status;
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
      <Text className="text-sm font-bold text-gray-900 mb-4">{title}</Text>
      {children}
    </View>
  );

  const Kpi = ({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) => (
    <View className="bg-white rounded-2xl border border-gray-100 p-4" style={{ width: '48%' }}>
      <View className={`w-9 h-9 rounded-xl items-center justify-center mb-2 ${KPI_BG[color]}`}>{icon}</View>
      <Text className="text-xl font-black text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
      {sub ? <Text className="text-[11px] text-gray-400 mt-0.5" numberOfLines={1}>{sub}</Text> : null}
    </View>
  );

  // Revenue bars
  const maxRev = Math.max(1, ...m.monthlyRevenue.map(x => x.revenue));
  const revEmpty = m.monthlyRevenue.every(x => x.revenue === 0);
  // Job status bars
  const maxJob = Math.max(1, ...m.jobStatus.map(x => x.value));
  // Employee hours bars
  const maxHours = Math.max(1, ...m.employeeHours.map(e => e.hours));
  // Invoice total for proportions
  const invTotal = m.invoicesTotal;

  return (
    <View className="flex-1 bg-surface">
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 144 }}>
      <Text className="text-2xl font-bold text-gray-900">{t.title}</Text>
      <Text className="text-sm text-gray-500 mt-0.5 mb-4">{t.subtitle}</Text>

      {/* Range selector — presets + a Custom date-range chip (opens the sheet) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
        <View className="flex-row gap-1.5">
          {REPORT_RANGE_KEYS.map(r => {
            const on = range === r && !customActive;
            return (
              <Pressable
                key={r}
                onPress={() => onRangeChange(r)}
                className={`px-3.5 py-2 rounded-xl ${on ? 'bg-primary' : 'bg-gray-100'}`}
              >
                <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-gray-600'}`}>{t.ranges[r]}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setDateOpen(true)}
            className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl ${customActive ? 'bg-primary' : 'bg-gray-100'}`}
          >
            <CalendarRange size={13} color={customActive ? '#FFFFFF' : '#6B7280'} />
            <Text className={`text-xs font-semibold ${customActive ? 'text-white' : 'text-gray-600'}`}>
              {t.customRange}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* KPIs */}
      <View className="flex-row flex-wrap justify-between gap-y-3 mb-2">
        <Kpi color="emerald" icon={<DollarSign size={16} color={KPI_COLOR.emerald} />} label={t.kpis.revenueCollected} value={fmt(m.totalRevenue)}
          sub={m.paidInvoicesCount === 0 ? t.kpis.noPaidInvoices : (m.paidInvoicesCount === 1 ? t.kpis.paidInvoicesCountSingle : t.kpis.paidInvoicesCountPlural).replace('{{count}}', String(m.paidInvoicesCount))} />
        <Kpi color="amber" icon={<FileText size={16} color={KPI_COLOR.amber} />} label={t.kpis.pendingToCollect} value={fmt(m.pendingRevenue + m.overdueRevenue)}
          sub={m.overdueRevenue > 0 ? t.kpis.overdueSuffix.replace('{{amount}}', fmt(m.overdueRevenue)) : undefined} />
        <Kpi color="indigo" icon={<ClipboardList size={16} color={KPI_COLOR.indigo} />} label={t.kpis.avgJobValue} value={m.avgJobValue > 0 ? fmt(m.avgJobValue) : '—'}
          sub={t.kpis.completedJobsCount.replace('{{count}}', String(m.completedJobsCount))} />
        <Kpi color="purple" icon={<Clock size={16} color={KPI_COLOR.purple} />} label={t.kpis.hoursLogged} value={m.totalHours.toFixed(1)}
          sub={t.kpis.estPayrollSub.replace('{{amount}}', fmt(m.totalPayroll))} />
      </View>

      <View className="mt-4" />

      {/* Revenue by month */}
      <Section title={t.sections.revenueByMonth}>
        {revEmpty ? (
          <View className="items-center py-8">
            <BarChart3 size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-2">{t.empty.revenue}</Text>
          </View>
        ) : (
          <View className="flex-row items-end justify-between" style={{ height: 140 }}>
            {m.monthlyRevenue.map((x, i) => (
              <View key={i} className="flex-1 items-center justify-end" style={{ height: '100%' }}>
                <View className="w-full px-0.5 justify-end" style={{ height: 110 }}>
                  <View className="bg-primary rounded-t-md w-full" style={{ height: Math.max(x.revenue > 0 ? 4 : 2, Math.round((x.revenue / maxRev) * 110)) }} />
                </View>
                <Text className="text-[10px] text-gray-400 mt-1">{x.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Section>

      {/* Invoice status */}
      <Section title={t.sections.invoiceStatus}>
        {m.invoiceStatus.length === 0 ? (
          <View className="items-center py-8">
            <FileText size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-2">{t.empty.invoices}</Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {/* Proportion bar */}
            <View className="flex-row h-2.5 rounded-full overflow-hidden mb-1">
              {m.invoiceStatus.map(d => (
                <View key={d.status} style={{ flex: d.count, backgroundColor: INVOICE_PIE_COLORS[d.status] ?? '#9CA3AF' }} />
              ))}
            </View>
            {m.invoiceStatus.map(d => (
              <View key={d.status} className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INVOICE_PIE_COLORS[d.status] ?? '#9CA3AF' }} />
                  <Text className="text-xs text-gray-600">{invoiceLabel(d.status)}</Text>
                </View>
                <Text className="text-sm font-bold text-gray-900">{d.count}</Text>
              </View>
            ))}
            <View className="border-t border-gray-100 pt-2 flex-row justify-between">
              <Text className="text-xs font-bold text-gray-500">{t.invoicePie.total}</Text>
              <Text className="text-xs font-bold text-gray-900">{invTotal}</Text>
            </View>
          </View>
        )}
      </Section>

      {/* Jobs by status */}
      <Section title={t.sections.jobsByStatus}>
        {m.jobsTotal === 0 ? (
          <View className="items-center py-8">
            <ClipboardList size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-2">{t.empty.jobs}</Text>
          </View>
        ) : (
          <>
            <View className="gap-2.5">
              {m.jobStatus.map(d => (
                <View key={d.status}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-gray-700">{jobLabel(d.status)}</Text>
                    <Text className="text-xs font-bold text-gray-900">{d.value}</Text>
                  </View>
                  <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${Math.round((d.value / maxJob) * 100)}%`, backgroundColor: d.color }} />
                  </View>
                </View>
              ))}
            </View>
            <View className="flex-row mt-4 pt-3 border-t border-gray-50">
              <View className="flex-1 items-center">
                <Text className="text-xl font-black text-gray-900">{m.jobsTotal}</Text>
                <Text className="text-xs text-gray-400">{t.jobsBreakdown.totalJobs}</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-xl font-black text-emerald-600">{m.completionRate}%</Text>
                <Text className="text-xs text-gray-400">{t.jobsBreakdown.completionRate}</Text>
              </View>
            </View>
          </>
        )}
      </Section>

      {/* Hours by employee */}
      <Section title={t.sections.hoursByEmployee}>
        {m.employeeHours.length === 0 ? (
          <View className="items-center py-8">
            <Clock size={32} color="#D1D5DB" />
            <Text className="text-sm text-gray-400 mt-2">{t.empty.hours}</Text>
          </View>
        ) : (
          <>
            <View className="gap-3">
              {m.employeeHours.map(e => (
                <View key={e.name}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs font-medium text-gray-700 flex-1 mr-2" numberOfLines={1}>{e.name}</Text>
                    <View className="flex-row gap-3">
                      <Text className="text-xs text-gray-500">{t.employees.hoursSuffix.replace('{{hours}}', String(e.hours))}</Text>
                      <Text className="text-xs font-bold text-gray-900">{fmt(e.pay)}</Text>
                    </View>
                  </View>
                  <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <View className="h-full bg-primary rounded-full" style={{ width: `${Math.round((e.hours / maxHours) * 100)}%` }} />
                  </View>
                </View>
              ))}
            </View>
            <View className="border-t border-gray-100 pt-3 mt-3 flex-row justify-between">
              <Text className="text-sm font-bold text-gray-500">{t.employees.totalEstimatedPayroll}</Text>
              <Text className="text-sm font-bold text-primary">{fmt(m.totalPayroll)}</Text>
            </View>
          </>
        )}
      </Section>

      {/* New clients */}
      <Section title={t.sections.newClients}>
        <View className="items-center py-4">
          <Text className="text-5xl font-black text-primary">{m.newClientsCount}</Text>
          <Text className="text-sm text-gray-500 mt-1">{t.newClientsBlock.newCount}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">{t.newClientsBlock.totalAccumulated.replace('{{count}}', String(m.totalClientsCount))}</Text>
        </View>
      </Section>

      {/* Financial summary */}
      <Section title={t.sections.financialSummary}>
        <View className="gap-0">
          {[
            { label: t.financial.revenueCollected, value: fmt(m.totalRevenue), color: 'text-emerald-600' },
            { label: t.financial.pending, value: fmt(m.pendingRevenue), color: 'text-blue-600' },
            { label: t.financial.overdue, value: fmt(m.overdueRevenue), color: 'text-red-500' },
            { label: t.financial.estPayroll, value: fmt(m.totalPayroll), color: 'text-amber-600' },
            { label: t.financial.grossMarginEst, value: m.totalRevenue > 0 ? fmt(m.totalRevenue - m.totalPayroll) : '—', color: 'text-gray-900' },
          ].map(row => (
            <View key={row.label} className="flex-row justify-between items-center py-2 border-b border-gray-50">
              <Text className="text-xs text-gray-500">{row.label}</Text>
              <Text className={`text-sm font-bold ${row.color}`}>{row.value}</Text>
            </View>
          ))}
        </View>
      </Section>

      {/* Inventory (module-gated) */}
      {inventoryEnabled ? (
        <Section title={t.sections.inventory}>
          <View className="items-center py-2 mb-3">
            <Text className="text-3xl font-black text-gray-900">{fmt(m.inventoryValue)}</Text>
            <Text className="text-sm text-gray-500 mt-1">{t.inventoryBlock.totalValueLabel}</Text>
          </View>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">{t.inventoryBlock.totalItems}</Text>
              <Text className="text-xs font-bold text-gray-900">{m.inventoryItemsCount}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">{t.inventoryBlock.lowStock}</Text>
              <Text className={`text-xs font-bold ${m.lowStock > 0 ? 'text-orange-500' : 'text-gray-900'}`}>{m.lowStock}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">{t.inventoryBlock.outOfStock}</Text>
              <Text className={`text-xs font-bold ${m.outOfStock > 0 ? 'text-red-500' : 'text-gray-900'}`}>{m.outOfStock}</Text>
            </View>
          </View>
        </Section>
      ) : null}
    </ScrollView>

    <DateRangeSheet
      open={dateOpen}
      onClose={() => setDateOpen(false)}
      from={customFrom}
      to={customTo}
      onChange={onCustomChange}
      title={tdate.title}
      fromLabel={tdate.from}
      toLabel={tdate.to}
      clearLabel={tdate.clear}
      applyLabel={tdate.apply}
    />
    </View>
  );
}

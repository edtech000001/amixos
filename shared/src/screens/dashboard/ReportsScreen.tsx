import { useState } from 'react';
import { SkeletonBlock, SkeletonStats, SkeletonChart } from '../../ui/Skeleton';
import { useBarScrub } from '../../ui/useBarScrub';
import { niceCeil, axisTick } from '../../lib/chartAxis';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { DollarSign, FileText, ClipboardList, Clock, BarChart3, CalendarRange, ChevronRight, MapPin, Wallet, PiggyBank } from 'lucide-react-native';
import { ChipScroll } from '../../ui/ChipScroll';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
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
  /** Open the dedicated Payroll page. Hidden when not provided. */
  onOpenPayroll?: () => void;
}

function fmt(n: number) {
  // Decimal-aware half-up to the cent (float .665 stores as .66499… — the
  // toFixed pass restores the intended .67 before formatting).
  const cents = Math.round(Number((n * 100).toFixed(3))) / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
}

/** Plot height of the revenue chart, and how many bands the Y axis is cut into. */
const CHART_H = 120;
const CHART_TICKS = 4;
/** Fixed tooltip box — the width centres the bubble over its bar, the height
 *  keeps it inside the plot when a bar reaches the top gridline. */
const BUBBLE_W = 84;
const BUBBLE_H = 24;

const KPI_BG: Record<string, string> = {
  emerald: 'bg-emerald-500/10', amber: 'bg-amber-500/10', indigo: 'bg-indigo-500/10', purple: 'bg-purple-500/10',
  red: 'bg-red-500/10', blue: 'bg-blue-500/10',
};
const KPI_COLOR: Record<string, string> = {
  emerald: '#059669', amber: '#D97706', indigo: '#4F46E5', purple: '#7C3AED',
  red: '#DC2626', blue: '#2563EB',
};

// Section / Kpi live at module scope on purpose. Declared inside the component
// they would be a NEW component type on every render, so React would unmount
// and remount every section's subtree on each state change — which tore down
// the revenue chart's gesture overlay mid-scrub and made the hold-and-drag
// readout drop out constantly.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-card rounded-2xl border border-border-soft p-5 mb-4">
      <Text className="text-sm font-bold text-ink mb-4">{title}</Text>
      {children}
    </View>
  );
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <View className="bg-card rounded-2xl border border-border-soft p-4" style={{ width: '48%' }}>
      <View className={`w-9 h-9 rounded-xl items-center justify-center mb-2 ${KPI_BG[color]}`}>{icon}</View>
      <Text className="text-xl font-black text-ink">{value}</Text>
      <Text className="text-xs text-muted mt-0.5">{label}</Text>
      {sub ? <Text className="text-[11px] text-faint mt-0.5" numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

export function ReportsScreen({ loading, range, onRangeChange, metrics, inventoryEnabled, customFrom, customTo, onCustomChange, onOpenPayroll }: ReportsScreenProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.reports;
  const jobsTabs = full.dashboard.jobs.tabs;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the date-filter labels
  const dateLocale = full.dashboard.dateLocale;
  const [dateOpen, setDateOpen] = useState(false);
  // Hold-and-drag readout for the revenue chart. Bars are flush (no flex gap),
  // so the default gap of 0 maps x → bar directly.
  const scrub = useBarScrub({ count: metrics?.monthlyRevenue.length ?? 0 });
  const customActive = !!customFrom || !!customTo;

  if (loading || !metrics) {
    // Range chips, KPI tiles, then the chart cards.
    return (
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 24, gap: 16 }}>
        <SkeletonBlock className="h-9 w-full rounded-xl" />
        <SkeletonStats count={6} />
        <SkeletonChart />
        <SkeletonChart />
      </ScrollView>
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

  // Revenue bars
  const maxRev = Math.max(1, ...m.monthlyRevenue.map(x => x.revenue));
  // Bars scale to the rounded axis top, not the raw peak, so the tallest
  // bar lines up with a gridline instead of floating above all of them.
  const axisMax = niceCeil(maxRev);
  // A zero month still gets a 2px stub so the axis reads as a series.
  const barHeight = (revenue: number) =>
    Math.max(revenue > 0 ? 4 : 2, Math.round((revenue / axisMax) * CHART_H));
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
      <Text className="text-2xl font-bold text-ink">{t.title}</Text>
      <Text className="text-sm text-muted mt-0.5 mb-4">{t.subtitle}</Text>

      {/* Range selector — presets + a Custom date-range chip (opens the sheet) */}
      <ChipScroll className="mb-5">
        <View className="flex-row gap-1.5">
          {REPORT_RANGE_KEYS.map(r => {
            const on = range === r && !customActive;
            return (
              <Pressable
                key={r}
                onPress={() => onRangeChange(r)}
                className={`px-3.5 py-2 rounded-xl ${on ? 'bg-primary' : 'bg-border-soft'}`}
              >
                <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-muted'}`}>{t.ranges[r]}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setDateOpen(true)}
            className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl ${customActive ? 'bg-primary' : 'bg-border-soft'}`}
          >
            <CalendarRange size={13} color={customActive ? '#FFFFFF' : c.muted} />
            <Text className={`text-xs font-semibold ${customActive ? 'text-white' : 'text-muted'}`}>
              {t.customRange}
            </Text>
          </Pressable>
        </View>
      </ChipScroll>

      {/* Payroll page entry */}
      {onOpenPayroll ? (
        <Pressable
          onPress={onOpenPayroll}
          className="flex-row items-center justify-between bg-card rounded-2xl border border-border-soft shadow-sm px-4 py-3.5 mb-4 active:bg-surface"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
              <DollarSign size={16} color={c.primary} />
            </View>
            <Text className="text-sm font-semibold text-ink">{t.payroll.entry}</Text>
          </View>
          <ChevronRight size={18} color={c.faint} />
        </Pressable>
      ) : null}

      {/* KPIs */}
      <View className="flex-row flex-wrap justify-between gap-y-3 mb-4">
        <Kpi color="emerald" icon={<DollarSign size={16} color={c.success} />} label={t.kpis.revenueCollected} value={fmt(m.totalRevenue)}
          sub={m.paidInvoicesCount === 0 ? t.kpis.noPaidInvoices : (m.paidInvoicesCount === 1 ? t.kpis.paidInvoicesCountSingle : t.kpis.paidInvoicesCountPlural).replace('{{count}}', String(m.paidInvoicesCount))} />
        <Kpi color="amber" icon={<FileText size={16} color={c.warning} />} label={t.kpis.pendingToCollect} value={fmt(m.pendingRevenue + m.overdueRevenue)}
          sub={m.overdueRevenue > 0 ? t.kpis.overdueSuffix.replace('{{amount}}', fmt(m.overdueRevenue)) : undefined} />
        <Kpi color="red" icon={<Wallet size={16} color={c.danger} />} label={t.kpis.payroll} value={fmt(m.totalPayroll)}
          sub={t.kpis.payrollWorkersSub.replace('{{count}}', String(m.payrollWorkers))} />
        <Kpi color="blue" icon={<PiggyBank size={16} color={c.primary} />} label={t.kpis.grossMargin} value={m.totalRevenue > 0 ? fmt(m.totalRevenue - m.totalPayroll) : '—'}
          sub={m.totalRevenue > 0 ? t.kpis.grossMarginSub.replace('{{percent}}', String(Math.round(((m.totalRevenue - m.totalPayroll) / m.totalRevenue) * 100))) : undefined} />
        <Kpi color="indigo" icon={<ClipboardList size={16} color={c.primary} />} label={t.kpis.avgJobValue} value={m.avgJobValue > 0 ? fmt(m.avgJobValue) : '—'}
          sub={t.kpis.completedJobsCount.replace('{{count}}', String(m.completedJobsCount))} />
        <Kpi color="purple" icon={<Clock size={16} color={KPI_COLOR.purple} />} label={t.kpis.hoursLogged} value={m.totalHours.toFixed(1)}
          sub={t.kpis.estPayrollSub.replace('{{amount}}', fmt(m.totalPayroll))} />
      </View>

      {/* Revenue by month */}
      <Section title={t.sections.revenueByMonth}>
        {revEmpty ? (
          <View className="items-center py-8">
            <BarChart3 size={32} color={c.faint} />
            <Text className="text-sm text-faint mt-2">{t.empty.revenue}</Text>
          </View>
        ) : (
          <View className="flex-row">
            {/* Y axis — same rounded ticks the web chart shows, top value first. */}
            <View style={{ width: 44, height: CHART_H }}>
              {Array.from({ length: CHART_TICKS + 1 }, (_, i) => (
                <Text
                  key={i}
                  className="text-[9px] text-faint"
                  // Absolute, not space-between: the gridlines below use the
                  // same top = i × band formula, so label and line always meet.
                  style={{ position: 'absolute', top: (CHART_H / CHART_TICKS) * i - 5, right: 8 }}
                >
                  {axisTick((axisMax / CHART_TICKS) * (CHART_TICKS - i))}
                </Text>
              ))}
            </View>

            <View className="flex-1">
              <View style={{ height: CHART_H }}>
                {/* Gridlines behind the bars */}
                {Array.from({ length: CHART_TICKS + 1 }, (_, i) => (
                  <View
                    key={i}
                    className="absolute left-0 right-0 h-px bg-border-soft"
                    style={{ top: (CHART_H / CHART_TICKS) * i }}
                  />
                ))}

                <View className="flex-row items-end" style={{ height: CHART_H }}>
                  {m.monthlyRevenue.map((x, i) => (
                    <View key={i} className="flex-1 justify-end" style={{ height: CHART_H }}>
                      <View className="w-full px-0.5">
                        <View
                          className={`rounded-t-md w-full ${scrub.active === i ? 'bg-primary' : 'bg-primary/80'}`}
                          style={{ height: barHeight(x.revenue) }}
                        />
                      </View>
                    </View>
                  ))}
                </View>

                {/* One bubble for the whole plot, not one per column: a column
                    is ~30px wide and Android clips children that overflow, so
                    a per-column tooltip would lose its own edges. */}
                {scrub.active !== null && scrub.width > 0 && m.monthlyRevenue[scrub.active] ? (
                  <View
                    className="absolute bg-ink rounded-lg px-2 py-1"
                    style={{
                      width: BUBBLE_W,
                      // Sits above the bar, but never past the top of the plot
                      // — Android clips children that overflow their parent, so
                      // a full-height bar tucks the bubble just inside instead.
                      bottom: Math.min(
                        barHeight(m.monthlyRevenue[scrub.active].revenue) + 6,
                        CHART_H - BUBBLE_H,
                      ),
                      left: Math.min(
                        Math.max(0, ((scrub.active + 0.5) / m.monthlyRevenue.length) * scrub.width - BUBBLE_W / 2),
                        Math.max(0, scrub.width - BUBBLE_W),
                      ),
                    }}
                  >
                    <Text className="text-[10px] font-bold text-surface text-center" numberOfLines={1}>
                      {fmt(m.monthlyRevenue[scrub.active].revenue)}
                    </Text>
                  </View>
                ) : null}

                {/* Transparent touch layer: hold, then slide across the bars.
                    It owns the gesture (see useBarScrub) and has no children,
                    so locationX maps cleanly onto a bar index. */}
                <View className="absolute left-0 right-0 top-0 bottom-0" {...scrub.handlers} />
              </View>

              <View className="flex-row">
                {m.monthlyRevenue.map((x, i) => (
                  <Text
                    key={i}
                    className={`flex-1 text-center text-[10px] mt-1 ${scrub.active === i ? 'text-primary font-semibold' : 'text-faint'}`}
                  >
                    {x.name}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
      </Section>

      {/* Invoice status */}
      <Section title={t.sections.invoiceStatus}>
        {m.invoiceStatus.length === 0 ? (
          <View className="items-center py-8">
            <FileText size={32} color={c.faint} />
            <Text className="text-sm text-faint mt-2">{t.empty.invoices}</Text>
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
                  <Text className="text-xs text-muted">{invoiceLabel(d.status)}</Text>
                </View>
                <Text className="text-sm font-bold text-ink">{d.count}</Text>
              </View>
            ))}
            <View className="border-t border-border-soft pt-2 flex-row justify-between">
              <Text className="text-xs font-bold text-muted">{t.invoicePie.total}</Text>
              <Text className="text-xs font-bold text-ink">{invTotal}</Text>
            </View>
          </View>
        )}
      </Section>

      {/* Jobs by status */}
      <Section title={t.sections.jobsByStatus}>
        {m.jobsTotal === 0 ? (
          <View className="items-center py-8">
            <ClipboardList size={32} color={c.faint} />
            <Text className="text-sm text-faint mt-2">{t.empty.jobs}</Text>
          </View>
        ) : (
          <>
            <View className="gap-2.5">
              {m.jobStatus.map(d => (
                <View key={d.status}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-ink">{jobLabel(d.status)}</Text>
                    <Text className="text-xs font-bold text-ink">{d.value}</Text>
                  </View>
                  <View className="h-2 bg-border-soft rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${Math.round((d.value / maxJob) * 100)}%`, backgroundColor: d.color }} />
                  </View>
                </View>
              ))}
            </View>
            <View className="flex-row mt-4 pt-3 border-t border-border-soft">
              <View className="flex-1 items-center">
                <Text className="text-xl font-black text-ink">{m.jobsTotal}</Text>
                <Text className="text-xs text-faint">{t.jobsBreakdown.totalJobs}</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-xl font-black text-emerald-600">{m.completionRate}%</Text>
                <Text className="text-xs text-faint">{t.jobsBreakdown.completionRate}</Text>
              </View>
            </View>
          </>
        )}
      </Section>


      {/* Per-branch breakdown — multi-location businesses only. */}
      {m.byLocation.length > 0 ? (
        <Section title={t.byLocation.title}>
          <View className="gap-1">
            {m.byLocation.map(loc => (
              <View key={loc.locationId ?? 'none'} className="flex-row items-center justify-between py-2.5 border-b border-border-soft">
                <View className="flex-row items-center gap-2 flex-1 mr-2">
                  <MapPin size={14} color={c.faint} />
                  <Text className="text-sm font-medium text-ink flex-1" numberOfLines={1}>{loc.name}</Text>
                </View>
                <View className="flex-row items-center gap-4">
                  <Text className="text-xs text-faint">{loc.jobCount} {t.byLocation.jobs}</Text>
                  <Text className="text-sm font-bold text-ink">{fmt(loc.revenue)}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* New clients */}
      <Section title={t.sections.newClients}>
        <View className="items-center py-4">
          <Text className="text-5xl font-black text-primary">{m.newClientsCount}</Text>
          <Text className="text-sm text-muted mt-1">{t.newClientsBlock.newCount}</Text>
          <Text className="text-xs text-faint mt-0.5">{t.newClientsBlock.totalAccumulated.replace('{{count}}', String(m.totalClientsCount))}</Text>
        </View>
      </Section>

      {/* Financial summary — gross-margin headline + payroll-vs-margin bar. */}
      <Section title={t.sections.financialSummary}>
        <View className="gap-4">
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-3xl font-black text-ink">{m.totalRevenue > 0 ? fmt(m.totalRevenue - m.totalPayroll) : '—'}</Text>
              {m.totalRevenue > 0 ? (
                <View className={`px-1.5 py-0.5 rounded-md ${(m.totalRevenue - m.totalPayroll) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  <Text className={`text-xs font-bold ${(m.totalRevenue - m.totalPayroll) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {Math.round(((m.totalRevenue - m.totalPayroll) / m.totalRevenue) * 100)}%
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-muted mt-0.5">{t.financial.grossMarginEst}</Text>
          </View>

          {m.totalRevenue > 0 ? (
            <View className="flex-row h-2.5 rounded-full overflow-hidden bg-border-soft">
              <View className="bg-amber-400 h-full" style={{ width: `${Math.min(100, Math.max(0, (m.totalPayroll / m.totalRevenue) * 100))}%` }} />
              <View className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, Math.max(0, ((m.totalRevenue - m.totalPayroll) / m.totalRevenue) * 100))}%` }} />
            </View>
          ) : null}

          <View className="gap-2.5">
            {[
              { label: t.financial.revenueCollected, value: fmt(m.totalRevenue), dot: 'bg-emerald-500' },
              { label: t.financial.estPayroll, value: fmt(m.totalPayroll), dot: 'bg-amber-400' },
              { label: t.financial.pending, value: fmt(m.pendingRevenue), dot: 'bg-blue-500' },
              { label: t.financial.overdue, value: fmt(m.overdueRevenue), dot: 'bg-red-500' },
            ].map(row => (
              <View key={row.label} className="flex-row justify-between items-center">
                <View className="flex-row items-center gap-2">
                  <View className={`w-2 h-2 rounded-full ${row.dot}`} />
                  <Text className="text-xs text-muted">{row.label}</Text>
                </View>
                <Text className="text-sm font-bold text-ink">{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Section>

      {/* Inventory (module-gated) */}
      {inventoryEnabled ? (
        <Section title={t.sections.inventory}>
          <View className="items-center py-2 mb-3">
            <Text className="text-3xl font-black text-ink">{fmt(m.inventoryValue)}</Text>
            <Text className="text-sm text-muted mt-1">{t.inventoryBlock.totalValueLabel}</Text>
          </View>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">{t.inventoryBlock.totalItems}</Text>
              <Text className="text-xs font-bold text-ink">{m.inventoryItemsCount}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">{t.inventoryBlock.lowStock}</Text>
              <Text className={`text-xs font-bold ${m.lowStock > 0 ? 'text-orange-500' : 'text-ink'}`}>{m.lowStock}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-muted">{t.inventoryBlock.outOfStock}</Text>
              <Text className={`text-xs font-bold ${m.outOfStock > 0 ? 'text-red-500' : 'text-ink'}`}>{m.outOfStock}</Text>
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

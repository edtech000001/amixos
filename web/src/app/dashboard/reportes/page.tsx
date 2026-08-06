'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ClipboardList,
  FileText, Clock, Package, BarChart3, X, ChevronRight, MapPin, Calendar, XCircle,
  Wallet, PiggyBank } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { fetchReportsMetricsServer, type ReportsMetrics, type ReportRange } from '@amixos/shared/lib/reports';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string; status: string; total_amount: number;
  paid_at: string | null; created_at: string; issue_date: string;
  line_items?: { job_id?: string | null; qty?: number; rate?: number }[] | null;
}
interface Job {
  id: string; status: string; total_amount: number; created_at: string;
  client_id: string | null; location_id: string | null;
  // Payroll-estimate inputs: hours are logged on the job (not always in the
  // timesheets table), so the estimate must read them from here too.
  scheduled_date: string | null; total_hours: number | null;
  driver_employee_ids: string[] | null; driver_hours: number | null;
  custom_fields: Record<string, unknown> | null;
  job_assignments?: { employee_id: string | null }[];
}
interface Client { id: string; created_at: string; }
interface Timesheet { id: string; hours_worked: number; work_date: string; employee_id: string | null; worker_name: string | null; }
interface Employee {
  id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string;
  overtime_eligible?: boolean | null; overtime_threshold?: number | null;
  overtime_multiplier?: number | null; custom_fields?: Record<string, unknown> | null;
}
interface InventoryItem { id: string; quantity: number; unit_cost: number; }

type Range = 'month' | 'last_month' | 'quarter' | 'half' | 'year' | 'last_year' | 'all';

const RANGE_KEYS: Range[] = ['month', 'last_month', 'quarter', 'half', 'year', 'last_year', 'all'];

const PIE_COLORS = {
  paid: '#10B981', sent: '#6366F1', draft: '#9CA3AF',
  overdue: '#EF4444', cancelled: '#D1D5DB', invoiced: '#8B5CF6',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  // Decimal-aware half-up to the cent (float .665 stores as .66499… — the
  // toFixed pass restores the intended .67 before formatting).
  const cents = Math.round(Number((n * 100).toFixed(3))) / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
}

function getRangeStart(range: Range): Date | null {
  const now = new Date();
  switch (range) {
    case 'month':      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'last_month': return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'quarter':    return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'half':       return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case 'year':       return new Date(now.getFullYear(), 0, 1);
    case 'last_year':  return new Date(now.getFullYear() - 1, 0, 1);
    case 'all':        return null;
  }
}
function getRangeEnd(range: Range): Date {
  const now = new Date();
  if (range === 'last_month') return new Date(now.getFullYear(), now.getMonth(), 0);
  if (range === 'last_year') return new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  return now;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, trend, color = 'indigo' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: number; color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-600',
    emerald: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    purple: 'bg-purple-500/10 text-purple-600',
    red: 'bg-red-500/10 text-red-600',
    blue: 'bg-blue-500/10 text-blue-600',
  };
  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[color] ?? colorMap.indigo}`}>
          {icon}
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend > 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-ink">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-faint mt-1">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <h2 className="text-sm font-bold text-ink mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border-soft rounded-xl shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{typeof p.value === 'number' && p.value > 100 ? fmt(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const supabase = createSupabaseClient();
  const { business, locations } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.reports;
  const tc = full.common;
  const tdate = full.dashboard.jobs.dateFilter; // reuse the date-filter labels
  const dateLocale = full.dashboard.dateLocale;

  const [range, setRange] = useState<Range>('year');
  // Custom date range overrides the preset when set; picking a preset clears it.
  const [dateOpen, setDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [metrics, setMetrics] = useState<ReportsMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Inventory KPIs only render — and only fetch — when the business has
  // the Inventory module enabled.
  const { modules: enabledModules } = useEnabledModules(supabase, business?.id ?? null);
  const inventoryEnabled = enabledModules.some(m => m.id === 'inventory');

  const customActive = !!customFrom || !!customTo;

  // Server-side aggregates (migration 186): two RPCs replace the old seven
  // full-table downloads; range changes refetch (tiny payloads). The payroll
  // estimate — incl. totalHours — uses the payroll engine (job + driver
  // credits), matching mobile and the Nómina page.
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    fetchReportsMetricsServer({
      supabase,
      businessId: business.id,
      range: range as ReportRange,
      dateLocale,
      custom: { from: customFrom || null, to: customTo || null },
      unassignedLocationLabel: locale === 'es' ? 'Sin ubicación' : 'No location',
      payrollConfig: business.payroll_config,
      inventoryEnabled,
    }).then(m => {
      if (!cancelled) { setMetrics(m); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false); // offline / migration missing — keep previous
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, inventoryEnabled, range, customFrom, customTo, dateLocale, locale, business?.payroll_config]);

  // Derived values keep their historical names so the render stays unchanged.
  const totalRevenue = metrics?.totalRevenue ?? 0;
  const pendingRevenue = metrics?.pendingRevenue ?? 0;
  const overdueRevenue = metrics?.overdueRevenue ?? 0;
  const avgJobValue = metrics?.avgJobValue ?? 0;
  const totalHours = metrics?.totalHours ?? 0;
  const inventoryValue = metrics?.inventoryValue ?? 0;
  const totalPayroll = metrics?.totalPayroll ?? 0;
  const payrollWorkers = metrics?.payrollWorkers ?? 0;
  const grossMargin = totalRevenue - totalPayroll;
  const marginPct = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 100) : 0;
  const byLocation = metrics?.byLocation ?? [];
  const paidInvoicesCount = metrics?.paidInvoicesCount ?? 0;
  const invoicesTotalCount = metrics?.invoicesTotal ?? 0;
  const jobsTotalCount = metrics?.jobsTotal ?? 0;
  const completedJobsCount = metrics?.completedJobsCount ?? 0;
  const completionRate = metrics?.completionRate ?? 0;
  const newClientsCount = metrics?.newClientsCount ?? 0;
  const totalClientsCount = metrics?.totalClientsCount ?? 0;
  const inventoryItemsCount = metrics?.inventoryItemsCount ?? 0;
  const lowStockCount = metrics?.lowStock ?? 0;
  const outOfStockCount = metrics?.outOfStock ?? 0;

  // Chart series keyed by localized labels (recharts reads the object keys).
  const monthlyRevenue = useMemo(
    () => (metrics?.monthlyRevenue ?? []).map(x => ({
      name: x.name,
      [t.chart.revenueSeries]: x.revenue,
      [t.chart.jobsSeries]: x.jobs,
    })),
    [metrics?.monthlyRevenue, t.chart.revenueSeries, t.chart.jobsSeries],
  );

  const invoiceStatusData = useMemo(() => {
    const labelFor = (status: string): string => {
      switch (status) {
        case 'paid':      return t.pieStatuses.paid;
        case 'sent':      return t.pieStatuses.sent;
        case 'draft':     return t.pieStatuses.draft;
        case 'overdue':   return t.pieStatuses.overdue;
        case 'cancelled': return t.pieStatuses.cancelled;
        default:          return status;
      }
    };
    return (metrics?.invoiceStatus ?? []).map(r => ({ name: labelFor(r.status), value: r.count, status: r.status }));
  }, [metrics?.invoiceStatus, t.pieStatuses]);

  const jobStatusData = useMemo(() => {
    const tabs = full.dashboard.jobs.tabs as Record<string, string>;
    return (metrics?.jobStatus ?? []).map(r => ({ name: tabs[r.status] ?? r.status, value: r.value, color: r.color }));
  }, [metrics?.jobStatus, full.dashboard.jobs.tabs]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
      ))}</div>
    </div>
  );

  const paidSubLabel = paidInvoicesCount === 0
    ? t.kpis.noPaidInvoices
    : (paidInvoicesCount === 1
        ? t.kpis.paidInvoicesCountSingle.replace('{{count}}', String(paidInvoicesCount))
        : t.kpis.paidInvoicesCountPlural.replace('{{count}}', String(paidInvoicesCount)));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-0.5">{t.subtitle}</p>
        </div>
        {/* Range selector + custom date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-border-soft p-1 rounded-xl flex-wrap">
            {RANGE_KEYS.map(r => {
              const on = range === r && !customActive;
              return (
                <button key={r} onClick={() => { setRange(r); setCustomFrom(''); setCustomTo(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    on ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'
                  }`}>
                  {t.ranges[r]}
                </button>
              );
            })}
          </div>
          {/* Custom date range — compact calendar icon + popover (same
             pattern as the invoices/jobs list filters). Overrides the
             preset when either side is set. */}
          {customActive ? (
            <button
              onClick={() => { setCustomFrom(''); setCustomTo(''); }}
              title={tdate.clear}
              aria-label={tdate.clear}
              className="shrink-0 flex items-center justify-center p-2.5 rounded-xl border border-red-200 bg-red-500/10 text-red-600 hover:bg-red-100 transition-colors"
            >
              <XCircle size={16} />
            </button>
          ) : null}
          <div className="relative shrink-0">
            <button
              onClick={() => setDateOpen(o => !o)}
              title={tdate.button}
              aria-label={tdate.button}
              className={`flex items-center justify-center p-2.5 rounded-xl border transition-colors ${
                customActive ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
              }`}
            >
              <Calendar size={16} />
            </button>
            {dateOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDateOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-card rounded-2xl border border-border-soft shadow-lg p-4">
                  <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-2">{tdate.title}</p>
                  {/* One-click previous years — no manual from/to typing. */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => {
                      const on = customFrom === `${y}-01-01` && customTo === `${y}-12-31`;
                      return (
                        <button
                          key={y}
                          onClick={() => { setCustomFrom(`${y}-01-01`); setCustomTo(`${y}-12-31`); }}
                          className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                            on ? 'bg-primary border-primary text-white' : 'bg-card border-border text-muted hover:border-border'
                          }`}
                        >
                          {y}
                        </button>
                      );
                    })}
                  </div>
                  <label className="block text-xs font-medium text-muted mb-1">{tdate.from}</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full mb-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <label className="block text-xs font-medium text-muted mb-1">{tdate.to}</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {customActive ? (
                    <button
                      onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                      className="mt-3 w-full py-2 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border"
                    >
                      {tdate.clear}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Payroll page entry */}
      <Link
        href="/dashboard/reportes/nomina"
        className="inline-flex items-center justify-between gap-6 bg-card rounded-2xl border border-border-soft shadow-sm pl-4 pr-3 py-3 mb-6 hover:bg-surface transition-colors"
      >
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={16} className="text-primary" />
          </span>
          <span className="text-sm font-semibold text-ink">{t.payroll.entry}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </Link>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KpiCard icon={<DollarSign size={16}/>} label={t.kpis.revenueCollected} value={fmt(totalRevenue)} color="emerald"
          sub={paidSubLabel}/>
        <KpiCard icon={<FileText size={16}/>} label={t.kpis.pendingToCollect} value={fmt(pendingRevenue + overdueRevenue)} color="amber"
          sub={overdueRevenue > 0 ? t.kpis.overdueSuffix.replace('{{amount}}', fmt(overdueRevenue)) : undefined}/>
        <KpiCard icon={<Wallet size={16}/>} label={t.kpis.payroll} value={fmt(totalPayroll)} color="red"
          sub={t.kpis.payrollWorkersSub.replace('{{count}}', String(payrollWorkers))}/>
        <KpiCard icon={<PiggyBank size={16}/>} label={t.kpis.grossMargin} value={totalRevenue > 0 ? fmt(grossMargin) : '—'} color="blue"
          sub={totalRevenue > 0 ? t.kpis.grossMarginSub.replace('{{percent}}', String(marginPct)) : undefined}/>
        <KpiCard icon={<ClipboardList size={16}/>} label={t.kpis.avgJobValue} value={avgJobValue > 0 ? fmt(avgJobValue) : '—'} color="indigo"
          sub={t.kpis.completedJobsCount.replace('{{count}}', String(completedJobsCount))}/>
        <KpiCard icon={<Clock size={16}/>} label={t.kpis.hoursLogged} value={totalHours.toFixed(1)} color="purple"
          sub={t.kpis.estPayrollSub.replace('{{amount}}', fmt(totalPayroll))}/>
      </div>

      {/* ── Per-branch breakdown (multi-location businesses only) ─────────── */}
      {byLocation.length > 0 && (
        <div className="mb-5">
          <Section title={locale === 'es' ? 'Por ubicación' : 'By location'}>
            <div className="divide-y divide-border-soft">
              {byLocation.map(loc => (
                <div key={loc.locationId ?? 'none'} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={14} className="text-faint shrink-0"/>
                    <span className="text-sm font-medium text-ink truncate">{loc.name}</span>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <span className="text-xs text-faint">{loc.jobCount} {locale === 'es' ? 'trabajos' : 'jobs'}</span>
                    <span className="text-sm font-semibold text-ink tabular-nums">{fmt(loc.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* ── Revenue chart ─────────────────────────────────────────────── */}
        <Section title={t.sections.revenueByMonth}>
          {monthlyRevenue.every(m => m[t.chart.revenueSeries] === 0) ? (
            <div className="flex items-center justify-center h-48 text-faint">
              <div className="text-center">
                <BarChart3 size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{t.empty.revenue}</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyRevenue} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey={t.chart.revenueSeries} fill="#4F46E5" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── Invoice status breakdown ───────────────────────────────────── */}
        <Section title={t.sections.invoiceStatus}>
          {invoiceStatusData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-faint">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{t.empty.invoices}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={invoiceStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    paddingAngle={3} dataKey="value">
                    {invoiceStatusData.map((entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[entry.status as keyof typeof PIE_COLORS] ?? '#9CA3AF'}/>
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 flex-1">
                {invoiceStatusData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[d.status as keyof typeof PIE_COLORS] ?? '#9CA3AF' }}/>
                      <span className="text-muted text-xs">{d.name}</span>
                    </div>
                    <span className="font-bold text-ink">{d.value}</span>
                  </div>
                ))}
                <div className="border-t border-border-soft pt-2 flex justify-between text-xs font-bold">
                  <span className="text-muted">{t.invoicePie.total}</span>
                  <span>{invoicesTotalCount}</span>
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* ── Jobs breakdown ─────────────────────────────────────────────── */}
        <Section title={t.sections.jobsByStatus}>
          {jobsTotalCount === 0 ? (
            <div className="flex items-center justify-center h-48 text-faint">
              <div className="text-center">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">{t.empty.jobs}</p>
              </div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={jobStatusData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#6B7280' }} width={90} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Bar dataKey="value" name={t.jobsBreakdown.seriesName} radius={[0,6,6,0]}>
                    {jobStatusData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border-soft">
                <div className="text-center">
                  <p className="text-xl font-black text-ink">{jobsTotalCount}</p>
                  <p className="text-xs text-faint">{t.jobsBreakdown.totalJobs}</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-emerald-600">
                    {completionRate}%
                  </p>
                  <p className="text-xs text-faint">{t.jobsBreakdown.completionRate}</p>
                </div>
              </div>
            </>
          )}
        </Section>

        {/* Financial summary — gross-margin headline + a payroll-vs-margin bar
            over collected revenue, then the breakdown. */}
        <Section title={t.sections.financialSummary}>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black text-ink">{totalRevenue > 0 ? fmt(grossMargin) : '—'}</p>
                {totalRevenue > 0 ? (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${marginPct >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>{marginPct}%</span>
                ) : null}
              </div>
              <p className="text-xs text-muted mt-0.5">{t.financial.grossMarginEst}</p>
            </div>

            {totalRevenue > 0 ? (
              <div className="flex h-2.5 rounded-full overflow-hidden bg-border-soft">
                <div className="bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, (totalPayroll / totalRevenue) * 100))}%` }} />
                <div className="bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, (grossMargin / totalRevenue) * 100))}%` }} />
              </div>
            ) : null}

            <div className="flex flex-col gap-2.5">
              {[
                { label: t.financial.revenueCollected, value: fmt(totalRevenue), dot: 'bg-emerald-500' },
                { label: t.financial.estPayroll, value: fmt(totalPayroll), dot: 'bg-amber-400' },
                { label: t.financial.pending, value: fmt(pendingRevenue), dot: 'bg-blue-500' },
                { label: t.financial.overdue, value: fmt(overdueRevenue), dot: 'bg-red-500' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className={`w-2 h-2 rounded-full ${row.dot}`} />
                    {row.label}
                  </span>
                  <span className="text-sm font-bold text-ink">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Nuevos clientes */}
        <Section title={t.sections.newClients}>
          <div className="text-center py-6">
            <p className="text-5xl font-black text-primary">{newClientsCount}</p>
            <p className="text-sm text-muted mt-1">{t.newClientsBlock.newCount}</p>
            <p className="text-xs text-faint mt-0.5">
              {t.newClientsBlock.totalAccumulated.replace('{{count}}', String(totalClientsCount))}
            </p>
          </div>
        </Section>

        {/* Inventory value — only shown when the Inventory module is on. */}
        {inventoryEnabled && (
          <Section title={t.sections.inventory}>
            <div className="flex flex-col gap-4">
              <div className="text-center py-2">
                <p className="text-3xl font-black text-ink">{fmt(inventoryValue)}</p>
                <p className="text-sm text-muted mt-1">{t.inventoryBlock.totalValueLabel}</p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{t.inventoryBlock.totalItems}</span>
                  <span className="font-bold">{inventoryItemsCount}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{t.inventoryBlock.lowStock}</span>
                  <span className={`font-bold ${lowStockCount > 0 ? 'text-orange-500' : 'text-ink'}`}>
                    {lowStockCount}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{t.inventoryBlock.outOfStock}</span>
                  <span className={`font-bold ${outOfStockCount > 0 ? 'text-red-500' : 'text-ink'}`}>
                    {outOfStockCount}
                  </span>
                </div>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

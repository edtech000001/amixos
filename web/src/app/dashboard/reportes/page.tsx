'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Briefcase,
  FileText, Clock, Package, BarChart3,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Invoice {
  id: string; status: string; total_amount: number;
  paid_at: string | null; created_at: string; issue_date: string;
}
interface Job {
  id: string; status: string; total_amount: number; created_at: string;
  client_id: string | null;
}
interface Client { id: string; created_at: string; }
interface Timesheet { id: string; hours_worked: number; work_date: string; employee_id: string | null; worker_name: string | null; }
interface Employee { id: string; first_name: string; last_name: string; pay_rate: number; pay_type: string; }
interface InventoryItem { id: string; quantity: number; unit_cost: number; }

type Range = 'month' | 'last_month' | 'quarter' | 'half' | 'year' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  month: 'Este mes', last_month: 'Mes anterior', quarter: 'Últimos 3 meses',
  half: 'Últimos 6 meses', year: 'Este año', all: 'Todo el tiempo',
};

const MONTH_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const PIE_COLORS = {
  paid: '#10B981', sent: '#6366F1', draft: '#9CA3AF',
  overdue: '#EF4444', cancelled: '#D1D5DB', invoiced: '#8B5CF6',
};

const STATUS_LABELS: Record<string, string> = {
  paid: 'Pagadas', sent: 'Enviadas', draft: 'Borrador',
  overdue: 'Vencidas', cancelled: 'Canceladas',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function getRangeStart(range: Range): Date | null {
  const now = new Date();
  switch (range) {
    case 'month':      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'last_month': return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case 'quarter':    return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'half':       return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case 'year':       return new Date(now.getFullYear(), 0, 1);
    case 'all':        return null;
  }
}
function getRangeEnd(range: Range): Date {
  const now = new Date();
  if (range === 'last_month') return new Date(now.getFullYear(), now.getMonth(), 0);
  return now;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, trend, color = 'indigo' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: number; color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
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
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
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
  const { business } = useApp();
  const [range, setRange] = useState<Range>('year');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all data once — filter client-side per range
  useEffect(() => {
    if (!business) return;
    Promise.all([
      supabase.from('invoices').select('id, status, total_amount, paid_at, created_at, issue_date').eq('business_id', business.id),
      supabase.from('jobs').select('id, status, total_amount, created_at, client_id').eq('business_id', business.id),
      supabase.from('clients').select('id, created_at').eq('business_id', business.id),
      supabase.from('timesheets').select('id, hours_worked, work_date, employee_id, worker_name').eq('business_id', business.id),
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type').eq('business_id', business.id),
      supabase.from('inventory_items').select('id, quantity, unit_cost').eq('business_id', business.id),
    ]).then(([inv, j, cl, ts, emp, inv_items]) => {
      setInvoices(inv.data ?? []);
      setJobs(j.data ?? []);
      setClients(cl.data ?? []);
      setTimesheets(ts.data ?? []);
      setEmployees(emp.data ?? []);
      setInventory(inv_items.data ?? []);
      setLoading(false);
    });
  }, [business]);

  // Filter by date range
  const rangeStart = getRangeStart(range);
  const rangeEnd = getRangeEnd(range);

  const inRange = (dateStr: string) => {
    const d = new Date(dateStr);
    if (rangeStart && d < rangeStart) return false;
    if (d > rangeEnd) return false;
    return true;
  };

  const filteredInvoices = useMemo(() => invoices.filter(i => inRange(i.created_at)), [invoices, range]);
  const filteredJobs     = useMemo(() => jobs.filter(j => inRange(j.created_at)), [jobs, range]);
  const filteredClients  = useMemo(() => clients.filter(c => inRange(c.created_at)), [clients, range]);
  const filteredSheets   = useMemo(() => timesheets.filter(t => inRange(t.work_date)), [timesheets, range]);

  // ── Revenue KPIs ─────────────────────────────────────────────────────────
  const paidInvoices = filteredInvoices.filter(i => i.status === 'paid');
  const totalRevenue = paidInvoices.reduce((s, i) => s + i.total_amount, 0);
  const pendingRevenue = filteredInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total_amount, 0);
  const overdueRevenue = filteredInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total_amount, 0);
  const avgInvoice = paidInvoices.length ? totalRevenue / paidInvoices.length : 0;

  const completedJobs = filteredJobs.filter(j => j.status === 'completed' || j.status === 'invoiced');
  const avgJobValue = completedJobs.length ? completedJobs.reduce((s, j) => s + j.total_amount, 0) / completedJobs.length : 0;

  const totalHours = filteredSheets.reduce((s, t) => s + (t.hours_worked ?? 0), 0);

  const inventoryValue = inventory.reduce((s, i) => s + i.quantity * i.unit_cost, 0);

  // ── Monthly revenue chart ─────────────────────────────────────────────────
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months = range === 'month' || range === 'last_month' ? 1
      : range === 'quarter' ? 3
      : range === 'half' ? 6
      : range === 'year' || range === 'all' ? 12 : 12;

    return Array.from({ length: months }, (_, i) => {
      const d = range === 'last_month'
        ? new Date(now.getFullYear(), now.getMonth() - 1 + i, 1)
        : new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      const monthInvoices = paidInvoices.filter(inv => {
        const pd = new Date(inv.paid_at ?? inv.created_at);
        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
      });
      const monthJobs = filteredJobs.filter(j => {
        const jd = new Date(j.created_at);
        return jd.getFullYear() === d.getFullYear() && jd.getMonth() === d.getMonth();
      });
      return {
        name: MONTH_NAMES_ES[d.getMonth()],
        'Ingresos': +monthInvoices.reduce((s, i) => s + i.total_amount, 0).toFixed(0),
        'Trabajos': monthJobs.length,
      };
    });
  }, [paidInvoices, filteredJobs, range]);

  // ── Invoice status pie ────────────────────────────────────────────────────
  const invoiceStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredInvoices.forEach(i => { counts[i.status] = (counts[i.status] ?? 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] ?? status, value: count, status,
    }));
  }, [filteredInvoices]);

  // ── Job status data ───────────────────────────────────────────────────────
  const jobStatusData = useMemo(() => {
    const map: Record<string, number> = {
      scheduled: 0, in_progress: 0, completed: 0, invoiced: 0, cancelled: 0,
    };
    filteredJobs.forEach(j => { if (j.status in map) map[j.status]++; });
    return [
      { name: 'Programados', value: map.scheduled,   color: '#6366F1' },
      { name: 'En progreso', value: map.in_progress,  color: '#F59E0B' },
      { name: 'Completados', value: map.completed,    color: '#10B981' },
      { name: 'Facturados',  value: map.invoiced,     color: '#8B5CF6' },
      { name: 'Cancelados',  value: map.cancelled,    color: '#D1D5DB' },
    ].filter(d => d.value > 0);
  }, [filteredJobs]);

  // ── Employee hours table ──────────────────────────────────────────────────
  const employeeHours = useMemo(() => {
    const map: Record<string, { name: string; hours: number; payRate: number; payType: string }> = {};
    filteredSheets.forEach(ts => {
      const key = ts.employee_id ?? ts.worker_name ?? 'Sin nombre';
      const emp = employees.find(e => e.id === ts.employee_id);
      const name = emp ? `${emp.first_name} ${emp.last_name}` : ts.worker_name ?? 'Manual';
      if (!map[key]) map[key] = { name, hours: 0, payRate: emp?.pay_rate ?? 0, payType: emp?.pay_type ?? 'hourly' };
      map[key].hours += ts.hours_worked ?? 0;
    });
    return Object.values(map)
      .map(e => ({
        ...e,
        pay: e.payType === 'hourly' ? e.hours * e.payRate
           : e.payType === 'daily' ? Math.ceil(e.hours / 8) * e.payRate
           : e.payRate,
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);
  }, [filteredSheets, employees]);

  const totalPayroll = employeeHours.reduce((s, e) => s + e.pay, 0);

  // ── Top clients by invoice revenue ───────────────────────────────────────
  const topClients = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; count: number }> = {};
    // We need client names — join through jobs table
    filteredInvoices.filter(i => i.status === 'paid').forEach(inv => {
      // We don't have client name here directly, but client_id is on invoice
      // Use invoice id as key for now — ideally we'd join
    });
    return [];
  }, [filteredInvoices]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex gap-1">{[0,1,2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>
      ))}</div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analiza el rendimiento de tu negocio</p>
        </div>
        {/* Range selector */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
          {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<DollarSign size={16}/>} label="Ingresos cobrados" value={fmt(totalRevenue)} color="emerald"
          sub={paidInvoices.length > 0 ? `${paidInvoices.length} facturas pagadas` : 'Sin facturas pagadas'}/>
        <KpiCard icon={<FileText size={16}/>} label="Pendiente de cobro" value={fmt(pendingRevenue + overdueRevenue)} color="amber"
          sub={overdueRevenue > 0 ? `${fmt(overdueRevenue)} vencido` : undefined}/>
        <KpiCard icon={<Briefcase size={16}/>} label="Valor promedio/trabajo" value={avgJobValue > 0 ? fmt(avgJobValue) : '—'} color="indigo"
          sub={`${completedJobs.length} trabajos completados`}/>
        <KpiCard icon={<Clock size={16}/>} label="Horas registradas" value={totalHours.toFixed(1)} color="purple"
          sub={`Est. nómina: ${fmt(totalPayroll)}`}/>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* ── Revenue chart ─────────────────────────────────────────────── */}
        <Section title="Ingresos por mes">
          {monthlyRevenue.every(m => m['Ingresos'] === 0) ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <BarChart3 size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Sin datos de ingresos en este período.</p>
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
                <Bar dataKey="Ingresos" fill="#4F46E5" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── Invoice status breakdown ───────────────────────────────────── */}
        <Section title="Estado de facturas">
          {invoiceStatusData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Sin facturas en este período.</p>
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
                      <span className="text-gray-600 text-xs">{d.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">{d.value}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 flex justify-between text-xs font-bold">
                  <span className="text-gray-500">Total</span>
                  <span>{filteredInvoices.length}</span>
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* ── Jobs breakdown ─────────────────────────────────────────────── */}
        <Section title="Trabajos por estado">
          {filteredJobs.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <Briefcase size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Sin trabajos en este período.</p>
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
                  <Bar dataKey="value" name="Trabajos" radius={[0,6,6,0]}>
                    {jobStatusData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-xl font-black text-gray-900">{filteredJobs.length}</p>
                  <p className="text-xs text-gray-400">Total trabajos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-emerald-600">
                    {filteredJobs.length > 0
                      ? Math.round((completedJobs.length / filteredJobs.length) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-gray-400">Tasa de completado</p>
                </div>
              </div>
            </>
          )}
        </Section>

        {/* ── Employee hours ─────────────────────────────────────────────── */}
        <Section title="Horas por empleado">
          {employeeHours.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <Clock size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="text-sm">Sin registros de horas en este período.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {employeeHours.map(emp => {
                  const maxHours = Math.max(...employeeHours.map(e => e.hours));
                  const pct = maxHours > 0 ? (emp.hours / maxHours) * 100 : 0;
                  return (
                    <div key={emp.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700 truncate max-w-[140px]">{emp.name}</span>
                        <div className="flex gap-3 shrink-0">
                          <span className="text-gray-500">{emp.hours}h</span>
                          <span className="font-bold text-gray-900">{fmt(emp.pay)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between text-sm font-bold">
                <span className="text-gray-500">Total estimado nómina</span>
                <span className="text-primary">{fmt(totalPayroll)}</span>
              </div>
            </>
          )}
        </Section>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Nuevos clientes */}
        <Section title="Nuevos clientes">
          <div className="text-center py-6">
            <p className="text-5xl font-black text-primary">{filteredClients.length}</p>
            <p className="text-sm text-gray-500 mt-1">clientes nuevos</p>
            <p className="text-xs text-gray-400 mt-0.5">{clients.length} total acumulado</p>
          </div>
        </Section>

        {/* Invoice conversion */}
        <Section title="Resumen financiero">
          <div className="flex flex-col gap-3">
            {[
              { label: 'Ingresos cobrados', value: fmt(totalRevenue), color: 'text-emerald-600' },
              { label: 'Por cobrar', value: fmt(pendingRevenue), color: 'text-blue-600' },
              { label: 'Vencido', value: fmt(overdueRevenue), color: 'text-red-500' },
              { label: 'Nómina estimada', value: fmt(totalPayroll), color: 'text-amber-600' },
              { label: 'Margen bruto est.', value: totalRevenue > 0 ? fmt(totalRevenue - totalPayroll) : '—', color: 'text-gray-900' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500">{row.label}</span>
                <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Inventory value */}
        <Section title="Inventario">
          <div className="flex flex-col gap-4">
            <div className="text-center py-2">
              <p className="text-3xl font-black text-gray-900">{fmt(inventoryValue)}</p>
              <p className="text-sm text-gray-500 mt-1">valor total en inventario</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Artículos totales</span>
                <span className="font-bold">{inventory.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Bajo stock</span>
                <span className={`font-bold ${inventory.filter(i => i.quantity <= 5).length > 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                  {inventory.filter(i => i.quantity <= 5).length}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Sin stock</span>
                <span className={`font-bold ${inventory.filter(i => i.quantity === 0).length > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {inventory.filter(i => i.quantity === 0).length}
                </span>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

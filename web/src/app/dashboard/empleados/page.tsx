'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Plus, Clock, ClipboardList, Pencil, UserCheck, UserX, DollarSign } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
}

interface Timesheet {
  id: string;
  worker_name: string | null;
  work_date: string;
  hours_worked: number | null;
  job_description: string | null;
  employee_id: string | null;
}

const EMPTY_EMP = { first_name: '', last_name: '', phone: '', role: 'worker', pay_type: 'hourly', pay_rate: 0 };
const EMPTY_TS  = { employee_id: '', worker_name: '', work_date: new Date().toISOString().split('T')[0], hours_worked: 8, job_description: '' };

const PAY_TYPES: Record<string, string> = { hourly: 'Por hora', salary: 'Salario', daily: 'Por día' };
const ROLES: Record<string, string> = { owner: 'Dueño', manager: 'Gerente', worker: 'Trabajador' };

export default function EmpleadosPage() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [tab, setTab] = useState<'empleados' | 'horas' | 'nomina'>('empleados');
  const [empModal, setEmpModal] = useState<'add' | 'edit' | null>(null);
  const [tsModal, setTsModal] = useState(false);
  const [selEmp, setSelEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [tsForm, setTsForm] = useState(EMPTY_TS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadEmployees = async () => {
    if (!business) return;
    const { data } = await supabase.from('employees').select('*').eq('business_id', business.id).order('first_name');
    setEmployees(data ?? []);
  };

  const loadTimesheets = async () => {
    if (!business) return;
    const { data } = await supabase.from('timesheets').select('*').eq('business_id', business.id).order('work_date', { ascending: false }).limit(50);
    setTimesheets(data ?? []);
  };

  useEffect(() => { loadEmployees(); loadTimesheets(); }, [business]);

  // Employee CRUD
  const openAddEmp = () => { setEmpForm(EMPTY_EMP); setError(''); setEmpModal('add'); };
  const openEditEmp = (e: Employee) => {
    setSelEmp(e);
    setEmpForm({ first_name: e.first_name, last_name: e.last_name, phone: e.phone ?? '', role: e.role, pay_type: e.pay_type, pay_rate: e.pay_rate });
    setError(''); setEmpModal('edit');
  };
  const saveEmp = async () => {
    if (!empForm.first_name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    if (empModal === 'add') {
      await supabase.from('employees').insert({ ...empForm, business_id: business!.id });
    } else if (selEmp) {
      await supabase.from('employees').update(empForm).eq('id', selEmp.id);
    }
    await loadEmployees(); setSaving(false); setEmpModal(null);
  };
  const toggleActive = async (e: Employee) => {
    await supabase.from('employees').update({ active: !e.active }).eq('id', e.id);
    setEmployees(prev => prev.map(emp => emp.id === e.id ? { ...emp, active: !e.active } : emp));
  };

  // Timesheet entry
  const saveTimesheet = async () => {
    if (!tsForm.hours_worked) { setError('Las horas son requeridas'); return; }
    const name = tsForm.employee_id
      ? employees.find(e => e.id === tsForm.employee_id)?.first_name + ' ' + employees.find(e => e.id === tsForm.employee_id)?.last_name
      : tsForm.worker_name;
    setSaving(true); setError('');
    await supabase.from('timesheets').insert({
      business_id: business!.id,
      employee_id: tsForm.employee_id || null,
      worker_name: name,
      work_date: tsForm.work_date,
      hours_worked: tsForm.hours_worked,
      job_description: tsForm.job_description || null,
      status: 'completed',
    });
    await loadTimesheets(); setSaving(false); setTsModal(false); setTsForm(EMPTY_TS);
  };

  const activeCount = employees.filter(e => e.active).length;
  const totalHoursThisWeek = (() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return timesheets.filter(t => new Date(t.work_date) >= start).reduce((s, t) => s + (t.hours_worked ?? 0), 0);
  })();

  // Payroll computation for nomina tab
  const payrollRows = (() => {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSheets = timesheets.filter(t => new Date(t.work_date) >= startMonth);
    const byWorker: Record<string, { hours: number; emp?: typeof employees[0] }> = {};
    monthSheets.forEach(t => {
      const key = t.worker_name ?? 'Desconocido';
      if (!byWorker[key]) byWorker[key] = { hours: 0, emp: employees.find(e => e.id === t.employee_id) };
      byWorker[key].hours += t.hours_worked ?? 0;
    });
    return Object.entries(byWorker);
  })();
  const payrollMonth = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const payrollTotal = payrollRows.reduce((s, [, { hours, emp }]) => {
    const rate = emp?.pay_rate ?? 0;
    const pt = emp?.pay_type ?? 'hourly';
    return s + (pt === 'hourly' ? hours * rate : pt === 'daily' ? Math.ceil(hours / 8) * rate : rate);
  }, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activeCount} activos · {totalHoursThisWeek}h esta semana</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => { setTsForm(EMPTY_TS); setError(''); setTsModal(true); }}>
            <Clock size={15} className="mr-1.5"/> Registrar horas
          </Button>
          <Button size="md" onClick={openAddEmp}>
            <Plus size={15} className="mr-1.5"/> Agregar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {(['empleados', 'horas', 'nomina'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'empleados' ? 'Equipo' : t === 'horas' ? 'Horas' : 'Nómina'}
          </button>
        ))}
      </div>

      {tab === 'empleados' ? (
        // ── Employee list ──────────────────────────────────────────────────────
        employees.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <UserCheck size={40} className="mx-auto mb-3 opacity-30"/>
            <p className="text-sm">Aún no tienes empleados.</p>
            <button onClick={openAddEmp} className="text-primary text-sm font-medium hover:underline mt-1">Agrega el primero →</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {employees.map((e, i) => (
              <div key={e.id} className={`flex items-center justify-between px-5 py-4 ${i < employees.length-1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${e.active ? 'bg-primary/10' : 'bg-gray-100'}`}>
                    <span className={`text-sm font-semibold ${e.active ? 'text-primary' : 'text-gray-400'}`}>
                      {e.first_name.charAt(0)}{e.last_name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{e.first_name} {e.last_name}</p>
                      {!e.active && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactivo</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ROLES[e.role] ?? e.role} · {PAY_TYPES[e.pay_type]} ${e.pay_rate.toFixed(2)}
                      {e.phone ? ` · ${e.phone}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button onClick={() => openEditEmp(e)} className="p-2 rounded-lg hover:bg-gray-100"><Pencil size={14} className="text-gray-400"/></button>
                  <button onClick={() => toggleActive(e)} className="p-2 rounded-lg hover:bg-gray-100">
                    {e.active ? <UserX size={14} className="text-gray-400"/> : <UserCheck size={14} className="text-emerald-500"/>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'horas' ? (
        // ── Timesheets ─────────────────────────────────────────────────────────
        timesheets.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30"/>
            <p className="text-sm">Sin registros de horas.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_80px_120px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3 border-b border-gray-50">
              <span>Trabajador</span><span className="text-center">Fecha</span><span className="text-center">Horas</span><span>Trabajo</span>
            </div>
            {timesheets.map((t, i) => (
              <div key={t.id} className={`grid grid-cols-[1fr_100px_80px_120px] items-center px-5 py-3 text-sm ${i < timesheets.length-1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50`}>
                <span className="text-gray-900 font-medium truncate">{t.worker_name ?? '—'}</span>
                <span className="text-center text-gray-500 text-xs">
                  {new Date(t.work_date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-center font-semibold text-gray-900">{t.hours_worked ?? '—'}</span>
                <span className="text-gray-400 text-xs truncate">{t.job_description ?? '—'}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        // ── Payroll summary ──────────────────────────────────────────────────
        payrollRows.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <DollarSign size={40} className="mx-auto mb-3 opacity-30"/>
            <p className="text-sm">Sin registros de horas este mes.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 text-xs font-semibold text-gray-400">
              Resumen de nómina — {payrollMonth}
            </div>
            <div className="grid grid-cols-[1fr_80px_90px_110px] text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-2 border-b border-gray-50">
              <span>Empleado</span><span className="text-center">Horas</span><span className="text-center">Tarifa</span><span className="text-right">Total</span>
            </div>
            {payrollRows.map(([name, { hours, emp }], i) => {
              const rate = emp?.pay_rate ?? 0;
              const payType = emp?.pay_type ?? 'hourly';
              const pay = payType === 'hourly' ? hours * rate : payType === 'daily' ? Math.ceil(hours / 8) * rate : rate;
              return (
                <div key={name} className={`grid grid-cols-[1fr_80px_90px_110px] items-center px-5 py-3.5 text-sm ${i < payrollRows.length-1 ? 'border-b border-gray-50' : ''}`}>
                  <span className="font-medium text-gray-900 truncate">{name}</span>
                  <span className="text-center text-gray-600">{hours}</span>
                  <span className="text-center text-gray-400 text-xs">${rate.toFixed(2)}/{payType === 'hourly' ? 'hr' : payType === 'daily' ? 'día' : 'mes'}</span>
                  <span className="text-right font-bold text-gray-900">${pay.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between text-sm font-bold">
              <span className="text-gray-700">Total estimado del mes</span>
              <span className="text-primary">${payrollTotal.toFixed(2)}</span>
            </div>
          </div>
        )
      )}

      {/* Add/Edit Employee Modal */}
      <Modal open={empModal !== null} onClose={() => setEmpModal(null)} title={empModal === 'add' ? 'Nuevo empleado' : 'Editar empleado'}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *" placeholder="Juan" value={empForm.first_name} onChange={e => setEmpForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label="Apellido" placeholder="Pérez" value={empForm.last_name} onChange={e => setEmpForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <Input label="Teléfono" placeholder="+1 (555) 000-0000" value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Puesto</label>
              <select value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Tipo de pago</label>
              <select value={empForm.pay_type} onChange={e => setEmpForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <Input label={`Tarifa (${empForm.pay_type === 'hourly' ? '$/hr' : empForm.pay_type === 'daily' ? '$/día' : '$/mes'})`} type="number" min="0" step="0.01" value={empForm.pay_rate || ''} onChange={e => setEmpForm(f => ({ ...f, pay_rate: parseFloat(e.target.value) || 0 }))} leftIcon={<DollarSign size={15}/>} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEmpModal(null)} fullWidth>Cancelar</Button>
            <Button onClick={saveEmp} loading={saving} fullWidth>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Log hours modal */}
      <Modal open={tsModal} onClose={() => setTsModal(false)} title="Registrar horas">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Empleado</label>
            <select value={tsForm.employee_id} onChange={e => setTsForm(f => ({ ...f, employee_id: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              <option value="">Escribir nombre manualmente</option>
              {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          {!tsForm.employee_id && (
            <Input label="Nombre del trabajador" placeholder="Juan Pérez" value={tsForm.worker_name} onChange={e => setTsForm(f => ({ ...f, worker_name: e.target.value }))} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" value={tsForm.work_date} onChange={e => setTsForm(f => ({ ...f, work_date: e.target.value }))} />
            <Input label="Horas trabajadas" type="number" min="0.5" step="0.5" placeholder="8" value={tsForm.hours_worked || ''} onChange={e => setTsForm(f => ({ ...f, hours_worked: parseFloat(e.target.value) || 0 }))} />
          </div>
          <Input label="Descripción del trabajo" placeholder="Instalación de pivote, Sección Norte" value={tsForm.job_description} onChange={e => setTsForm(f => ({ ...f, job_description: e.target.value }))} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setTsModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={saveTimesheet} loading={saving} fullWidth>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

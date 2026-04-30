'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';
import {
  EmployeesScreen,
  type EmployeeListItem,
  type TimesheetListItem,
} from '@amixos/shared/screens/dashboard/EmployeesScreen';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
}

interface RawTimesheet {
  id: string;
  worker_name: string | null;
  work_date: string;
  hours_worked: number | null;
  job_description: string | null;
  employee_id: string | null;
}

const EMPTY_EMP = { first_name: '', last_name: '', phone: '', role: 'worker', pay_type: 'hourly', pay_rate: 0 };
const EMPTY_TS  = { employee_id: '', worker_name: '', work_date: new Date().toISOString().split('T')[0], hours_worked: 8, job_description: '' };

export default function EmpleadosPage() {
  const { t: full } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
  const [empModal, setEmpModal] = useState<'add' | 'edit' | null>(null);
  const [tsModal, setTsModal] = useState(false);
  const [selEmp, setSelEmp] = useState<RawEmployee | null>(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [tsForm, setTsForm] = useState(EMPTY_TS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PAY_TYPES: Record<string, string> = { hourly: t.payTypes.hourly, salary: t.payTypes.salary, daily: t.payTypes.daily };
  const ROLES: Record<string, string> = { owner: t.roles.owner, manager: t.roles.manager, worker: t.roles.worker };
  const PAY_UNIT: Record<string, string> = { hourly: t.payRateUnit.hourly, salary: t.payRateUnit.salary, daily: t.payRateUnit.daily };

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

  const empList: EmployeeListItem[] = useMemo(() => employees.map(e => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    phone: e.phone,
    role: e.role,
    payType: e.pay_type,
    payRate: e.pay_rate,
    active: e.active,
  })), [employees]);

  const tsList: TimesheetListItem[] = useMemo(() => timesheets.map(ts => ({
    id: ts.id,
    workerName: ts.worker_name,
    workDate: ts.work_date,
    hoursWorked: ts.hours_worked,
    jobDescription: ts.job_description,
    employeeId: ts.employee_id,
  })), [timesheets]);

  const openAddEmp = () => { setEmpForm(EMPTY_EMP); setError(''); setEmpModal('add'); };
  const openEditEmpById = (id: string) => {
    const e = employees.find(emp => emp.id === id);
    if (!e) return;
    setSelEmp(e);
    setEmpForm({ first_name: e.first_name, last_name: e.last_name, phone: e.phone ?? '', role: e.role, pay_type: e.pay_type, pay_rate: e.pay_rate });
    setError(''); setEmpModal('edit');
  };
  const saveEmp = async () => {
    if (!empForm.first_name.trim()) { setError(t.modal.errorFirstNameRequired); return; }
    setSaving(true); setError('');
    if (empModal === 'add') {
      await supabase.from('employees').insert({ ...empForm, business_id: business!.id });
    } else if (selEmp) {
      await supabase.from('employees').update(empForm).eq('id', selEmp.id);
    }
    await loadEmployees(); setSaving(false); setEmpModal(null);
  };
  const toggleActive = async (id: string) => {
    const e = employees.find(emp => emp.id === id);
    if (!e) return;
    await supabase.from('employees').update({ active: !e.active }).eq('id', e.id);
    setEmployees(prev => prev.map(emp => emp.id === e.id ? { ...emp, active: !e.active } : emp));
  };

  const saveTimesheet = async () => {
    if (!tsForm.hours_worked) { setError(t.timesheetModal.errorHoursRequired); return; }
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

  const modals = (
    <>
      <Modal open={empModal !== null} onClose={() => setEmpModal(null)} title={empModal === 'add' ? t.modal.addTitle : t.modal.editTitle}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder} value={empForm.first_name} onChange={e => setEmpForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label={t.modal.lastNameLabel} placeholder={t.modal.lastNamePlaceholder} value={empForm.last_name} onChange={e => setEmpForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <Input label={t.modal.phoneLabel} placeholder={t.modal.phonePlaceholder} value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.modal.roleLabel}</label>
              <select value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.modal.payTypeLabel}</label>
              <select value={empForm.pay_type} onChange={e => setEmpForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <Input label={t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[empForm.pay_type] ?? PAY_UNIT.hourly)} type="number" min="0" step="0.01" value={empForm.pay_rate || ''} onChange={e => setEmpForm(f => ({ ...f, pay_rate: parseFloat(e.target.value) || 0 }))} leftIcon={<DollarSign size={15}/>} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEmpModal(null)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveEmp} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={tsModal} onClose={() => setTsModal(false)} title={t.timesheetModal.title}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.timesheetModal.employeeLabel}</label>
            <select value={tsForm.employee_id} onChange={e => setTsForm(f => ({ ...f, employee_id: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              <option value="">{t.timesheetModal.employeeManualOption}</option>
              {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>
          {!tsForm.employee_id && (
            <Input label={t.timesheetModal.workerNameLabel} placeholder={t.timesheetModal.workerNamePlaceholder} value={tsForm.worker_name} onChange={e => setTsForm(f => ({ ...f, worker_name: e.target.value }))} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.timesheetModal.dateLabel} type="date" value={tsForm.work_date} onChange={e => setTsForm(f => ({ ...f, work_date: e.target.value }))} />
            <Input label={t.timesheetModal.hoursLabel} type="number" min="0.5" step="0.5" placeholder={t.timesheetModal.hoursPlaceholder} value={tsForm.hours_worked || ''} onChange={e => setTsForm(f => ({ ...f, hours_worked: parseFloat(e.target.value) || 0 }))} />
          </div>
          <Input label={t.timesheetModal.jobDescriptionLabel} placeholder={t.timesheetModal.jobDescriptionPlaceholder} value={tsForm.job_description} onChange={e => setTsForm(f => ({ ...f, job_description: e.target.value }))} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setTsModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveTimesheet} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>
    </>
  );

  return (
    <EmployeesScreen
      employees={empList}
      timesheets={tsList}
      onAddEmployee={openAddEmp}
      onEditEmployee={openEditEmpById}
      onToggleActive={toggleActive}
      onLogHours={() => { setTsForm(EMPTY_TS); setError(''); setTsModal(true); }}
      modalsSlot={modals}
    />
  );
}

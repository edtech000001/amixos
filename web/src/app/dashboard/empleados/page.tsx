'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Clock, DollarSign } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { useLang } from '@/i18n/LangProvider';
import {
  EmployeesScreen,
  type EmployeeListItem,
  type TimesheetListItem,
} from '@amixos/shared/screens/dashboard/EmployeesScreen';
import { EmployeeHistoryView } from '@amixos/shared/screens/dashboard/EmployeeHistoryView';
import {
  diffEmployeeChanges,
  logEmployeeMilestone,
} from '@amixos/shared/lib/employeeHistory';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { resolveAccess, orphanMembers, displayNameFromAccount, type AccessMember, type AccessInvite } from '@amixos/shared/lib/teamPeople';
import type { Role } from '@amixos/shared/lib/permissions';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
  user_id: string | null;
  email: string | null;
  birthday: string | null;
  hire_date: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  custom_fields: Record<string, string> | null;
}

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

interface RawTimesheet {
  id: string;
  worker_name: string | null;
  work_date: string;
  hours_worked: number | null;
  job_description: string | null;
  employee_id: string | null;
}

const EMPTY_EMP = {
  first_name: '',
  last_name: '',
  phone: '',
  // Role hidden from the form — app-user RBAC lives in Ajustes → Equipo.
  // Default stays 'worker' so existing DB checks/queries still pass.
  role: 'worker',
  pay_type: 'hourly',
  pay_rate: 0,
  email: '',
  birthday: '',
  hire_date: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  custom_fields: {} as Record<string, string>,
};
const EMPTY_TS  = { employee_id: '', worker_name: '', work_date: new Date().toISOString().split('T')[0], hours_worked: 8, job_description: '' };

export default function EmpleadosPage() {
  const { t: full } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [invites, setInvites] = useState<AccessInvite[]>([]);
  const [empModal, setEmpModal] = useState<'add' | 'edit' | null>(null);
  const [tsModal, setTsModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selEmp, setSelEmp] = useState<RawEmployee | null>(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [tsForm, setTsForm] = useState(EMPTY_TS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PAY_TYPES: Record<string, string> = { hourly: t.payTypes.hourly, salary: t.payTypes.salary, daily: t.payTypes.daily };
  const PAY_UNIT: Record<string, string> = { hourly: t.payRateUnit.hourly, salary: t.payRateUnit.salary, daily: t.payRateUnit.daily };

  const loadEmployees = async () => {
    if (!business) return;
    const businessId = business.id;
    const data = await fetchAll<RawEmployee>((from, to) =>
      supabase.from('employees').select('*').eq('business_id', businessId)
        .order('first_name').range(from, to));
    setEmployees(data);
  };
  const loadTimesheets = async () => {
    if (!business) return;
    const { data } = await supabase.from('timesheets').select('*').eq('business_id', business.id).order('work_date', { ascending: false }).limit(50);
    setTimesheets(data ?? []);
  };

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('employee_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates((data ?? []) as FieldTemplate[]);
  };

  // Loads the unified people view: employees + app accounts (business_members)
  // + pending invites. Part of the Empleados+Equipo merge (Phase 1).
  //   - access badge per person  (Increment 1)
  //   - auto-create an employee row for any app account that has none, so the
  //     list is always complete — owner, legacy users, etc. (option B). The
  //     insert is best-effort: RLS rejects it for non-admins, which we ignore.
  const fetchEmployees = (bid: string) =>
    fetchAll<RawEmployee>((from, to) =>
      supabase.from('employees').select('*').eq('business_id', bid).order('first_name').range(from, to));

  const loadPeople = async () => {
    if (!business || !user) return;
    const bid = business.id;
    const [emps, { data: rawMembers }, invitesRes] = await Promise.all([
      fetchEmployees(bid),
      supabase.rpc('list_business_members', { b_id: bid }),
      fetch(`${getApiBaseUrl()}/api/v1/invites?business_id=${bid}`, {
        headers: { Authorization: `Bearer ${await getJwt()}` },
      }).then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);
    const mappedMembers: AccessMember[] = ((rawMembers as Array<{ id: string; user_id: string; email: string | null; display_name: string | null; role: string }> | null) ?? []).map(m => ({
      id: m.id, userId: m.user_id, email: m.email, displayName: m.display_name, role: m.role as Role, isYou: m.user_id === user.id,
    }));
    const mappedInvites: AccessInvite[] = ((invitesRes?.data ?? []) as Array<{ id: string; email: string; role: string }>).map(i => ({
      id: i.id, email: i.email, role: i.role as Role,
    }));
    setMembers(mappedMembers);
    setInvites(mappedInvites);

    const orphans = orphanMembers(mappedMembers, emps.map(e => ({ userId: e.user_id, email: e.email })));
    if (orphans.length > 0) {
      const { error } = await supabase.from('employees').insert(orphans.map(o => ({
        business_id: bid,
        user_id: o.userId,
        first_name: displayNameFromAccount(o),
        last_name: '',
        role: o.role === 'owner' ? 'owner' : o.role === 'manager' ? 'manager' : 'worker',
        active: true,
      })));
      if (!error) { setEmployees(await fetchEmployees(bid)); return; }
    }
    setEmployees(emps);
  };

  useEffect(() => { loadPeople(); loadTimesheets(); loadTemplates(); }, [business]);

  const empList: EmployeeListItem[] = useMemo(() => employees.map(e => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    phone: e.phone,
    role: e.role,
    payType: e.pay_type,
    payRate: e.pay_rate,
    active: e.active,
    access: resolveAccess({ userId: e.user_id ?? null, email: e.email }, members, invites),
  })), [employees, members, invites]);

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
    setEmpForm({
      first_name: e.first_name,
      last_name: e.last_name,
      phone: e.phone ?? '',
      role: e.role,
      pay_type: e.pay_type,
      pay_rate: e.pay_rate,
      email: e.email ?? '',
      birthday: e.birthday ?? '',
      hire_date: e.hire_date ?? '',
      address: e.address ?? '',
      city: e.city ?? '',
      state: e.state ?? '',
      zip_code: e.zip_code ?? '',
      emergency_contact_name: e.emergency_contact_name ?? '',
      emergency_contact_phone: e.emergency_contact_phone ?? '',
      custom_fields: e.custom_fields ?? {},
    });
    setError(''); setEmpModal('edit');
  };
  const saveEmp = async () => {
    if (!empForm.first_name.trim()) { setError(t.modal.errorFirstNameRequired); return; }
    if (empForm.email.trim() && !isValidEmail(empForm.email)) { setError(tc.validation.invalidEmail); return; }
    setSaving(true); setError('');
    // Normalise empty-string dates / optional text → null so Postgres
    // accepts them.
    const payload = {
      ...empForm,
      birthday: empForm.birthday || null,
      hire_date: empForm.hire_date || null,
      email: empForm.email.trim() || null,
      address: empForm.address.trim() || null,
      city: empForm.city.trim() || null,
      state: empForm.state || null,
      zip_code: empForm.zip_code.trim() || null,
      emergency_contact_name: empForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: empForm.emergency_contact_phone.trim() || null,
    };
    if (empModal === 'add') {
      const { data: created } = await supabase.from('employees').insert({ ...payload, business_id: business!.id }).select().single();
      if (created) {
        // Seed the timeline with the hire so future entries have a baseline.
        void logEmployeeMilestone(supabase, {
          businessId: business!.id,
          employeeId: created.id,
          eventType: 'hired',
          details: { role: empForm.role, pay_type: empForm.pay_type, rate: empForm.pay_rate },
          createdBy: user?.id ?? null,
        });
      }
    } else if (selEmp) {
      const prev = selEmp;
      await supabase.from('employees').update(payload).eq('id', selEmp.id);
      // Log each material diff (pay change AND role change in one save → two
      // entries). Phone/name edits don't log.
      const milestones = diffEmployeeChanges(
        { pay_rate: prev.pay_rate, pay_type: prev.pay_type, role: prev.role },
        { pay_rate: empForm.pay_rate, pay_type: empForm.pay_type, role: empForm.role },
      );
      for (const m of milestones) {
        void logEmployeeMilestone(supabase, {
          businessId: business!.id,
          employeeId: prev.id,
          eventType: m.eventType,
          details: m.details,
          createdBy: user?.id ?? null,
        });
      }
    }
    await loadEmployees(); setSaving(false); setEmpModal(null);
  };
  const toggleActive = async (id: string) => {
    const e = employees.find(emp => emp.id === id);
    if (!e || !business) return;
    const nextActive = !e.active;
    await supabase.from('employees').update({ active: nextActive }).eq('id', e.id);
    void logEmployeeMilestone(supabase, {
      businessId: business.id,
      employeeId: e.id,
      eventType: nextActive ? 'rehired' : 'terminated',
      createdBy: user?.id ?? null,
    });
    setEmployees(prev => prev.map(emp => emp.id === e.id ? { ...emp, active: nextActive } : emp));
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
          {/* Basic info */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.basicInfoHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder} value={empForm.first_name} onChange={e => setEmpForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label={t.modal.lastNameLabel} placeholder={t.modal.lastNamePlaceholder} value={empForm.last_name} onChange={e => setEmpForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.phoneLabel} placeholder={t.modal.phonePlaceholder} value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} />
            <Input label={t.modal.emailLabel} type="email" placeholder={t.modal.emailPlaceholder} value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} />
          </div>

          {/* Employment + pay */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.employmentHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.hireDateLabel} type="date" value={empForm.hire_date} onChange={e => setEmpForm(f => ({ ...f, hire_date: e.target.value }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.modal.payTypeLabel}</label>
              <select value={empForm.pay_type} onChange={e => setEmpForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <Input label={t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[empForm.pay_type] ?? PAY_UNIT.hourly)} type="number" min="0" step="0.01" value={empForm.pay_rate || ''} onChange={e => setEmpForm(f => ({ ...f, pay_rate: parseFloat(e.target.value) || 0 }))} leftIcon={<DollarSign size={15}/>} />

          {/* Personal */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.personalHeading}</p>
          <Input label={t.modal.birthdayLabel} type="date" value={empForm.birthday} onChange={e => setEmpForm(f => ({ ...f, birthday: e.target.value }))} />
          <Input label={t.modal.addressLabel} placeholder={t.modal.addressPlaceholder} value={empForm.address} onChange={e => setEmpForm(f => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-[1fr_100px_120px] gap-3">
            <Input label={t.modal.cityLabel} placeholder={t.modal.cityPlaceholder} value={empForm.city} onChange={e => setEmpForm(f => ({ ...f, city: e.target.value }))} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t.modal.stateLabel}</label>
              <select value={empForm.state} onChange={e => setEmpForm(f => ({ ...f, state: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                <option value="">{t.modal.stateNone}</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Input label={t.modal.zipLabel} placeholder={t.modal.zipPlaceholder} value={empForm.zip_code} onChange={e => setEmpForm(f => ({ ...f, zip_code: e.target.value }))} />
          </div>

          {/* Emergency contact */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.emergencyContactHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.modal.emergencyNameLabel} placeholder={t.modal.emergencyNamePlaceholder} value={empForm.emergency_contact_name} onChange={e => setEmpForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
            <Input label={t.modal.emergencyPhoneLabel} placeholder={t.modal.emergencyPhonePlaceholder} value={empForm.emergency_contact_phone} onChange={e => setEmpForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} />
          </div>

          {/* Custom fields */}
          {templates.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.customFieldsHeading}</p>
              <div className="flex flex-col gap-3">
                {templates.map(tpl => (
                  <CustomFieldInput
                    key={tpl.id}
                    template={tpl}
                    value={empForm.custom_fields[tpl.field_key] ?? ''}
                    onChange={v => setEmpForm(f => ({
                      ...f,
                      custom_fields: { ...f.custom_fields, [tpl.field_key]: v },
                    }))}
                  />
                ))}
              </div>
            </>
          ) : null}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Historial — only on edit (needs an existing employee id). */}
          {empModal === 'edit' && selEmp ? (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <Clock size={15} className="text-primary"/>
              <span className="text-sm font-semibold text-primary">{t.history.openBtn}</span>
            </button>
          ) : null}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEmpModal(null)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={saveEmp} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </div>
        </div>
      </Modal>

      {/* Employee history (read-only timeline) */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t.history.title}>
        {selEmp ? (
          <EmployeeHistoryView supabase={supabase} employeeId={selEmp.id} />
        ) : null}
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

/**
 * Renders the right HTML input for a given template field type. Values are
 * always stored/passed as strings (boolean → "true"/"false", date → ISO).
 */
function CustomFieldInput({
  template,
  value,
  onChange,
}: {
  template: FieldTemplate;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = template.required ? `${template.field_label} *` : template.field_label;

  if (template.field_type === 'boolean') {
    const on = value === 'true';
    return (
      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
        <span className="text-sm text-gray-900">{label}</span>
        <input
          type="checkbox"
          checked={on}
          onChange={e => onChange(e.target.checked ? 'true' : 'false')}
          className="w-5 h-5 accent-primary"
        />
      </label>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : template.field_type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

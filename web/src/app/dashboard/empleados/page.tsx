'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import { useRouter } from 'next/navigation';
import { Clock, DollarSign, UserX, UserCheck, Pencil, Eye } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput, todayLocalISO, formatDateLong } from '@amixos/shared/lib/format';
import { getPayrollPeriod, parsePayrollAnchor, normalizeFrequency, computePayrollRows, normalizePayrollConfig, type PayrollEmployee, type PayrollTimesheet } from '@amixos/shared/lib/payroll';
import { usStateName } from '@amixos/shared/lib/usStates';
import { useLang } from '@/i18n/LangProvider';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { useScrollRestore, saveScrollAnchor } from '@/lib/useScrollRestore';
import {
  EmployeesScreen,
  type EmployeeListItem,
  type TimesheetListItem,
  type HourTotalItem,
} from '@amixos/shared/screens/dashboard/EmployeesScreen';
import { EmployeeHistoryView } from '@amixos/shared/screens/dashboard/EmployeeHistoryView';
import {
  diffEmployeeChanges,
  logEmployeeMilestone,
} from '@amixos/shared/lib/employeeHistory';
import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { fetchEmployeeLocations, employeeIdsAtLocation, setEmployeePrimaryLocation, type EmployeeLocation } from '@amixos/shared/lib/locations';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { groupNumberString, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import {
  EMPLOYEE_FIELD_SECTIONS,
  EMPLOYEE_FIELDS_ALWAYS_SHOWN,
  EMPLOYEE_SECTION_FIELDS,
  parseEmployeeLayout,
  employeeFieldsInSection,
  type EmployeeFieldSection,
} from '@amixos/shared/lib/employeeFieldSections';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { resolveAccess, orphanMembers, displayNameFromAccount, type AccessMember, type AccessInvite } from '@amixos/shared/lib/teamPeople';
import { INVITABLE_ROLES, ROLE_LABELS, can, isReadOnly, type Role } from '@amixos/shared/lib/permissions';
import ImportModal from '@/components/dashboard/ImportModal';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  check_name: string | null;
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
  intended_access_role: string | null;
  custom_fields: Record<string, string> | null;
}

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
  field_config: { integerOnly?: boolean; multi?: boolean; thousands?: boolean } | null;
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
  check_name: '',
  phone: '',
  // Role hidden from the form — app-user RBAC lives in Ajustes → Equipo.
  // Default stays 'worker' so existing DB checks/queries still pass.
  role: 'worker',
  pay_type: 'hourly',
  // Kept as a string so the user can type "18." mid-entry without losing
  // the decimal point. Parsed to a number on save.
  pay_rate: '',
  overtime_eligible: false,
  overtime_threshold: '',
  overtime_multiplier: '',
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
const EMPTY_TS  = { id: '', employee_id: '', worker_name: '', work_date: todayLocalISO(), hours_worked: 8, job_description: '' };

export default function EmpleadosPage() {
  const router = useRouter();
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const supabase = createSupabaseClient();
  const { business, user, currentRole, startImpersonation, activeLocationId, locations } = useApp();
  // UI-hygiene gates (RLS is the real lock). A read-only viewer never sees
  // write affordances. Log-hours stays for anyone who may write timesheets
  // (field crew via writeOwnTimesheet, managers via seeAllTimesheets) but
  // never for a read-only viewer.
  const canCreateEmployee = can.createEmployee(currentRole);
  const canEditEmployee = can.editEmployee(currentRole);
  const canLogHours =
    can.writeOwnTimesheet(currentRole) ||
    (can.seeAllTimesheets(currentRole) && !isReadOnly(currentRole));
  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  // Coming back from an employee detail lands at the top otherwise — restore
  // the list scroll position once the rows have rendered. (This page has no
  // loading flag; rows present = ready.)
  useScrollRestore('employees-list', employees.length > 0);
  // Worker↔branch links — used to scope the list to the active branch (a worker
  // lent to another branch appears in both). Empty in single-location mode.
  const [empLocations, setEmpLocations] = useState<EmployeeLocation[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
  const [hourTotals, setHourTotals] = useState<HourTotalItem[]>([]);
  const [payPeriodLabel, setPayPeriodLabel] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [accessRoles, setAccessRoles] = useState<{ key: string; name: string | null }[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [invites, setInvites] = useState<AccessInvite[]>([]);
  // Modal modes:
  //   'view' — tap a row → read-only detail with pencil + deactivate in header
  //   'edit' — pencil in 'view' mode flips here (full form)
  //   'add'  — Agregar button (full form, no pre-existing row)
  const [empModal, setEmpModal] = useState<'add' | 'edit' | 'view' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tsModal, setTsModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selEmp, setSelEmp] = useState<RawEmployee | null>(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  // Home branch for a new employee (set in this form so you don't have to visit
  // Ajustes → Ubicaciones per hire). Defaults to the active branch on open.
  const [empHomeLocation, setEmpHomeLocation] = useState<string>('');
  const [tsForm, setTsForm] = useState(EMPTY_TS);
  // Multi-select workers when LOGGING new hours (one row inserted per worker).
  // Editing an existing entry stays single (tsForm.employee_id).
  const [tsEmpIds, setTsEmpIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // App-access controls inside the person modal (invite/role/revoke).
  const [accessRole, setAccessRole] = useState<Role>('office');
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const PAY_TYPES: Record<string, string> = { hourly: t.payTypes.hourly, salary: t.payTypes.salary, daily: t.payTypes.daily };
  const PAY_UNIT: Record<string, string> = { hourly: t.payRateUnit.hourly, salary: t.payRateUnit.salary, daily: t.payRateUnit.daily };

  // Labels used both for the `*` indicator on form fields and the "missing
  // required" error. first_name is omitted — it has its own dedicated error.
  const REQUIRED_FIELD_LABELS: Record<string, string> = {
    last_name: t.modal.lastNameLabel,
    check_name: t.modal.checkNameLabel,
    phone: t.modal.phoneLabel,
    email: t.modal.emailLabel,
    birthday: t.modal.birthdayLabel,
    hire_date: t.modal.hireDateLabel,
    pay_type: t.modal.payTypeLabel,
    pay_rate: t.modal.payRateLabel.replace(' ({{unit}})', ''),
    address: t.modal.addressLabel,
    city: t.modal.cityLabel,
    state: t.modal.stateLabel,
    zip_code: t.modal.zipLabel,
    emergency_contact_name: `${t.modal.emergencyContactHeading} — ${t.modal.emergencyNameLabel}`,
    emergency_contact_phone: `${t.modal.emergencyContactHeading} — ${t.modal.emergencyPhoneLabel}`,
  };
  const reqFlags: Record<string, boolean> = business?.employee_field_required ?? {};
  const rLabel = (key: string, base: string) => (reqFlags[key] ? `${base} *` : base);

  // Per-field show/hide (always-shown fields can never be hidden).
  const empHidden = parseHiddenFields(business?.employee_field_hidden);
  const fHidden = (key: string) =>
    !EMPLOYEE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(empHidden, key);

  // Custom fields grouped by section, in saved layout order.
  const empAllKeys = useMemo(
    () => [
      ...EMPLOYEE_FIELD_SECTIONS.flatMap(s => EMPLOYEE_SECTION_FIELDS[s]),
      ...templates.map(tpl => `custom:${tpl.id}`),
    ],
    [templates],
  );
  const empLayout = useMemo(
    () => parseEmployeeLayout(business?.employee_field_layout ?? null, empAllKeys),
    [business?.employee_field_layout, empAllKeys],
  );
  const empSectionLabel = (section: EmployeeFieldSection): string => {
    const es = locale === 'es';
    switch (section) {
      case 'general': return 'General';
      case 'contact': return es ? 'Contacto' : 'Contact';
      case 'employment': return es ? 'Empleo' : 'Employment';
      case 'location': return es ? 'Ubicación' : 'Location';
      case 'emergency': return es ? 'Emergencia' : 'Emergency';
      case 'additional': return es ? 'Detalles adicionales' : 'Additional details';
    }
  };

  // Custom field input wired into the create form's state.
  const empRenderCustom = (tpl: FieldTemplate) => (
    <CustomFieldInput key={tpl.id} template={tpl} value={empForm.custom_fields[tpl.field_key] ?? ''}
      onChange={v => setEmpForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [tpl.field_key]: v } }))} />
  );

  // Full-width / stacked JSX for each built-in employee field key. The
  // data-driven section loop calls this in saved order (already gated on
  // fHidden so it never receives a hidden key).
  const empRenderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return <Input key={key} label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder} value={empForm.first_name} onChange={e => setEmpForm(f => ({ ...f, first_name: e.target.value }))} />;
      case 'last_name':
        return <Input key={key} label={rLabel('last_name', t.modal.lastNameLabel)} placeholder={t.modal.lastNamePlaceholder} value={empForm.last_name} onChange={e => setEmpForm(f => ({ ...f, last_name: e.target.value }))} />;
      case 'check_name':
        return <Input key={key} label={rLabel('check_name', t.modal.checkNameLabel)} placeholder={t.modal.checkNamePlaceholder} hint={t.modal.checkNameHint} value={empForm.check_name} onChange={e => setEmpForm(f => ({ ...f, check_name: e.target.value }))} />;
      case 'phone':
        return <Input key={key} label={rLabel('phone', t.modal.phoneLabel)} placeholder={t.modal.phonePlaceholder} value={formatPhoneInput(empForm.phone)} onChange={e => setEmpForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))} />;
      case 'email':
        return <Input key={key} label={rLabel('email', t.modal.emailLabel)} type="email" placeholder={t.modal.emailPlaceholder} value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} />;
      case 'hire_date':
        return <Input key={key} label={rLabel('hire_date', t.modal.hireDateLabel)} type="date" value={empForm.hire_date} onChange={e => setEmpForm(f => ({ ...f, hire_date: e.target.value }))} />;
      case 'birthday':
        return <Input key={key} label={rLabel('birthday', t.modal.birthdayLabel)} type="date" value={empForm.birthday} onChange={e => setEmpForm(f => ({ ...f, birthday: e.target.value }))} />;
      case 'pay_type':
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{rLabel('pay_type', t.modal.payTypeLabel)}</label>
            <select value={empForm.pay_type} onChange={e => setEmpForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        );
      case 'pay_rate':
        return (
          <div key={key} className="flex flex-col gap-2">
            <Input
              label={rLabel('pay_rate', t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[empForm.pay_type] ?? PAY_UNIT.hourly))}
              type="text"
              inputMode="decimal"
              value={empForm.pay_rate}
              onChange={e => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                const parts = cleaned.split('.');
                const next = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
                setEmpForm(f => ({ ...f, pay_rate: next }));
              }}
              placeholder="0.00"
              leftIcon={<DollarSign size={15}/>}
            />
            {/* Overtime — hardcoded companion of the pay rate (hourly only). */}
            {empForm.pay_type === 'hourly' ? (
              <>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-ink">{t.modal.overtimeLabel}</span>
                  <input
                    type="checkbox"
                    checked={empForm.overtime_eligible}
                    onChange={e => setEmpForm(f => ({ ...f, overtime_eligible: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
                {empForm.overtime_eligible ? (
                  <div className="flex gap-3">
                    <label className="flex-1 text-xs text-muted">
                      {t.modal.overtimeThresholdLabel}
                      <input
                        type="number" min="0"
                        value={empForm.overtime_threshold}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        onChange={e => setEmpForm(f => ({ ...f, overtime_threshold: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <label className="flex-1 text-xs text-muted">
                      {t.modal.overtimeMultiplierLabel}
                      <input
                        type="number" min="1" step="0.1"
                        value={empForm.overtime_multiplier}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        onChange={e => setEmpForm(f => ({ ...f, overtime_multiplier: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      case 'address':
        return <Input key={key} label={rLabel('address', t.modal.addressLabel)} placeholder={t.modal.addressPlaceholder} value={empForm.address} onChange={e => setEmpForm(f => ({ ...f, address: e.target.value }))} />;
      case 'city':
        return <Input key={key} label={rLabel('city', t.modal.cityLabel)} placeholder={t.modal.cityPlaceholder} value={empForm.city} onChange={e => setEmpForm(f => ({ ...f, city: e.target.value }))} />;
      case 'state':
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{rLabel('state', t.modal.stateLabel)}</label>
            <select value={empForm.state} onChange={e => setEmpForm(f => ({ ...f, state: e.target.value }))} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              <option value="">{t.modal.stateNone}</option>
              {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
            </select>
          </div>
        );
      case 'zip_code':
        return <Input key={key} label={rLabel('zip_code', t.modal.zipLabel)} placeholder={t.modal.zipPlaceholder} value={empForm.zip_code} onChange={e => setEmpForm(f => ({ ...f, zip_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))} inputMode="numeric" />;
      case 'emergency_contact_name':
        return <Input key={key} label={rLabel('emergency_contact_name', t.modal.emergencyNameLabel)} placeholder={t.modal.emergencyNamePlaceholder} value={empForm.emergency_contact_name} onChange={e => setEmpForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />;
      case 'emergency_contact_phone':
        return <Input key={key} label={rLabel('emergency_contact_phone', t.modal.emergencyPhoneLabel)} placeholder={t.modal.emergencyPhonePlaceholder} value={formatPhoneInput(empForm.emergency_contact_phone)} onChange={e => setEmpForm(f => ({ ...f, emergency_contact_phone: formatPhoneInput(e.target.value) }))} />;
      default:
        return null;
    }
  };

  const loadEmployees = async () => {
    if (!business) return;
    const businessId = business.id;
    const data = await fetchAllById<RawEmployee>((afterId, pageSize) => {
      let q = supabase.from('employees').select('*').eq('business_id', businessId)
        .order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });
    setEmployees(data);
  };
  const loadTimesheets = async () => {
    if (!business) return;
    // All logged/manual hours (not period-bound) — paginate past the 1000-row
    // cap, then sort newest-first for the History tab.
    const rows = await fetchAllById<RawTimesheet>((afterId, pageSize) => {
      let q = supabase.from('timesheets').select('*').eq('business_id', business.id)
        .order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });
    rows.sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : 0));
    setTimesheets(rows);
  };
  // Per-worker hour totals for the CURRENT pay period (Hours tab). Uses the SAME
  // engine as Payroll so hours logged on JOBS (total_hours + driver hours, split
  // across crew assignments) count too — not just the timesheets table.
  const loadHourTotals = async () => {
    if (!business) return;
    const bid = business.id;
    const freq = normalizeFrequency(business.payroll_frequency);
    const anchor = parsePayrollAnchor(business.payroll_anchor_date);
    const customDays = business.payroll_custom_days ?? null;
    const period = getPayrollPeriod(freq, new Date(), 0, anchor, customDays);
    const [empRes, tsRes, jobRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, pay_rate, pay_type, overtime_eligible, overtime_threshold, overtime_multiplier, custom_fields').eq('business_id', bid),
      supabase.from('timesheets').select('employee_id, hours_worked, work_date').eq('business_id', bid)
        .gte('work_date', period.startStr).lte('work_date', period.endStr),
      supabase.from('jobs').select('id, title, scheduled_date, total_hours, driver_employee_ids, driver_hours, custom_fields, job_assignments(employee_id)')
        .eq('business_id', bid).gte('scheduled_date', period.startStr).lte('scheduled_date', period.endStr),
    ]);
    const jobs = ((jobRes.data ?? []) as Array<{ id: string; title: string | null; scheduled_date: string | null; total_hours: number | null; driver_employee_ids: string[] | null; driver_hours: number | null; custom_fields: Record<string, unknown> | null; job_assignments: { employee_id: string | null }[] }>).map(j => ({
      id: j.id, title: j.title, scheduled_date: j.scheduled_date,
      total_hours: j.total_hours, driver_employee_ids: j.driver_employee_ids,
      driver_hours: j.driver_hours, custom_fields: j.custom_fields,
      assignmentEmployeeIds: (j.job_assignments ?? []).map(a => a.employee_id).filter((x): x is string => !!x),
    }));
    const rows = computePayrollRows({
      employees: (empRes.data ?? []) as PayrollEmployee[],
      timesheets: (tsRes.data ?? []) as PayrollTimesheet[],
      jobs,
      period,
      includeZero: false,
      config: normalizePayrollConfig(business.payroll_config),
    });
    setHourTotals(rows.map(r => ({ employeeId: r.employeeId, workerName: r.name, hours: r.hours })));
    setPayPeriodLabel(`${formatDateLong(period.startStr, locale)} – ${formatDateLong(period.endStr, locale)}`);
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
    fetchAllById<RawEmployee>((afterId, pageSize) => {
      let q = supabase.from('employees').select('*').eq('business_id', bid)
        .order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });

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
    const mappedInvites: AccessInvite[] = ((invitesRes?.data ?? []) as Array<{ id: string; email: string; role: string; acceptUrl?: string }>).map(i => ({
      id: i.id, email: i.email, role: i.role as Role, acceptUrl: i.acceptUrl,
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

  useEffect(() => { loadPeople(); loadTimesheets(); loadHourTotals(); loadTemplates(); }, [business]);

  // Worker↔branch assignments for the active business (for per-branch scoping).
  useEffect(() => {
    if (!business) { setEmpLocations([]); return; }
    fetchEmployeeLocations(supabase, business.id).then(setEmpLocations).catch(() => setEmpLocations([]));
  }, [business]);

  // Per-business role renames so the team CSV can use custom role labels.
  useEffect(() => {
    if (!business) return;
    supabase.from('business_roles').select('key, name').eq('business_id', business.id)
      .then(({ data }: { data: { key: string; name: string | null }[] | null }) => setAccessRoles(data ?? []));
  }, [business]);

  // Opened from Ajustes → Empleados "Importar equipo" via ?import=1.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('import') === '1') {
      // Importing team members creates employee rows — gate on create.
      if (canCreateEmployee) setImportOpen(true);
      params.delete('import');
      const qs = params.toString();
      window.history.replaceState(null, '', `/dashboard/empleados${qs ? `?${qs}` : ''}`);
    }
  }, []);

  const empList: EmployeeListItem[] = useMemo(() => {
    // Scope to the active branch (home or borrowed). "All" = no filter.
    const scoped = activeLocationId
      ? (() => {
          const ids = employeeIdsAtLocation(empLocations, activeLocationId);
          return employees.filter(e => ids.has(e.id));
        })()
      : employees;
    return scoped.map(e => ({
      id: e.id,
      firstName: e.first_name,
      lastName: e.last_name,
      phone: e.phone,
      role: e.role,
      payType: e.pay_type,
      payRate: e.pay_rate,
      active: e.active,
      access: resolveAccess({ userId: e.user_id ?? null, email: e.email }, members, invites),
      // Every field value — categorical queries (overtime/access/status)
      // are handled by the filter panel, not keywords.
      searchExtra: [
        e.check_name ?? '', e.email ?? '', e.phone ?? '',
        e.address ?? '', e.city ?? '', e.state ?? '',
        ...Object.values((e.custom_fields ?? {}) as Record<string, string>),
      ].join(' '),
      overtimeEligible: e.pay_type === 'hourly' && ((e as { overtime_eligible?: boolean | null }).overtime_eligible ?? false),
      city: e.city,
      state: e.state,
      customFields: (e.custom_fields ?? {}) as Record<string, string>,
    }));
  }, [employees, members, invites, activeLocationId, empLocations]);

  const tsList: TimesheetListItem[] = useMemo(() => timesheets.map(ts => ({
    id: ts.id,
    workerName: ts.worker_name,
    workDate: ts.work_date,
    hoursWorked: ts.hours_worked,
    jobDescription: ts.job_description,
    employeeId: ts.employee_id,
  })), [timesheets]);

  // Unsaved-changes guard for the Add modal: dirty once the form diverges
  // from EMPTY_EMP. Confirms before closing via backdrop / X; a successful
  // save closes through setEmpModal(null) directly (no prompt).
  const empDirty = empModal === 'add' && JSON.stringify(empForm) !== JSON.stringify(EMPTY_EMP);
  const confirmEmpClose = useUnsavedChanges(empDirty);

  const openAddEmp = () => {
    setEmpForm(EMPTY_EMP);
    setEmpHomeLocation(activeLocationId ?? '');
    setError(''); setEmpModal('add');
  };
  // Row taps now navigate to the dedicated detail page; the list itself
  // only owns the "Add" modal for the create flow.
  const openEditEmpById = (id: string) => { saveScrollAnchor('employees-list', id); router.push(`/dashboard/empleados/${id}`); };
  // Legacy edit-modal seed (dead code — the modal `open` condition gates
  // rendering to add-only now, so this is never reached. Kept inline for
  // one follow-up cleanup pass).
  const _legacyOpenEdit = (id: string) => {
    const e = employees.find(emp => emp.id === id);
    if (!e) return;
    setSelEmp(e);
    setEmpForm({
      first_name: e.first_name,
      last_name: e.last_name,
      check_name: e.check_name ?? '',
      phone: e.phone ?? '',
      overtime_eligible: (e as { overtime_eligible?: boolean | null }).overtime_eligible ?? true,
      overtime_threshold: '',
      overtime_multiplier: '',
      role: e.role,
      pay_type: e.pay_type,
      pay_rate: e.pay_rate ? String(e.pay_rate) : '',
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
    setError(''); setAccessError('');
    // Pre-select the Invite dialog with the planned access role from import.
    setAccessRole(e.intended_access_role && (INVITABLE_ROLES as string[]).includes(e.intended_access_role) ? e.intended_access_role as Role : 'office');
    // Row clicks open the read-only detail; pencil in the header flips to edit.
    setEmpModal('view');
  };
  const saveEmp = async () => {
    if (!empForm.first_name.trim()) { setError(t.modal.errorFirstNameRequired); return; }
    if (empForm.email.trim() && !isValidEmail(empForm.email)) { setError(tc.validation.invalidEmail); return; }
    // Honour the per-business required-field toggles from Ajustes → Equipo
    // (employee_field_required). first_name is enforced above to mirror the
    // DB NOT NULL constraint; everything else is opt-in.
    const fieldValues: Record<string, string> = {
      last_name: empForm.last_name,
      check_name: empForm.check_name,
      phone: empForm.phone,
      email: empForm.email,
      birthday: empForm.birthday,
      hire_date: empForm.hire_date,
      pay_type: empForm.pay_type,
      pay_rate: empForm.pay_rate,
      address: empForm.address,
      city: empForm.city,
      state: empForm.state,
      zip_code: empForm.zip_code,
      emergency_contact_name: empForm.emergency_contact_name,
      emergency_contact_phone: empForm.emergency_contact_phone,
    };
    const missing: string[] = [];
    for (const [key, label] of Object.entries(REQUIRED_FIELD_LABELS)) {
      if (!reqFlags[key] || fHidden(key)) continue;
      const v = fieldValues[key];
      if (!v || !v.trim()) missing.push(label);
    }
    for (const tpl of templates) {
      if (tpl.required && !empForm.custom_fields[tpl.field_key]?.trim()) {
        missing.push(tpl.field_label);
      }
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      return;
    }
    setSaving(true); setError('');
    // pay_rate is a string in the form so the user can type "18." mid-entry
    // without losing the decimal — parse it back to a number for the DB.
    const payRateNum = parseFloat(empForm.pay_rate) || 0;
    // Normalise empty-string dates / optional text → null so Postgres
    // accepts them.
    const payload = {
      ...empForm,
      pay_rate: payRateNum,
      overtime_threshold: empForm.overtime_threshold.trim() === '' ? null : parseFloat(empForm.overtime_threshold) || 0,
      overtime_multiplier: empForm.overtime_multiplier.trim() === '' ? null : parseFloat(empForm.overtime_multiplier) || 1,
      check_name: empForm.check_name.trim() || null,
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
        // Assign the home branch picked in the form (no-op for single-location).
        if (empHomeLocation) await setEmployeePrimaryLocation(supabase, business!.id, created.id, empHomeLocation);
        // Seed the timeline with the hire so future entries have a baseline.
        void logEmployeeMilestone(supabase, {
          businessId: business!.id,
          employeeId: created.id,
          eventType: 'hired',
          details: { role: empForm.role, pay_type: empForm.pay_type, rate: payRateNum },
          createdBy: user?.id ?? null,
        });
        // Refresh links so the new hire shows under the right branch immediately.
        fetchEmployeeLocations(supabase, business!.id).then(setEmpLocations).catch(() => {});
      }
    } else if (selEmp) {
      const prev = selEmp;
      await supabase.from('employees').update(payload).eq('id', selEmp.id);
      // Log each material diff (pay change AND role change in one save → two
      // entries). Phone/name edits don't log.
      const milestones = diffEmployeeChanges(
        { pay_rate: prev.pay_rate, pay_type: prev.pay_type, role: prev.role },
        { pay_rate: payRateNum, pay_type: empForm.pay_type, role: empForm.role },
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
    // Hours are always logged against a registered employee — no free-text name.
    // Edit → the one row's worker; new log → every selected worker (one row each).
    const saveIds = tsForm.id ? (tsForm.employee_id ? [tsForm.employee_id] : []) : tsEmpIds;
    if (saveIds.length === 0) { setError(t.timesheetModal.errorEmployeeRequired); return; }
    if (!tsForm.hours_worked) { setError(t.timesheetModal.errorHoursRequired); return; }
    const nameOf = (id: string) => { const emp = employees.find(e => e.id === id); return emp ? `${emp.first_name} ${emp.last_name}` : ''; };
    setSaving(true); setError('');
    const base = {
      work_date: tsForm.work_date,
      hours_worked: tsForm.hours_worked,
      job_description: tsForm.job_description || null,
    };
    if (tsForm.id) {
      await supabase.from('timesheets').update({ ...base, employee_id: tsForm.employee_id || null, worker_name: nameOf(tsForm.employee_id) }).eq('id', tsForm.id);
    } else {
      await supabase.from('timesheets').insert(
        saveIds.map(id => ({ ...base, employee_id: id || null, worker_name: nameOf(id), business_id: business!.id, status: 'completed' })),
      );
    }
    await loadTimesheets(); await loadHourTotals(); setSaving(false); setTsModal(false); setTsForm(EMPTY_TS); setTsEmpIds([]);
  };

  const editTimesheet = (id: string) => {
    const ts = timesheets.find(t => t.id === id);
    if (!ts) return;
    setTsForm({
      id: ts.id,
      employee_id: ts.employee_id ?? '',
      worker_name: ts.worker_name ?? '',
      work_date: ts.work_date,
      hours_worked: ts.hours_worked ?? 0,
      job_description: ts.job_description ?? '',
    });
    setTsEmpIds([]);
    setError('');
    setTsModal(true);
  };

  const deleteTimesheet = async (id: string) => {
    const ok = await confirm({ message: t.deleteHoursConfirm, confirmText: tc.buttons.delete, destructive: true });
    if (!ok) return;
    await supabase.from('timesheets').delete().eq('id', id);
    await loadTimesheets(); await loadHourTotals();
  };

  // Bulk-delete selected employees. Removes app-access memberships first (mirrors
  // the single delete), skips your own record, then the rows. Returns false when
  // cancelled so the list keeps its selection.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const bulkDeleteEmployees = async (ids: string[]): Promise<boolean> => {
    if (!business || ids.length === 0) return false;
    const toDelete = employees
      .filter(e => ids.includes(e.id) && !(e.user_id && e.user_id === user?.id))
      .map(e => e.id);
    if (toDelete.length === 0) return false;
    const ok = await confirm({
      message: t.confirmDeleteBulk.replace('{{count}}', String(toDelete.length)),
      confirmText: t.bulkDelete,
      destructive: true,
    });
    if (!ok) return false;
    setBulkDeleting(true);
    const userIds = employees.filter(e => toDelete.includes(e.id) && e.user_id).map(e => e.user_id as string);
    if (userIds.length) {
      await supabase.from('business_members').delete().eq('business_id', business.id).in('user_id', userIds);
    }
    for (let i = 0; i < toDelete.length; i += 50) {
      await supabase.from('employees').delete().in('id', toDelete.slice(i, i + 50));
    }
    await loadEmployees();
    await loadPeople();
    setBulkDeleting(false);
    return true;
  };

  // ─── App access (invite / change role / revoke / remove) ───────────────
  // Managed straight from the person modal. RLS is the real lock; these
  // controls only show for owner/admin. After each action we reload the
  // unified people view so the badge reflects the new state.
  const inviteToApp = async (email: string, role: Role) => {
    if (!business || !email) return;
    setAccessBusy(true); setAccessError('');
    const res = await fetch(`${getApiBaseUrl()}/api/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getJwt()}` },
      body: JSON.stringify({ business_id: business.id, email, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const codeMap: Record<string, string> = {
        invite_self: teamT.errorInviteSelf,
        already_member: teamT.errorAlreadyMember,
        already_invited: teamT.errorAlreadyInvited,
      };
      setAccessError(codeMap[body.code] ?? teamT.inviteFailedToast);
      setAccessBusy(false);
      return;
    }
    await loadPeople(); setAccessBusy(false);
  };

  // Copy the invite's accept link for manual sharing (email delivery via
  // Supabase can be slow / land in spam).
  const copyInviteLink = async (inviteId: string) => {
    const url = invites.find(i => i.id === inviteId)?.acceptUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    } catch {
      window.prompt(teamT.copyLinkBtn, url);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!(await confirm({ message: teamT.confirmRevoke.replace('{{email}}', selEmp?.email ?? ''), destructive: true }))) return;
    setAccessBusy(true); setAccessError('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await getJwt()}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAccessError(`${body.message ?? 'Error'} (${res.status})`);
        setAccessBusy(false);
        return;
      }
    } catch (e: any) {
      setAccessError(e?.message ?? 'Network error');
      setAccessBusy(false);
      return;
    }
    await loadPeople(); setAccessBusy(false);
  };

  const changeAccessRole = async (memberId: string, role: Role) => {
    const m = members.find(x => x.id === memberId);
    if (!m || !business) return;
    setAccessBusy(true); setAccessError('');
    await supabase.from('business_members').update({ role }).eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business.id,
      action: 'member.role_changed',
      entity_type: 'member',
      entity_id: m.userId,
      details: { email: m.email, from: m.role, to: role },
    });
    await loadPeople(); setAccessBusy(false);
  };

  const removeAccess = async (memberId: string) => {
    const m = members.find(x => x.id === memberId);
    if (!m || !business) return;
    if (!(await confirm({ message: teamT.confirmRemove.replace('{{name}}', m.displayName ?? m.email ?? ''), destructive: true }))) return;
    setAccessBusy(true); setAccessError('');
    await supabase.from('business_members').delete().eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business.id,
      action: 'member.removed',
      entity_type: 'member',
      entity_id: m.userId,
      details: { email: m.email, role: m.role },
    });
    await loadPeople(); setAccessBusy(false);
  };

  // "Ver como" — enter this member's view (read-only). Mirrors the server
  // guardrails so we don't show a button that would 403: owner/admin only,
  // never the owner, and an admin can't view another admin.
  const verComoMember = async (memberId: string) => {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    setAccessBusy(true); setAccessError('');
    try {
      await startImpersonation(m.userId);
      router.push('/dashboard');
    } catch (e: any) {
      const code = e?.message as string | undefined;
      setAccessError(
        code === 'role_not_allowed' ? teamT.verComoNotAllowed
          : code === 'not_a_member' ? teamT.verComoNotMember
          : teamT.verComoFailed,
      );
      setAccessBusy(false);
    }
  };
  const canVerComo = (role: Role) =>
    can.manageMembers(currentRole) && role !== 'owner' && !(currentRole === 'admin' && role === 'admin');

  const selAccess = selEmp
    ? resolveAccess({ userId: selEmp.user_id ?? null, email: selEmp.email }, members, invites)
    : null;
  const canManageAccess = can.manageMembers(currentRole);

  const modals = (
    <>
      {business && (
        <ImportModal
          open={importOpen}
          mode="employees"
          businessId={business.id}
          supabase={supabase}
          templates={templates.map(t => ({ field_key: t.field_key, field_label: t.field_label, field_type: t.field_type, field_options: t.field_options }))}
          accessRoles={accessRoles}
          onClose={() => setImportOpen(false)}
          onDone={loadPeople}
        />
      )}
      <Modal
        open={empModal === 'add'}
        onClose={() => confirmEmpClose(() => setEmpModal(null))}
        title={
          empModal === 'add'
            ? t.modal.addTitle
            : empModal === 'view' && selEmp
            ? `${selEmp.first_name} ${selEmp.last_name}`.trim()
            : t.modal.editTitle
        }
        // 'view' shows the pencil (flip to edit) + the activate/deactivate
        // toggle. 'edit' and 'add' hide these icons (the Save / Cancel
        // buttons below are the affordance).
        headerAction={
          empModal === 'view' && selEmp ? (
            <>
              <button
                type="button"
                onClick={() => setEmpModal('edit')}
                className="p-1.5 rounded-lg hover:bg-border-soft transition-colors"
              >
                <Pencil size={16} className="text-muted" />
              </button>
              <button
                type="button"
                onClick={() => toggleActive(selEmp.id)}
                className="p-1.5 rounded-lg hover:bg-border-soft transition-colors"
              >
                {selEmp.active ? (
                  <UserX size={16} className="text-muted" />
                ) : (
                  <UserCheck size={16} className="text-emerald-500" />
                )}
              </button>
            </>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {/* Read-only detail view (row click lands here; pencil in the
              header flips to 'edit' to make the form editable). */}
          {empModal === 'view' && selEmp ? (
            <div className="flex flex-col gap-4">
              {/* Avatar + active badge */}
              <div className="flex flex-col items-center gap-2 py-2">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${selEmp.active ? 'bg-primary/10' : 'bg-border-soft'}`}>
                  <span className={`text-2xl font-bold ${selEmp.active ? 'text-primary' : 'text-faint'}`}>
                    {selEmp.first_name.charAt(0)}{selEmp.last_name.charAt(0)}
                  </span>
                </div>
                {!selEmp.active ? (
                  <span className="px-2 py-0.5 rounded-full bg-border-soft text-xs text-faint">{t.inactiveBadge}</span>
                ) : null}
              </div>

              {(selEmp.phone || selEmp.email) ? (
                <>
                  <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.modal.basicInfoHeading}</p>
                  <ViewRow label={t.modal.phoneLabel} value={selEmp.phone} />
                  <ViewRow label={t.modal.emailLabel} value={selEmp.email} />
                </>
              ) : null}

              <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.modal.employmentHeading}</p>
              <ViewRow label={t.modal.hireDateLabel} value={selEmp.hire_date} />
              <ViewRow label={t.modal.payTypeLabel} value={PAY_TYPES[selEmp.pay_type] ?? selEmp.pay_type} />
              {selEmp.pay_rate ? (
                <ViewRow
                  label={t.modal.payRateLabel.replace(' ({{unit}})', '')}
                  value={`$${selEmp.pay_rate.toFixed(2)} / ${PAY_UNIT[selEmp.pay_type] ?? PAY_UNIT.hourly}`}
                />
              ) : null}

              {(selEmp.birthday || selEmp.address || selEmp.city || selEmp.state || selEmp.zip_code) ? (
                <>
                  <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.modal.personalHeading}</p>
                  <ViewRow label={t.modal.birthdayLabel} value={selEmp.birthday} />
                  <ViewRow label={t.modal.addressLabel} value={selEmp.address} />
                  {(selEmp.city || selEmp.state || selEmp.zip_code) ? (
                    <ViewRow
                      label={`${t.modal.cityLabel} / ${t.modal.stateLabel} / ${t.modal.zipLabel}`}
                      value={[selEmp.city, selEmp.state, selEmp.zip_code].filter(Boolean).join(' · ')}
                    />
                  ) : null}
                </>
              ) : null}

              {(selEmp.emergency_contact_name || selEmp.emergency_contact_phone) ? (
                <>
                  <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.modal.emergencyContactHeading}</p>
                  <ViewRow label={t.modal.emergencyNameLabel} value={selEmp.emergency_contact_name} />
                  <ViewRow label={t.modal.emergencyPhoneLabel} value={selEmp.emergency_contact_phone} />
                </>
              ) : null}

              {templates.length > 0 && selEmp.custom_fields && Object.keys(selEmp.custom_fields).length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-faint uppercase tracking-wide mt-1">{t.modal.customFieldsHeading}</p>
                  {templates.map(tpl => (
                    <ViewRow key={tpl.id} label={tpl.field_label} value={selEmp.custom_fields?.[tpl.field_key]} />
                  ))}
                </>
              ) : null}
            </div>
          ) : null}

          {empModal !== 'view' ? (
          <>
          {/* Fully data-driven: each section renders its visible fields
              (built-in + custom) in saved layout order. */}
          {EMPLOYEE_FIELD_SECTIONS.map(section => {
            const visibleKeys = employeeFieldsInSection(empLayout, section)
              .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
            if (visibleKeys.length === 0) return null;
            return (
              <div key={section} className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 flex flex-col gap-4">
                <p className="text-xs font-semibold text-faint uppercase tracking-wide">{empSectionLabel(section)}</p>
                {visibleKeys.map(k => {
                  if (k.startsWith('custom:')) {
                    const tpl = templates.find(tp => `custom:${tp.id}` === k);
                    return tpl ? empRenderCustom(tpl) : null;
                  }
                  return empRenderField(k);
                })}
              </div>
            );
          })}

          {/* Home branch — set here so you don't visit Ajustes per hire. Only
              shown when the business runs multiple locations. */}
          {locations.length >= 2 && (
            <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5 flex flex-col gap-2">
              <label className="text-sm font-medium text-ink">{lang === 'en' ? 'Home location' : 'Ubicación principal'}</label>
              <select value={empHomeLocation} onChange={e => setEmpHomeLocation(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                <option value="">{lang === 'en' ? 'No location' : 'Sin ubicación'}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <p className="text-xs text-faint">{lang === 'en' ? 'Lend them to other branches in Settings → Locations.' : 'Préstalos a otras sucursales en Ajustes → Ubicaciones.'}</p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
          </>
          ) : null}

          {/* App access — invite / change role / revoke, straight from the
              person record. Visible in view AND edit modes. */}
          {(empModal === 'edit' || empModal === 'view') && selEmp ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border-soft bg-surface p-3">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{t.modal.appAccessHeading}</p>

              {selAccess?.kind === 'active' ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{ROLE_LABELS[selAccess.role][lang]}</span>
                    {selAccess.isYou ? <span className="text-xs text-faint">{teamT.youSuffix}</span> : null}
                    {selAccess.role === 'owner' ? <span className="text-xs text-faint">{teamT.ownerSuffix}</span> : null}
                  </div>
                  {canManageAccess && !selAccess.isYou && selAccess.role !== 'owner' ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selAccess.role}
                        disabled={accessBusy}
                        onChange={e => changeAccessRole(selAccess.memberId, e.target.value as Role)}
                        className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
                      >
                        {INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r][lang]}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={accessBusy}
                        onClick={() => removeAccess(selAccess.memberId)}
                        className="px-3 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {teamT.removeBtn}
                      </button>
                    </div>
                  ) : null}
                  {!selAccess.isYou && canVerComo(selAccess.role) ? (
                    <button
                      type="button"
                      disabled={accessBusy}
                      onClick={() => verComoMember(selAccess.memberId)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-ink hover:bg-surface transition-colors disabled:opacity-50"
                    >
                      <Eye size={14} /> {teamT.verComoBtn}
                    </button>
                  ) : null}
                </div>
              ) : selAccess?.kind === 'invited' ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{teamT.pendingBadge}</span>
                  <span className="text-xs text-muted">{ROLE_LABELS[selAccess.role][lang]}</span>
                  {canManageAccess ? (
                    <div className="ml-auto flex items-center gap-1">
                      {invites.find(i => i.id === selAccess!.inviteId)?.acceptUrl ? (
                        <button
                          type="button"
                          onClick={() => copyInviteLink(selAccess!.inviteId)}
                          className="px-3 py-1.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                        >
                          {inviteLinkCopied ? teamT.linkCopied : teamT.copyLinkBtn}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={accessBusy}
                        onClick={() => revokeInvite(selAccess!.inviteId)}
                        className="px-3 py-1.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {teamT.revokeBtn}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : canManageAccess ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">{t.modal.appAccessNoneHint}</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={accessRole}
                      disabled={accessBusy}
                      onChange={e => setAccessRole(e.target.value as Role)}
                      className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
                    >
                      {INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r][lang]}</option>)}
                    </select>
                    <button
                      type="button"
                      disabled={accessBusy || !empForm.email.trim()}
                      onClick={() => inviteToApp(empForm.email.trim(), accessRole)}
                      className="px-3 py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      {teamT.inviteBtn}
                    </button>
                  </div>
                  {!empForm.email.trim() ? <p className="text-xs text-amber-600">{t.modal.appAccessEmailRequired}</p> : null}
                </div>
              ) : (
                <p className="text-xs text-faint">{t.modal.appAccessNoManage}</p>
              )}

              {accessError ? <p className="text-xs text-red-500">{accessError}</p> : null}
            </div>
          ) : null}

          {/* Historial — visible in view AND edit modes. */}
          {(empModal === 'edit' || empModal === 'view') && selEmp ? (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface hover:bg-border-soft transition-colors"
            >
              <Clock size={15} className="text-primary"/>
              <span className="text-sm font-semibold text-primary">{t.history.openBtn}</span>
            </button>
          ) : null}

          {/* Save / cancel — only when the form is open ('view' is
              read-only; pencil flips to 'edit' to expose these). */}
          {empModal !== 'view' ? (
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => confirmEmpClose(() => setEmpModal(null))} fullWidth>{tc.buttons.cancel}</Button>
              <Button onClick={saveEmp} loading={saving} fullWidth>{tc.buttons.save}</Button>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Employee history (read-only timeline) */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t.history.title}>
        {selEmp ? (
          <EmployeeHistoryView supabase={supabase} employeeId={selEmp.id} />
        ) : null}
      </Modal>

      <Modal open={tsModal} onClose={() => setTsModal(false)} title={tsForm.id ? t.timesheetModal.editTitle : t.timesheetModal.title}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">{t.timesheetModal.employeeLabel}</label>
            {tsForm.id ? (
              <select value={tsForm.employee_id} onChange={e => setTsForm(f => ({ ...f, employee_id: e.target.value }))} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                <option value="">{t.timesheetModal.selectEmployee}</option>
                {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            ) : (
              // Multi-select: log the same hours to several workers at once.
              <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border-soft">
                {employees.filter(e => e.active).map(e => {
                  const checked = tsEmpIds.includes(e.id);
                  return (
                    <label key={e.id} className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-surface">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setTsEmpIds(prev => checked ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                        className="accent-primary w-4 h-4"
                      />
                      <span className="text-sm text-ink">{e.first_name} {e.last_name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
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
      customFieldDefs={templates.map(tpl => ({
        key: tpl.field_key,
        label: tpl.field_label,
        multi: tpl.field_type === 'select' && !!tpl.field_config?.multi,
        boolean: tpl.field_type === 'boolean',
      }))}
      employees={empList}
      timesheets={tsList}
      hourTotals={hourTotals}
      payPeriodLabel={payPeriodLabel}
      onAddEmployee={canCreateEmployee ? openAddEmp : undefined}
      onEditEmployee={openEditEmpById}
      onToggleActive={toggleActive}
      onLogHours={canLogHours ? () => { setTsForm(EMPTY_TS); setTsEmpIds([]); setError(''); setTsModal(true); } : undefined}
      onEditTimesheet={canEditEmployee ? editTimesheet : undefined}
      onDeleteTimesheet={canEditEmployee ? deleteTimesheet : undefined}
      onBulkDelete={can.deleteEmployee(currentRole) ? bulkDeleteEmployees : undefined}
      bulkDeleting={bulkDeleting}
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
  const { t: full } = useLang();
  const tc = full.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;
  const cfg = parseFieldConfig(template.field_config);

  if (template.field_type === 'note') {
    // Long free text — multiline.
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <textarea
          rows={4}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
        />
      </div>
    );
  }
  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Clicking the active button clears
    // it so the user can return to "unanswered". Required-field validation
    // now distinguishes "No" from "didn't touch".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-border bg-card text-ink hover:bg-surface'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">{label}</label>
          <div className="flex flex-wrap gap-2">
            {template.field_options.map(o => {
              const on = selected.includes(o);
              return (
                <button key={o} type="button" onClick={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted hover:border-border'}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">{label}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
        >
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (template.field_type === 'number') {
    // type="text" + inputMode so we can enforce numeric (and optional
    // whole-number-only) as the user types — type="number" can't be sanitized.
    return (
      <Input
        label={label}
        type="text"
        inputMode={cfg.integerOnly ? 'numeric' : 'decimal'}
        value={cfg.thousands ? groupNumberString(value) : value}
        onChange={e => onChange(sanitizeNumberInput(e.target.value, cfg.integerOnly))}
      />
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

/**
 * Read-only label/value row used by the view-detail mode of the person
 * modal. Returns null when the value is empty so missing optional fields
 * just disappear from the detail.
 */
function ViewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-faint">{label}</p>
      <p className="text-sm text-ink">{value}</p>
    </div>
  );
}

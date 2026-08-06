import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronDown, Check, DollarSign, X, Clock, UserX, UserCheck, Pencil, Minus, Plus, Search } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { queuedInsert } from '@/lib/offline/mutate';
import { newUuid } from '@/lib/offline/ids';
import { useApp } from '@/lib/AppContext';
import { swrRead, swrWrite } from '@amixos/shared/lib/swrCache';
import { LocationSwitcher } from '@/components/LocationSwitcher';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput, todayLocalISO, formatDateLong } from '@amixos/shared/lib/format';
import { getPayrollPeriod, parsePayrollAnchor, normalizeFrequency, computePayrollRows, normalizePayrollConfig, type PayrollEmployee, type PayrollTimesheet } from '@amixos/shared/lib/payroll';
import { confirm } from '@amixos/shared/ui/confirmBus';
import { foldSearchText } from '@amixos/shared/lib/usStates';
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';
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
import { fetchEmployeeLocations, employeeIdsAtLocation, type EmployeeLocation } from '@amixos/shared/lib/locations';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { resolveAccess, orphanMembers, displayNameFromAccount, type AccessMember, type AccessInvite } from '@amixos/shared/lib/teamPeople';
import { can, isReadOnly, type Role } from '@amixos/shared/lib/permissions';

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
  check_name?: string | null;
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
interface RawTimesheet {
  id: string;
  worker_name: string | null;
  work_date: string;
  hours_worked: number | null;
  job_description: string | null;
  employee_id: string | null;
}

interface EmpForm {
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  pay_type: string;
  // Stored as a string so the user can type intermediate values like "18."
  // without losing the decimal point. Parsed to a number on save.
  pay_rate: string;
  email: string;
  birthday: string;
  hire_date: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  custom_fields: Record<string, string>;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
interface TsForm {
  id: string;
  employee_id: string;
  worker_name: string;
  work_date: string;
  hours_worked: number;
  job_description: string;
}

const EMPTY_EMP: EmpForm = {
  first_name: '',
  last_name: '',
  phone: '',
  // Hidden from the form — app-user RBAC lives in Ajustes → Equipo. Default
  // stays 'worker' so existing DB checks/queries still pass.
  role: 'worker',
  pay_type: 'hourly',
  pay_rate: '',
  email: '',
  birthday: '',
  hire_date: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  custom_fields: {},
};
const EMPTY_TS = (): TsForm => ({
  id: '',
  employee_id: '',
  worker_name: '',
  work_date: todayLocalISO(),
  hours_worked: 8,
  job_description: '',
});

export default function EmpleadosRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, activeLocationId } = useApp();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.employees;
  const tc = full.common;
  const insets = useSafeAreaInsets();

  // UI-hygiene gates (RLS is the real lock). A read-only viewer never sees
  // write affordances. Log-hours stays for field crew (writeOwnTimesheet) and
  // for managers who see all timesheets, but never for a read-only viewer.
  const canCreateEmployee = can.createEmployee(currentRole);
  const canEditEmployee = can.editEmployee(currentRole);
  const canLogHours =
    can.writeOwnTimesheet(currentRole) ||
    (can.seeAllTimesheets(currentRole) && !isReadOnly(currentRole));

  // Floating bottom-sheet look (matches the client picker): a heavier scrim so
  // the screen behind reads as a soft dark wash, plus a rounded card lifted off
  // the screen edges with a soft shadow.
  const sheetScrim = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' };
  const sheetShadow = {
    marginBottom: insets.bottom + 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 24,
  };

  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  // Worker↔branch links — scope the list to the active branch (borrowed workers
  // appear in both). Empty in single-location mode.
  const [empLocations, setEmpLocations] = useState<EmployeeLocation[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
  const [hourTotals, setHourTotals] = useState<HourTotalItem[]>([]);
  const [payPeriodLabel, setPayPeriodLabel] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [invites, setInvites] = useState<AccessInvite[]>([]);

  // Modal modes:
  //   'view' — tap a row → read-only detail with pencil + deactivate in header
  //   'edit' — pencil in 'view' mode flips here (full form)
  //   'add'  — Agregar button (full form, no pre-existing row)
  const [empModal, setEmpModal] = useState<'add' | 'edit' | 'view' | null>(null);
  const [selEmpId, setSelEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<EmpForm>(EMPTY_EMP);
  const [tsModalOpen, setTsModalOpen] = useState(false);
  const [tsForm, setTsForm] = useState<TsForm>(EMPTY_TS);
  // Raw text mirror of hours_worked so typing "8." / "8.5" survives (a numeric
  // value would drop the trailing dot on each re-render). The stepper and reset
  // keep this in sync; parseFloat drives the saved number.
  const [hoursText, setHoursText] = useState('8');
  const setHours = (n: number) => {
    const v = Math.max(0, Math.round(n * 100) / 100);
    setTsForm((f) => ({ ...f, hours_worked: v }));
    setHoursText(String(v));
  };
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  // Multi-select employees when LOGGING new hours (one row is inserted per
  // selected worker). Editing an existing entry stays single (tsForm.employee_id).
  const [tsEmpIds, setTsEmpIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const PAY_TYPE_OPTIONS = [
    { value: 'hourly', label: t.payTypes.hourly },
    { value: 'salary', label: t.payTypes.salary },
    { value: 'daily', label: t.payTypes.daily },
  ];

  // Labels used both for the `*` indicator on form fields and the "missing
  // required" error. first_name is omitted — it has its own dedicated error.
  const REQUIRED_FIELD_LABELS: Record<string, string> = {
    last_name: t.modal.lastNameLabel,
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
  const PAY_UNIT: Record<string, string> = {
    hourly: t.payRateUnit.hourly,
    salary: t.payRateUnit.salary,
    daily: t.payRateUnit.daily,
  };

  const fetchEmployees = (bid: string) =>
    fetchAllById<RawEmployee>((afterId, pageSize) => {
      let q = supabase.from('employees').select('*').eq('business_id', bid)
        .order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    });

  const loadEmployees = async () => {
    if (!business) return;
    const rows = await fetchEmployees(business.id);
    setEmployees(rows);
    // Persist for the next instant open (size-capped; trimmed automatically).
    void swrWrite(`employees_list_${business.id}`, rows);
  };
  // Cache-first: paint the last roster snapshot immediately on first mount.
  const empHydratedRef = useRef(false);
  useEffect(() => {
    if (!business || empHydratedRef.current) return;
    void swrRead<RawEmployee[]>(`employees_list_${business.id}`).then((hit) => {
      if (!hit || empHydratedRef.current) return;
      empHydratedRef.current = true;
      setEmployees((prev) => (prev.length > 0 ? prev : hit.data));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);
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
    const biz = business as {
      id: string;
      payroll_frequency?: string | null;
      payroll_anchor_date?: string | null;
      payroll_custom_days?: number | null;
    };
    const freq = normalizeFrequency(biz.payroll_frequency);
    const anchor = parsePayrollAnchor(biz.payroll_anchor_date);
    const customDays = biz.payroll_custom_days ?? null;
    const period = getPayrollPeriod(freq, new Date(), 0, anchor, customDays);
    setPayPeriodLabel(`${formatDateLong(period.startStr, locale)} – ${formatDateLong(period.endStr, locale)}`);
    // team_hour_totals RPC (migration 185): one scan replaces downloading the
    // roster + every timesheet/job in the period. The displayed hours are
    // config-free (timesheets + job crew hours + driver hours), so this is
    // exactly computePayrollRows' hour-attribution phase, server-side.
    const { data, error } = await supabase.rpc('team_hour_totals', {
      p_business_id: biz.id,
      p_start: period.startStr,
      p_end: period.endStr,
    });
    if (error) return; // offline / migration not run — keep previous totals
    setHourTotals(((data ?? []) as { employee_id: string; worker_name: string; hours: number | string }[])
      .map(r => ({ employeeId: r.employee_id, workerName: r.worker_name, hours: Number(r.hours) })));
  };

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('employee_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates(localizeTemplates((data ?? []) as FieldTemplate[], locale));
  };

  // Unified people view: employees + app accounts (business_members) + pending
  // invites. Shows the access badge (Increment 1) and auto-creates an employee
  // row for any app account that has none, so the list is always complete
  // (option B). The insert is best-effort — RLS rejects it for non-admins.
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

  // Reload on focus (not just mount) so employees added/edited on the
  // dedicated /nuevo and /[id] screens appear when the user navigates back.
  // Throttled: these are five whole-table reads — refreshing more than once
  // per few seconds (e.g. rapid tab switches) is pure waste.
  const lastFocusLoadRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusLoadRef.current < 3_000) return;
      lastFocusLoadRef.current = now;
      void loadPeople();
      void loadTimesheets();
      void loadHourTotals();
      void loadTemplates();
      if (business) fetchEmployeeLocations(supabase, business.id).then(setEmpLocations).catch(() => setEmpLocations([]));
    }, [business?.id, locale]),
  );

  const empList: EmployeeListItem[] = useMemo(
    () => {
      // Scope to the active branch (home or borrowed). "All" = no filter.
      const scoped = activeLocationId
        ? (() => {
            const ids = employeeIdsAtLocation(empLocations, activeLocationId);
            return employees.filter((e) => ids.has(e.id));
          })()
        : employees;
      return scoped.map((e) => {
        const access = resolveAccess({ userId: e.user_id ?? null, email: e.email }, members, invites);
        return {
          id: e.id,
          firstName: e.first_name,
          lastName: e.last_name,
          phone: e.phone,
          role: e.role,
          payType: e.pay_type,
          payRate: e.pay_rate ?? 0,
          active: e.active,
          access,
          // Every field value — categorical queries are the filter panel's job.
          searchExtra: [
            e.check_name ?? '', e.email ?? '', e.phone ?? '',
            e.address ?? '', e.city ?? '', e.state ?? '',
            ...Object.values((e.custom_fields ?? {}) as Record<string, string>),
          ].join(' '),
          overtimeEligible: e.pay_type === 'hourly' && ((e as { overtime_eligible?: boolean | null }).overtime_eligible ?? false),
          city: e.city,
          state: e.state,
          customFields: (e.custom_fields ?? {}) as Record<string, string>,
        };
      });
    },
    [employees, members, invites, activeLocationId, empLocations],
  );

  const tsList: TimesheetListItem[] = useMemo(
    () =>
      timesheets.map((ts) => ({
        id: ts.id,
        workerName: ts.worker_name,
        workDate: ts.work_date,
        hoursWorked: ts.hours_worked,
        jobDescription: ts.job_description,
        employeeId: ts.employee_id,
      })),
    [timesheets],
  );

  const toggleActive = async (id: string) => {
    const e = employees.find((emp) => emp.id === id);
    if (!e || !business) return;
    const nextActive = !e.active;
    await supabase.from('employees').update({ active: nextActive }).eq('id', e.id);
    void logEmployeeMilestone(supabase, {
      businessId: business.id,
      employeeId: e.id,
      eventType: nextActive ? 'rehired' : 'terminated',
      createdBy: user?.id ?? null,
    });
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === e.id ? { ...emp, active: nextActive } : emp)),
    );
  };

  // Bulk-delete selected employees. Removes their app-access membership first
  // (mirrors the single-delete), skips your own record, then the rows. Returns
  // false when cancelled so the list keeps its selection.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const bulkDeleteEmployees = (ids: string[]): Promise<boolean> => {
    if (!business || ids.length === 0) return Promise.resolve(false);
    // Never delete your own employee record from a bulk action.
    const toDelete = employees
      .filter((e) => ids.includes(e.id) && !(e.user_id && e.user_id === user?.id))
      .map((e) => e.id);
    if (toDelete.length === 0) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      Alert.alert('', t.confirmDeleteBulk.replace('{{count}}', String(toDelete.length)), [
        { text: tc.buttons.cancel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: t.bulkDelete,
          style: 'destructive',
          onPress: async () => {
            setBulkDeleting(true);
            const userIds = employees
              .filter((e) => toDelete.includes(e.id) && e.user_id)
              .map((e) => e.user_id as string);
            if (userIds.length) {
              await supabase.from('business_members').delete().eq('business_id', business.id).in('user_id', userIds);
            }
            for (let i = 0; i < toDelete.length; i += 50) {
              await supabase.from('employees').delete().in('id', toDelete.slice(i, i + 50));
            }
            await loadEmployees();
            await loadPeople();
            setBulkDeleting(false);
            resolve(true);
          },
        },
      ]);
    });
  };

  // Add + row taps both navigate to dedicated screens now (no in-list modal):
  // FAB → /nuevo (create form), row → /[id] (detail). The list reloads on
  // focus so changes made on those screens show up on return.
  const openAddEmp = () => router.push('/dashboard/mas/empleados/nuevo' as never);
  const openEditEmpById = (id: string) => router.push(`/dashboard/mas/empleados/${id}`);
  // Legacy edit-modal seed kept inline as dead code (the RNModal's
  // `visible` is gated on add mode below, so this isn't reached). Will
  // be cleaned up in a follow-up pass.
  const _legacyOpenEdit = (id: string) => {
    const e = employees.find((emp) => emp.id === id);
    if (!e) return;
    setSelEmpId(e.id);
    setEmpForm({
      first_name: e.first_name,
      last_name: e.last_name,
      phone: e.phone ?? '',
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
    setError('');
    // Row taps open the read-only detail view first; the user clicks the
    // pencil in the header to switch to the editable form.
    setEmpModal('view');
  };
  const saveEmp = async () => {
    if (!business) return;
    if (!empForm.first_name.trim()) {
      setError(t.modal.errorFirstNameRequired);
      return;
    }
    if (empForm.email.trim() && !isValidEmail(empForm.email)) {
      setError(tc.validation.invalidEmail);
      return;
    }
    // Honour the per-business required-field toggles from Ajustes → Equipo
    // (employee_field_required). first_name is enforced above to mirror the
    // DB NOT NULL constraint; everything else is opt-in.
    const fieldValues: Record<string, string> = {
      last_name: empForm.last_name,
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
      if (!reqFlags[key]) continue;
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
    setSaving(true);
    setError('');
    // pay_rate is a string in the form so the user can type "18." while still
    // mid-typing — parse it back to a number for the DB.
    const payRateNum = parseFloat(empForm.pay_rate) || 0;
    // Normalise empty-string dates → null so Postgres doesn't reject them.
    const payload = {
      ...empForm,
      pay_rate: payRateNum,
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
      const { data: created } = await supabase
        .from('employees')
        .insert({ ...payload, business_id: business.id })
        .select()
        .single();
      if (created) {
        // Seed the timeline with the hire so future entries have a baseline.
        void logEmployeeMilestone(supabase, {
          businessId: business.id,
          employeeId: created.id,
          eventType: 'hired',
          details: {
            role: empForm.role,
            pay_type: empForm.pay_type,
            rate: payRateNum,
          },
          createdBy: user?.id ?? null,
        });
      }
    } else if (selEmpId) {
      const prev = employees.find((e) => e.id === selEmpId);
      await supabase.from('employees').update(payload).eq('id', selEmpId);
      if (prev) {
        // Log each material diff as its own milestone (pay change AND role
        // change in one save → two entries). Phone/name edits don't log.
        const milestones = diffEmployeeChanges(
          { pay_rate: prev.pay_rate, pay_type: prev.pay_type, role: prev.role },
          { pay_rate: payRateNum, pay_type: empForm.pay_type, role: empForm.role },
        );
        for (const m of milestones) {
          void logEmployeeMilestone(supabase, {
            businessId: business.id,
            employeeId: selEmpId,
            eventType: m.eventType,
            details: m.details,
            createdBy: user?.id ?? null,
          });
        }
      }
    }
    await loadEmployees();
    setSaving(false);
    setEmpModal(null);
  };

  const openLogHours = () => {
    setTsForm(EMPTY_TS());
    setTsEmpIds([]);
    setHoursText('8');
    setError('');
    setTsModalOpen(true);
  };
  const saveTimesheet = async () => {
    if (!business) return;
    // Hours are always logged against a registered employee — no free-text
    // worker name. Require a selection before saving.
    // Edit → the one row's employee; new log → every selected worker.
    const saveIds = tsForm.id ? (tsForm.employee_id ? [tsForm.employee_id] : []) : tsEmpIds;
    if (saveIds.length === 0) {
      setError(t.timesheetModal.errorEmployeeRequired);
      return;
    }
    if (!tsForm.hours_worked) {
      setError(t.timesheetModal.errorHoursRequired);
      return;
    }
    const nameOf = (id: string) => {
      const emp = employees.find((e) => e.id === id);
      return emp ? `${emp.first_name} ${emp.last_name}` : '';
    };
    setSaving(true);
    setError('');
    // Editing an existing entry: straight update (offline queue is only for the
    // field-logging insert path). On failure, surface it like the insert path.
    if (tsForm.id) {
      const { error: upErr } = await supabase.from('timesheets').update({
        employee_id: tsForm.employee_id || null,
        worker_name: nameOf(tsForm.employee_id),
        work_date: tsForm.work_date,
        hours_worked: tsForm.hours_worked,
        job_description: tsForm.job_description || null,
      }).eq('id', tsForm.id);
      if (upErr) {
        setError(__DEV__ ? `No se pudo guardar: ${upErr.message}` : 'No se pudo guardar.');
        setSaving(false);
        return;
      }
      try { await loadTimesheets(); await loadHourTotals(); } catch { /* stale list reconciles on refetch */ }
      setSaving(false);
      setTsModalOpen(false);
      return;
    }
    // Only the WRITE failing counts as "couldn't save". The list reload is a
    // separate concern — a failed refresh must not masquerade as a save error
    // (it would lie to the user when the row actually landed / was queued).
    let queued = false;
    try {
      // queuedInsert writes through when online, or parks the entry in the
      // offline outbox (drained on reconnect) when there's no signal — crews
      // log hours in the field and it syncs later. The banner reports progress.
      // One row per selected worker, all sharing the date / hours / description.
      for (const eid of saveIds) {
        const nm = nameOf(eid);
        const res = await queuedInsert({
          table: 'timesheets',
          businessId: business.id,
          label: `Horas: ${nm || 'trabajador'} · ${tsForm.hours_worked} h`,
          payload: {
            // Client-generated id makes an offline retry idempotent (a re-send
            // after a lost ack collides instead of creating a duplicate timesheet).
            id: newUuid(),
            business_id: business.id,
            employee_id: eid || null,
            worker_name: nm,
            work_date: tsForm.work_date,
            hours_worked: tsForm.hours_worked,
            job_description: tsForm.job_description || null,
            status: 'completed',
          },
        });
        if (res.queued) queued = true;
      }
    } catch (err) {
      // Surface the real cause in dev so failures are diagnosable instead of a
      // blanket "couldn't save". Production keeps the friendly message.
      const msg = (err as { message?: string })?.message;
      setError(__DEV__ && msg ? `No se pudo guardar: ${msg}` : 'No se pudo guardar.');
      setSaving(false);
      return;
    }
    // Saved (or queued offline). Refresh the list when it actually hit the
    // server; a reload failure here is non-fatal — the write already succeeded.
    if (!queued) {
      try {
        await loadTimesheets();
        await loadHourTotals();
      } catch {
        /* stale list is fine; next focus/refetch reconciles it */
      }
    }
    setSaving(false);
    setTsModalOpen(false);
  };

  const editTimesheet = (id: string) => {
    const ts = timesheets.find((t) => t.id === id);
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
    setHoursText(ts.hours_worked != null ? String(ts.hours_worked) : '');
    setError('');
    setTsModalOpen(true);
  };

  const deleteTimesheet = async (id: string) => {
    const ok = await confirm({ message: t.deleteHoursConfirm, confirmText: tc.buttons.delete, destructive: true });
    if (!ok) return;
    const { error: delErr } = await supabase.from('timesheets').delete().eq('id', id);
    if (delErr) return;
    try { await loadTimesheets(); await loadHourTotals(); } catch { /* stale list reconciles on refetch */ }
  };

  // App-access management (invite / change role / remove) lives in the person
  // detail route — mas/empleados/[id].tsx — not here. This screen only needs
  // the access BADGE on each row, derived in loadPeople() from members+invites.
  const selEmp = selEmpId ? employees.find((e) => e.id === selEmpId) ?? null : null;

  const empModalTitle =
    empModal === 'add'
      ? t.modal.addTitle
      : empModal === 'view' && selEmp
      ? `${selEmp.first_name} ${selEmp.last_name}`.trim()
      : t.modal.editTitle;
  const selectedTsEmp = tsForm.employee_id
    ? employees.find((e) => e.id === tsForm.employee_id) ?? null
    : null;
  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const modalsSlot = (
    <>
      {/* Employee history (read-only timeline) */}
      <RNModal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setHistoryOpen(false)}
            style={sheetScrim}
          />
          <View
            className="bg-card rounded-3xl pt-3 mx-3 overflow-hidden"
            style={{ maxHeight: '85%', ...sheetShadow }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{t.history.title}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={8}>
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="px-5 py-5 pb-10">
              {selEmpId ? (
                <EmployeeHistoryView supabase={supabase} employeeId={selEmpId} />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </RNModal>

      {/* Log hours */}
      <RNModal
        visible={tsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTsModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 justify-end">
            <Pressable
              onPress={() => setTsModalOpen(false)}
              style={sheetScrim}
            />
            <View
              className="bg-card rounded-3xl pt-3 mx-3 overflow-hidden"
              style={{ maxHeight: '90%', ...sheetShadow }}
            >
              <View className="items-center mb-2">
                <View className="w-10 h-1 bg-border rounded-full" />
              </View>
              <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border-soft">
                <Text className="text-lg font-bold text-ink">{tsForm.id ? t.timesheetModal.editTitle : t.timesheetModal.title}</Text>
                <Pressable onPress={() => setTsModalOpen(false)} hitSlop={8}>
                  <X size={20} color={c.faint} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerClassName="px-5 py-5 pb-10 gap-3"
                keyboardShouldPersistTaps="handled"
              >
                {/* Employee picker — hours are always logged against a
                    registered employee (no free-text name). */}
                <View className="flex flex-col gap-2">
                  <Text className="text-sm font-semibold text-ink">
                    {t.timesheetModal.employeeLabel}
                  </Text>
                  <Pressable
                    onPress={() => { setEmpSearch(''); setEmpPickerOpen(true); }}
                    className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
                  >
                    <Text
                      className={`flex-1 text-base ${
                        (tsForm.id ? selectedTsEmp : tsEmpIds.length) ? 'text-ink' : 'text-faint'
                      }`}
                      numberOfLines={1}
                    >
                      {tsForm.id
                        ? (selectedTsEmp ? `${selectedTsEmp.first_name} ${selectedTsEmp.last_name}` : t.timesheetModal.selectEmployee)
                        : (tsEmpIds.length
                            ? activeEmployees.filter((e) => tsEmpIds.includes(e.id)).map((e) => `${e.first_name} ${e.last_name}`).join(', ')
                            : t.timesheetModal.selectEmployee)}
                    </Text>
                    <ChevronDown size={16} color={c.faint} />
                  </Pressable>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <DatePicker
                      label={t.timesheetModal.dateLabel}
                      value={tsForm.work_date}
                      onChange={(v) => setTsForm((f) => ({ ...f, work_date: v }))}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-ink mb-1.5">
                      {t.timesheetModal.hoursLabel}
                    </Text>
                    <View className="flex-row items-center rounded-xl border border-border bg-card overflow-hidden">
                      <Pressable
                        onPress={() => setHours((tsForm.hours_worked || 0) - 1)}
                        hitSlop={6}
                        className="h-[42px] w-11 items-center justify-center active:bg-surface border-r border-border-soft"
                      >
                        <Minus size={16} color={c.primary} />
                      </Pressable>
                      <TextInput
                        value={hoursText}
                        onChangeText={(v) => {
                          // Allow digits + a single decimal point while typing.
                          const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                          setHoursText(clean);
                          setTsForm((f) => ({ ...f, hours_worked: parseFloat(clean) || 0 }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder={t.timesheetModal.hoursPlaceholder}
                        placeholderTextColor={c.faint}
                        className="flex-1 text-center text-base font-semibold text-ink py-2.5"
                      />
                      <Pressable
                        onPress={() => setHours((tsForm.hours_worked || 0) + 1)}
                        hitSlop={6}
                        className="h-[42px] w-11 items-center justify-center active:bg-surface border-l border-border-soft"
                      >
                        <Plus size={16} color={c.primary} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <Input
                  label={t.timesheetModal.jobDescriptionLabel}
                  placeholder={t.timesheetModal.jobDescriptionPlaceholder}
                  value={tsForm.job_description}
                  onChangeText={(v) => setTsForm((f) => ({ ...f, job_description: v }))}
                />

                {error ? (
                  <Text className="text-xs text-red-500 mt-1">{error}</Text>
                ) : null}

                {/* Cancel lives as the header X; just the primary action here. */}
                <View className="pt-3">
                  <Button onPress={saveTimesheet} loading={saving} fullWidth>
                    {tc.buttons.save}
                  </Button>
                </View>
              </ScrollView>
            </View>

            {/* Employee picker — an in-modal overlay, NOT a nested <Modal>.
                iOS presents only one Modal at a time, so a picker modal opened
                from this sheet would silently fail to appear. Absolute overlay
                inside the same Modal avoids that. */}
            {empPickerOpen ? (
              <View
                className="justify-end"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              >
                <Pressable onPress={() => setEmpPickerOpen(false)} style={sheetScrim} />
                <View
                  className="bg-card rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
                  style={{ maxHeight: '70%', ...sheetShadow }}
                >
                  <View className="items-center mb-2">
                    <View className="w-10 h-1 bg-border rounded-full" />
                  </View>
                  <View className="flex-row items-center justify-between px-5 mb-3">
                    <Text className="text-base font-semibold text-ink">
                      {t.timesheetModal.employeeLabel}
                    </Text>
                    <Pressable onPress={() => setEmpPickerOpen(false)} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
                      <X size={22} color={c.faint} />
                    </Pressable>
                  </View>
                  <View className="px-5 mb-3">
                    <View className="flex-row items-center rounded-xl border border-border bg-card px-3">
                      <Search size={16} color={c.faint} />
                      <TextInput
                        value={empSearch}
                        onChangeText={setEmpSearch}
                        placeholder={t.timesheetModal.selectEmployee}
                        placeholderTextColor={c.faint}
                        className="flex-1 py-2.5 pl-2 text-sm text-ink"
                      />
                    </View>
                  </View>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {activeEmployees
                      .filter((e) =>
                        foldSearchText(`${e.first_name} ${e.last_name}`).includes(foldSearchText(empSearch.trim())),
                      )
                      .map((e) => {
                      // Editing → single pick (close on tap). Logging new hours →
                      // multi-select toggle so hours can be added to several at once.
                      const isSel = tsForm.id ? tsForm.employee_id === e.id : tsEmpIds.includes(e.id);
                      return (
                        <Pressable
                          key={e.id}
                          onPress={() => {
                            if (tsForm.id) {
                              setTsForm((f) => ({ ...f, employee_id: e.id }));
                              setEmpPickerOpen(false);
                            } else {
                              setTsEmpIds((prev) => (prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]));
                            }
                          }}
                          className={`flex-row items-center justify-between px-5 py-3.5 active:bg-surface ${
                            isSel ? 'bg-primary/5' : ''
                          }`}
                        >
                          <Text
                            className={`text-sm ${
                              isSel ? 'text-primary font-semibold' : 'text-ink'
                            }`}
                          >
                            {e.first_name} {e.last_name}
                          </Text>
                          {isSel ? <Check size={16} color={c.primary} /> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {!tsForm.id ? (
                    <View className="px-5 pt-3">
                      <Pressable
                        onPress={() => setEmpPickerOpen(false)}
                        className="py-3 rounded-2xl bg-primary items-center active:opacity-90"
                      >
                        <Text className="text-sm font-semibold text-white">
                          {tsEmpIds.length ? `${tc.buttons.done} (${tsEmpIds.length})` : tc.buttons.done}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </RNModal>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <LocationSwitcher />
      <EmployeesScreen
        customFieldDefs={templates.map((tpl) => ({
          key: tpl.field_key,
          label: tpl.field_label,
          multi:
            tpl.field_type === 'select' &&
            !!(tpl as { field_config?: { multi?: boolean } | null }).field_config?.multi,
          boolean: tpl.field_type === 'boolean',
        }))}
        employees={empList}
        timesheets={tsList}
        hourTotals={hourTotals}
        payPeriodLabel={payPeriodLabel}
        onAddEmployee={canCreateEmployee ? openAddEmp : undefined}
        onEditEmployee={openEditEmpById}
        onToggleActive={toggleActive}
        onLogHours={canLogHours ? openLogHours : undefined}
        onEditTimesheet={canEditEmployee ? editTimesheet : undefined}
        onDeleteTimesheet={canEditEmployee ? deleteTimesheet : undefined}
        onBulkDelete={can.deleteEmployee(currentRole) ? bulkDeleteEmployees : undefined}
        bulkDeleting={bulkDeleting}
        modalsSlot={modalsSlot}
      />
    </SafeAreaView>
  );
}

/**
 * Renders the right input for a given template field type. Values are
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

  if (template.field_type === 'date') {
    return <DatePicker label={label} value={value} onChange={onChange} />;
  }
  if (template.field_type === 'boolean') {
    // Three states — '', 'true', 'false'. Tapping the active button clears
    // it so the user can return to "unanswered" if they tapped by mistake.
    // This makes required-field validation meaningful (was: a toggle with no
    // distinct "No" answer).
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <View>
        <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-ink'}`}>
              {tc.states.yes}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-ink'}`}>
              {tc.states.no}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    return (
      <Select
        label={label}
        value={value}
        onValueChange={onChange}
        placeholder="—"
        options={[
          { value: '', label: '—' },
          ...template.field_options.map((o) => ({ value: o, label: o })),
        ]}
      />
    );
  }
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      keyboardType={template.field_type === 'number' ? 'decimal-pad' : 'default'}
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
    <View className="gap-0.5">
      <Text className="text-xs text-faint">{label}</Text>
      <Text className="text-sm text-ink">{value}</Text>
    </View>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ChevronDown, Check, DollarSign, X, Clock, UserX, UserCheck, Pencil } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput } from '@amixos/shared/lib/format';
import { Button, Input, Select, DatePicker } from '@amixos/shared/ui';
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
import { INVITABLE_ROLES, ROLE_LABELS, can, type Role } from '@amixos/shared/lib/permissions';

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
  employee_id: '',
  worker_name: '',
  work_date: new Date().toISOString().split('T')[0],
  hours_worked: 8,
  job_description: '',
});

export default function EmpleadosRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const insets = useSafeAreaInsets();

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
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
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
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // App-access controls inside the person modal (invite/role/revoke).
  const [accessRole, setAccessRole] = useState<Role>('office');
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');

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
    fetchAll<RawEmployee>((from, to) =>
      supabase.from('employees').select('*').eq('business_id', bid).order('first_name').range(from, to));

  const loadEmployees = async () => {
    if (!business) return;
    setEmployees(await fetchEmployees(business.id));
  };
  const loadTimesheets = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('timesheets')
      .select('*')
      .eq('business_id', business.id)
      .order('work_date', { ascending: false })
      .limit(50);
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
  useFocusEffect(
    useCallback(() => {
      void loadPeople();
      void loadTimesheets();
      void loadTemplates();
    }, [business?.id]),
  );

  const empList: EmployeeListItem[] = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        phone: e.phone,
        role: e.role,
        payType: e.pay_type,
        payRate: e.pay_rate,
        active: e.active,
        access: resolveAccess({ userId: e.user_id ?? null, email: e.email }, members, invites),
      })),
    [employees, members, invites],
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
    setAccessError('');
    setAccessRole('office');
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
    setError('');
    setTsModalOpen(true);
  };
  const saveTimesheet = async () => {
    if (!business) return;
    if (!tsForm.hours_worked) {
      setError(t.timesheetModal.errorHoursRequired);
      return;
    }
    const emp = tsForm.employee_id
      ? employees.find((e) => e.id === tsForm.employee_id)
      : null;
    const name = emp ? `${emp.first_name} ${emp.last_name}` : tsForm.worker_name;
    setSaving(true);
    setError('');
    await supabase.from('timesheets').insert({
      business_id: business.id,
      employee_id: tsForm.employee_id || null,
      worker_name: name,
      work_date: tsForm.work_date,
      hours_worked: tsForm.hours_worked,
      job_description: tsForm.job_description || null,
      status: 'completed',
    });
    await loadTimesheets();
    setSaving(false);
    setTsModalOpen(false);
  };

  // ─── App access (invite / change role / revoke / remove) ───────────────
  // Managed straight from the person modal. RLS is the real lock; these
  // controls only show for owner/admin. Each action reloads the unified
  // people view so the badge reflects the new state.
  const confirmAsync = (title: string, confirmLabel: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(title, undefined, [
        { text: tc.buttons.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

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

  const revokeInvite = async (inviteId: string, email: string) => {
    if (!(await confirmAsync(teamT.confirmRevoke.replace('{{email}}', email), teamT.revokeBtn))) return;
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
    const m = members.find((x) => x.id === memberId);
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
    const m = members.find((x) => x.id === memberId);
    if (!m || !business) return;
    if (!(await confirmAsync(teamT.confirmRemove.replace('{{name}}', m.displayName ?? m.email ?? ''), teamT.removeBtn))) return;
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

  const selEmp = selEmpId ? employees.find((e) => e.id === selEmpId) ?? null : null;
  const selAccess = selEmp
    ? resolveAccess({ userId: selEmp.user_id ?? null, email: selEmp.email }, members, invites)
    : null;
  const canManageAccess = can.manageMembers(currentRole);

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
            className="bg-white rounded-3xl pt-3 mx-3 overflow-hidden"
            style={{ maxHeight: '85%', ...sheetShadow }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
              <Text className="text-lg font-bold text-gray-900">{t.history.title}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={8}>
                <X size={20} color="#9CA3AF" />
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
              className="bg-white rounded-3xl pt-3 mx-3 overflow-hidden"
              style={{ maxHeight: '90%', ...sheetShadow }}
            >
              <View className="items-center mb-2">
                <View className="w-10 h-1 bg-gray-200 rounded-full" />
              </View>
              <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-900">{t.timesheetModal.title}</Text>
                <Pressable onPress={() => setTsModalOpen(false)} hitSlop={8}>
                  <X size={20} color="#9CA3AF" />
                </Pressable>
              </View>
              <ScrollView
                contentContainerClassName="px-5 py-5 pb-10 gap-3"
                keyboardShouldPersistTaps="handled"
              >
                {/* Employee picker (or manual name fallback) */}
                <View className="flex flex-col gap-2">
                  <Text className="text-sm font-semibold text-gray-700">
                    {t.timesheetModal.employeeLabel}
                  </Text>
                  <Pressable
                    onPress={() => setEmpPickerOpen(true)}
                    className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5"
                  >
                    <Text
                      className={`flex-1 text-base ${
                        selectedTsEmp ? 'text-gray-900' : 'text-gray-400'
                      }`}
                      numberOfLines={1}
                    >
                      {selectedTsEmp
                        ? `${selectedTsEmp.first_name} ${selectedTsEmp.last_name}`
                        : t.timesheetModal.employeeManualOption}
                    </Text>
                    <ChevronDown size={16} color="#9CA3AF" />
                  </Pressable>
                </View>

                {!tsForm.employee_id ? (
                  <Input
                    label={t.timesheetModal.workerNameLabel}
                    placeholder={t.timesheetModal.workerNamePlaceholder}
                    value={tsForm.worker_name}
                    onChangeText={(v) => setTsForm((f) => ({ ...f, worker_name: v }))}
                  />
                ) : null}

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <DatePicker
                      label={t.timesheetModal.dateLabel}
                      value={tsForm.work_date}
                      onChange={(v) => setTsForm((f) => ({ ...f, work_date: v }))}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      {t.timesheetModal.hoursLabel}
                    </Text>
                    <TextInput
                      value={tsForm.hours_worked ? String(tsForm.hours_worked) : ''}
                      onChangeText={(v) =>
                        setTsForm((f) => ({ ...f, hours_worked: parseFloat(v) || 0 }))
                      }
                      keyboardType="decimal-pad"
                      placeholder={t.timesheetModal.hoursPlaceholder}
                      placeholderTextColor="#9CA3AF"
                      className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-base text-gray-900"
                    />
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

                <View className="flex-row gap-3 pt-3">
                  <View className="flex-1">
                    <Button variant="secondary" onPress={() => setTsModalOpen(false)} fullWidth>
                      {tc.buttons.cancel}
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button onPress={saveTimesheet} loading={saving} fullWidth>
                      {tc.buttons.save}
                    </Button>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Employee picker for the timesheet modal */}
      <RNModal
        visible={empPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmpPickerOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setEmpPickerOpen(false)}
            style={sheetScrim}
          />
          <View
            className="bg-white rounded-3xl pt-3 pb-6 mx-3 overflow-hidden"
            style={{ maxHeight: '70%', ...sheetShadow }}
          >
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="px-5 mb-3">
              <Text className="text-base font-semibold text-gray-900">
                {t.timesheetModal.employeeLabel}
              </Text>
            </View>
            <ScrollView>
              <Pressable
                onPress={() => {
                  setTsForm((f) => ({ ...f, employee_id: '' }));
                  setEmpPickerOpen(false);
                }}
                className="flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50"
              >
                <Text
                  className={`text-sm ${
                    !tsForm.employee_id ? 'text-primary font-semibold' : 'text-gray-500'
                  }`}
                >
                  {t.timesheetModal.employeeManualOption}
                </Text>
                {!tsForm.employee_id ? <Check size={16} color="#4F46E5" /> : null}
              </Pressable>
              {activeEmployees.map((e) => {
                const isSel = tsForm.employee_id === e.id;
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => {
                      setTsForm((f) => ({ ...f, employee_id: e.id }));
                      setEmpPickerOpen(false);
                    }}
                    className={`flex-row items-center justify-between px-5 py-3.5 active:bg-gray-50 ${
                      isSel ? 'bg-primary/5' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSel ? 'text-primary font-semibold' : 'text-gray-900'
                      }`}
                    >
                      {e.first_name} {e.last_name}
                    </Text>
                    {isSel ? <Check size={16} color="#4F46E5" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <EmployeesScreen
        employees={empList}
        timesheets={tsList}
        onAddEmployee={openAddEmp}
        onEditEmployee={openEditEmpById}
        onToggleActive={toggleActive}
        onLogHours={openLogHours}
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
        <Text className="text-sm font-semibold text-gray-700 mb-2">{label}</Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-gray-700'}`}>
              {tc.states.yes}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-gray-700'}`}>
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
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="text-sm text-gray-900">{value}</Text>
    </View>
  );
}

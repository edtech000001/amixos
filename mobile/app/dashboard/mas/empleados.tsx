import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, Check, DollarSign, X, Clock } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { isValidEmail } from '@amixos/shared/lib/validation';
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

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
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
  pay_rate: number;
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
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;

  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);

  const [empModal, setEmpModal] = useState<'add' | 'edit' | null>(null);
  const [selEmpId, setSelEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<EmpForm>(EMPTY_EMP);
  const [tsModalOpen, setTsModalOpen] = useState(false);
  const [tsForm, setTsForm] = useState<TsForm>(EMPTY_TS);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PAY_TYPE_OPTIONS = [
    { value: 'hourly', label: t.payTypes.hourly },
    { value: 'salary', label: t.payTypes.salary },
    { value: 'daily', label: t.payTypes.daily },
  ];
  const PAY_UNIT: Record<string, string> = {
    hourly: t.payRateUnit.hourly,
    salary: t.payRateUnit.salary,
    daily: t.payRateUnit.daily,
  };

  const loadEmployees = async () => {
    if (!business) return;
    const businessId = business.id;
    const data = await fetchAll<RawEmployee>((from, to) =>
      supabase
        .from('employees')
        .select('*')
        .eq('business_id', businessId)
        .order('first_name')
        .range(from, to));
    setEmployees(data);
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

  useEffect(() => {
    void loadEmployees();
    void loadTimesheets();
    void loadTemplates();
  }, [business?.id]);

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
      })),
    [employees],
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

  const openAddEmp = () => {
    setSelEmpId(null);
    setEmpForm(EMPTY_EMP);
    setError('');
    setEmpModal('add');
  };
  const openEditEmpById = (id: string) => {
    const e = employees.find((emp) => emp.id === id);
    if (!e) return;
    setSelEmpId(e.id);
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
    setError('');
    setEmpModal('edit');
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
    setSaving(true);
    setError('');
    // Normalise empty-string dates → null so Postgres doesn't reject them.
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
            rate: empForm.pay_rate,
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
          { pay_rate: empForm.pay_rate, pay_type: empForm.pay_type, role: empForm.role },
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

  const empModalTitle = empModal === 'add' ? t.modal.addTitle : t.modal.editTitle;
  const selectedTsEmp = tsForm.employee_id
    ? employees.find((e) => e.id === tsForm.employee_id) ?? null
    : null;
  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const modalsSlot = (
    <>
      {/* Add / edit employee */}
      <RNModal
        visible={empModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEmpModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Backdrop sits BEHIND the sheet so its Pressable doesn't eat the
             ScrollView's pan gestures. The previous nested-Pressable layout
             only let you scroll after focusing an input. */}
          <View className="flex-1 justify-end">
            <Pressable
              onPress={() => setEmpModal(null)}
              className="absolute inset-0 bg-black/40"
            />
            <View
              className="bg-white rounded-t-3xl pt-3"
              style={{ maxHeight: '90%' }}
            >
              <View className="items-center mb-2">
                <View className="w-10 h-1 bg-gray-200 rounded-full" />
              </View>
              <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-900">{empModalTitle}</Text>
                <Pressable onPress={() => setEmpModal(null)} hitSlop={8}>
                  <X size={20} color="#9CA3AF" />
                </Pressable>
              </View>
              <ScrollView
                contentContainerClassName="px-5 py-5 pb-10 gap-4"
                keyboardShouldPersistTaps="handled"
              >
                {/* Basic info */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t.modal.basicInfoHeading}
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label={t.modal.firstNameLabel}
                      placeholder={t.modal.firstNamePlaceholder}
                      value={empForm.first_name}
                      onChangeText={(v) => setEmpForm((f) => ({ ...f, first_name: v }))}
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      label={t.modal.lastNameLabel}
                      placeholder={t.modal.lastNamePlaceholder}
                      value={empForm.last_name}
                      onChangeText={(v) => setEmpForm((f) => ({ ...f, last_name: v }))}
                    />
                  </View>
                </View>
                <Input
                  label={t.modal.phoneLabel}
                  placeholder={t.modal.phonePlaceholder}
                  value={empForm.phone}
                  onChangeText={(v) => setEmpForm((f) => ({ ...f, phone: v }))}
                  keyboardType="phone-pad"
                />
                <Input
                  label={t.modal.emailLabel}
                  placeholder={t.modal.emailPlaceholder}
                  value={empForm.email}
                  onChangeText={(v) => setEmpForm((f) => ({ ...f, email: v }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                {/* Employment + pay */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">
                  {t.modal.employmentHeading}
                </Text>
                <DatePicker
                  label={t.modal.hireDateLabel}
                  value={empForm.hire_date}
                  onChange={(v) => setEmpForm((f) => ({ ...f, hire_date: v }))}
                />
                <View>
                  <Select
                    label={t.modal.payTypeLabel}
                    value={empForm.pay_type}
                    onValueChange={(v) => setEmpForm((f) => ({ ...f, pay_type: v }))}
                    options={PAY_TYPE_OPTIONS}
                  />
                </View>
                <View>
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    {t.modal.payRateLabel.replace(
                      '{{unit}}',
                      PAY_UNIT[empForm.pay_type] ?? PAY_UNIT.hourly,
                    )}
                  </Text>
                  <View className="flex-row items-center rounded-2xl border border-gray-200 bg-white px-4">
                    <DollarSign size={16} color="#9CA3AF" />
                    <TextInput
                      value={empForm.pay_rate ? String(empForm.pay_rate) : ''}
                      onChangeText={(v) =>
                        setEmpForm((f) => ({ ...f, pay_rate: parseFloat(v) || 0 }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      className="flex-1 py-3.5 pl-2 text-base text-gray-900"
                    />
                  </View>
                </View>

                {/* Personal */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">
                  {t.modal.personalHeading}
                </Text>
                <DatePicker
                  label={t.modal.birthdayLabel}
                  value={empForm.birthday}
                  onChange={(v) => setEmpForm((f) => ({ ...f, birthday: v }))}
                />
                <Input
                  label={t.modal.addressLabel}
                  placeholder={t.modal.addressPlaceholder}
                  value={empForm.address}
                  onChangeText={(v) => setEmpForm((f) => ({ ...f, address: v }))}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label={t.modal.cityLabel}
                      placeholder={t.modal.cityPlaceholder}
                      value={empForm.city}
                      onChangeText={(v) => setEmpForm((f) => ({ ...f, city: v }))}
                    />
                  </View>
                  <View style={{ width: 100 }}>
                    <Select
                      label={t.modal.stateLabel}
                      value={empForm.state}
                      onValueChange={(v) => setEmpForm((f) => ({ ...f, state: v }))}
                      placeholder={t.modal.stateNone}
                      options={[
                        { value: '', label: t.modal.stateNone },
                        ...US_STATES.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </View>
                  <View style={{ width: 90 }}>
                    <Input
                      label={t.modal.zipLabel}
                      placeholder={t.modal.zipPlaceholder}
                      value={empForm.zip_code}
                      onChangeText={(v) => setEmpForm((f) => ({ ...f, zip_code: v }))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                {/* Emergency contact */}
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">
                  {t.modal.emergencyContactHeading}
                </Text>
                <Input
                  label={t.modal.emergencyNameLabel}
                  placeholder={t.modal.emergencyNamePlaceholder}
                  value={empForm.emergency_contact_name}
                  onChangeText={(v) =>
                    setEmpForm((f) => ({ ...f, emergency_contact_name: v }))
                  }
                />
                <Input
                  label={t.modal.emergencyPhoneLabel}
                  placeholder={t.modal.emergencyPhonePlaceholder}
                  value={empForm.emergency_contact_phone}
                  onChangeText={(v) =>
                    setEmpForm((f) => ({ ...f, emergency_contact_phone: v }))
                  }
                  keyboardType="phone-pad"
                />

                {/* Custom fields (rendered from templates table) */}
                {templates.length > 0 ? (
                  <>
                    <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">
                      {t.modal.customFieldsHeading}
                    </Text>
                    {templates.map((tpl) => (
                      <CustomFieldInput
                        key={tpl.id}
                        template={tpl}
                        value={empForm.custom_fields[tpl.field_key] ?? ''}
                        onChange={(v) =>
                          setEmpForm((f) => ({
                            ...f,
                            custom_fields: { ...f.custom_fields, [tpl.field_key]: v },
                          }))
                        }
                      />
                    ))}
                  </>
                ) : null}

                {error ? (
                  <Text className="text-xs text-red-500 mt-1">{error}</Text>
                ) : null}

                {/* Historial — only available on edit (need an existing
                    employee id to query against). */}
                {empModal === 'edit' && selEmpId ? (
                  <Pressable
                    onPress={() => setHistoryOpen(true)}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-gray-50 active:bg-gray-100 mt-1"
                  >
                    <Clock size={16} color="#4F46E5" />
                    <Text className="text-sm font-semibold text-primary">
                      {t.history.openBtn}
                    </Text>
                  </Pressable>
                ) : null}

                <View className="flex-row gap-3 pt-3">
                  <View className="flex-1">
                    <Button variant="secondary" onPress={() => setEmpModal(null)} fullWidth>
                      {tc.buttons.cancel}
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button onPress={saveEmp} loading={saving} fullWidth>
                      {tc.buttons.save}
                    </Button>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </RNModal>

      {/* Employee history (read-only timeline) */}
      <RNModal
        visible={historyOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <View
            className="bg-white rounded-t-3xl pt-3"
            style={{ maxHeight: '85%' }}
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
        animationType="slide"
        onRequestClose={() => setTsModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View className="flex-1 justify-end">
            <Pressable
              onPress={() => setTsModalOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            <View
              className="bg-white rounded-t-3xl pt-3"
              style={{ maxHeight: '90%' }}
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
        animationType="slide"
        onRequestClose={() => setEmpPickerOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setEmpPickerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <View
            className="bg-white rounded-t-3xl pt-3 pb-8"
            style={{ maxHeight: '70%' }}
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
  const label = template.required ? `${template.field_label} *` : template.field_label;

  if (template.field_type === 'date') {
    return <DatePicker label={label} value={value} onChange={onChange} />;
  }
  if (template.field_type === 'boolean') {
    const on = value === 'true';
    return (
      <View className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
        <Text className="text-base text-gray-900 flex-1">{label}</Text>
        <Pressable
          onPress={() => onChange(on ? 'false' : 'true')}
          className={`w-12 h-7 rounded-full ${on ? 'bg-primary' : 'bg-gray-200'} justify-center px-1`}
        >
          <View
            className={`w-5 h-5 rounded-full bg-white ${on ? 'self-end' : 'self-start'}`}
          />
        </Pressable>
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

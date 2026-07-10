// New employee screen (mobile). Routed at /dashboard/mas/empleados/nuevo so
// the add flow is a real page (back button, consistent with the detail
// screen) instead of the old in-list modal. Saved via the full-width button
// at the end of the form, per the one-hand bottom-placement convention.

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, DollarSign } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { setEmployeePrimaryLocation } from '@amixos/shared/lib/locations';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { usStateName } from '@amixos/shared/lib/usStates';
import { formatPhoneInput } from '@amixos/shared/lib/format';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Button, Input, Select, DatePicker, Toggle } from '@amixos/shared/ui';
import { logEmployeeMilestone } from '@amixos/shared/lib/employeeHistory';
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

interface EmpForm {
  first_name: string;
  last_name: string;
  check_name: string;
  phone: string;
  role: string;
  pay_type: string;
  pay_rate: string;
  overtime_eligible: boolean;
  overtime_threshold: string;
  overtime_multiplier: string;
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

const EMPTY_EMP: EmpForm = {
  first_name: '',
  last_name: '',
  check_name: '',
  phone: '',
  // Hidden from the form — app-user RBAC lives in Ajustes → Equipo. Default
  // stays 'worker' so existing DB checks/queries still pass.
  role: 'worker',
  pay_type: 'hourly',
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
  custom_fields: {},
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function NuevoEmpleadoRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user, locations, activeLocationId } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;

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

  // Per-field show/hide (Ajustes → Empleados eye toggles). first/last name
  // can never be hidden.
  const hidden = parseHiddenFields(business?.employee_field_hidden);
  const fHidden = (key: string) =>
    !EMPLOYEE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);

  const [form, setForm] = useState<EmpForm>(EMPTY_EMP);
  // Home branch — set on the person, defaulting to the active branch so most
  // hires need no extra tap. Lending lives in Ajustes → Ubicaciones.
  const [homeLocation, setHomeLocation] = useState<string>(activeLocationId ?? '');
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Custom fields grouped by section, in the saved layout order.
  const empLayout = useMemo(() => {
    const standardKeys = EMPLOYEE_FIELD_SECTIONS.flatMap(s => EMPLOYEE_SECTION_FIELDS[s]);
    const allKeys = [...standardKeys, ...templates.map(t => `custom:${t.id}`)];
    return parseEmployeeLayout(business?.employee_field_layout, allKeys);
  }, [business?.employee_field_layout, templates]);
  const customFieldsFor = (section: EmployeeFieldSection): FieldTemplate[] =>
    employeeFieldsInSection(empLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => templates.find(t => `custom:${t.id}` === k))
      .filter((t): t is FieldTemplate => !!t);

  // Bilingual section headers (data-driven layout).
  const sectionLabel: Record<EmployeeFieldSection, string> = {
    general: 'General',
    contact: locale === 'es' ? 'Contacto' : 'Contact',
    employment: locale === 'es' ? 'Empleo' : 'Employment',
    location: locale === 'es' ? 'Ubicación' : 'Location',
    emergency: locale === 'es' ? 'Emergencia' : 'Emergency',
    additional: locale === 'es' ? 'Detalles adicionales' : 'Additional details',
  };

  // Full-width JSX for one built-in field key.
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return (
          <Input key={key} label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder}
            value={form.first_name} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
        );
      case 'last_name':
        return (
          <Input key={key} label={rLabel('last_name', t.modal.lastNameLabel)} placeholder={t.modal.lastNamePlaceholder}
            value={form.last_name} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
        );
      case 'check_name':
        return (
          <Input key={key} label={rLabel('check_name', t.modal.checkNameLabel)} placeholder={t.modal.checkNamePlaceholder}
            hint={t.modal.checkNameHint}
            value={form.check_name} onChangeText={(v) => setForm((f) => ({ ...f, check_name: v }))} />
        );
      case 'phone':
        return (
          <Input key={key} label={rLabel('phone', t.modal.phoneLabel)} placeholder={t.modal.phonePlaceholder}
            value={formatPhoneInput(form.phone)}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" />
        );
      case 'email':
        return (
          <Input key={key} label={rLabel('email', t.modal.emailLabel)} placeholder={t.modal.emailPlaceholder}
            value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address" autoCapitalize="none" />
        );
      case 'hire_date':
        return (
          <DatePicker key={key} label={rLabel('hire_date', t.modal.hireDateLabel)} value={form.hire_date}
            onChange={(v) => setForm((f) => ({ ...f, hire_date: v }))} />
        );
      case 'pay_type':
        return (
          <Select key={key} label={rLabel('pay_type', t.modal.payTypeLabel)} value={form.pay_type}
            onValueChange={(v) => setForm((f) => ({ ...f, pay_type: v }))}
            options={PAY_TYPE_OPTIONS} />
        );
      case 'pay_rate':
        return (
          <View key={key}>
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              {rLabel('pay_rate', t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[form.pay_type] ?? PAY_UNIT.hourly))}
            </Text>
            <View className="flex-row items-center rounded-2xl border border-gray-200 bg-white px-4">
              <DollarSign size={16} color="#9CA3AF" />
              <Input
                containerClassName="flex-1 ml-2"
                placeholder="0.00"
                value={form.pay_rate}
                onChangeText={(v) => setForm((f) => ({ ...f, pay_rate: v }))}
                keyboardType="decimal-pad"
              />
            </View>
            {/* Overtime — hardcoded companion of the pay rate (hourly only). */}
            {form.pay_type === 'hourly' ? (
              <View className="mt-3 gap-2">
                <Pressable
                  onPress={() => setForm(f => ({ ...f, overtime_eligible: !f.overtime_eligible }))}
                  className="flex-row items-center justify-between"
                >
                  <Text className="text-sm font-medium text-gray-700">{t.modal.overtimeLabel}</Text>
                  <View className={`w-11 h-6 rounded-full px-0.5 justify-center ${form.overtime_eligible ? 'bg-primary' : 'bg-gray-200'}`}>
                    <View className={`w-5 h-5 rounded-full bg-white ${form.overtime_eligible ? 'self-end' : 'self-start'}`} />
                  </View>
                </Pressable>
                {form.overtime_eligible ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-xs text-gray-500 mb-1">{t.modal.overtimeThresholdLabel}</Text>
                      <TextInput
                        value={form.overtime_threshold}
                        onChangeText={v => setForm(f => ({ ...f, overtime_threshold: v.replace(/[^0-9.]/g, '') }))}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs text-gray-500 mb-1">{t.modal.overtimeMultiplierLabel}</Text>
                      <TextInput
                        value={form.overtime_multiplier}
                        onChangeText={v => setForm(f => ({ ...f, overtime_multiplier: v.replace(/[^0-9.]/g, '') }))}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      case 'birthday':
        return (
          <DatePicker key={key} label={rLabel('birthday', t.modal.birthdayLabel)} value={form.birthday}
            onChange={(v) => setForm((f) => ({ ...f, birthday: v }))} />
        );
      case 'address':
        return (
          <Input key={key} label={rLabel('address', t.modal.addressLabel)} placeholder={t.modal.addressPlaceholder}
            value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
        );
      case 'city':
        return (
          <Input key={key} label={rLabel('city', t.modal.cityLabel)} placeholder={t.modal.cityPlaceholder}
            value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
        );
      case 'state':
        return (
          <Select key={key} label={rLabel('state', t.modal.stateLabel)} value={form.state}
            onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
            placeholder={t.modal.stateNone}
            searchable
            options={[{ value: '', label: t.modal.stateNone }, ...US_STATES.map((s) => ({ value: s, label: usStateName(s, locale) }))]} />
        );
      case 'zip_code':
        return (
          <Input key={key} label={rLabel('zip_code', t.modal.zipLabel)} placeholder={t.modal.zipPlaceholder}
            value={form.zip_code} onChangeText={(v) => setForm((f) => ({ ...f, zip_code: v.replace(/[^0-9]/g, '').slice(0, 5) }))}
            keyboardType="number-pad" />
        );
      case 'emergency_contact_name':
        return (
          <Input key={key} label={rLabel('emergency_contact_name', t.modal.emergencyNameLabel)} placeholder={t.modal.emergencyNamePlaceholder}
            value={form.emergency_contact_name}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_name: v }))} />
        );
      case 'emergency_contact_phone':
        return (
          <Input key={key} label={rLabel('emergency_contact_phone', t.modal.emergencyPhoneLabel)} placeholder={t.modal.emergencyPhonePlaceholder}
            value={formatPhoneInput(form.emergency_contact_phone)}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" />
        );
      default:
        return null;
    }
  };

  // Data-driven render of every section: built-in (gated by fHidden) + custom
  // fields in saved layout order. Sections with no visible field are skipped.
  const renderSection = (section: EmployeeFieldSection): React.ReactNode => {
    const keys = employeeFieldsInSection(empLayout, section);
    const visibleKeys = keys.filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
    if (visibleKeys.length === 0) return null;
    return (
      <View key={section}>
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">{sectionLabel[section]}</Text>
        <View className="bg-white rounded-2xl border border-gray-100 p-4 gap-4">
          {visibleKeys.map(k => {
            if (k.startsWith('custom:')) {
              const tpl = templates.find(tp => `custom:${tp.id}` === k);
              return tpl ? (
                <CustomFieldInput
                  key={tpl.id}
                  template={tpl}
                  value={form.custom_fields[tpl.field_key] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [tpl.field_key]: v } }))}
                />
              ) : null;
            }
            return renderField(k);
          })}
        </View>
      </View>
    );
  };

  useEffect(() => {
    if (!business) return;
    (async () => {
      const { data } = await supabase
        .from('employee_field_templates')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order');
      setTemplates((data ?? []) as FieldTemplate[]);
    })();
  }, [business?.id]);

  // Default the home branch once locations load (active branch, else default).
  useEffect(() => {
    if (homeLocation || locations.length === 0) return;
    setHomeLocation(activeLocationId ?? '');
  }, [locations, activeLocationId]);

  const goBack = () => router.replace('/dashboard/mas/empleados' as never);

  // Guard the back arrow + hardware back when the form has been touched.
  const dirty = useDirty(form, true);
  const { confirmLeave: confirmBack, unsavedSheet } = useUnsavedGuard({ dirty, onLeave: goBack });

  const save = async () => {
    if (!business) return;
    if (!form.first_name.trim()) {
      setError(t.modal.errorFirstNameRequired);
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      setError(tc.validation.invalidEmail);
      return;
    }
    // Honour the per-business required-field toggles from Ajustes → Equipo
    // (employee_field_required). first_name is enforced above to mirror the
    // DB NOT NULL constraint; everything else is opt-in.
    const fieldValues: Record<string, string> = {
      last_name: form.last_name,
      check_name: form.check_name,
      phone: form.phone,
      email: form.email,
      birthday: form.birthday,
      hire_date: form.hire_date,
      pay_type: form.pay_type,
      pay_rate: form.pay_rate,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
    };
    const missing: string[] = [];
    for (const [key, label] of Object.entries(REQUIRED_FIELD_LABELS)) {
      if (!reqFlags[key] || fHidden(key)) continue;
      const v = fieldValues[key];
      if (!v || !v.trim()) missing.push(label);
    }
    for (const tpl of templates) {
      if (tpl.required && !form.custom_fields[tpl.field_key]?.trim()) {
        missing.push(tpl.field_label);
      }
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      return;
    }
    setSaving(true);
    setError('');
    // pay_rate is a string in the form so the user can type "18." while
    // mid-typing — parse it back to a number for the DB. Empty-string dates
    // normalise to null so Postgres doesn't reject them.
    const payRateNum = parseFloat(form.pay_rate) || 0;
    const { data: created, error: insErr } = await supabase
      .from('employees')
      .insert({
        ...form,
        business_id: business.id,
        pay_rate: payRateNum,
        overtime_threshold: form.overtime_threshold.trim() === '' ? null : parseFloat(form.overtime_threshold) || 0,
        overtime_multiplier: form.overtime_multiplier.trim() === '' ? null : parseFloat(form.overtime_multiplier) || 1,
        check_name: form.check_name.trim() || null,
        birthday: form.birthday || null,
        hire_date: form.hire_date || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
        zip_code: form.zip_code.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      })
      .select()
      .single();
    if (insErr || !created) {
      setSaving(false);
      setError(insErr?.message ?? t.modal.requiredError.replace('{{fields}}', ''));
      return;
    }
    // Assign the home branch picked in the form (no-op for single-location).
    if (homeLocation) await setEmployeePrimaryLocation(supabase, business.id, created.id, homeLocation);
    // Seed the timeline with the hire so future entries have a baseline.
    void logEmployeeMilestone(supabase, {
      businessId: business.id,
      employeeId: created.id,
      eventType: 'hired',
      details: { role: form.role, pay_type: form.pay_type, rate: payRateNum },
      createdBy: user?.id ?? null,
    });
    goBack();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={confirmBack} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-gray-900">{t.modal.addTitle}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-32 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          {EMPLOYEE_FIELD_SECTIONS.map(renderSection)}

          {/* Home branch — multi-location businesses only. */}
          {locations.length >= 2 ? (
            <View>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">{locale === 'en' ? 'Home location' : 'Ubicación principal'}</Text>
              <View className="bg-white rounded-2xl border border-gray-100 p-4">
                <Select
                  value={homeLocation}
                  onValueChange={setHomeLocation}
                  options={[{ value: '', label: locale === 'en' ? 'No location' : 'Sin ubicación' }, ...locations.map(l => ({ value: l.id, label: l.name }))]}
                />
              </View>
            </View>
          ) : null}

          {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <View className="pt-1">
            <Button onPress={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {unsavedSheet}
    </SafeAreaView>
  );
}

function CustomFieldInput({
  template, value, onChange,
}: { template: FieldTemplate; value: string; onChange: (v: string) => void }) {
  const tc = useLang().t.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;
  const cfg = parseFieldConfig(template.field_config);
  if (template.field_type === 'note') {
    // Long free text — multiline, grows with content.
    return (
      <View>
        <Text className="text-sm font-semibold text-gray-700 mb-2">{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          numberOfLines={4}
          placeholderTextColor="#9CA3AF"
          className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[90px]"
          style={{ textAlignVertical: 'top' }}
        />
      </View>
    );
  }
  if (template.field_type === 'date') {
    return <DatePicker label={label} value={value} onChange={onChange} />;
  }
  if (template.field_type === 'boolean') {
    // Two buttons (Yes / No), three states '' | 'true' | 'false' — nothing is
    // pre-selected so a required field forces a pick. Tapping active clears it.
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <View>
        <Text className="text-sm font-semibold text-gray-700 mb-2">{label}</Text>
        <View className="flex-row gap-2">
          <Pressable onPress={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}>
            <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-gray-700'}`}>{tc.states.yes}</Text>
          </Pressable>
          <Pressable onPress={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}>
            <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-gray-700'}`}>{tc.states.no}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <View>
          <Text className="text-sm font-semibold text-gray-700 mb-2">{label}</Text>
          <View className="flex-row flex-wrap gap-2">
            {template.field_options.map((o) => {
              const on = selected.includes(o);
              return (
                <Pressable
                  key={o}
                  onPress={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary/10' : 'border-gray-200 bg-white'}`}
                >
                  <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-gray-600'}`}>{o}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <Select
        label={label}
        value={value}
        onValueChange={onChange}
        placeholder="—"
        options={[{ value: '', label: '—' }, ...template.field_options.map((o) => ({ value: o, label: o }))]}
      />
    );
  }
  const isNumber = template.field_type === 'number';
  return (
    <Input
      label={label}
      value={isNumber && cfg.thousands ? groupNumberString(value) : value}
      onChangeText={(v) => onChange(isNumber ? sanitizeNumberInput(v, cfg.integerOnly) : v)}
      keyboardType={isNumber ? (cfg.integerOnly ? 'number-pad' : 'decimal-pad') : 'default'}
    />
  );
}

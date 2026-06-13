// New employee screen (mobile). Routed at /dashboard/mas/empleados/nuevo so
// the add flow is a real page (back button, consistent with the detail
// screen) instead of the old in-list modal. Saved via the full-width button
// at the end of the form, per the one-hand bottom-placement convention.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
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
import { createSupabaseClient } from '@/lib/supabase';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput } from '@amixos/shared/lib/format';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Button, Input, Select, DatePicker, Toggle } from '@amixos/shared/ui';
import { logEmployeeMilestone } from '@amixos/shared/lib/employeeHistory';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface EmpForm {
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  pay_type: string;
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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function NuevoEmpleadoRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, user } = useApp();
  const { t: full } = useLang();
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

  const [form, setForm] = useState<EmpForm>(EMPTY_EMP);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const goBack = () => router.replace('/dashboard/mas/empleados' as never);

  // Guard the back arrow + hardware back when the form has been touched.
  const dirty = useDirty(form, true);
  const confirmBack = useUnsavedGuard({ dirty, onLeave: goBack });

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
      if (!reqFlags[key]) continue;
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
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.basicInfoHeading}</Text>
          <Input label={`${t.modal.firstNameLabel} *`} placeholder={t.modal.firstNamePlaceholder}
            value={form.first_name} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
          <Input label={rLabel('last_name', t.modal.lastNameLabel)} placeholder={t.modal.lastNamePlaceholder}
            value={form.last_name} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
          <Input label={rLabel('phone', t.modal.phoneLabel)} placeholder={t.modal.phonePlaceholder}
            value={formatPhoneInput(form.phone)}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" />
          <Input label={rLabel('email', t.modal.emailLabel)} placeholder={t.modal.emailPlaceholder}
            value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address" autoCapitalize="none" />

          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.employmentHeading}</Text>
          <DatePicker label={rLabel('hire_date', t.modal.hireDateLabel)} value={form.hire_date}
            onChange={(v) => setForm((f) => ({ ...f, hire_date: v }))} />
          <Select label={rLabel('pay_type', t.modal.payTypeLabel)} value={form.pay_type}
            onValueChange={(v) => setForm((f) => ({ ...f, pay_type: v }))}
            options={PAY_TYPE_OPTIONS} />
          <View>
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
          </View>

          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.personalHeading}</Text>
          <DatePicker label={rLabel('birthday', t.modal.birthdayLabel)} value={form.birthday}
            onChange={(v) => setForm((f) => ({ ...f, birthday: v }))} />
          <Input label={rLabel('address', t.modal.addressLabel)} placeholder={t.modal.addressPlaceholder}
            value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
          <Input label={rLabel('city', t.modal.cityLabel)} placeholder={t.modal.cityPlaceholder}
            value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
          <Select label={rLabel('state', t.modal.stateLabel)} value={form.state}
            onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
            placeholder={t.modal.stateNone}
            options={[{ value: '', label: t.modal.stateNone }, ...US_STATES.map((s) => ({ value: s, label: s }))]} />
          <Input label={rLabel('zip_code', t.modal.zipLabel)} placeholder={t.modal.zipPlaceholder}
            value={form.zip_code} onChangeText={(v) => setForm((f) => ({ ...f, zip_code: v }))}
            keyboardType="number-pad" />

          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.emergencyContactHeading}</Text>
          <Input label={rLabel('emergency_contact_name', t.modal.emergencyNameLabel)} placeholder={t.modal.emergencyNamePlaceholder}
            value={form.emergency_contact_name}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_name: v }))} />
          <Input label={rLabel('emergency_contact_phone', t.modal.emergencyPhoneLabel)} placeholder={t.modal.emergencyPhonePlaceholder}
            value={formatPhoneInput(form.emergency_contact_phone)}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" />

          {templates.length > 0 ? (
            <>
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.customFieldsHeading}</Text>
              {templates.map((tpl) => (
                <CustomFieldInput
                  key={tpl.id}
                  template={tpl}
                  value={form.custom_fields[tpl.field_key] ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, custom_fields: { ...f.custom_fields, [tpl.field_key]: v } }))}
                />
              ))}
            </>
          ) : null}

          {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <View className="pt-1">
            <Button onPress={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CustomFieldInput({
  template, value, onChange,
}: { template: FieldTemplate; value: string; onChange: (v: string) => void }) {
  const label = template.required ? `${template.field_label} *` : template.field_label;
  if (template.field_type === 'date') {
    return <DatePicker label={label} value={value} onChange={onChange} />;
  }
  if (template.field_type === 'boolean') {
    const on = value === 'true';
    return (
      <View className="flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
        <Text className="text-base text-gray-900 flex-1">{label}</Text>
        <Toggle value={on} onValueChange={(v) => onChange(v ? 'true' : 'false')} />
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
        options={[{ value: '', label: '—' }, ...template.field_options.map((o) => ({ value: o, label: o }))]}
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

import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Building2, Phone, Mail, MapPin } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { isValidEmail } from '../../lib/validation';
import { usStateName } from '../../lib/usStates';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Select, type SelectOption } from '../../ui/Select';
import { DatePicker } from '../../ui/DatePicker';

export interface ClientFieldTemplate {
  // Optional on the RN variant (web uses it to map saved field layout →
  // `custom:<id>`); kept optional so existing mobile callers stay valid.
  id?: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
}

export interface ClientFormValues {
  first_name: string;
  last_name: string;
  company: string;
  phone_cell: string;
  phone_office: string;
  email_office: string;
  email_home: string;
  address: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  notes: string;
  custom_fields: Record<string, string>;
}

const EMPTY: ClientFormValues = {
  first_name: '', last_name: '', company: '',
  phone_cell: '', phone_office: '',
  email_office: '', email_home: '',
  address: '', address_line2: '', city: '', state: '', zip_code: '',
  notes: '',
  custom_fields: {},
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function fmtPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export interface ClientFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: Partial<ClientFormValues>;
  templates: ClientFieldTemplate[];
  /** Field-keyed map of `required` flags pulled from business config. */
  requiredFlags: Record<string, boolean>;
  /** Field-keyed map of hidden flags (web variant only). */
  hiddenFlags?: Record<string, boolean> | null;
  /** Saved per-field layout (web variant only). */
  fieldLayout?: { key: string; section: string }[] | null;
  saving: boolean;
  error: string;
  /** Multi-branch businesses only: branches to offer + current selection.
   *  (Consumed by the web variant; mobile uses its own full-screen form.) */
  branchOptions?: { id: string; name: string }[];
  branchIds?: string[];
  onToggleBranch?: (id: string) => void;
  onClose: () => void;
  onSubmit: (values: ClientFormValues) => Promise<void> | void;
}

export function ClientFormModal({
  open,
  mode,
  initial,
  templates,
  requiredFlags,
  saving,
  error,
  onClose,
  onSubmit,
}: ClientFormModalProps) {
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.clients;
  const tc = full.common;

  const [form, setForm] = useState<ClientFormValues>(EMPTY);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...initial, custom_fields: { ...(initial?.custom_fields ?? {}) } });
      setEmailError('');
    }
  }, [open, initial]);

  // Validate optional emails before handing off to the caller's onSubmit.
  const submit = () => {
    for (const em of [form.email_office, form.email_home]) {
      if (em.trim() && !isValidEmail(em)) { setEmailError(tc.validation.invalidEmail); return; }
    }
    setEmailError('');
    onSubmit(form);
  };

  const isReq = (key: string) => !!requiredFlags[key];
  const rLabel = (key: string, base: string) => (isReq(key) ? `${base} *` : base);
  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setForm(f => ({ ...f, [key]: value }));
  const setCustom = (key: string, val: string) =>
    setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));

  const stateOptions: SelectOption[] = [
    { value: '', label: '—' },
    ...US_STATES.map(s => ({ value: s, label: usStateName(s, locale) })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'add' ? t.modal.addTitle : t.modal.editTitle}
      size="lg"
    >
      <View className="gap-5 pb-2">
        {/* Basic info */}
        <View>
          <Text className="text-xs font-semibold text-faint uppercase mb-3">
            {t.sections.basicInfo}
          </Text>
          <View className="flex-col gap-3">
            <Input
              label={rLabel('first_name', t.fields.firstName)}
              placeholder={t.fields.placeholders.firstName}
              value={form.first_name}
              onChangeText={v => set('first_name', v)}
            />
            <Input
              label={rLabel('last_name', t.fields.lastName)}
              placeholder={t.fields.placeholders.lastName}
              value={form.last_name}
              onChangeText={v => set('last_name', v)}
            />
            <Input
              label={rLabel('company', t.fields.company)}
              placeholder={t.fields.placeholders.company}
              value={form.company}
              onChangeText={v => set('company', v)}
              leftIcon={<Building2 size={15} color={c.faint} />}
            />
          </View>
        </View>

        {/* Phones */}
        <View>
          <Text className="text-xs font-semibold text-faint uppercase mb-3">
            {t.sections.phones}
          </Text>
          <View className="flex-col gap-3">
            <Input
              label={rLabel('phone_cell', t.fields.phoneCell)}
              placeholder={t.fields.placeholders.phone}
              value={fmtPhoneInput(form.phone_cell)}
              onChangeText={v => set('phone_cell', fmtPhoneInput(v))}
              keyboardType="phone-pad"
              leftIcon={<Phone size={15} color={c.faint} />}
            />
            <Input
              label={rLabel('phone_office', t.fields.phoneOffice)}
              placeholder={t.fields.placeholders.phone}
              value={fmtPhoneInput(form.phone_office)}
              onChangeText={v => set('phone_office', fmtPhoneInput(v))}
              keyboardType="phone-pad"
              leftIcon={<Phone size={15} color={c.faint} />}
            />
          </View>
        </View>

        {/* Emails */}
        <View>
          <Text className="text-xs font-semibold text-faint uppercase mb-3">
            {t.sections.emails}
          </Text>
          <View className="flex-col gap-3">
            <Input
              label={rLabel('email_office', t.fields.emailOffice)}
              placeholder={t.fields.placeholders.emailOffice}
              value={form.email_office}
              onChangeText={v => set('email_office', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={15} color={c.faint} />}
            />
            <Input
              label={rLabel('email_home', t.fields.emailHome)}
              placeholder={t.fields.placeholders.emailHome}
              value={form.email_home}
              onChangeText={v => set('email_home', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={15} color={c.faint} />}
            />
          </View>
        </View>

        {/* Address */}
        <View>
          <Text className="text-xs font-semibold text-faint uppercase mb-3">
            {t.sections.address}
          </Text>
          <View className="flex-col gap-3">
            <Input
              label={rLabel('address', t.fields.addressLine1)}
              placeholder={t.fields.placeholders.address}
              value={form.address}
              onChangeText={v => set('address', v)}
              leftIcon={<MapPin size={15} color={c.faint} />}
            />
            <Input
              label={t.fields.addressLine2}
              placeholder={t.fields.placeholders.addressLine2}
              value={form.address_line2}
              onChangeText={v => set('address_line2', v)}
            />
            <Input
              label={rLabel('city', t.fields.city)}
              placeholder={t.fields.placeholders.city}
              value={form.city}
              onChangeText={v => set('city', v)}
            />
            <Select
              label={rLabel('state', t.fields.state)}
              value={form.state}
              onValueChange={v => set('state', v)}
              options={stateOptions}
              searchable
            />
            <Input
              label={rLabel('zip_code', t.fields.zipCode)}
              placeholder={t.fields.placeholders.zipCode}
              value={form.zip_code}
              onChangeText={v => set('zip_code', v.replace(/[^0-9]/g, '').slice(0, 5))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Custom fields */}
        {templates.length > 0 ? (
          <View>
            <Text className="text-xs font-semibold text-faint uppercase mb-3">
              {t.sections.customFields}
            </Text>
            <View className="flex-col gap-3">
              {templates.map(tpl => {
                const value = form.custom_fields[tpl.field_key] ?? '';
                const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;

                if (tpl.field_type === 'select' && tpl.field_options) {
                  return (
                    <Select
                      key={tpl.field_key}
                      label={labelText}
                      value={value}
                      onValueChange={v => setCustom(tpl.field_key, v)}
                      options={[
                        { value: '', label: '—' },
                        ...tpl.field_options.map(o => ({ value: o, label: o })),
                      ]}
                    />
                  );
                }
                if (tpl.field_type === 'boolean') {
                  // Three states — '', 'true', 'false'. Tapping active clears.
                  const yesActive = value === 'true';
                  const noActive = value === 'false';
                  return (
                    <View key={tpl.field_key}>
                      <Text className="text-sm font-semibold text-ink mb-2">{labelText}</Text>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => setCustom(tpl.field_key, yesActive ? '' : 'true')}
                          className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                        >
                          <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-ink'}`}>
                            {tc.states.yes}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setCustom(tpl.field_key, noActive ? '' : 'false')}
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
                if (tpl.field_type === 'date') {
                  return (
                    <DatePicker
                      key={tpl.field_key}
                      label={labelText}
                      value={value}
                      onChange={v => setCustom(tpl.field_key, v)}
                    />
                  );
                }
                return (
                  <Input
                    key={tpl.field_key}
                    label={labelText}
                    value={value}
                    onChangeText={v => setCustom(tpl.field_key, v)}
                    keyboardType={tpl.field_type === 'number' ? 'numeric' : 'default'}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Notes */}
        <View>
          <Text className="text-xs font-semibold text-faint uppercase mb-3">
            {t.sections.notes}
          </Text>
          <View className="rounded-xl border border-border bg-card px-4 py-1">
            <TextInput
              multiline
              numberOfLines={3}
              placeholder={t.fields.placeholders.notes}
              placeholderTextColor={c.faint}
              value={form.notes}
              onChangeText={v => set('notes', v)}
              className="text-sm text-ink py-2"
              style={{ textAlignVertical: 'top', minHeight: 60 }}
            />
          </View>
        </View>

        {(emailError || error) ? <Text className="text-xs text-red-500">{emailError || error}</Text> : null}

        <View className="flex-row gap-3 pt-1">
          <View className="flex-1">
            <Button variant="secondary" onPress={onClose} fullWidth>
              {tc.buttons.cancel}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              onPress={submit}
              loading={saving}
              fullWidth
            >
              {t.modal.saveBtn}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

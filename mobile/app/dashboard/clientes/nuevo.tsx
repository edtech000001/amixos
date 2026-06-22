import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDirty, useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Building2, Phone, Mail, MapPin } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { Input, Select, DatePicker } from '@amixos/shared/ui';
import type { SelectOption } from '@amixos/shared/ui';
import { triggerGoogleSyncOrThrow } from '@amixos/shared/lib/googleSync';
import { queuedInsert } from '@/lib/offline/mutate';
import { prependCached, writeCached } from '@/lib/offline/cache';
import { newUuid } from '@/lib/offline/ids';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { usStateName } from '@amixos/shared/lib/usStates';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

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

const fmtPhoneInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">{title}</Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

export default function NuevoClienteRoute() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const syncBanner = useGoogleSyncBanner();
  const { t: full, locale } = useLang();
  const t = full.dashboard.clients;
  const tc = full.common;

  const editId = edit ?? null;
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [phoneCell, setPhoneCell] = useState('');
  const [phoneOffice, setPhoneOffice] = useState('');
  const [emailOffice, setEmailOffice] = useState('');
  const [emailHome, setEmailHome] = useState('');
  const [address, setAddress] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      const { data: tpl } = await supabase
        .from('client_field_templates')
        .select('*')
        .eq('business_id', business.id)
        .order('sort_order');
      if (cancelled) return;
      setTemplates((tpl as FieldTemplate[] | null) ?? []);

      if (editId) {
        const { data: c } = await supabase.from('clients').select('*').eq('id', editId).single();
        if (cancelled || !c) {
          setLoadingEdit(false);
          return;
        }
        setFirstName(c.first_name ?? '');
        setLastName(c.last_name ?? '');
        setCompany(c.company ?? '');
        setPhoneCell(c.phone_cell ?? c.phone ?? '');
        setPhoneOffice(c.phone_office ?? '');
        setEmailOffice(c.email_office ?? c.email ?? '');
        setEmailHome(c.email_home ?? '');
        setAddress(c.address ?? '');
        setAddressLine2(c.address_line2 ?? '');
        setCity(c.city ?? '');
        setState(c.state ?? '');
        setZipCode(c.zip_code ?? '');
        setNotes(c.notes ?? '');
        setCustomFields(c.custom_fields ?? {});
        setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, editId]);

  const requiredFlags = business?.client_field_required ?? {};

  const fieldLabels: Record<string, string> = useMemo(
    () => ({
      first_name: t.fields.firstName,
      last_name: t.fields.lastName,
      company: t.fields.company,
      phone_cell: t.fields.phoneCell,
      phone_office: t.fields.phoneOffice,
      email_office: t.fields.emailOffice,
      email_home: t.fields.emailHome,
      address: t.fields.addressLine1,
      city: t.fields.city,
      state: t.fields.state,
      zip_code: t.fields.zipCode,
    }),
    [t],
  );

  const isReq = (key: string) => !!requiredFlags[key];
  const rLabel = (key: string, base: string) => (isReq(key) ? `${base} *` : base);

  const stateOptions: SelectOption[] = [
    { value: '', label: '—' },
    ...US_STATES.map(s => ({ value: s, label: usStateName(s, locale) })),
  ];

  const goBack = () => {
    if (editId) router.replace(`/dashboard/clientes/${editId}` as never);
    else router.replace('/dashboard/clientes' as never);
  };

  // Unsaved-changes guard on the back arrow + hardware back. `values` holds
  // every editable field; the snapshot is taken once data has loaded (edit)
  // or at mount (new), so untouched forms never prompt.
  const dirty = useDirty(
    {
      firstName, lastName, company, phoneCell, phoneOffice, emailOffice,
      emailHome, address, addressLine2, city, state, zipCode, notes, customFields,
    },
    !loadingEdit,
  );
  const { confirmLeave: confirmBack, unsavedSheet } = useUnsavedGuard({ dirty, onLeave: goBack });

  const save = async () => {
    if (!business) return;
    setSaving(true);
    setError('');

    // Validate required fields
    const values: Record<string, string> = {
      first_name: firstName,
      last_name: lastName,
      company,
      phone_cell: phoneCell,
      phone_office: phoneOffice,
      email_office: emailOffice,
      email_home: emailHome,
      address,
      city,
      state,
      zip_code: zipCode,
    };
    const missing: string[] = [];
    for (const key of Object.keys(fieldLabels)) {
      if (!isReq(key)) continue;
      const v = values[key];
      if (!v || !v.trim()) missing.push(fieldLabels[key]);
    }
    for (const tpl of templates) {
      if (tpl.required && !customFields[tpl.field_key]?.trim()) {
        missing.push(tpl.field_label);
      }
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      setSaving(false);
      return;
    }

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company: company.trim() || null,
      phone_cell: phoneCell.trim() || null,
      phone_office: phoneOffice.trim() || null,
      email_office: emailOffice.trim() || null,
      email_home: emailHome.trim() || null,
      address: address.trim() || null,
      address_line2: addressLine2.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip_code: zipCode.trim() || null,
      notes: notes.trim() || null,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    };

    if (editId) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', editId);
      if (e) {
        setError(t.modal.saveError);
        setSaving(false);
        return;
      }
      void (async () => {
        const apiBaseUrl = getApiBaseUrl();
        const jwt = await getJwt();
        if (!apiBaseUrl || !jwt) return;
        triggerGoogleSyncOrThrow('update', editId, { apiBaseUrl, jwt })
          .catch(() => syncBanner.reportError('No se pudo actualizar el contacto en Google Contacts.'));
      })();
      router.replace(`/dashboard/clientes/${editId}` as never);
    } else {
      // Client-generated id so creating works offline (and we can navigate /
      // sync to it immediately). queuedInsert writes through online, or parks it
      // in the outbox offline.
      const newId = newUuid();
      const row = { ...payload, id: newId, business_id: business.id };
      const label = `${payload.first_name} ${payload.last_name}`.trim() || payload.company || 'Cliente';
      let queued = false;
      try {
        const res = await queuedInsert({ table: 'clients', payload: row, businessId: business.id, label: `Cliente: ${label}` });
        queued = res.queued;
      } catch {
        setError(t.modal.saveError);
        setSaving(false);
        return;
      }
      if (queued) {
        // Offline: show it in the cached list AND seed its detail cache so it's
        // openable offline; it syncs on reconnect.
        void prependCached(`clients_list_${business.id}`, row);
        void writeCached(`client_${newId}`, row);
        router.replace('/dashboard/clientes' as never);
      } else {
        void (async () => {
          const apiBaseUrl = getApiBaseUrl();
          const jwt = await getJwt();
          if (!apiBaseUrl || !jwt) return;
          triggerGoogleSyncOrThrow('create', newId, { apiBaseUrl, jwt })
            .catch(() => syncBanner.reportError('No se pudo agregar el contacto a Google Contacts.'));
        })();
        router.replace(`/dashboard/clientes/${newId}` as never);
      }
    }
  };

  if (loadingEdit) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center" edges={['top']}>
        <ActivityIndicator color="#4F46E5" />
      </SafeAreaView>
    );
  }

  const heading = editId ? t.modal.editTitle : t.modal.addTitle;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={confirmBack} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <View className="ml-2 flex-1">
          <Text className="text-lg font-bold text-gray-900">{heading}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerClassName="px-5 pt-5 pb-32"
          keyboardShouldPersistTaps="handled"
        >
          <Section title={t.sections.basicInfo}>
            <Input
              label={rLabel('first_name', t.fields.firstName)}
              placeholder={t.fields.placeholders.firstName}
              value={firstName}
              onChangeText={setFirstName}
            />
            <Input
              label={rLabel('last_name', t.fields.lastName)}
              placeholder={t.fields.placeholders.lastName}
              value={lastName}
              onChangeText={setLastName}
            />
            <Input
              label={rLabel('company', t.fields.company)}
              placeholder={t.fields.placeholders.company}
              value={company}
              onChangeText={setCompany}
              leftIcon={<Building2 size={15} color="#9CA3AF" />}
            />
          </Section>

          <Section title={t.sections.phones}>
            <Input
              label={rLabel('phone_cell', t.fields.phoneCell)}
              placeholder={t.fields.placeholders.phone}
              value={fmtPhoneInput(phoneCell)}
              onChangeText={v => setPhoneCell(fmtPhoneInput(v))}
              keyboardType="phone-pad"
              leftIcon={<Phone size={15} color="#9CA3AF" />}
            />
            <Input
              label={rLabel('phone_office', t.fields.phoneOffice)}
              placeholder={t.fields.placeholders.phone}
              value={fmtPhoneInput(phoneOffice)}
              onChangeText={v => setPhoneOffice(fmtPhoneInput(v))}
              keyboardType="phone-pad"
              leftIcon={<Phone size={15} color="#9CA3AF" />}
            />
          </Section>

          <Section title={t.sections.emails}>
            <Input
              label={rLabel('email_office', t.fields.emailOffice)}
              placeholder={t.fields.placeholders.emailOffice}
              value={emailOffice}
              onChangeText={setEmailOffice}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={15} color="#9CA3AF" />}
            />
            <Input
              label={rLabel('email_home', t.fields.emailHome)}
              placeholder={t.fields.placeholders.emailHome}
              value={emailHome}
              onChangeText={setEmailHome}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={15} color="#9CA3AF" />}
            />
          </Section>

          <Section title={t.sections.address}>
            <Input
              label={rLabel('address', t.fields.addressLine1)}
              placeholder={t.fields.placeholders.address}
              value={address}
              onChangeText={setAddress}
              leftIcon={<MapPin size={15} color="#9CA3AF" />}
            />
            <Input
              label={t.fields.addressLine2}
              placeholder={t.fields.placeholders.addressLine2}
              value={addressLine2}
              onChangeText={setAddressLine2}
            />
            <Input
              label={rLabel('city', t.fields.city)}
              placeholder={t.fields.placeholders.city}
              value={city}
              onChangeText={setCity}
            />
            <Select
              label={rLabel('state', t.fields.state)}
              value={state}
              onValueChange={setState}
              options={stateOptions}
              searchable
            />
            <Input
              label={rLabel('zip_code', t.fields.zipCode)}
              placeholder={t.fields.placeholders.zipCode}
              value={zipCode}
              onChangeText={v => setZipCode(v.replace(/[^0-9]/g, '').slice(0, 5))}
              keyboardType="number-pad"
            />
          </Section>

          {templates.length > 0 ? (
            <Section title={t.sections.customFields}>
              {templates.map(tpl => {
                const value = customFields[tpl.field_key] ?? '';
                const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;
                const setVal = (v: string) =>
                  setCustomFields(prev => ({ ...prev, [tpl.field_key]: v }));

                if (tpl.field_type === 'select' && tpl.field_options) {
                  return (
                    <Select
                      key={tpl.field_key}
                      label={labelText}
                      value={value}
                      onValueChange={setVal}
                      options={[
                        { value: '', label: '—' },
                        ...tpl.field_options.map(o => ({ value: o, label: o })),
                      ]}
                    />
                  );
                }
                if (tpl.field_type === 'boolean') {
                  // Three states — '', 'true', 'false'. Tapping active button
                  // clears so user can return to "unanswered".
                  const yesActive = value === 'true';
                  const noActive = value === 'false';
                  return (
                    <View key={tpl.field_key}>
                      <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => setVal(yesActive ? '' : 'true')}
                          className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}`}
                        >
                          <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-gray-700'}`}>
                            {tc.states.yes}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setVal(noActive ? '' : 'false')}
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
                if (tpl.field_type === 'date') {
                  return (
                    <DatePicker
                      key={tpl.field_key}
                      label={labelText}
                      value={value}
                      onChange={setVal}
                    />
                  );
                }
                return (
                  <Input
                    key={tpl.field_key}
                    label={labelText}
                    value={value}
                    onChangeText={setVal}
                    keyboardType={tpl.field_type === 'number' ? 'numeric' : 'default'}
                  />
                );
              })}
            </Section>
          ) : null}

          <Section title={t.sections.notes}>
            <View className="rounded-xl border border-gray-200 bg-white px-4 py-1">
              <TextInput
                multiline
                numberOfLines={3}
                placeholder={t.fields.placeholders.notes}
                placeholderTextColor="#9CA3AF"
                value={notes}
                onChangeText={setNotes}
                className="text-sm text-gray-900 py-2"
                style={{ textAlignVertical: 'top', minHeight: 60 }}
              />
            </View>
          </Section>

          {error ? <Text className="text-xs text-red-500 mb-2">{error}</Text> : null}

          {/* Save — last element of the form so it's where the thumb lands
             after filling the final field. */}
          <Pressable
            onPress={save}
            disabled={saving}
            className={`mt-2 items-center py-3.5 rounded-2xl ${
              saving ? 'bg-primary/50' : 'bg-primary active:opacity-80'
            }`}
          >
            <Text className="text-base font-semibold text-white">
              {saving ? '…' : tc.buttons.save}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      {unsavedSheet}
    </SafeAreaView>
  );
}

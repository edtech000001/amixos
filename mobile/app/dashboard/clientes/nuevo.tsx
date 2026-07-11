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
import { triggerGoogleSyncOrThrow, googleSyncErrorMessage } from '@amixos/shared/lib/googleSync';
import { queuedInsert } from '@/lib/offline/mutate';
import { prependCached, writeCached } from '@/lib/offline/cache';
import { newUuid } from '@/lib/offline/ids';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { usStateName } from '@amixos/shared/lib/usStates';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { groupNumberString, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import {
  CLIENT_FIELD_SECTIONS,
  CLIENT_FIELDS_ALWAYS_SHOWN,
  CLIENT_SECTION_FIELDS,
  parseClientLayout,
  clientFieldsInSection,
  type ClientFieldSection,
} from '@amixos/shared/lib/clientFieldSections';

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

const fmtPhoneInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-xs font-semibold text-gray-400 uppercase mb-3 px-1">{title}</Text>
      <View className="bg-white rounded-2xl border border-gray-100 p-4 gap-3">{children}</View>
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
  const [priceTierId, setPriceTierId] = useState('');
  const [priceTiers, setPriceTiers] = useState<{ id: string; name: string }[]>([]);
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
        setPriceTierId((c as { price_tier_id?: string | null }).price_tier_id ?? '');
        setCustomFields(c.custom_fields ?? {});
        setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, editId]);

  useEffect(() => {
    if (!business) return;
    void supabase.from('price_tiers').select('id, name').eq('business_id', business.id).order('sort_order')
      .then(({ data }: { data: { id: string; name: string }[] | null }) => setPriceTiers(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

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

  // Per-field show/hide (Ajustes → Clientes eye toggles). Always-shown fields
  // (first/last name) can never be hidden.
  const hidden = parseHiddenFields(business?.client_field_hidden);
  const fHidden = (key: string) =>
    !CLIENT_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);

  // Custom fields grouped by section, in the saved layout order.
  const clientLayout = useMemo(() => {
    const standardKeys = CLIENT_FIELD_SECTIONS.flatMap(s => CLIENT_SECTION_FIELDS[s]);
    const allKeys = [...standardKeys, ...templates.map(t => `custom:${t.id}`)];
    return parseClientLayout(business?.client_field_layout, allKeys);
  }, [business?.client_field_layout, templates]);
  const customFieldsFor = (section: ClientFieldSection): FieldTemplate[] =>
    clientFieldsInSection(clientLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => templates.find(t => `custom:${t.id}` === k))
      .filter((t): t is FieldTemplate => !!t);

  // Render one custom field input (mirrors the previous flat-map renderer).
  const renderCustomField = (tpl: FieldTemplate) => {
    const value = customFields[tpl.field_key] ?? '';
    const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;
    const cfg = parseFieldConfig(tpl.field_config);
    const setVal = (v: string) =>
      setCustomFields(prev => ({ ...prev, [tpl.field_key]: v }));

    if (tpl.field_type === 'note') {
      // Long free text — multiline, grows with content.
      return (
        <View key={tpl.field_key}>
          <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
          <TextInput
            value={value}
            onChangeText={setVal}
            multiline
            numberOfLines={4}
            placeholderTextColor="#9CA3AF"
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[90px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      );
    }
    if (tpl.field_type === 'select' && tpl.field_options) {
      // Multi-select: chips, value stored comma-joined ("A, B") so display
      // paths read naturally. Single-select keeps the dropdown.
      if (cfg.multi) {
        const selected = splitMultiValue(value);
        return (
          <View key={tpl.field_key}>
            <Text className="text-sm font-semibold text-gray-700 mb-2">{labelText}</Text>
            <View className="flex-row flex-wrap gap-2">
              {tpl.field_options.map(o => {
                const on = selected.includes(o);
                return (
                  <Pressable
                    key={o}
                    onPress={() => setVal(toggleMultiOption(value, o))}
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
      return <DatePicker key={tpl.field_key} label={labelText} value={value} onChange={setVal} />;
    }
    const isNumber = tpl.field_type === 'number';
    return (
      <Input
        key={tpl.field_key}
        label={labelText}
        value={isNumber && cfg.thousands ? groupNumberString(value) : value}
        onChangeText={v => setVal(isNumber ? sanitizeNumberInput(v, cfg.integerOnly) : v)}
        keyboardType={isNumber ? (cfg.integerOnly ? 'number-pad' : 'numeric') : 'default'}
      />
    );
  };

  const stateOptions: SelectOption[] = [
    { value: '', label: '—' },
    ...US_STATES.map(s => ({ value: s, label: usStateName(s, locale) })),
  ];

  // Bilingual section headers (data-driven layout). General stays "General".
  const sectionLabel: Record<ClientFieldSection, string> = {
    general: 'General',
    contact: locale === 'es' ? 'Contacto' : 'Contact',
    location: locale === 'es' ? 'Ubicación' : 'Location',
    notes: locale === 'es' ? 'Notas' : 'Notes',
    additional: locale === 'es' ? 'Detalles adicionales' : 'Additional details',
  };

  // Full-width JSX for one built-in field key. address renders with its
  // address_line2 companion row directly beneath it.
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return (
          <Input
            key={key}
            label={rLabel('first_name', t.fields.firstName)}
            placeholder={t.fields.placeholders.firstName}
            value={firstName}
            onChangeText={setFirstName}
          />
        );
      case 'last_name':
        return (
          <Input
            key={key}
            label={rLabel('last_name', t.fields.lastName)}
            placeholder={t.fields.placeholders.lastName}
            value={lastName}
            onChangeText={setLastName}
          />
        );
      case 'company':
        return (
          <Input
            key={key}
            label={rLabel('company', t.fields.company)}
            placeholder={t.fields.placeholders.company}
            value={company}
            onChangeText={setCompany}
            leftIcon={<Building2 size={15} color="#9CA3AF" />}
          />
        );
      case 'phone_cell':
        return (
          <Input
            key={key}
            label={rLabel('phone_cell', t.fields.phoneCell)}
            placeholder={t.fields.placeholders.phone}
            value={fmtPhoneInput(phoneCell)}
            onChangeText={v => setPhoneCell(fmtPhoneInput(v))}
            keyboardType="phone-pad"
            leftIcon={<Phone size={15} color="#9CA3AF" />}
          />
        );
      case 'phone_office':
        return (
          <Input
            key={key}
            label={rLabel('phone_office', t.fields.phoneOffice)}
            placeholder={t.fields.placeholders.phone}
            value={fmtPhoneInput(phoneOffice)}
            onChangeText={v => setPhoneOffice(fmtPhoneInput(v))}
            keyboardType="phone-pad"
            leftIcon={<Phone size={15} color="#9CA3AF" />}
          />
        );
      case 'email_office':
        return (
          <Input
            key={key}
            label={rLabel('email_office', t.fields.emailOffice)}
            placeholder={t.fields.placeholders.emailOffice}
            value={emailOffice}
            onChangeText={setEmailOffice}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon={<Mail size={15} color="#9CA3AF" />}
          />
        );
      case 'email_home':
        return (
          <Input
            key={key}
            label={rLabel('email_home', t.fields.emailHome)}
            placeholder={t.fields.placeholders.emailHome}
            value={emailHome}
            onChangeText={setEmailHome}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon={<Mail size={15} color="#9CA3AF" />}
          />
        );
      case 'address':
        return (
          <View key={key} className="gap-3">
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
          </View>
        );
      case 'city':
        return (
          <Input
            key={key}
            label={rLabel('city', t.fields.city)}
            placeholder={t.fields.placeholders.city}
            value={city}
            onChangeText={setCity}
          />
        );
      case 'state':
        return (
          <Select
            key={key}
            label={rLabel('state', t.fields.state)}
            value={state}
            onValueChange={setState}
            options={stateOptions}
            searchable
          />
        );
      case 'zip_code':
        return (
          <Input
            key={key}
            label={rLabel('zip_code', t.fields.zipCode)}
            placeholder={t.fields.placeholders.zipCode}
            value={zipCode}
            onChangeText={v => setZipCode(v.replace(/[^0-9]/g, '').slice(0, 5))}
            keyboardType="number-pad"
          />
        );
      case 'notes':
        return (
          <View key={key} className="rounded-xl border border-gray-200 bg-white px-4 py-1">
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
        );
      default:
        return null;
    }
  };

  // Data-driven render of every section: built-in (gated by fHidden) + custom
  // fields in saved layout order. Sections with no visible field are skipped.
  const renderSection = (section: ClientFieldSection): React.ReactNode => {
    const keys = clientFieldsInSection(clientLayout, section);
    const visibleKeys = keys.filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
    if (visibleKeys.length === 0) return null;
    return (
      <Section key={section} title={sectionLabel[section]}>
        {visibleKeys.map(k => {
          if (k.startsWith('custom:')) {
            const tpl = templates.find(tp => `custom:${tp.id}` === k);
            return tpl ? renderCustomField(tpl) : null;
          }
          return renderField(k);
        })}
      </Section>
    );
  };

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
      if (!isReq(key) || fHidden(key)) continue;
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
      price_tier_id: priceTierId || null,
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
          .catch((e) => syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo actualizar el contacto en Google Contacts.')));
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
            .catch((e) => syncBanner.reportError(googleSyncErrorMessage(e, 'No se pudo agregar el contacto a Google Contacts.')));
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
          {CLIENT_FIELD_SECTIONS.map(renderSection)}

          {priceTiers.length > 0 ? (
            <View className="mb-3">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{full.dashboard.settings.priceSheet.clientTierLabel}</Text>
              <Select
                value={priceTierId}
                onValueChange={setPriceTierId}
                options={[{ value: '', label: full.dashboard.settings.priceSheet.clientTierNone }, ...priceTiers.map(pt => ({ value: pt.id, label: pt.name }))]}
              />
            </View>
          ) : null}

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

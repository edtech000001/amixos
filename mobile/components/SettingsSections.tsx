import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import {
  Building2,
  User as UserIcon,
  Globe,
  Lock,
  LogOut,
  Briefcase,
  Users,
  Plus,
  Pencil,
  Trash2,
  Sliders,
  Cloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import { Input, Button, Modal, Toggle, Select } from '@amixos/shared/ui';
import { linkGoogleContacts } from '@/lib/oauth';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { useSettingsSaveAction } from '@/components/SettingsPageWrapper';
import { moveTemplate } from '@amixos/shared/lib/fieldTemplates';
import { ChevronUp, ChevronDown, Sparkles } from 'lucide-react-native';

type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: FieldType;
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

const PIPELINE_STEP_KEYS = [
  'proposal', 'sent', 'accepted', 'scheduled', 'in_progress', 'completed', 'invoiced',
] as const;

const DEFAULT_CLIENT_FIELD_KEYS = [
  'first_name', 'last_name', 'company', 'phone_cell', 'phone_office',
  'email_office', 'email_home', 'address', 'city', 'state', 'zip_code',
] as const;

const DEFAULT_EMPLOYEE_FIELD_KEYS = [
  'first_name', 'last_name', 'phone', 'email',
  'hire_date', 'birthday',
  'pay_type', 'pay_rate',
  'address', 'city', 'state', 'zip_code',
  'emergency_contact_name', 'emergency_contact_phone',
] as const;

// Standard job fields exposed to the settings UI. `title` is omitted on
// purpose — a job without a title isn't usable.
const DEFAULT_JOB_FIELD_KEYS = [
  'client_id', 'priority', 'description',
  'job_address', 'job_city', 'job_state', 'coordinates',
  'scheduled_date', 'time_start', 'time_end',
  'assigned_workers', 'worker_notes', 'internal_notes',
] as const;

const toKey = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// ─── Shared helpers ───────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center mt-0.5">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">{title}</Text>
        <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text>
      </View>
    </View>
  );
}

function StatusMsg({ msg }: { msg: { text: string; isError: boolean } | null }) {
  if (!msg) return null;
  return (
    <View
      className={`rounded-xl px-4 py-3 ${
        msg.isError
          ? 'bg-red-50 border border-red-100'
          : 'bg-green-50 border border-green-100'
      }`}
    >
      <Text className={`text-sm ${msg.isError ? 'text-red-600' : 'text-green-700'}`}>
        {msg.text}
      </Text>
    </View>
  );
}

// ─── Business section ─────────────────────────────────────────────────────
const BUSINESS_US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function GroupLabel({ children }: { children: string }) {
  return <Text className="text-xs font-semibold text-gray-400 uppercase mt-2">{children}</Text>;
}

export function BusinessSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [name, setName] = useState(business?.name ?? '');
  const [email, setEmail] = useState(business?.email ?? '');
  const [phone, setPhone] = useState(business?.phone ?? '');
  const [website, setWebsite] = useState(business?.website ?? '');
  const [address, setAddress] = useState(business?.address ?? '');
  const [city, setCity] = useState(business?.city ?? '');
  const [usState, setUsState] = useState(business?.state ?? '');
  const [zip, setZip] = useState(business?.postal_code ?? '');
  const [taxId, setTaxId] = useState(business?.tax_id ?? '');
  const [license, setLicense] = useState(business?.license_number ?? '');
  const [invoiceNotes, setInvoiceNotes] = useState(business?.invoice_notes_default ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!business) return;
    setName(business.name ?? '');
    setEmail(business.email ?? '');
    setPhone(business.phone ?? '');
    setWebsite(business.website ?? '');
    setAddress(business.address ?? '');
    setCity(business.city ?? '');
    setUsState(business.state ?? '');
    setZip(business.postal_code ?? '');
    setTaxId(business.tax_id ?? '');
    setLicense(business.license_number ?? '');
    setInvoiceNotes(business.invoice_notes_default ?? '');
  }, [business]);

  const onSave = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: usState || null,
        postal_code: zip.trim() || null,
        tax_id: taxId.trim() || null,
        license_number: license.trim() || null,
        invoice_notes_default: invoiceNotes.trim() || null,
      })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.business.saveError : t.business.saveSuccess,
      isError: !!error,
    });
    if (!error) await refetchBusiness();
  };

  const stateOptions = [
    { value: '', label: '—' },
    ...BUSINESS_US_STATES.map((s) => ({ value: s, label: s })),
  ];

  return (
    <View className="gap-5">
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<Building2 size={18} color="#4F46E5" />}
          title={t.business.heading}
          subtitle={t.business.subtitle}
        />
        <Input label={t.business.nameLabel} value={name} onChangeText={setName} autoCapitalize="words" />

        <GroupLabel>{t.business.contactHeading}</GroupLabel>
        <Input
          label={t.business.emailLabel}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label={t.business.phoneLabel}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label={t.business.websiteLabel}
          value={website}
          onChangeText={setWebsite}
          autoCapitalize="none"
        />

        <GroupLabel>{t.business.addressHeading}</GroupLabel>
        <Input label={t.business.addressLabel} value={address} onChangeText={setAddress} autoCapitalize="words" />
        <Input label={t.business.cityLabel} value={city} onChangeText={setCity} autoCapitalize="words" />
        <Select label={t.business.stateLabel} value={usState} onValueChange={setUsState} options={stateOptions} />
        <Input label={t.business.zipLabel} value={zip} onChangeText={setZip} keyboardType="number-pad" />

        <GroupLabel>{t.business.legalHeading}</GroupLabel>
        <Input label={t.business.taxIdLabel} value={taxId} onChangeText={setTaxId} />
        <Input label={t.business.licenseLabel} value={license} onChangeText={setLicense} />

        <GroupLabel>{t.business.invoiceHeading}</GroupLabel>
        <View>
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">{t.business.invoiceNotesLabel}</Text>
          <View className="rounded-2xl border border-gray-200 bg-white px-4 py-1">
            <TextInput
              multiline
              placeholder={t.business.invoiceNotesPlaceholder}
              placeholderTextColor="#9CA3AF"
              value={invoiceNotes}
              onChangeText={setInvoiceNotes}
              className="text-base text-gray-900 py-2"
              style={{ textAlignVertical: 'top', minHeight: 70 }}
            />
          </View>
        </View>
      </View>

      <StatusMsg msg={msg} />
      <Button onPress={onSave} loading={saving} fullWidth>
        <Text className="text-white font-semibold">{full.common.buttons.saveChanges}</Text>
      </Button>
    </View>
  );
}

// ─── Trabajos section — pipeline step toggles ─────────────────────────────
export function TrabajosSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [disabled, setDisabled] = useState<Record<string, boolean>>(
    business?.job_pipeline_disabled ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (business) setDisabled(business.job_pipeline_disabled ?? {});
  }, [business]);

  const toggleStep = (key: string) => {
    setDisabled((prev) => ({ ...prev, [key]: !prev[key] }));
    setMsg(null);
  };

  const onSave = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ job_pipeline_disabled: disabled })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.pipeline.saveError : t.pipeline.saveSuccess,
      isError: !!error,
    });
    if (!error) await refetchBusiness();
  };

  return (
    <View className="gap-5">
      <SectionHeader
        icon={<Briefcase size={18} color="#4F46E5" />}
        title={t.pipeline.heading}
        subtitle={t.pipeline.subtitle}
      />

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {PIPELINE_STEP_KEYS.map((key, i) => {
          const step = t.pipelineSteps[key];
          const isDisabled = !!disabled[key];
          return (
            <View
              key={key}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i < PIPELINE_STEP_KEYS.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <View className="flex-1 mr-3">
                <Text
                  className={`text-sm font-medium ${
                    isDisabled ? 'text-gray-400' : 'text-gray-900'
                  }`}
                >
                  {step.label}
                </Text>
                <Text
                  className={`text-xs mt-0.5 ${
                    isDisabled ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {step.description}
                </Text>
              </View>
              <Toggle value={!isDisabled} onValueChange={() => toggleStep(key)} />
            </View>
          );
        })}
      </View>

      <StatusMsg msg={msg} />
      <Button onPress={onSave} loading={saving} fullWidth>
        <Text className="text-white font-semibold">{t.pipeline.saveBtn}</Text>
      </Button>
    </View>
  );
}

// ─── Clientes section ─────────────────────────────────────────────────────
// ─── Trabajos field config section ─────────────────────────────────────────
// Unified standard + custom job field list. Lives alongside TrabajosSection
// (which handles pipeline steps) on the Ajustes → Trabajos page.
export function TrabajosFieldsSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tJobNew = full.dashboard.jobs.new;

  const FIELD_LABELS: Record<string, string> = {
    client_id: tJobNew.clientLabel,
    priority: tJobNew.priorityLabel,
    description: tJobNew.descriptionLabel,
    job_address: tJobNew.addressLabel,
    job_city: tJobNew.cityLabel,
    job_state: tJobNew.stateLabel,
    coordinates: tJobNew.coordinatesLabel,
    scheduled_date: tJobNew.dateLabel,
    time_start: tJobNew.timeStartLabel,
    time_end: tJobNew.timeEndLabel,
    assigned_workers: tJobNew.workersHeading,
    worker_notes: tJobNew.workerNoteLabel,
    internal_notes: tJobNew.internalNoteLabelJob,
  };

  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.job_field_required ?? {},
  );
  const [savedRequired, setSavedRequired] = useState<Record<string, boolean>>(
    business?.job_field_required ?? {},
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = business.job_field_required ?? {};
      setRequired(fresh);
      setSavedRequired(fresh);
    }
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  }, [business?.id]);

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('job_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates((data as FieldTemplate[] | null) ?? []);
  };

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ job_field_required: required })
      .eq('id', business.id);
    setSavingReq(false);
    setReqMsg({
      text: error ? t.requiredFields.saveError : t.requiredFields.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setSavedRequired(required);
      await refetchBusiness();
    }
  };

  const dirty = (() => {
    const keys = new Set([...Object.keys(required), ...Object.keys(savedRequired)]);
    for (const k of keys) if (!!required[k] !== !!savedRequired[k]) return true;
    return false;
  })();

  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_JOB_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const,
      key: k,
      label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const,
      key: `custom:${tpl.id}`,
      label: tpl.field_label,
      tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));

    const saved = business?.job_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  })();

  const moveItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ job_field_order: next.map((i) => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('job_field_templates').delete().eq('id', id);
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
        },
      },
    ]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SectionHeader
            icon={<Sliders size={18} color="#4F46E5" />}
            title={t.jobsSection.title}
            subtitle={t.jobsSection.subtitle}
          />
        </View>
        <Pressable
          onPress={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-primary active:opacity-80"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-white text-xs font-semibold">{t.customFields.addBtn}</Text>
        </Pressable>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <View
              key={item.key}
              className={`flex-row items-center gap-2 px-4 py-3 ${
                isLast ? '' : 'border-b border-gray-50'
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                  {item.kind === 'custom' ? (
                    <Sparkles size={12} color="#4F46E5" />
                  ) : null}
                  <Text className="text-sm text-gray-900">{item.label}</Text>
                  {item.kind === 'custom' && item.tpl.required ? (
                    <View className="bg-orange-50 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] text-orange-600 font-semibold">
                        {t.customFields.requiredBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.kind === 'custom' ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t.fieldTypes[item.tpl.field_type]}
                    {item.tpl.field_type === 'select' && item.tpl.field_options?.length
                      ? ` · ${item.tpl.field_options.join(', ')}`
                      : ''}
                  </Text>
                ) : null}
              </View>

              <View className="flex-col">
                <Pressable
                  onPress={() => moveItem(item.key, 'up')}
                  disabled={i === 0}
                  className="px-1 active:opacity-60"
                >
                  <ChevronUp size={14} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
                <Pressable
                  onPress={() => moveItem(item.key, 'down')}
                  disabled={isLast}
                  className="px-1 active:opacity-60"
                >
                  <ChevronDown size={14} color={isLast ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
              </View>

              {item.kind === 'standard' ? (
                <Toggle
                  value={!!required[item.key]}
                  onValueChange={() => toggleRequired(item.key)}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setEditing(item.tpl);
                      setModalOpen(true);
                    }}
                    className="p-2 rounded-lg active:bg-blue-50"
                  >
                    <Pencil size={14} color="#3B82F6" />
                  </Pressable>
                  <Pressable
                    onPress={() => removeTemplate(item.tpl.id)}
                    className="p-2 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#EF4444" />
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        businessId={business?.id ?? null}
        tableName="job_field_templates"
        onSaved={() => {
          setModalOpen(false);
          void loadTemplates();
        }}
      />
    </View>
  );
}

// ─── Crew mode toggle ─────────────────────────────────────────────────────
// Single toggle that hides/shows the lead-picker + per-worker actuals across
// the rest of the app. Solo-tech businesses (mechanic, salon) flip it off.
export function CrewModeSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const initial = business?.job_crew_mode ?? true;
  const [value, setValue] = useState<boolean>(initial);
  const [saved, setSaved] = useState<boolean>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = business.job_crew_mode ?? true;
      setValue(fresh);
      setSaved(fresh);
    }
  }, [business]);

  const save = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ job_crew_mode: value })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.crewMode.saveError : t.crewMode.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setSaved(value);
      await refetchBusiness();
    }
  };

  const dirty = value !== saved;
  useSettingsSaveAction({ dirty, saving, onSave: save });

  return (
    <View className="gap-3">
      <SectionHeader
        icon={<Users size={18} color="#4F46E5" />}
        title={t.crewMode.heading}
        subtitle={t.crewMode.subtitle}
      />
      <View className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex-row items-center">
        <Text className="flex-1 text-sm text-gray-900">{t.crewMode.heading}</Text>
        <Toggle value={value} onValueChange={setValue} />
      </View>
      <StatusMsg msg={msg} />
    </View>
  );
}

// ─── Per-worker custom fields (assignment_field_templates) ─────────────────
// Mirror of TrabajosFieldsSection but targets job_assignment_field_templates +
// businesses.assignment_field_required / assignment_field_order. Standard
// keys: 'hours_worked' (the universal core field every industry tracks).
const DEFAULT_ASSIGNMENT_FIELD_KEYS = ['hours_worked'] as const;

export function TrabajadorFieldsSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tActuals = full.dashboard.jobs.actuals;

  const FIELD_LABELS: Record<string, string> = {
    hours_worked: tActuals.hoursWorkedLabel,
  };

  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.assignment_field_required ?? {},
  );
  const [savedRequired, setSavedRequired] = useState<Record<string, boolean>>(
    business?.assignment_field_required ?? {},
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = business.assignment_field_required ?? {};
      setRequired(fresh);
      setSavedRequired(fresh);
    }
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  }, [business?.id]);

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('job_assignment_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates((data as FieldTemplate[] | null) ?? []);
  };

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ assignment_field_required: required })
      .eq('id', business.id);
    setSavingReq(false);
    setReqMsg({
      text: error ? t.requiredFields.saveError : t.requiredFields.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setSavedRequired(required);
      await refetchBusiness();
    }
  };

  const dirty = (() => {
    const keys = new Set([...Object.keys(required), ...Object.keys(savedRequired)]);
    for (const k of keys) if (!!required[k] !== !!savedRequired[k]) return true;
    return false;
  })();
  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_ASSIGNMENT_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const,
      key: k,
      label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const,
      key: `custom:${tpl.id}`,
      label: tpl.field_label,
      tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));

    const saved = business?.assignment_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  })();

  const moveItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ assignment_field_order: next.map((i) => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('job_assignment_field_templates').delete().eq('id', id);
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
        },
      },
    ]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SectionHeader
            icon={<Sliders size={18} color="#4F46E5" />}
            title={t.assignmentFieldsSection.title}
            subtitle={t.assignmentFieldsSection.subtitle}
          />
        </View>
        <Pressable
          onPress={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-primary active:opacity-80"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-white text-xs font-semibold">{t.customFields.addBtn}</Text>
        </Pressable>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <View
              key={item.key}
              className={`flex-row items-center gap-2 px-4 py-3 ${
                isLast ? '' : 'border-b border-gray-50'
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                  {item.kind === 'custom' ? (
                    <Sparkles size={12} color="#4F46E5" />
                  ) : null}
                  <Text className="text-sm text-gray-900">{item.label}</Text>
                  {item.kind === 'custom' && item.tpl.required ? (
                    <View className="bg-orange-50 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] text-orange-600 font-semibold">
                        {t.customFields.requiredBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.kind === 'custom' ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t.fieldTypes[item.tpl.field_type]}
                    {item.tpl.field_type === 'select' && item.tpl.field_options?.length
                      ? ` · ${item.tpl.field_options.join(', ')}`
                      : ''}
                  </Text>
                ) : null}
              </View>

              <View className="flex-col">
                <Pressable
                  onPress={() => moveItem(item.key, 'up')}
                  disabled={i === 0}
                  className="px-1 active:opacity-60"
                >
                  <ChevronUp size={14} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
                <Pressable
                  onPress={() => moveItem(item.key, 'down')}
                  disabled={isLast}
                  className="px-1 active:opacity-60"
                >
                  <ChevronDown size={14} color={isLast ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
              </View>

              {item.kind === 'standard' ? (
                <Toggle
                  value={!!required[item.key]}
                  onValueChange={() => toggleRequired(item.key)}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setEditing(item.tpl);
                      setModalOpen(true);
                    }}
                    className="p-2 rounded-lg active:bg-blue-50"
                  >
                    <Pencil size={14} color="#3B82F6" />
                  </Pressable>
                  <Pressable
                    onPress={() => removeTemplate(item.tpl.id)}
                    className="p-2 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#EF4444" />
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        businessId={business?.id ?? null}
        tableName="job_assignment_field_templates"
        onSaved={() => {
          setModalOpen(false);
          void loadTemplates();
        }}
      />
    </View>
  );
}

export function ClientesSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tFields = full.dashboard.clients.fields;

  const FIELD_LABELS: Record<string, string> = {
    first_name: tFields.firstName,
    last_name: tFields.lastName,
    company: tFields.company,
    phone_cell: tFields.phoneCell,
    phone_office: tFields.phoneOffice,
    email_office: tFields.emailOffice,
    email_home: tFields.emailHome,
    address: tFields.addressLine1,
    city: tFields.city,
    state: tFields.state,
    zip_code: tFields.zipCode,
  };

  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {},
  );
  // Snapshot of the last-saved value — diff against current `required` to
  // know whether the user has unsaved changes (powers the header save pill
  // + the back-press warning).
  const [savedRequired, setSavedRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {},
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  // CSV import — lives here in Ajustes (instead of on the Clientes list)
  // because it's a one-time-per-onboarding op, not a daily action. After
  // import, refresh the counts so the user sees the new total.
  const [importOpen, setImportOpen] = useState(false);

  // Contacts summary — lets the user reconcile counts against Google Contacts.
  // Counts both clients and client_contacts because both mirror to Google
  // (one Google contact per row in each table). Employees do NOT sync.
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [contactsCount, setContactsCount] = useState<number | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = business.client_field_required ?? {};
      setRequired(fresh);
      setSavedRequired(fresh);
    }
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
    void loadCounts();
  }, [business?.id]);

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('client_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates((data as FieldTemplate[] | null) ?? []);
  };

  const loadCounts = async () => {
    if (!business) return;
    const [clientsRes, contactsRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id),
      supabase
        .from('client_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.id),
    ]);
    setClientsCount(clientsRes.count ?? 0);
    setContactsCount(contactsRes.count ?? 0);
  };

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ client_field_required: required })
      .eq('id', business.id);
    setSavingReq(false);
    setReqMsg({
      text: error ? t.requiredFields.saveError : t.requiredFields.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setSavedRequired(required);  // clears dirty + hides the header pill
      await refetchBusiness();
    }
  };

  // Compare current vs last-saved by key set + value to detect dirty state.
  const dirty = (() => {
    const keys = new Set([...Object.keys(required), ...Object.keys(savedRequired)]);
    for (const k of keys) {
      if (!!required[k] !== !!savedRequired[k]) return true;
    }
    return false;
  })();

  // Surface the save action to the wrapper's header. The pill auto-appears
  // when dirty=true and disappears once saveRequired clears the snapshot.
  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  // ── Unified field list (standard + custom in one ordered display) ─────
  // `client_field_order` is a single JSONB array where each entry is either
  // a standard field key ("phone_cell") or a custom-template reference
  // ("custom:<uuid>"). Lets the user interleave custom + default fields.
  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const buildItems = (): UnifiedItem[] => {
    const standardItems: UnifiedItem[] = DEFAULT_CLIENT_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const,
      key: k,
      label: FIELD_LABELS[k],
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const,
      key: `custom:${tpl.id}`,
      label: tpl.field_label,
      tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));

    const saved = business?.client_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    // Append anything in the available set that the saved order doesn't
    // reference — new templates / new standard fields stay visible.
    const used = new Set(ordered.map((i) => i.key));
    const appended = all.filter((i) => !used.has(i.key));
    return [...ordered, ...appended];
  };
  const items = buildItems();

  const moveItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    // Save immediately — no dirty state. Order changes feel direct.
    await supabase
      .from('businesses')
      .update({ client_field_order: next.map((i) => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('client_field_templates').delete().eq('id', id);
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
        },
      },
    ]);
  };

  const totalCount =
    clientsCount !== null && contactsCount !== null ? clientsCount + contactsCount : null;

  return (
    <View className="gap-4">
      {/* Import CSV — lives at the top of Ajustes → Clientes since it's
         an onboarding/migration action, not a daily one. */}
      {business ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-4">
          <Pressable
            onPress={() => setImportOpen(true)}
            className="flex-row items-center gap-3 active:opacity-70"
          >
            <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
              <Sparkles size={18} color="#4F46E5" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900">
                {full.dashboard.clients.importBtn}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {full.dashboard.clients.importHint}
              </Text>
            </View>
            <Text className="text-xl text-gray-400">›</Text>
          </Pressable>
          <ImportClientsModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            businessId={business.id}
            templates={templates.map(tpl => ({
              field_key: tpl.field_key,
              field_label: tpl.field_label,
            }))}
            onImportComplete={loadCounts}
          />
        </View>
      ) : null}

      {/* Contacts summary — total clients + employees so the user can
         reconcile against their Google Contacts count when sync is on. */}
      <View className="bg-white rounded-2xl border border-gray-100 p-4">
        <Text className="text-sm font-semibold text-gray-900 mb-3">
          {t.contactsStats.heading}
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1 bg-indigo-50 rounded-xl p-3 items-center">
            <Text className="text-xs text-indigo-600 font-medium">
              {t.contactsStats.clientsLabel}
            </Text>
            <Text className="text-2xl font-bold text-indigo-700 mt-1">
              {clientsCount ?? '—'}
            </Text>
          </View>
          <View className="flex-1 bg-emerald-50 rounded-xl p-3 items-center">
            <Text className="text-xs text-emerald-600 font-medium text-center">
              {t.contactsStats.contactsLabel}
            </Text>
            <Text className="text-2xl font-bold text-emerald-700 mt-1">
              {contactsCount ?? '—'}
            </Text>
          </View>
          <View className="flex-1 bg-gray-100 rounded-xl p-3 items-center">
            <Text className="text-xs text-gray-600 font-medium">
              {t.contactsStats.totalLabel}
            </Text>
            <Text className="text-2xl font-bold text-gray-900 mt-1">
              {totalCount ?? '—'}
            </Text>
          </View>
        </View>
        <Text className="text-[11px] text-gray-500 mt-3 leading-4">
          {t.contactsStats.googleHint}
        </Text>
      </View>

      {/* One header for the whole unified list. The user can interleave
         custom fields with standard ones via the up/down arrows below;
         custom items are marked with a Sparkles glyph. */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SectionHeader
            icon={<Sliders size={18} color="#4F46E5" />}
            title={t.requiredFields.heading}
            subtitle={t.requiredFields.subtitle}
          />
        </View>
        <Pressable
          onPress={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-primary active:opacity-80"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-white text-xs font-semibold">{t.customFields.addBtn}</Text>
        </Pressable>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <View
              key={item.key}
              className={`flex-row items-center gap-2 px-4 py-3 ${
                isLast ? '' : 'border-b border-gray-50'
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                  {item.kind === 'custom' ? (
                    <Sparkles size={12} color="#4F46E5" />
                  ) : null}
                  <Text className="text-sm text-gray-900">{item.label}</Text>
                  {item.kind === 'custom' && item.tpl.required ? (
                    <View className="bg-orange-50 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] text-orange-600 font-semibold">
                        {t.customFields.requiredBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.kind === 'custom' ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t.fieldTypes[item.tpl.field_type]}
                    {item.tpl.field_type === 'select' && item.tpl.field_options?.length
                      ? ` · ${item.tpl.field_options.join(', ')}`
                      : ''}
                  </Text>
                ) : null}
              </View>

              {/* Reorder arrows — work across the whole unified list. */}
              <View className="flex-col">
                <Pressable
                  onPress={() => moveItem(item.key, 'up')}
                  disabled={i === 0}
                  className="px-1 active:opacity-60"
                >
                  <ChevronUp size={14} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
                <Pressable
                  onPress={() => moveItem(item.key, 'down')}
                  disabled={isLast}
                  className="px-1 active:opacity-60"
                >
                  <ChevronDown size={14} color={isLast ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
              </View>

              {/* Right-side controls: standard rows get the required toggle;
                 custom rows get edit + delete (required is on the template). */}
              {item.kind === 'standard' ? (
                <Toggle
                  value={!!required[item.key]}
                  onValueChange={() => toggleRequired(item.key)}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setEditing(item.tpl);
                      setModalOpen(true);
                    }}
                    className="p-2 rounded-lg active:bg-blue-50"
                  >
                    <Pencil size={14} color="#3B82F6" />
                  </Pressable>
                  <Pressable
                    onPress={() => removeTemplate(item.tpl.id)}
                    className="p-2 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#EF4444" />
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        businessId={business?.id ?? null}
        onSaved={() => {
          setModalOpen(false);
          void loadTemplates();
        }}
      />
    </View>
  );
}

// ─── Empleados section ─────────────────────────────────────────────────────
// Unified standard + custom field list — same UX as ClientesSection. Users
// toggle which standard fields are required, add custom-field templates,
// and reorder everything in one mixed list (custom items get a Sparkles
// glyph). Saved order lives in businesses.employee_field_order; required
// flags in businesses.employee_field_required.
export function EmpleadosSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tEmpModal = full.dashboard.employees.modal;

  const FIELD_LABELS: Record<string, string> = {
    first_name: tEmpModal.firstNameLabel.replace(' *', ''),
    last_name: tEmpModal.lastNameLabel,
    phone: tEmpModal.phoneLabel,
    email: tEmpModal.emailLabel,
    birthday: tEmpModal.birthdayLabel,
    hire_date: tEmpModal.hireDateLabel,
    pay_type: tEmpModal.payTypeLabel,
    pay_rate: tEmpModal.payRateLabel.replace(' ({{unit}})', ''),
    address: tEmpModal.addressLabel,
    city: tEmpModal.cityLabel,
    state: tEmpModal.stateLabel,
    zip_code: tEmpModal.zipLabel,
    emergency_contact_name: `${tEmpModal.emergencyContactHeading} — ${tEmpModal.emergencyNameLabel}`,
    emergency_contact_phone: `${tEmpModal.emergencyContactHeading} — ${tEmpModal.emergencyPhoneLabel}`,
  };

  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.employee_field_required ?? {},
  );
  const [savedRequired, setSavedRequired] = useState<Record<string, boolean>>(
    business?.employee_field_required ?? {},
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = business.employee_field_required ?? {};
      setRequired(fresh);
      setSavedRequired(fresh);
    }
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  }, [business?.id]);

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase
      .from('employee_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    setTemplates((data as FieldTemplate[] | null) ?? []);
  };

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ employee_field_required: required })
      .eq('id', business.id);
    setSavingReq(false);
    setReqMsg({
      text: error ? t.requiredFields.saveError : t.requiredFields.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setSavedRequired(required);
      await refetchBusiness();
    }
  };

  const dirty = (() => {
    const keys = new Set([...Object.keys(required), ...Object.keys(savedRequired)]);
    for (const k of keys) if (!!required[k] !== !!savedRequired[k]) return true;
    return false;
  })();

  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  // Unified items list — same model as ClientesSection.
  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_EMPLOYEE_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const,
      key: k,
      label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const,
      key: `custom:${tpl.id}`,
      label: tpl.field_label,
      tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));

    const saved = business?.employee_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  })();

  const moveItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ employee_field_order: next.map((i) => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: async () => {
          await supabase.from('employee_field_templates').delete().eq('id', id);
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
        },
      },
    ]);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SectionHeader
            icon={<Users size={18} color="#4F46E5" />}
            title={t.employeesSection.title}
            subtitle={t.employeesSection.subtitle}
          />
        </View>
        <Pressable
          onPress={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-primary active:opacity-80"
        >
          <Plus size={14} color="#FFFFFF" />
          <Text className="text-white text-xs font-semibold">{t.customFields.addBtn}</Text>
        </Pressable>
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <View
              key={item.key}
              className={`flex-row items-center gap-2 px-4 py-3 ${
                isLast ? '' : 'border-b border-gray-50'
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5 flex-wrap">
                  {item.kind === 'custom' ? (
                    <Sparkles size={12} color="#4F46E5" />
                  ) : null}
                  <Text className="text-sm text-gray-900">{item.label}</Text>
                  {item.kind === 'custom' && item.tpl.required ? (
                    <View className="bg-orange-50 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] text-orange-600 font-semibold">
                        {t.customFields.requiredBadge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.kind === 'custom' ? (
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t.fieldTypes[item.tpl.field_type]}
                    {item.tpl.field_type === 'select' && item.tpl.field_options?.length
                      ? ` · ${item.tpl.field_options.join(', ')}`
                      : ''}
                  </Text>
                ) : null}
              </View>

              <View className="flex-col">
                <Pressable
                  onPress={() => moveItem(item.key, 'up')}
                  disabled={i === 0}
                  className="px-1 active:opacity-60"
                >
                  <ChevronUp size={14} color={i === 0 ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
                <Pressable
                  onPress={() => moveItem(item.key, 'down')}
                  disabled={isLast}
                  className="px-1 active:opacity-60"
                >
                  <ChevronDown size={14} color={isLast ? '#D1D5DB' : '#6B7280'} />
                </Pressable>
              </View>

              {item.kind === 'standard' ? (
                <Toggle
                  value={!!required[item.key]}
                  onValueChange={() => toggleRequired(item.key)}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setEditing(item.tpl);
                      setModalOpen(true);
                    }}
                    className="p-2 rounded-lg active:bg-blue-50"
                  >
                    <Pencil size={14} color="#3B82F6" />
                  </Pressable>
                  <Pressable
                    onPress={() => removeTemplate(item.tpl.id)}
                    className="p-2 rounded-lg active:bg-red-50"
                  >
                    <Trash2 size={14} color="#EF4444" />
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        businessId={business?.id ?? null}
        tableName="employee_field_templates"
        onSaved={() => {
          setModalOpen(false);
          void loadTemplates();
        }}
      />
    </View>
  );
}

function FieldTemplateModal({
  open,
  onClose,
  editing,
  templates,
  businessId,
  onSaved,
  // Table to insert/update against. Defaults to clients for backwards
  // compatibility with the original ClientesSection caller.
  tableName = 'client_field_templates',
}: {
  open: boolean;
  onClose: () => void;
  editing: FieldTemplate | null;
  templates: FieldTemplate[];
  businessId: string | null;
  onSaved: () => void;
  tableName?:
    | 'client_field_templates'
    | 'employee_field_templates'
    | 'job_field_templates'
    | 'job_assignment_field_templates';
}) {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setLabel(editing.field_label);
      setType(editing.field_type);
      setRequired(editing.required);
      setOptionsRaw(editing.field_options?.join('\n') ?? '');
    } else {
      setLabel('');
      setType('text');
      setRequired(false);
      setOptionsRaw('');
    }
    setError('');
  }, [editing, open]);

  const FIELD_TYPE_OPTIONS = [
    { value: 'text', label: t.fieldTypes.text },
    { value: 'number', label: t.fieldTypes.number },
    { value: 'date', label: t.fieldTypes.date },
    { value: 'boolean', label: t.fieldTypes.boolean },
    { value: 'select', label: t.fieldTypes.select },
  ];

  const onSave = async () => {
    if (!businessId) return;
    if (!label.trim()) {
      setError(t.customFields.errorNameRequired);
      return;
    }
    const key = toKey(label);
    if (!editing && templates.some((tpl) => tpl.field_key === key)) {
      setError(t.customFields.errorDuplicate);
      return;
    }
    setSaving(true);
    setError('');

    const options =
      type === 'select'
        ? optionsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
        : null;

    const payload = {
      field_label: label.trim(),
      field_type: type,
      field_options: options,
      required,
    };

    if (editing) {
      const { error: err } = await supabase
        .from(tableName)
        .update(payload)
        .eq('id', editing.id);
      setSaving(false);
      if (err) {
        setError(t.customFields.errorSave);
        return;
      }
    } else {
      const { error: err } = await supabase.from(tableName).insert({
        ...payload,
        business_id: businessId,
        field_key: key,
        sort_order: templates.length,
      });
      setSaving(false);
      if (err) {
        setError(t.customFields.errorSave);
        return;
      }
    }
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t.customFields.editModalTitle : t.customFields.addModalTitle}
    >
      <View className="gap-4">
        <Input
          label={t.customFields.fieldNameLabel}
          placeholder={t.customFields.fieldNamePlaceholder}
          value={label}
          onChangeText={setLabel}
          autoCapitalize="sentences"
        />

        <Select
          label={t.customFields.fieldTypeLabel}
          value={type}
          onValueChange={(v) => setType(v as FieldType)}
          options={FIELD_TYPE_OPTIONS}
        />

        {type === 'select' ? (
          <View>
            <Input
              label={t.customFields.optionsLabel}
              placeholder={t.customFields.optionsPlaceholder}
              value={optionsRaw}
              onChangeText={setOptionsRaw}
              multiline
              numberOfLines={4}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <Text className="text-xs text-gray-400 mt-1">{t.customFields.optionsHint}</Text>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
          <Text className="text-sm text-gray-900">{t.customFields.requiredToggleLabel}</Text>
          <Toggle value={required} onValueChange={setRequired} />
        </View>

        {error ? (
          <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <Button onPress={onSave} loading={saving} fullWidth>
          <Text className="text-white font-semibold">{t.customFields.addFieldBtn}</Text>
        </Button>
      </View>
    </Modal>
  );
}

// ─── Account section ──────────────────────────────────────────────────────
export function AccountSection() {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const logout = useAuthStore((s) => s.logout);
  const { t: full, locale, setLocale, labels } = useLang();
  const t = full.dashboard.settings;

  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const onSavePassword = async () => {
    if (newPw.length < 8) {
      setPwMsg({ text: t.password.errorMinLength, isError: true });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ text: `${t.password.errorPrefix}: ${error.message}`, isError: true });
    } else {
      setPwMsg({ text: t.password.successMsg, isError: false });
      setNewPw('');
    }
  };

  const confirmLogout = () => {
    Alert.alert('', '', [
      { text: full.common.buttons.cancel, style: 'cancel' },
      { text: full.dashboard.sidebar.logout, style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View className="gap-4">
      {/* Account info card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<UserIcon size={18} color="#4F46E5" />}
          title={t.account.heading}
          subtitle={t.account.subtitle}
        />
        <View className="gap-1">
          <Text className="text-xs text-gray-500">{t.account.emailLabel}</Text>
          <Text className="text-sm font-medium text-gray-900">{user?.email ?? '—'}</Text>
        </View>
      </View>

      {/* Language card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<Globe size={18} color="#4F46E5" />}
          title={t.language.heading}
          subtitle={t.language.subtitle}
        />
        <View className="flex-row gap-2">
          {(['es', 'en'] as const).map((code) => (
            <Pressable
              key={code}
              onPress={() => setLocale(code)}
              className={`flex-1 py-3 rounded-xl items-center ${
                locale === code ? 'bg-primary' : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  locale === code ? 'text-white' : 'text-gray-900'
                }`}
              >
                {labels[code]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Password card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<Lock size={18} color="#4F46E5" />}
          title={t.password.heading}
          subtitle={t.password.subtitle}
        />
        <Input
          label={t.password.newPasswordLabel}
          placeholder={t.password.newPasswordPlaceholder}
          secureTextEntry
          value={newPw}
          onChangeText={setNewPw}
        />
        <StatusMsg msg={pwMsg} />
        <Button onPress={onSavePassword} loading={savingPw} fullWidth>
          <Text className="text-white font-semibold">{t.password.saveBtn}</Text>
        </Button>
      </View>

      <Pressable
        onPress={confirmLogout}
        className="flex-row items-center justify-center gap-2 py-4 rounded-2xl bg-white border border-red-100 active:bg-red-50"
      >
        <LogOut size={18} color="#EF4444" />
        <Text className="text-sm font-semibold text-red-600">
          {full.dashboard.sidebar.logout}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Connections section ──────────────────────────────────────────────────
export function ConnectionsSection() {
  return (
    <View className="gap-7">
      <GoogleSyncSection />
    </View>
  );
}

interface GoogleStatus {
  connected: boolean;
  enabled?: boolean;
  contactGroupId?: string | null;
  contactGroupName?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
}

function GoogleSyncSection() {
  const { t: full } = useLang();
  const t = full.dashboard.settings.google;
  // Per-business sync: every Google Sync action targets the currently active
  // business. Switching workspaces (via the business switcher) automatically
  // re-fetches the status for the new business and shows its connection
  // state independently.
  const { business } = useApp();

  const [status, setStatus] = useState<GoogleStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Notes-template state — lets the user stuff custom-field values into the
  // Google biography for iPhone Contacts visibility.
  const [notesTemplate, setNotesTemplate] = useState<string>('');
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  const supabase = createSupabaseClient();
  const apiBaseUrl = getApiBaseUrl();
  const businessId = business?.id ?? null;

  const fetchStatus = async () => {
    if (!apiBaseUrl || !businessId) return;
    setLoading(true);
    try {
      const jwt = await getJwt();
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/status?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data ?? { connected: false });
      }
    } catch {
      setStatus({ connected: false });
    }
    setLoading(false);
  };

  const fetchGroups = async () => {
    if (!apiBaseUrl || !businessId) return;
    try {
      const jwt = await getJwt();
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/contact-groups?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const json = await res.json();
        setGroups(json.data ?? []);
      }
    } catch {
      setGroups([]);
    }
  };

  // Re-fetch status whenever the active business changes — connection state
  // is per-business, so switching workspaces should immediately reflect
  // that business's own credentials.
  useEffect(() => {
    void fetchStatus();
  }, [businessId]);

  useEffect(() => {
    if (status.connected) void fetchGroups();
  }, [status.connected, businessId]);

  // Load the saved template + available custom field labels (so we can
  // show the user which placeholders are valid). Runs once the business
  // is known. Loading state lets us avoid wiping a user-typed value
  // before the saved one comes back.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const [{ data: biz }, { data: tpl }] = await Promise.all([
        supabase
          .from('businesses')
          .select('google_sync_notes_template')
          .eq('id', businessId)
          .maybeSingle(),
        supabase
          .from('client_field_templates')
          .select('field_label')
          .eq('business_id', businessId)
          .order('sort_order'),
      ]);
      if (cancelled) return;
      setNotesTemplate(((biz as { google_sync_notes_template: string | null } | null)
        ?.google_sync_notes_template) ?? '');
      setTemplateLoaded(true);
      // {{Notas}} is always offered as a default placeholder so the user
      // can position their own notes anywhere in the template. Show it
      // first; custom-field labels follow.
      const customLabels = ((tpl as { field_label: string }[] | null) ?? [])
        .map(r => r.field_label)
        .filter(Boolean);
      setAvailableFields(['Notas', ...customLabels]);
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, supabase]);

  const onSaveTemplate = async () => {
    if (!businessId) return;
    setSavingTemplate(true);
    setTemplateMsg(null);
    const trimmed = notesTemplate.trim();
    const { error } = await supabase
      .from('businesses')
      .update({ google_sync_notes_template: trimmed === '' ? null : notesTemplate })
      .eq('id', businessId);
    setSavingTemplate(false);
    if (error) {
      // Show the underlying supabase error so missing columns / RLS denials
      // are diagnosable instead of being lumped into a generic message.
      setTemplateMsg({ text: `${t.templateSaveError} (${error.message})`, isError: true });
    } else {
      setTemplateMsg({ text: t.templateSaved, isError: false });
    }
  };

  // Re-apply the current template to every already-synced Google contact.
  // Queries the synced subset, confirms the count with the user, then
  // hands the IDs to the banner's update queue — throttled, persisted,
  // and cancellable just like the import flow.
  const syncBanner = useGoogleSyncBanner();
  const onReapplyTemplate = async () => {
    if (!businessId) return;
    // Pull synced clients AND synced client_contacts in parallel — the
    // notes template now renders on both surfaces (the parent client's
    // rendered template gets appended to each contact's bio), so the
    // reapply flow has to cover both to keep them in sync.
    const [clientsRes, contactsRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id')
        .eq('business_id', businessId)
        .not('google_resource_name', 'is', null),
      supabase
        .from('client_contacts')
        .select('id')
        .eq('business_id', businessId)
        .not('google_resource_name', 'is', null),
    ]);
    const clientIds = ((clientsRes.data as { id: string }[] | null) ?? []).map(r => r.id);
    const contactIds = ((contactsRes.data as { id: string }[] | null) ?? []).map(r => r.id);
    const total = clientIds.length + contactIds.length;
    if (total === 0) {
      setTemplateMsg({ text: t.templateReapplyEmpty, isError: false });
      return;
    }
    Alert.alert(
      t.templateReapplyConfirmTitle,
      t.templateReapplyConfirmBody.replace('{{count}}', String(total)),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: t.templateReapplyConfirmBtn,
          onPress: () => {
            syncBanner.runUpdateBatch(clientIds, contactIds);
          },
        },
      ],
    );
  };

  // After connect, fetch the count of un-synced clients. If > 0, prompt
  // the user to backfill them now. Best-effort — failures are silent
  // (the user can always re-connect or sync clients individually).
  const maybeOfferBackfill = async () => {
    const jwt = await getJwt();
    if (!jwt || !apiBaseUrl || !businessId) return;
    let count = 0;
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/google-sync/unsynced-count?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.ok) {
        const j = await r.json();
        count = j?.data?.count ?? 0;
      }
    } catch {
      return;
    }
    if (count === 0) return;

    Alert.alert(
      t.backfillTitle,
      t.backfillBody.replace('{{count}}', String(count)),
      [
        { text: t.backfillSkipBtn, style: 'cancel' },
        {
          text: t.backfillSyncBtn,
          onPress: async () => {
            setBusy(true);
            setMsg({ text: t.backfillProgress.replace('{{count}}', String(count)), isError: false });
            try {
              const jwt2 = await getJwt();
              const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/backfill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt2}` },
                body: JSON.stringify({ business_id: businessId }),
              });
              if (res.ok) {
                const json = await res.json();
                const { created = 0, linked = 0 } = json?.data ?? {};
                setMsg({
                  text: `${t.backfillDoneTitle} ${t.backfillDoneBody
                    .replace('{{created}}', String(created))
                    .replace('{{linked}}', String(linked))}`,
                  isError: false,
                });
              } else {
                setMsg({ text: t.backfillFailedToast, isError: true });
              }
            } catch {
              setMsg({ text: t.backfillFailedToast, isError: true });
            }
            setBusy(false);
          },
        },
      ],
    );
  };

  const onConnect = async () => {
    console.log('[connect] start. apiBaseUrl:', apiBaseUrl || '(EMPTY!)');
    setBusy(true);
    setMsg(null);
    const result = await linkGoogleContacts();
    console.log('[connect] linkGoogleContacts returned. ok:', result.ok, 'reason:', 'reason' in result ? result.reason : 'n/a');
    if (!result.ok) {
      setBusy(false);
      if (result.reason === 'cancelled') {
        setMsg({ text: t.cancelled, isError: false });
      } else {
        // Show the underlying message when present so we can see which
        // branch of linkGoogleContacts threw — otherwise every failure
        // surfaces as the unhelpful `[generic]`.
        const detail = 'message' in result && result.message ? `: ${result.message}` : '';
        setMsg({ text: `${t.connectError} [${result.reason}]${detail}`, isError: true });
      }
      return;
    }
    const jwt = await getJwt();
    console.log('[connect] jwt present:', !!jwt, 'sending to:', `${apiBaseUrl}/api/v1/google-sync/connect`);
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          business_id: businessId,
          refresh_token: result.refresh_token,
          client_id: result.client_id,
          scopes: result.scopes,
        }),
      });
      console.log('[connect] /connect response status:', res.status);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.log('[connect] error body:', text);
        setMsg({ text: `${t.connectError} [HTTP ${res.status}]`, isError: true });
      } else {
        await fetchStatus();
        // Prompt to backfill existing clients. We do this AFTER refreshing
        // status so the UI is already in the connected state behind the alert.
        await maybeOfferBackfill();
      }
    } catch (err) {
      console.log('[connect] fetch threw:', err);
      setMsg({ text: `${t.connectError} [network]`, isError: true });
    }
    setBusy(false);
  };

  // Performs the actual disconnect API call. Split out so the dialog can
  // wire up "Keep" vs "Also remove" buttons to the same code path.
  const performDisconnect = async (deleteContacts: boolean) => {
    if (!businessId) return;
    setBusy(true);
    const jwt = await getJwt();
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ delete_contacts: deleteContacts, business_id: businessId }),
      });
    } catch {}
    await fetchStatus();
    setBusy(false);
  };

  const onDisconnect = async () => {
    if (!businessId) return;
    // First, look up how many synced contacts will be affected so the user
    // sees the real impact in the confirmation dialog. If the count fetch
    // fails we just show "your contacts" generically.
    setBusy(true);
    let syncedCount = 0;
    try {
      const jwt = await getJwt();
      const r = await fetch(`${apiBaseUrl}/api/v1/google-sync/synced-count?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (r.ok) {
        const json = await r.json();
        syncedCount = json?.data?.count ?? 0;
      }
    } catch {}
    setBusy(false);

    const countLabel = syncedCount > 0
      ? t.disconnectCountWithNumber.replace('{{count}}', String(syncedCount))
      : t.disconnectCountGeneric;

    Alert.alert(
      t.disconnectTitle,
      `${t.disconnectBody}\n\n${countLabel}`,
      [
        { text: full.common.buttons.cancel, style: 'cancel' },
        { text: t.disconnectKeepBtn, onPress: () => performDisconnect(false) },
        { text: t.disconnectDeleteBtn, style: 'destructive', onPress: () => performDisconnect(true) },
      ],
    );
  };

  const onGroupChange = async (groupId: string) => {
    const found = groups.find((g) => g.id === groupId);
    setBusy(true);
    const jwt = await getJwt();
    if (!businessId) return;
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/contact-group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          business_id: businessId,
          contact_group_id: groupId || null,
          contact_group_name: found?.name ?? null,
        }),
      });
    } catch {}
    await fetchStatus();
    setBusy(false);
  };

  const statusLabel = !status.connected
    ? t.disconnected
    : status.enabled === false
      ? t.reconnectNeeded
      : t.connected;

  const statusColor = !status.connected
    ? '#9CA3AF'
    : status.enabled === false
      ? '#F59E0B'
      : '#10B981';

  return (
    <View className="gap-3">
      <SectionHeader
        icon={<Cloud size={18} color="#4F46E5" />}
        title={t.heading}
        subtitle={t.subtitle}
      />

      <View className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
        <View className="flex-row items-center gap-2 mb-1">
          {status.connected && status.enabled !== false ? (
            <CheckCircle2 size={14} color={statusColor} />
          ) : status.connected ? (
            <AlertCircle size={14} color={statusColor} />
          ) : null}
          <Text className="text-sm font-semibold" style={{ color: statusColor }}>
            {loading ? '…' : statusLabel}
          </Text>
        </View>
        {status.lastSyncAt ? (
          <Text className="text-xs text-gray-500">
            {t.lastSyncedAt}: {new Date(status.lastSyncAt).toLocaleString()}
          </Text>
        ) : null}
        {status.lastSyncError ? (
          <Text className="text-xs text-red-500 mt-1">
            {t.lastSyncError}: {status.lastSyncError}
          </Text>
        ) : null}
      </View>

      {status.connected && status.enabled !== false ? (
        <Select
          label={t.contactGroupLabel}
          value={status.contactGroupId ?? ''}
          onValueChange={onGroupChange}
          options={[
            { value: '', label: t.contactGroupNoneOption },
            ...groups.map((g) => ({ value: g.id, label: g.name })),
          ]}
        />
      ) : null}

      {/* Force-sync sits above Disconnect — same handler as the
          "Apply to existing contacts" button down in the template card,
          but surfaced near the connection controls where users naturally
          look for sync actions. Re-pushes every synced client + contact
          using the current template. */}
      {status.connected && status.enabled !== false ? (
        <>
          <Pressable
            onPress={onReapplyTemplate}
            disabled={busy}
            className="py-3 rounded-2xl bg-primary items-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-white">{t.forceSyncBtn}</Text>
          </Pressable>
          <Pressable
            onPress={onDisconnect}
            disabled={busy}
            className="py-3 rounded-2xl bg-white border border-gray-200 items-center active:bg-gray-50"
          >
            <Text className="text-sm font-semibold text-gray-700">{t.disconnectBtn}</Text>
          </Pressable>
        </>
      ) : null}

      {/* Notes template editor — only meaningful when connected. Lets the
          user stuff custom-field values into the Google biography so they
          show up on iPhone Contacts (which doesn't render userDefined fields). */}
      {status.connected && status.enabled !== false && templateLoaded ? (
        <View className="gap-2 bg-white rounded-2xl border border-gray-100 p-4">
          <Text className="text-sm font-semibold text-gray-900">{t.templateTitle}</Text>
          <Text className="text-xs text-gray-500 leading-5">{t.templateHint}</Text>
          <TextInput
            value={notesTemplate}
            onChangeText={setNotesTemplate}
            multiline
            placeholder={t.templatePlaceholder}
            placeholderTextColor="#9CA3AF"
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white"
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          {availableFields.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5 pt-1">
              <Text className="text-xs text-gray-500 mr-1">{t.templateAvailable}:</Text>
              {availableFields.map(label => (
                <Pressable
                  key={label}
                  onPress={() => setNotesTemplate(prev => {
                    const sep = prev && !prev.endsWith('\n') ? '\n' : '';
                    // Notas is multiline free-form text — drop a bare
                    // placeholder. Custom fields render single-line so the
                    // "Label: {{Label}}" shortcut is friendlier.
                    const insertion = label === 'Notas'
                      ? `{{${label}}}`
                      : `${label}: {{${label}}}`;
                    return `${prev}${sep}${insertion}`;
                  })}
                  className="px-2 py-0.5 rounded-md bg-gray-100 active:bg-gray-200"
                >
                  <Text className="text-xs text-gray-700">{`{{${label}}}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <StatusMsg msg={templateMsg} />
          <Pressable
            onPress={onSaveTemplate}
            disabled={savingTemplate}
            className={`mt-1 py-2.5 rounded-xl items-center ${savingTemplate ? 'bg-primary/40' : 'bg-primary active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-white">
              {savingTemplate ? t.templateSaving : t.templateSaveBtn}
            </Text>
          </Pressable>
          <Pressable
            onPress={onReapplyTemplate}
            className="py-2.5 rounded-xl items-center border border-gray-200 bg-white active:bg-gray-50"
          >
            <Text className="text-sm font-semibold text-gray-700">{t.templateReapplyBtn}</Text>
          </Pressable>
        </View>
      ) : null}

      <StatusMsg msg={msg} />

      {!status.connected || status.enabled === false ? (
        <Button onPress={onConnect} loading={busy} fullWidth>
          <Text className="text-white font-semibold">
            {status.enabled === false ? t.reconnectBtn : t.connectBtn}
          </Text>
        </Button>
      ) : null}
    </View>
  );
}

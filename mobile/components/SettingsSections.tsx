import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
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
export function BusinessSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [name, setName] = useState(business?.name ?? '');
  const [city, setCity] = useState(business?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (business) {
      setName(business.name);
      setCity(business.city);
    }
  }, [business]);

  const onSave = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from('businesses')
      .update({ name, city })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.business.saveError : t.business.saveSuccess,
      isError: !!error,
    });
    if (!error) await refetchBusiness();
  };

  return (
    <View className="gap-5">
      <SectionHeader
        icon={<Building2 size={18} color="#4F46E5" />}
        title={t.business.heading}
        subtitle={t.business.subtitle}
      />
      <Input label={t.business.nameLabel} value={name} onChangeText={setName} autoCapitalize="words" />
      <Input label={t.business.cityLabel} value={city} onChangeText={setCity} autoCapitalize="words" />
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
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) setRequired(business.client_field_required ?? {});
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
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
    if (!error) await refetchBusiness();
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

  return (
    <View className="gap-7">
      <View className="gap-4">
        <SectionHeader
          icon={<Sliders size={18} color="#4F46E5" />}
          title={t.requiredFields.heading}
          subtitle={t.requiredFields.subtitle}
        />
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {DEFAULT_CLIENT_FIELD_KEYS.map((key, i) => (
            <View
              key={key}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i < DEFAULT_CLIENT_FIELD_KEYS.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <Text className="flex-1 text-sm text-gray-900">{FIELD_LABELS[key]}</Text>
              <Toggle value={!!required[key]} onValueChange={() => toggleRequired(key)} />
            </View>
          ))}
        </View>
        <StatusMsg msg={reqMsg} />
        <Button onPress={saveRequired} loading={savingReq} fullWidth>
          <Text className="text-white font-semibold">{t.requiredFields.saveBtn}</Text>
        </Button>
      </View>

      <View className="gap-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <SectionHeader
              icon={<Users size={18} color="#4F46E5" />}
              title={t.customFields.heading}
              subtitle={t.customFields.subtitle}
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

        {templates.length === 0 ? (
          <View className="py-8 items-center bg-white rounded-2xl border border-dashed border-gray-200">
            <Sliders size={24} color="#D1D5DB" />
            <Text className="text-xs text-gray-400 mt-2">{t.customFields.emptyState}</Text>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {templates.map((tpl, i) => (
              <View
                key={tpl.id}
                className={`flex-row items-center gap-3 px-4 py-3 ${
                  i < templates.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-sm font-medium text-gray-900">{tpl.field_label}</Text>
                    {tpl.required ? (
                      <View className="bg-orange-50 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] text-orange-600 font-semibold">
                          {t.customFields.requiredBadge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {t.fieldTypes[tpl.field_type]}
                    {tpl.field_type === 'select' && tpl.field_options?.length
                      ? ` · ${tpl.field_options.join(', ')}`
                      : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setEditing(tpl);
                    setModalOpen(true);
                  }}
                  className="p-2 rounded-lg active:bg-blue-50"
                >
                  <Pencil size={14} color="#3B82F6" />
                </Pressable>
                <Pressable
                  onPress={() => removeTemplate(tpl.id)}
                  className="p-2 rounded-lg active:bg-red-50"
                >
                  <Trash2 size={14} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

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

function FieldTemplateModal({
  open,
  onClose,
  editing,
  templates,
  businessId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: FieldTemplate | null;
  templates: FieldTemplate[];
  businessId: string | null;
  onSaved: () => void;
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
        .from('client_field_templates')
        .update(payload)
        .eq('id', editing.id);
      setSaving(false);
      if (err) {
        setError(t.customFields.errorSave);
        return;
      }
    } else {
      const { error: err } = await supabase.from('client_field_templates').insert({
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
    <View className="gap-7">
      <View className="gap-3">
        <SectionHeader
          icon={<UserIcon size={18} color="#4F46E5" />}
          title={t.account.heading}
          subtitle={t.account.subtitle}
        />
        <View className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <Text className="text-xs text-gray-500 mb-1">{t.account.emailLabel}</Text>
          <Text className="text-sm text-gray-900">{user?.email ?? '—'}</Text>
        </View>
      </View>

      <View className="gap-3">
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
                locale === code ? 'bg-primary' : 'bg-white border border-gray-200'
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

      <View className="gap-3">
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

  const [status, setStatus] = useState<GoogleStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const apiBaseUrl = getApiBaseUrl();

  const fetchStatus = async () => {
    if (!apiBaseUrl) return;
    setLoading(true);
    try {
      const jwt = await getJwt();
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/status`, {
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
    if (!apiBaseUrl) return;
    try {
      const jwt = await getJwt();
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/contact-groups`, {
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

  useEffect(() => {
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (status.connected) void fetchGroups();
  }, [status.connected]);

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
        setMsg({ text: `${t.connectError} [${result.reason}]`, isError: true });
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
          refresh_token: result.refresh_token,
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
      }
    } catch (err) {
      console.log('[connect] fetch threw:', err);
      setMsg({ text: `${t.connectError} [network]`, isError: true });
    }
    setBusy(false);
  };

  const onDisconnect = async () => {
    setBusy(true);
    const jwt = await getJwt();
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch {}
    await fetchStatus();
    setBusy(false);
  };

  const onGroupChange = async (groupId: string) => {
    const found = groups.find((g) => g.id === groupId);
    setBusy(true);
    const jwt = await getJwt();
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/contact-group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
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

      <StatusMsg msg={msg} />

      {!status.connected || status.enabled === false ? (
        <Button onPress={onConnect} loading={busy} fullWidth>
          <Text className="text-white font-semibold">
            {status.enabled === false ? t.reconnectBtn : t.connectBtn}
          </Text>
        </Button>
      ) : (
        <Pressable
          onPress={onDisconnect}
          disabled={busy}
          className="py-3 rounded-2xl bg-white border border-gray-200 items-center active:bg-gray-50"
        >
          <Text className="text-sm font-semibold text-gray-700">{t.disconnectBtn}</Text>
        </Pressable>
      )}
    </View>
  );
}

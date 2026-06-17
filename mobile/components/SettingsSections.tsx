import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert, TextInput, Image, Modal as RNModal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Building2,
  User as UserIcon,
  Lock,
  LogOut,
  Briefcase,
  Users,
  Plus,
  Pencil,
  Trash2,
  Sliders,
  Cloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Bell,
  Eye,
  EyeOff,
  X,
  Contrast,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { pathFromPublicUrl, PUBLIC_ASSETS_BUCKET } from '@amixos/shared/lib/storageUrls';
import { logAudit } from '@amixos/shared/lib/audit';
import { InvoiceDesigner } from './InvoiceDesigner';
import { normalizeBundle, activeBundleConfig, type InvoiceThemeBundle, type InvoiceBranding } from '@amixos/shared/lib/invoiceTemplate';
import { formatPhoneInput } from '@amixos/shared/lib/format';
import { ROLE_LABELS } from '@amixos/shared/lib/permissions';
import { createSupabaseClient } from '@/lib/supabase';
import { Input, Button, Modal, Toggle, Select, DatePicker } from '@amixos/shared/ui';
import {
  DAY_KEYS,
  DEFAULT_OPERATING_HOURS,
  normalizeOperatingHours,
  type OperatingHours,
} from '@amixos/shared/lib/operatingHours';
import { linkGoogleContacts } from '@/lib/oauth';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { ImportClientsModal } from '@/components/ImportClientsModal';
import { useSettingsSaveAction } from '@/components/SettingsPageWrapper';
import { moveTemplate } from '@amixos/shared/lib/fieldTemplates';
import { diffById, isDirty, isTempId, newTempId } from '@amixos/shared/lib/draftList';
import {
  JOB_ALERT_COLORS,
  JOB_ALERT_STYLE,
  normalizeJobAlertThresholds,
  type JobAlertColor,
  type JobAlertThresholds,
} from '@amixos/shared/lib/jobAlerts';
import { SortableList } from '@/components/SortableList';
import { useRouter } from 'expo-router';
import { ChevronUp, ChevronDown, ChevronRight, Palette, Sparkles, GripVertical } from 'lucide-react-native';

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
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(
    normalizeOperatingHours(business?.operating_hours) ?? DEFAULT_OPERATING_HOURS,
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoViewerOpen, setLogoViewerOpen] = useState(false);
  // Viewer backdrop: dark by default; toggle to white so dark/black logos
  // (which vanish on a dark backdrop) are visible.
  const [logoViewerLight, setLogoViewerLight] = useState(false);

  // Logo upload is immediate (pick → upload → persist → refetch), separate
  // from the form's save pill — same flow + bucket path as onboarding.
  const pickAndUploadLogo = async () => {
    if (!business) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setMsg({ text: t.business.logoError, isError: true }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      setMsg({ text: t.business.logoSizeError, isError: true });
      return;
    }
    setUploadingLogo(true);
    setMsg(null);
    try {
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `logos/${business.id}-${Date.now()}.${ext}`;
      const contentType = asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const { error: upErr } = await supabase.storage
        .from('business-assets')
        .upload(path, arrayBuffer, { upsert: true, contentType });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('business-assets').getPublicUrl(path);
      const { error: updErr } = await supabase.from('businesses').update({ logo_url: data.publicUrl }).eq('id', business.id);
      if (updErr) throw updErr;
      await refetchBusiness();
    } catch {
      setMsg({ text: t.business.logoError, isError: true });
    } finally {
      setUploadingLogo(false);
    }
  };

  // Remove the logo: delete the storage object (best-effort) then clear logo_url.
  const removeLogo = () => {
    if (!business?.logo_url) return;
    Alert.alert(t.business.logoLabel, t.business.logoRemoveConfirm, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: t.business.logoRemoveBtn,
        style: 'destructive',
        onPress: async () => {
          if (!business) return;
          setUploadingLogo(true);
          setMsg(null);
          try {
            const path = pathFromPublicUrl(business.logo_url);
            if (path) {
              await supabase.storage.from(PUBLIC_ASSETS_BUCKET).remove([path]);
            }
            const { error: updErr } = await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id);
            if (updErr) throw updErr;
            await refetchBusiness();
          } catch {
            setMsg({ text: t.business.logoError, isError: true });
          } finally {
            setUploadingLogo(false);
          }
        },
      },
    ]);
  };

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
    setOperatingHours(normalizeOperatingHours(business.operating_hours) ?? DEFAULT_OPERATING_HOURS);
  }, [business]);

  const onSave = async () => {
    if (!business) return;
    if (email.trim() && !isValidEmail(email)) {
      setMsg({ text: full.common.validation.invalidEmail, isError: true });
      return;
    }
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
        operating_hours: operatingHours,
      })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.business.saveError : t.business.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      void logAudit(supabase, business.id, 'business.updated', 'business', business.id, { name });
      await refetchBusiness();
    }
  };

  const stateOptions = [
    { value: '', label: '—' },
    ...BUSINESS_US_STATES.map((s) => ({ value: s, label: s })),
  ];

  // Surface the save action to the page header (top-right pill) like the
  // other settings sections, instead of a bottom button. Dirty = any field
  // differs from what's currently persisted on the business.
  const dirty =
    name !== (business?.name ?? '') ||
    email !== (business?.email ?? '') ||
    phone !== (business?.phone ?? '') ||
    website !== (business?.website ?? '') ||
    address !== (business?.address ?? '') ||
    city !== (business?.city ?? '') ||
    usState !== (business?.state ?? '') ||
    zip !== (business?.postal_code ?? '') ||
    taxId !== (business?.tax_id ?? '') ||
    license !== (business?.license_number ?? '') ||
    JSON.stringify(operatingHours) !==
      JSON.stringify(normalizeOperatingHours(business?.operating_hours) ?? DEFAULT_OPERATING_HOURS);
  useSettingsSaveAction({ dirty, saving, onSave });

  return (
    <View className="gap-5">
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<Building2 size={18} color="#4F46E5" />}
          title={t.business.heading}
          subtitle={t.business.subtitle}
        />

        {/* Logo — centered, `contain` so round/wide logos aren't clipped.
           Uploads immediately on pick. */}
        <View className="items-center gap-3 py-1">
          {business?.logo_url ? (
            <Pressable onPress={() => setLogoViewerOpen(true)}>
              <Image source={{ uri: business.logo_url }} className="w-24 h-24 rounded-2xl bg-gray-50" resizeMode="contain" />
            </Pressable>
          ) : (
            <View className="w-24 h-24 rounded-2xl bg-gray-100 items-center justify-center">
              <Building2 size={28} color="#9CA3AF" />
            </View>
          )}
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={pickAndUploadLogo}
              disabled={uploadingLogo}
              className={`px-3.5 py-1.5 rounded-xl ${uploadingLogo ? 'bg-primary/5' : 'bg-primary/10 active:bg-primary/20'}`}
            >
              <Text className="text-sm font-semibold text-primary">
                {uploadingLogo ? t.business.logoUploading : (business?.logo_url ? t.business.logoChangeBtn : t.business.logoUploadBtn)}
              </Text>
            </Pressable>
            {business?.logo_url && !uploadingLogo && (
              <Pressable
                onPress={removeLogo}
                className="px-3.5 py-1.5 rounded-xl active:bg-red-50"
              >
                <Text className="text-sm font-semibold text-red-500">{t.business.logoRemoveBtn}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Full-screen logo viewer — tap the logo to zoom; tap anywhere / the X
           to close. Explicit dark backdrop via style (reliable full-screen
           dim) + statusBarTranslucent so it covers the status bar too. */}
        <RNModal
          visible={logoViewerOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setLogoViewerOpen(false)}
        >
          <Pressable
            onPress={() => setLogoViewerOpen(false)}
            className="items-center justify-center px-8"
            style={{ flex: 1, backgroundColor: logoViewerLight ? '#FFFFFF' : 'rgba(0,0,0,0.92)' }}
          >
            {/* Background toggle (dark ⇄ white) for dark logos. */}
            <Pressable
              onPress={() => setLogoViewerLight((v) => !v)}
              hitSlop={12}
              style={{ position: 'absolute', top: 56, left: 20 }}
            >
              <Contrast size={24} color={logoViewerLight ? '#111827' : '#FFFFFF'} />
            </Pressable>
            <Pressable
              onPress={() => setLogoViewerOpen(false)}
              hitSlop={12}
              style={{ position: 'absolute', top: 56, right: 20 }}
            >
              <X size={26} color={logoViewerLight ? '#111827' : '#FFFFFF'} />
            </Pressable>
            {business?.logo_url ? (
              <Image source={{ uri: business.logo_url }} style={{ width: '85%', height: '55%' }} resizeMode="contain" />
            ) : null}
          </Pressable>
        </RNModal>

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
          value={formatPhoneInput(phone)}
          onChangeText={v => setPhone(formatPhoneInput(v))}
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

        <GroupLabel>{t.business.operatingHoursHeading}</GroupLabel>
        <Text className="text-xs text-gray-400 -mt-2">{t.business.operatingHoursSub}</Text>
        <View>
          {DAY_KEYS.map((dk) => {
            const d = operatingHours[dk];
            const setDay = (patch: Partial<typeof d>) =>
              setOperatingHours((prev) => ({ ...prev, [dk]: { ...prev[dk], ...patch } }));
            return (
              <View key={dk} className="flex-row items-center py-2.5">
                <Text className="w-24 text-sm text-gray-800">{t.business.days[dk]}</Text>
                <Toggle value={d.enabled} onValueChange={(v) => setDay({ enabled: v })} />
                <View className="flex-1" />
                {d.enabled ? (
                  <View className="flex-row items-center gap-1.5">
                    <DatePicker variant="ghost" mode="time" value={d.start} onChange={(v) => setDay({ start: v })} />
                    <Text className="text-gray-400 text-sm">–</Text>
                    <DatePicker variant="ghost" mode="time" value={d.end} onChange={(v) => setDay({ end: v })} />
                  </View>
                ) : (
                  <Text className="text-sm text-gray-400">{t.business.closedLabel}</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <StatusMsg msg={msg} />
    </View>
  );
}

// ─── Facturas section — default due window + terms (moved out of Negocio) ──
export function FacturasSection() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const tNew = full.dashboard.invoices.new;

  // Standard invoice fields the user can mark required. Order here is the
  // display order; the new/edit invoice form enforces the flags on save.
  const STANDARD_FIELDS: { key: string; label: string }[] = [
    { key: 'invoice_number', label: tNew.invoiceNumberLabel },
    { key: 'client', label: tNew.clientsLabel },
    { key: 'issue_date', label: tNew.issueDateLabel },
    { key: 'due_date', label: tNew.dueDateLabel },
    { key: 'notes', label: tNew.notesLabel },
  ];

  // Draft-until-save: working copy + db snapshot for every batched field.
  const [dueDays, setDueDays] = useState(
    business?.invoice_due_days != null ? String(business.invoice_due_days) : '',
  );
  const [dbDueDays, setDbDueDays] = useState(
    business?.invoice_due_days != null ? String(business.invoice_due_days) : '',
  );
  const [notes, setNotes] = useState(business?.invoice_notes_default ?? '');
  const [dbNotes, setDbNotes] = useState(business?.invoice_notes_default ?? '');
  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.invoice_field_required ?? {},
  );
  const [dbRequired, setDbRequired] = useState<Record<string, boolean>>(
    business?.invoice_field_required ?? {},
  );
  const [localOrder, setLocalOrder] = useState<string[]>(
    Array.isArray(business?.invoice_field_order) ? (business!.invoice_field_order as string[]) : [],
  );
  const [dbOrder, setDbOrder] = useState<string[]>(
    Array.isArray(business?.invoice_field_order) ? (business!.invoice_field_order as string[]) : [],
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (!business) return;
    const d = business.invoice_due_days != null ? String(business.invoice_due_days) : '';
    setDueDays(d); setDbDueDays(d);
    const n = business.invoice_notes_default ?? '';
    setNotes(n); setDbNotes(n);
    const r = business.invoice_field_required ?? {};
    setRequired(r); setDbRequired(r);
    const o = Array.isArray(business.invoice_field_order) ? (business.invoice_field_order as string[]) : [];
    setLocalOrder(o); setDbOrder(o);
  }, [business]);

  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase
      .from('invoice_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    const fetched = (data as FieldTemplate[] | null) ?? [];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setMsg(null);
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.invoices.confirmDeleteField, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
          setLocalOrder((prev) => prev.filter((k) => k !== `custom:${id}`));
        },
      },
    ]);
  };

  // Local-only template insert/update from the modal.
  const onTemplateSubmit = (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => {
    if (editing) {
      setTemplates((prev) =>
        prev.map((tpl) =>
          tpl.id === editing.id
            ? { ...tpl, field_label: data.field_label, field_type: data.field_type, field_options: data.field_options, required: data.required }
            : tpl,
        ),
      );
    } else {
      const newTpl: FieldTemplate = {
        id: newTempId(),
        field_key: data.field_key,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        required: data.required,
        sort_order: templates.length,
      };
      setTemplates((prev) => [...prev, newTpl]);
      setLocalOrder((prev) => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    }
    setModalOpen(false);
  };

  // One save covers everything on the page: due window, terms, required
  // flags, templates (diff), and the unified field order.
  const onSave = async () => {
    if (!business) return;
    const trimmed = dueDays.trim();
    const days = trimmed === '' ? null : Number(trimmed);
    if (days != null && (!Number.isInteger(days) || days < 0)) {
      setMsg({ text: t.invoices.saveError, isError: true });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbTemplates.length + i,
        }));
        const { data: created, error } = await supabase
          .from('invoice_field_templates').insert(rows).select();
        if (error) throw error;
        ops.inserts.forEach((tmp, i) => {
          const realId = (created as { id: string }[] | null)?.[i]?.id;
          if (realId) tempToReal[tmp.id] = realId;
        });
      }
      for (const u of ops.updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from('invoice_field_templates').update(rest).eq('id', id);
        if (error) throw error;
      }
      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('invoice_field_templates').delete().in('id', ops.deletes);
        if (error) throw error;
      }

      const resolvedOrder = localOrder
        .map((key) => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        invoice_due_days: days,
        invoice_notes_default: notes.trim() || null,
        invoice_field_required: required,
        invoice_field_order: resolvedOrder,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalOrder(resolvedOrder);
      setDbOrder(resolvedOrder);
      setDbRequired(required);
      setDbDueDays(dueDays);
      setDbNotes(notes);
      setMsg({ text: t.invoices.saveSuccess, isError: false });
    } catch {
      setMsg({ text: t.invoices.saveError, isError: true });
    }
    setSaving(false);
  };

  const dirty = useMemo(
    () =>
      dueDays !== dbDueDays ||
      notes !== dbNotes ||
      JSON.stringify(dbRequired) !== JSON.stringify(required) ||
      JSON.stringify(dbOrder) !== JSON.stringify(localOrder) ||
      isDirty(dbTemplates, templates),
    [dueDays, dbDueDays, notes, dbNotes, dbRequired, required, dbOrder, localOrder, dbTemplates, templates],
  );
  useSettingsSaveAction({ dirty, saving, onSave });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = STANDARD_FIELDS.map((f) => ({
      kind: 'standard' as const,
      key: f.key,
      label: f.label,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const,
      key: `custom:${tpl.id}`,
      label: tpl.field_label,
      tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));

    if (localOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localOrder, full]);

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalOrder(next.map((i) => i.key));
    setMsg(null);
  };

  const onDragReorder = (next: { id: string }[]) => {
    setLocalOrder(next.map((i) => i.id));
    setMsg(null);
  };

  return (
    <View className="gap-5">
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<FileText size={18} color="#4F46E5" />}
          title={t.invoices.heading}
          subtitle={t.invoices.subtitle}
        />
        <Input
          label={t.invoices.dueDaysLabel}
          value={dueDays}
          onChangeText={(v) => setDueDays(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
        />
        <Text className="text-xs text-gray-400 -mt-2">{t.invoices.dueDaysHint}</Text>
        <View>
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">{t.invoices.notesLabel}</Text>
          <View className="rounded-2xl border border-gray-200 bg-white px-4 py-1">
            <TextInput
              multiline
              placeholder={t.invoices.notesPlaceholder}
              placeholderTextColor="#9CA3AF"
              value={notes}
              onChangeText={setNotes}
              className="text-base text-gray-900 py-2"
              style={{ textAlignVertical: 'top', minHeight: 70 }}
            />
          </View>
        </View>
      </View>

      {/* Unified fields list: standard (required toggle) + custom
         (edit/delete), reorderable. Same UX as Trabajos. */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <SectionHeader
            icon={<Sliders size={18} color="#4F46E5" />}
            title={t.invoicesSection.title}
            subtitle={t.invoicesSection.subtitle}
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
        <SortableList<UnifiedItem & { id: string }>
          items={items.map((it) => ({ ...it, id: it.key }))}
          onReorder={onDragReorder}
          renderItem={(item, i, { drag, isActive }) => {
            const isLast = i === items.length - 1;
            return (
              <View
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  isActive ? 'bg-primary/5' : ''
                } ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                <Pressable onLongPress={drag} delayLongPress={120} hitSlop={6} className="p-1 -ml-1 active:opacity-60">
                  <GripVertical size={14} color="#9CA3AF" />
                </Pressable>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    {item.kind === 'custom' ? <Sparkles size={12} color="#4F46E5" /> : null}
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
          }}
        />
      </View>

      <StatusMsg msg={msg} />

      {/* Invoice theme lives here — a drill-in rather than a separate menu item. */}
      <Pressable
        onPress={() => router.push('/dashboard/mas/ajustes/factura-tema' as never)}
        className="bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-3 active:bg-gray-50"
      >
        <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
          <Palette size={18} color="#4F46E5" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.invoices.design.title}</Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>{t.invoices.design.subtitle}</Text>
        </View>
        <ChevronRight size={18} color="#9CA3AF" />
      </Pressable>

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        onSubmit={onTemplateSubmit}
      />
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

  // Surface save to the page header (top-right pill) like the sibling
  // sections, instead of a bottom button. Dirty = any step toggle differs
  // from what's persisted (missing key == not disabled).
  const savedDisabled = business?.job_pipeline_disabled ?? {};
  const dirty = (() => {
    const keys = new Set([...Object.keys(disabled), ...Object.keys(savedDisabled)]);
    for (const k of keys) if (!!disabled[k] !== !!savedDisabled[k]) return true;
    return false;
  })();
  useSettingsSaveAction({ dirty, saving, onSave });

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

  // Draft pattern (mirrors Clientes/Facturas).
  const [required, setRequired] = useState<Record<string, boolean>>(business?.job_field_required ?? {});
  const [dbRequired, setDbRequired] = useState<Record<string, boolean>>(business?.job_field_required ?? {});
  const [localOrder, setLocalOrder] = useState<string[]>(
    Array.isArray(business?.job_field_order) ? (business!.job_field_order as string[]) : [],
  );
  const [dbOrder, setDbOrder] = useState<string[]>(
    Array.isArray(business?.job_field_order) ? (business!.job_field_order as string[]) : [],
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const r = business.job_field_required ?? {};
      setRequired(r); setDbRequired(r);
      const o = Array.isArray(business.job_field_order) ? (business.job_field_order as string[]) : [];
      setLocalOrder(o); setDbOrder(o);
    }
  }, [business]);

  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase
      .from('job_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    const fetched = (data as FieldTemplate[] | null) ?? [];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    try {
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbTemplates.length + i,
        }));
        const { data: created, error } = await supabase
          .from('job_field_templates').insert(rows).select();
        if (error) throw error;
        ops.inserts.forEach((tmp, i) => {
          const realId = (created as { id: string }[] | null)?.[i]?.id;
          if (realId) tempToReal[tmp.id] = realId;
        });
      }
      for (const u of ops.updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from('job_field_templates').update(rest).eq('id', id);
        if (error) throw error;
      }
      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('job_field_templates').delete().in('id', ops.deletes);
        if (error) throw error;
      }

      const resolvedOrder = localOrder
        .map((key) => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        job_field_required: required,
        job_field_order: resolvedOrder,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalOrder(resolvedOrder); setDbOrder(resolvedOrder); setDbRequired(required);
      setReqMsg({ text: t.requiredFields.saveSuccess, isError: false });
    } catch {
      setReqMsg({ text: t.requiredFields.saveError, isError: true });
    }
    setSavingReq(false);
  };

  const dirty = useMemo(
    () =>
      isDirty(dbTemplates, templates) ||
      JSON.stringify(dbRequired) !== JSON.stringify(required) ||
      JSON.stringify(dbOrder) !== JSON.stringify(localOrder),
    [dbTemplates, templates, dbRequired, required, dbOrder, localOrder],
  );

  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_JOB_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const, key: k, label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const, key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));
    if (localOrder.length === 0) return all;
    const ordered: UnifiedItem[] = [];
    for (const k of localOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localOrder, full]);

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalOrder(next.map((i) => i.key));
    setReqMsg(null);
  };

  const onDragReorder = (next: { id: string }[]) => {
    setLocalOrder(next.map((i) => i.id));
    setReqMsg(null);
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
          setLocalOrder((prev) => prev.filter((k) => k !== `custom:${id}`));
        },
      },
    ]);
  };

  const onTemplateSubmit = (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => {
    if (editing) {
      setTemplates((prev) =>
        prev.map((tpl) =>
          tpl.id === editing.id
            ? { ...tpl, field_label: data.field_label, field_type: data.field_type, field_options: data.field_options, required: data.required }
            : tpl,
        ),
      );
    } else {
      const newTpl: FieldTemplate = {
        id: newTempId(),
        field_key: data.field_key,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        required: data.required,
        sort_order: templates.length,
      };
      setTemplates((prev) => [...prev, newTpl]);
      setLocalOrder((prev) => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    }
    setModalOpen(false);
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
        <SortableList<UnifiedItem & { id: string }>
          items={items.map((it) => ({ ...it, id: it.key }))}
          onReorder={onDragReorder}
          renderItem={(item, i, { drag, isActive }) => {
            const isLast = i === items.length - 1;
            return (
              <View
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  isActive ? 'bg-primary/5' : ''
                } ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                <Pressable onLongPress={drag} delayLongPress={120} hitSlop={6} className="p-1 -ml-1 active:opacity-60">
                  <GripVertical size={14} color="#9CA3AF" />
                </Pressable>
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
          }}
        />
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        onSubmit={onTemplateSubmit}
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

// ─── Job alerts (upcoming-job tier highlight) ─────────────────────────────
// Owner-configured tiers (e.g. "1 day before = red, 3 days before = orange")
// that surface as a colored left border + chip on each job card. Schema:
// businesses.job_alert_thresholds (migration 046). Matching logic +
// rendering live in shared/lib/jobAlerts.ts.
export function JobAlertsSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const initial = normalizeJobAlertThresholds(business?.job_alert_thresholds);
  const [value, setValue] = useState<JobAlertThresholds>(initial);
  const [saved, setSaved] = useState<JobAlertThresholds>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (business) {
      const fresh = normalizeJobAlertThresholds(business.job_alert_thresholds);
      setValue(fresh);
      setSaved(fresh);
    }
  }, [business]);

  const toggleEnabled = () => {
    setValue(v => ({ ...v, enabled: !v.enabled }));
    setMsg(null);
  };
  const toggleOverdue = () => {
    setValue(v => ({ ...v, overdue: !v.overdue }));
    setMsg(null);
  };
  const addLevel = () => {
    setValue(v => ({ ...v, levels: [...v.levels, { days: 1, color: 'red' as JobAlertColor }] }));
    setMsg(null);
  };
  const updateLevel = (idx: number, patch: Partial<{ days: number; color: JobAlertColor }>) => {
    setValue(v => ({
      ...v,
      levels: v.levels.map((lvl, i) => i === idx ? { ...lvl, ...patch } : lvl),
    }));
    setMsg(null);
  };
  const removeLevel = (idx: number) => {
    setValue(v => ({ ...v, levels: v.levels.filter((_, i) => i !== idx) }));
    setMsg(null);
  };

  const save = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    // Persist with levels sorted ascending by days so matchJobAlert
    // (which assumes that order) sees the same shape on every read.
    const payload: JobAlertThresholds = {
      enabled: value.enabled,
      levels: [...value.levels].sort((a, b) => a.days - b.days),
      overdue: value.overdue,
    };
    const { error } = await supabase
      .from('businesses')
      .update({ job_alert_thresholds: payload })
      .eq('id', business.id);
    setSaving(false);
    setMsg({
      text: error ? t.jobAlerts.saveError : t.jobAlerts.saveSuccess,
      isError: !!error,
    });
    if (!error) {
      setValue(payload);
      setSaved(payload);
      await refetchBusiness();
    }
  };

  const dirty = JSON.stringify(saved) !== JSON.stringify(value);
  useSettingsSaveAction({ dirty, saving, onSave: save });

  const colorOptions = JOB_ALERT_COLORS.map(c => ({ value: c, label: t.jobAlerts.colors[c] }));

  return (
    <View className="gap-3">
      <SectionHeader
        icon={<Bell size={18} color="#4F46E5" />}
        title={t.jobAlerts.heading}
        subtitle={t.jobAlerts.subtitle}
      />

      <View className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex-row items-center">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-medium text-gray-900">{t.jobAlerts.enabledLabel}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">{t.jobAlerts.enabledHint}</Text>
        </View>
        <Toggle value={value.enabled} onValueChange={toggleEnabled} />
      </View>

      {value.enabled && (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-gray-500 uppercase">
              {t.jobAlerts.levelsHeading}
            </Text>
            <Pressable
              onPress={addLevel}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 active:opacity-80"
            >
              <Plus size={14} color="#4F46E5" />
              <Text className="text-xs font-semibold text-primary">{t.jobAlerts.addLevelBtn}</Text>
            </Pressable>
          </View>

          {value.levels.length === 0 ? (
            <Text className="text-xs text-gray-400 italic py-2">{t.jobAlerts.levelsEmpty}</Text>
          ) : (
            value.levels.map((level, idx) => {
              const swatch = JOB_ALERT_STYLE[level.color as JobAlertColor];
              return (
                <View
                  key={idx}
                  className={`bg-white rounded-xl border border-gray-100 border-l-4 px-3 py-3 ${
                    swatch?.borderClass ?? 'border-l-gray-300'
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        keyboardType="number-pad"
                        value={String(level.days)}
                        onChangeText={txt => {
                          const n = parseInt(txt.replace(/[^0-9]/g, ''), 10);
                          updateLevel(idx, { days: Number.isFinite(n) ? Math.max(0, n) : 0 });
                        }}
                        className="w-14 px-2 py-1.5 text-sm text-gray-900 rounded-lg border border-gray-200 bg-white text-center"
                      />
                      <Text className="text-xs text-gray-500">
                        {level.days === 1 ? t.jobAlerts.daysSuffixOne : t.jobAlerts.daysSuffixMany}
                      </Text>
                    </View>
                    <View className="flex-1" />
                    <Pressable
                      onPress={() => removeLevel(idx)}
                      accessibilityLabel={t.jobAlerts.removeLevelLabel}
                      className="p-2 rounded-lg active:bg-red-50"
                    >
                      <Trash2 size={14} color="#F87171" />
                    </Pressable>
                  </View>
                  <View className="mt-2">
                    <Select
                      value={level.color}
                      onValueChange={v => updateLevel(idx, { color: v as JobAlertColor })}
                      options={colorOptions}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Overdue indicator — independent of the day-tier levels above. */}
      <View className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex-row items-center">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-medium text-gray-900">{t.jobAlerts.overdueHeading}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">{t.jobAlerts.overdueSubtitle}</Text>
        </View>
        <Toggle value={value.overdue} onValueChange={toggleOverdue} />
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

  // Draft pattern (mirrors Clientes/Facturas/TrabajosFields).
  const [required, setRequired] = useState<Record<string, boolean>>(business?.assignment_field_required ?? {});
  const [dbRequired, setDbRequired] = useState<Record<string, boolean>>(business?.assignment_field_required ?? {});
  const [localOrder, setLocalOrder] = useState<string[]>(
    Array.isArray(business?.assignment_field_order) ? (business!.assignment_field_order as string[]) : [],
  );
  const [dbOrder, setDbOrder] = useState<string[]>(
    Array.isArray(business?.assignment_field_order) ? (business!.assignment_field_order as string[]) : [],
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const r = business.assignment_field_required ?? {};
      setRequired(r); setDbRequired(r);
      const o = Array.isArray(business.assignment_field_order) ? (business.assignment_field_order as string[]) : [];
      setLocalOrder(o); setDbOrder(o);
    }
  }, [business]);

  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase
      .from('job_assignment_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    const fetched = (data as FieldTemplate[] | null) ?? [];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    try {
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbTemplates.length + i,
        }));
        const { data: created, error } = await supabase
          .from('job_assignment_field_templates').insert(rows).select();
        if (error) throw error;
        ops.inserts.forEach((tmp, i) => {
          const realId = (created as { id: string }[] | null)?.[i]?.id;
          if (realId) tempToReal[tmp.id] = realId;
        });
      }
      for (const u of ops.updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from('job_assignment_field_templates').update(rest).eq('id', id);
        if (error) throw error;
      }
      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('job_assignment_field_templates').delete().in('id', ops.deletes);
        if (error) throw error;
      }

      const resolvedOrder = localOrder
        .map((key) => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        assignment_field_required: required,
        assignment_field_order: resolvedOrder,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalOrder(resolvedOrder); setDbOrder(resolvedOrder); setDbRequired(required);
      setReqMsg({ text: t.requiredFields.saveSuccess, isError: false });
    } catch {
      setReqMsg({ text: t.requiredFields.saveError, isError: true });
    }
    setSavingReq(false);
  };

  const dirty = useMemo(
    () =>
      isDirty(dbTemplates, templates) ||
      JSON.stringify(dbRequired) !== JSON.stringify(required) ||
      JSON.stringify(dbOrder) !== JSON.stringify(localOrder),
    [dbTemplates, templates, dbRequired, required, dbOrder, localOrder],
  );
  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_ASSIGNMENT_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const, key: k, label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const, key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));
    if (localOrder.length === 0) return all;
    const ordered: UnifiedItem[] = [];
    for (const k of localOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localOrder, full]);

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalOrder(next.map((i) => i.key));
    setReqMsg(null);
  };

  const onDragReorder = (next: { id: string }[]) => {
    setLocalOrder(next.map((i) => i.id));
    setReqMsg(null);
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
          setLocalOrder((prev) => prev.filter((k) => k !== `custom:${id}`));
        },
      },
    ]);
  };

  const onTemplateSubmit = (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => {
    if (editing) {
      setTemplates((prev) =>
        prev.map((tpl) =>
          tpl.id === editing.id
            ? { ...tpl, field_label: data.field_label, field_type: data.field_type, field_options: data.field_options, required: data.required }
            : tpl,
        ),
      );
    } else {
      const newTpl: FieldTemplate = {
        id: newTempId(),
        field_key: data.field_key,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        required: data.required,
        sort_order: templates.length,
      };
      setTemplates((prev) => [...prev, newTpl]);
      setLocalOrder((prev) => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    }
    setModalOpen(false);
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
        <SortableList<UnifiedItem & { id: string }>
          items={items.map((it) => ({ ...it, id: it.key }))}
          onReorder={onDragReorder}
          renderItem={(item, i, { drag, isActive }) => {
            const isLast = i === items.length - 1;
            return (
              <View
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  isActive ? 'bg-primary/5' : ''
                } ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                <Pressable onLongPress={drag} delayLongPress={120} hitSlop={6} className="p-1 -ml-1 active:opacity-60">
                  <GripVertical size={14} color="#9CA3AF" />
                </Pressable>
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
          }}
        />
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        onSubmit={onTemplateSubmit}
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

  // Draft-until-save: each user-mutated value (templates, required-flags,
  // order) is paired with a `db*` snapshot. saveRequired() diffs the two
  // and persists everything in one batch; the header pill stays disabled
  // until something is dirty.
  const [required, setRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {},
  );
  const [dbRequired, setDbRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {},
  );
  const [localOrder, setLocalOrder] = useState<string[]>(
    Array.isArray(business?.client_field_order) ? (business!.client_field_order as string[]) : [],
  );
  const [dbOrder, setDbOrder] = useState<string[]>(
    Array.isArray(business?.client_field_order) ? (business!.client_field_order as string[]) : [],
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
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
      const r = business.client_field_required ?? {};
      setRequired(r);
      setDbRequired(r);
      const o = Array.isArray(business.client_field_order) ? (business.client_field_order as string[]) : [];
      setLocalOrder(o);
      setDbOrder(o);
    }
  }, [business]);

  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase
      .from('client_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    const fetched = (data as FieldTemplate[] | null) ?? [];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
    void loadCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

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

  // Full save: diff templates → insert/update/delete, then write the
  // business row with required-flags + resolved order (temp ids replaced
  // with the real ones returned from inserts).
  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    try {
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbTemplates.length + i,
        }));
        const { data: created, error } = await supabase
          .from('client_field_templates').insert(rows).select();
        if (error) throw error;
        ops.inserts.forEach((tmp, i) => {
          const realId = (created as { id: string }[] | null)?.[i]?.id;
          if (realId) tempToReal[tmp.id] = realId;
        });
      }
      for (const u of ops.updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from('client_field_templates').update(rest).eq('id', id);
        if (error) throw error;
      }
      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('client_field_templates').delete().in('id', ops.deletes);
        if (error) throw error;
      }

      const resolvedOrder = localOrder
        .map((key) => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        client_field_required: required,
        client_field_order: resolvedOrder,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalOrder(resolvedOrder);
      setDbOrder(resolvedOrder);
      setDbRequired(required);
      setReqMsg({ text: t.requiredFields.saveSuccess, isError: false });
    } catch {
      setReqMsg({ text: t.requiredFields.saveError, isError: true });
    }
    setSavingReq(false);
  };

  // Dirty when any of templates / required / order differs from its db snapshot.
  const dirty = useMemo(
    () =>
      isDirty(dbTemplates, templates) ||
      JSON.stringify(dbRequired) !== JSON.stringify(required) ||
      JSON.stringify(dbOrder) !== JSON.stringify(localOrder),
    [dbTemplates, templates, dbRequired, required, dbOrder, localOrder],
  );

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

  const items: UnifiedItem[] = useMemo(() => {
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

    if (localOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    // New templates / new standard fields not yet in the saved order get
    // appended so they stay visible.
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localOrder, full]);

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalOrder(next.map((i) => i.key));
    setReqMsg(null);
  };

  const onDragReorder = (next: { id: string }[]) => {
    setLocalOrder(next.map((i) => i.id));
    setReqMsg(null);
  };

  // Local-only — actual DB delete happens at Save time via the diff.
  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
          setLocalOrder((prev) => prev.filter((k) => k !== `custom:${id}`));
        },
      },
    ]);
  };

  // Local-only insert/update from the modal's onSubmit callback.
  const onTemplateSubmit = (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => {
    if (editing) {
      setTemplates((prev) =>
        prev.map((tpl) =>
          tpl.id === editing.id
            ? {
                ...tpl,
                field_label: data.field_label,
                field_type: data.field_type,
                field_options: data.field_options,
                required: data.required,
              }
            : tpl,
        ),
      );
    } else {
      const newTpl: FieldTemplate = {
        id: newTempId(),
        field_key: data.field_key,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        required: data.required,
        sort_order: templates.length,
      };
      setTemplates((prev) => [...prev, newTpl]);
      setLocalOrder((prev) =>
        prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`],
      );
    }
    setModalOpen(false);
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
        <SortableList<UnifiedItem & { id: string }>
          items={items.map((it) => ({ ...it, id: it.key }))}
          onReorder={onDragReorder}
          renderItem={(item, i, { drag, isActive }) => {
            const isLast = i === items.length - 1;
            return (
              <View
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  isActive ? 'bg-primary/5' : ''
                } ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                {/* Drag handle — long-press to start drag. */}
                <Pressable
                  onLongPress={drag}
                  delayLongPress={120}
                  hitSlop={6}
                  className="p-1 -ml-1 active:opacity-60"
                >
                  <GripVertical size={14} color="#9CA3AF" />
                </Pressable>
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

                {/* Reorder arrows — accessibility fallback alongside DnD. */}
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

                {/* Right-side controls: standard → required toggle; custom →
                   edit + delete (required lives on the template itself). */}
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
          }}
        />
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        onSubmit={onTemplateSubmit}
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

  // Draft pattern (mirrors the other sections).
  const [required, setRequired] = useState<Record<string, boolean>>(business?.employee_field_required ?? {});
  const [dbRequired, setDbRequired] = useState<Record<string, boolean>>(business?.employee_field_required ?? {});
  const [localOrder, setLocalOrder] = useState<string[]>(
    Array.isArray(business?.employee_field_order) ? (business!.employee_field_order as string[]) : [],
  );
  const [dbOrder, setDbOrder] = useState<string[]>(
    Array.isArray(business?.employee_field_order) ? (business!.employee_field_order as string[]) : [],
  );
  const [savingReq, setSavingReq] = useState(false);
  const [reqMsg, setReqMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FieldTemplate | null>(null);

  useEffect(() => {
    if (business) {
      const r = business.employee_field_required ?? {};
      setRequired(r); setDbRequired(r);
      const o = Array.isArray(business.employee_field_order) ? (business.employee_field_order as string[]) : [];
      setLocalOrder(o); setDbOrder(o);
    }
  }, [business]);

  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase
      .from('employee_field_templates')
      .select('*')
      .eq('business_id', business.id)
      .order('sort_order');
    const fetched = (data as FieldTemplate[] | null) ?? [];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => {
    if (!business) return;
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  const toggleRequired = (key: string) => {
    setRequired((prev) => ({ ...prev, [key]: !prev[key] }));
    setReqMsg(null);
  };

  const saveRequired = async () => {
    if (!business) return;
    setSavingReq(true);
    setReqMsg(null);
    try {
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbTemplates.length + i,
        }));
        const { data: created, error } = await supabase
          .from('employee_field_templates').insert(rows).select();
        if (error) throw error;
        ops.inserts.forEach((tmp, i) => {
          const realId = (created as { id: string }[] | null)?.[i]?.id;
          if (realId) tempToReal[tmp.id] = realId;
        });
      }
      for (const u of ops.updates) {
        const { id, ...rest } = u;
        const { error } = await supabase.from('employee_field_templates').update(rest).eq('id', id);
        if (error) throw error;
      }
      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('employee_field_templates').delete().in('id', ops.deletes);
        if (error) throw error;
      }

      const resolvedOrder = localOrder
        .map((key) => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        employee_field_required: required,
        employee_field_order: resolvedOrder,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalOrder(resolvedOrder); setDbOrder(resolvedOrder); setDbRequired(required);
      setReqMsg({ text: t.requiredFields.saveSuccess, isError: false });
    } catch {
      setReqMsg({ text: t.requiredFields.saveError, isError: true });
    }
    setSavingReq(false);
  };

  const dirty = useMemo(
    () =>
      isDirty(dbTemplates, templates) ||
      JSON.stringify(dbRequired) !== JSON.stringify(required) ||
      JSON.stringify(dbOrder) !== JSON.stringify(localOrder),
    [dbTemplates, templates, dbRequired, required, dbOrder, localOrder],
  );

  useSettingsSaveAction({ dirty, saving: savingReq, onSave: saveRequired });

  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const items: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_EMPLOYEE_FIELD_KEYS.map((k) => ({
      kind: 'standard' as const, key: k, label: FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = templates.map((tpl) => ({
      kind: 'custom' as const, key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map((it) => [it.key, it]));
    if (localOrder.length === 0) return all;
    const ordered: UnifiedItem[] = [];
    for (const k of localOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map((i) => i.key));
    return [...ordered, ...all.filter((i) => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localOrder, full]);

  const moveItem = (key: string, direction: 'up' | 'down') => {
    const idx = items.findIndex((it) => it.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalOrder(next.map((i) => i.key));
    setReqMsg(null);
  };

  const onDragReorder = (next: { id: string }[]) => {
    setLocalOrder(next.map((i) => i.id));
    setReqMsg(null);
  };

  const removeTemplate = (id: string) => {
    Alert.alert('', t.customFields.confirmDelete, [
      { text: full.common.buttons.cancel, style: 'cancel' },
      {
        text: full.common.buttons.delete,
        style: 'destructive',
        onPress: () => {
          setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
          setLocalOrder((prev) => prev.filter((k) => k !== `custom:${id}`));
        },
      },
    ]);
  };

  const onTemplateSubmit = (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => {
    if (editing) {
      setTemplates((prev) =>
        prev.map((tpl) =>
          tpl.id === editing.id
            ? { ...tpl, field_label: data.field_label, field_type: data.field_type, field_options: data.field_options, required: data.required }
            : tpl,
        ),
      );
    } else {
      const newTpl: FieldTemplate = {
        id: newTempId(),
        field_key: data.field_key,
        field_label: data.field_label,
        field_type: data.field_type,
        field_options: data.field_options,
        required: data.required,
        sort_order: templates.length,
      };
      setTemplates((prev) => [...prev, newTpl]);
      setLocalOrder((prev) => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    }
    setModalOpen(false);
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
        <SortableList<UnifiedItem & { id: string }>
          items={items.map((it) => ({ ...it, id: it.key }))}
          onReorder={onDragReorder}
          renderItem={(item, i, { drag, isActive }) => {
            const isLast = i === items.length - 1;
            return (
              <View
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  isActive ? 'bg-primary/5' : ''
                } ${isLast ? '' : 'border-b border-gray-50'}`}
              >
                <Pressable onLongPress={drag} delayLongPress={120} hitSlop={6} className="p-1 -ml-1 active:opacity-60">
                  <GripVertical size={14} color="#9CA3AF" />
                </Pressable>
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
          }}
        />
      </View>
      <StatusMsg msg={reqMsg} />

      <FieldTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        templates={templates}
        onSubmit={onTemplateSubmit}
      />
    </View>
  );
}

// Draft-aware modal: collects the form data, runs the duplicate-key check,
// then hands the payload back to the section via onSubmit. The section
// decides whether this is an add (push a temp-id row into local state) or
// an update (replace by id) and is responsible for closing the modal.
function FieldTemplateModal({
  open,
  onClose,
  editing,
  templates,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  editing: FieldTemplate | null;
  templates: FieldTemplate[];
  onSubmit: (data: {
    field_label: string;
    field_type: FieldType;
    field_options: string[] | null;
    required: boolean;
    field_key: string;
  }) => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [optionsRaw, setOptionsRaw] = useState('');
  const [required, setRequired] = useState(false);
  const [error, setError] = useState('');

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

  const onSave = () => {
    if (!label.trim()) {
      setError(t.customFields.errorNameRequired);
      return;
    }
    const key = toKey(label);
    if (!editing && templates.some((tpl) => tpl.field_key === key)) {
      setError(t.customFields.errorDuplicate);
      return;
    }
    const options =
      type === 'select'
        ? optionsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
        : null;
    onSubmit({
      field_label: label.trim(),
      field_type: type,
      field_options: options,
      required,
      field_key: key,
    });
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

        <Button onPress={onSave} fullWidth>
          <Text className="text-white font-semibold">{t.customFields.addFieldBtn}</Text>
        </Button>
      </View>
    </Modal>
  );
}

// ─── Account section ──────────────────────────────────────────────────────
export function AccountSection() {
  const supabase = createSupabaseClient();
  const { user, currentRole } = useApp();
  const logout = useAuthStore((s) => s.logout);
  const businesses = useAuthStore((s) => s.businesses);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const roles = useAuthStore((s) => s.roles);
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings;

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // ── Profile name (first/last) — lives in public.profiles, editable here.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const onSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    setNameMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', user.id);
    setSavingName(false);
    setNameMsg(
      error
        ? { text: t.account.nameSaveError, isError: true }
        : { text: t.account.nameSaveSuccess, isError: false },
    );
  };

  const onSavePassword = async () => {
    if (!currentPw) {
      setPwMsg({ text: t.password.errorCurrentRequired, isError: true });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ text: t.password.errorMinLength, isError: true });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    // Re-authenticate with the current password first — updateUser() alone
    // doesn't verify the old password, so without this anyone on an unlocked
    // session could reset it.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPw,
    });
    if (verifyError) {
      setSavingPw(false);
      setPwMsg({ text: t.password.errorCurrentWrong, isError: true });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ text: `${t.password.errorPrefix}: ${error.message}`, isError: true });
    } else {
      setPwMsg({ text: t.password.successMsg, isError: false });
      setCurrentPw('');
      setNewPw('');
    }
  };

  // One-handed: a bottom sheet instead of a centered iOS alert.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const confirmLogout = () => setLogoutOpen(true);

  return (
    <View className="gap-4">
      {/* Account info card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<UserIcon size={18} color="#4F46E5" />}
          title={t.account.heading}
          subtitle={t.account.subtitle}
        />
        <Input
          label={t.account.firstNameLabel}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />
        <Input
          label={t.account.lastNameLabel}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />
        <StatusMsg msg={nameMsg} />
        <Button onPress={onSaveName} loading={savingName} fullWidth>
          <Text className="text-white font-semibold">{t.account.saveNameBtn}</Text>
        </Button>
        <View className="gap-1 pt-2 border-t border-gray-100">
          <Text className="text-xs text-gray-500">{t.account.emailLabel}</Text>
          <Text className="text-sm font-medium text-gray-900">{user?.email ?? '—'}</Text>
        </View>
        <View className="gap-1">
          <Text className="text-xs text-gray-500">{t.account.roleLabel}</Text>
          <Text className="text-sm font-medium text-gray-900">
            {currentRole ? ROLE_LABELS[currentRole][locale] : '—'}
          </Text>
        </View>
      </View>

      {/* Businesses you belong to — shows every workspace the user is a member
          of, with their role per business. Read-only list; switching active
          business still happens via the header BusinessSwitcher. */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-3">
        <SectionHeader
          icon={<Building2 size={18} color="#4F46E5" />}
          title={t.account.businessesHeading}
          subtitle={t.account.businessesSubtitle}
        />
        {businesses.length === 0 ? (
          <Text className="text-sm text-gray-500">{t.account.businessesEmpty}</Text>
        ) : (
          <View className="bg-gray-50 rounded-xl overflow-hidden">
            {businesses.map((b, i) => {
              const role = roles[b.id];
              const isActive = b.id === activeBusinessId;
              return (
                <View
                  key={b.id}
                  className={`flex-row items-center gap-3 px-4 py-3 ${
                    i < businesses.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center shrink-0">
                    <Building2 size={14} color="#4F46E5" />
                  </View>
                  <Text className="flex-1 text-sm font-semibold text-gray-900">
                    {b.name}
                    {isActive ? ' •' : ''}
                  </Text>
                  {role ? (
                    <View className="bg-primary/10 rounded-full px-2.5 py-1 shrink-0">
                      <Text className="text-xs font-semibold text-primary">
                        {ROLE_LABELS[role][locale]}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Password card */}
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<Lock size={18} color="#4F46E5" />}
          title={t.password.heading}
          subtitle={t.password.subtitle}
        />
        <Input
          label={t.password.currentPasswordLabel}
          placeholder={t.password.currentPasswordPlaceholder}
          secureTextEntry={!showCurrentPw}
          value={currentPw}
          onChangeText={setCurrentPw}
          rightIcon={
            <Pressable
              onPress={() => setShowCurrentPw(v => !v)}
              hitSlop={8}
              accessibilityLabel={showCurrentPw ? t.password.hidePassword : t.password.showPassword}
            >
              {showCurrentPw ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
            </Pressable>
          }
        />
        <Input
          label={t.password.newPasswordLabel}
          placeholder={t.password.newPasswordPlaceholder}
          secureTextEntry={!showNewPw}
          value={newPw}
          onChangeText={setNewPw}
          rightIcon={
            <Pressable
              onPress={() => setShowNewPw(v => !v)}
              hitSlop={8}
              accessibilityLabel={showNewPw ? t.password.hidePassword : t.password.showPassword}
            >
              {showNewPw ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
            </Pressable>
          }
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

      {/* Sign-out confirmation — bottom sheet (one-handed) */}
      <RNModal visible={logoutOpen} transparent animationType="fade" onRequestClose={() => setLogoutOpen(false)}>
        <Pressable onPress={() => setLogoutOpen(false)} className="flex-1 bg-black/40 justify-end">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pb-10 pt-4">
            <View className="items-center mb-4">
              <View className="w-10 h-1 bg-gray-200 rounded-full" />
            </View>
            <View className="items-center mb-5 gap-2">
              <View className="w-12 h-12 rounded-2xl bg-red-50 items-center justify-center">
                <LogOut size={22} color="#EF4444" />
              </View>
              <Text className="text-lg font-bold text-gray-900">{full.dashboard.sidebar.logout}</Text>
              <Text className="text-sm text-gray-500 text-center">{t.account.logoutConfirm}</Text>
            </View>
            <View className="gap-2.5">
              <Pressable
                onPress={() => { setLogoutOpen(false); logout(); }}
                style={{ backgroundColor: '#DC2626' }}
                className="py-3.5 rounded-2xl items-center active:opacity-90"
              >
                <Text className="text-base font-semibold text-white">{full.dashboard.sidebar.logout}</Text>
              </Pressable>
              <Pressable
                onPress={() => setLogoutOpen(false)}
                className="py-3.5 rounded-2xl bg-gray-100 items-center active:bg-gray-200"
              >
                <Text className="text-base font-semibold text-gray-700">{full.common.buttons.cancel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
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
  // True when the status CHECK failed (missing API config, network, non-2xx)
  // — rendered differently from a real "disconnected" answer so a transport
  // problem doesn't masquerade as a disconnected account.
  const [statusError, setStatusError] = useState(false);
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
    if (!businessId) return;
    if (!apiBaseUrl) {
      setStatusError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const jwt = await getJwt();
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/status?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data ?? { connected: false });
        setStatusError(false);
      } else {
        setStatusError(true);
      }
    } catch {
      setStatus({ connected: false });
      setStatusError(true);
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
      // `in` narrows to the failure variant. `if (!result.ok)` alone doesn't
      // narrow reliably with the project's `strict: false` tsconfig.
      if (!('reason' in result)) return;
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
        // Load the contact groups now. On a RECONNECT, status.connected was
        // already true (the old token was revoked, not disconnected), so the
        // status-driven effect below won't re-fire to load them — fetch them
        // explicitly so the group dropdown populates without navigating away
        // and back in.
        void fetchGroups();
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

      {business?.name ? (
        <Text className="text-xs font-medium text-gray-500">
          {t.scopeNote.replace('{{name}}', business.name)}
        </Text>
      ) : null}

      {statusError ? (
        <View className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
          <Text className="text-sm text-amber-700">{t.statusCheckError}</Text>
        </View>
      ) : null}

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

// ── Invoice theme — its own settings screen (separate from Facturas fields) ──
export function InvoiceThemeSection() {
  const supabase = createSupabaseClient();
  const { business, refetchBusiness } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;

  const [bundle, setBundle] = useState<InvoiceThemeBundle>(() => normalizeBundle(business?.invoice_template));
  const [dbBundle, setDbBundle] = useState<InvoiceThemeBundle>(() => normalizeBundle(business?.invoice_template));
  const [customFields, setCustomFields] = useState<{ key: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!business) return;
    const b = normalizeBundle(business.invoice_template);
    setBundle(b);
    setDbBundle(b);
    let cancelled = false;
    supabase
      .from('invoice_field_templates')
      .select('field_key, field_label')
      .eq('business_id', business.id)
      .then(({ data }) => {
        if (!cancelled && data) {
          setCustomFields(
            data
              .filter((r: { field_key: string | null }) => r.field_key)
              .map((r: { field_key: string; field_label: string }) => ({ key: r.field_key, label: r.field_label })),
          );
        }
      });
    return () => { cancelled = true; };
  }, [business]);

  const onSave = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from('businesses').update({ invoice_template: bundle }).eq('id', business.id);
    if (!error) {
      await refetchBusiness();
      setDbBundle(bundle);
      setMsg({ text: t.invoices.saveSuccess, isError: false });
    } else {
      setMsg({ text: t.invoices.saveError, isError: true });
    }
    setSaving(false);
  };

  const dirty = useMemo(() => JSON.stringify(dbBundle) !== JSON.stringify(bundle), [dbBundle, bundle]);
  // Keep the dirty/unsaved-changes back-guard, but render our own Save button at
  // the bottom instead of the top-right header pill.
  useSettingsSaveAction({ dirty, saving, onSave, hideHeaderButton: true });

  const branding: InvoiceBranding = {
    name: business?.name ?? '',
    logoUrl: business?.logo_url ?? null,
    city: business?.city ?? null,
    state: business?.state ?? null,
    address: business?.address ?? null,
    postalCode: business?.postal_code ?? null,
    taxId: business?.tax_id ?? null,
    licenseNumber: business?.license_number ?? null,
    email: business?.email ?? null,
    phone: business?.phone ?? null,
    website: business?.website ?? null,
  };

  return (
    <View className="gap-5">
      <View className="bg-white rounded-2xl border border-gray-100 p-5 gap-4">
        <SectionHeader
          icon={<FileText size={18} color="#4F46E5" />}
          title={t.invoices.design.title}
          subtitle={t.invoices.design.subtitle}
        />
        <InvoiceDesigner
          key={bundle.active}
          value={activeBundleConfig(bundle)}
          onChange={(c) => { setBundle(b => ({ ...b, [b.active]: c })); setMsg(null); }}
          onSwitchMode={(m) => setBundle(b => ({ ...b, active: m }))}
          branding={branding}
          customFields={customFields}
        />
        {msg ? (
          <Text className={`text-xs ${msg.isError ? 'text-red-500' : 'text-emerald-600'}`}>{msg.text}</Text>
        ) : null}
      </View>
      <Button onPress={onSave} loading={saving} disabled={!dirty}>
        {full.common.buttons.save}
      </Button>
    </View>
  );
}

// Employee detail screen (mobile). Routed at /dashboard/mas/empleados/[id]
// so taps from the list become real navigation (back button works, deep
// links work). Mirrors the data + UX the previous in-list modal exposed:
// view ↔ edit, access section, history timeline.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Share,
  Linking,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Pencil,
  UserX,
  UserCheck,
  Clock,
  X,
  DollarSign,
  Trash2,
  Phone,
  Mail,
  Calendar,
  Briefcase,
  MapPin,
  Gift,
  HeartPulse,
  ChevronRight,
  Hash,
  MessageSquare,
  KeyRound,
  Eye,
  Check,
  type LucideIcon,
  Crown,
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { fetchEmployeeLocations, setEmployeePrimaryLocation, toggleEmployeeBranch } from '@amixos/shared/lib/locations';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput, formatDateLong, formatDateTimeLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { usStateName } from '@amixos/shared/lib/usStates';
import { Button, Input, Select, DatePicker, Toggle } from '@amixos/shared/ui';
import { EmployeeHistoryView } from '@amixos/shared/screens/dashboard/EmployeeHistoryView';
import {
  diffEmployeeChanges,
  logEmployeeMilestone,
} from '@amixos/shared/lib/employeeHistory';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import {
  resolveAccess,
  type AccessMember,
  type AccessInvite,
} from '@amixos/shared/lib/teamPeople';
import { INVITABLE_ROLES, roleLabel, getActiveCustomRoles, can, type Role } from '@amixos/shared/lib/permissions';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { parseHiddenFields, isFieldHidden } from '@amixos/shared/lib/fieldLayout';
import { groupNumberString, localizeTemplates, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '@amixos/shared/lib/fieldTemplates';
import {
  EMPLOYEE_FIELD_SECTIONS,
  EMPLOYEE_FIELDS_ALWAYS_SHOWN,
  EMPLOYEE_SECTION_FIELDS,
  parseEmployeeLayout,
  employeeFieldsInSection,
  type EmployeeFieldSection,
} from '@amixos/shared/lib/employeeFieldSections';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  check_name: string | null;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
  /** Offered in job crew/lead/driver pickers (migration 128). */
  show_in_roster?: boolean | null;
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
  intended_access_role: string | null;
  custom_fields: Record<string, string> | null;
}

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

export default function EmpleadoDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = createSupabaseClient();
  const { business, user, currentRole, startImpersonation, locations, refetchBusiness } = useApp();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.employees;
  const tc = full.common;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  // Built-in invitable roles + this business's custom roles (migration 179).
  const assignableRoles: Role[] = [...INVITABLE_ROLES, ...getActiveCustomRoles().map(c => c.key as Role)];

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

  const [employee, setEmployee] = useState<RawEmployee | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [invites, setInvites] = useState<AccessInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // Worker's home branch (from employee_locations). Editable on the person.
  const [homeLocation, setHomeLocation] = useState<string>('');
  // Branches this worker is LENT to (non-home). Toggled via the share chips.
  const [sharedLocations, setSharedLocations] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', check_name: '', phone: '', role: 'worker',
    pay_type: 'hourly', pay_rate: '', overtime_eligible: false, overtime_threshold: '', overtime_multiplier: '', email: '',
    birthday: '', hire_date: '',
    address: '', city: '', state: '', zip_code: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    custom_fields: {} as Record<string, string>,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accessRole, setAccessRole] = useState<Role>('office');
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');

  const reqFlags: Record<string, boolean> = business?.employee_field_required ?? {};

  // Per-field show/hide (Ajustes → Empleados eye toggles). first/last name
  // can never be hidden.
  const hidden = parseHiddenFields(business?.employee_field_hidden);
  const fHidden = (key: string) =>
    !EMPLOYEE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);

  // Custom fields grouped by section, in the saved layout order.
  const empLayout = useMemo(() => {
    const standardKeys = EMPLOYEE_FIELD_SECTIONS.flatMap(s => EMPLOYEE_SECTION_FIELDS[s]);
    const allKeys = [...standardKeys, ...templates.map(tpl => `custom:${tpl.id}`)];
    return parseEmployeeLayout(business?.employee_field_layout, allKeys);
  }, [business?.employee_field_layout, templates]);
  const customFieldsFor = (section: EmployeeFieldSection): FieldTemplate[] =>
    employeeFieldsInSection(empLayout, section)
      .filter(k => k.startsWith('custom:'))
      .map(k => templates.find(tpl => `custom:${tpl.id}` === k))
      .filter((tpl): tpl is FieldTemplate => !!tpl);

  // Bilingual section headers (data-driven layout).
  const sectionLabel: Record<EmployeeFieldSection, string> = {
    general: 'General',
    contact: locale === 'es' ? 'Contacto' : 'Contact',
    employment: locale === 'es' ? 'Empleo' : 'Employment',
    location: locale === 'es' ? 'Ubicación' : 'Location',
    emergency: locale === 'es' ? 'Emergencia' : 'Emergency',
    additional: locale === 'es' ? 'Detalles adicionales' : 'Additional details',
  };

  // Full-width JSX for one built-in field key (edit form — no required `*`).
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return (
          <Input key={key} label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder}
            value={form.first_name} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
        );
      case 'last_name':
        return (
          <Input key={key} label={t.modal.lastNameLabel} placeholder={t.modal.lastNamePlaceholder}
            value={form.last_name} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
        );
      case 'check_name':
        return (
          <Input key={key} label={t.modal.checkNameLabel} placeholder={t.modal.checkNamePlaceholder}
            hint={t.modal.checkNameHint}
            value={form.check_name} onChangeText={(v) => setForm((f) => ({ ...f, check_name: v }))} />
        );
      case 'phone':
        return (
          <Input key={key} label={t.modal.phoneLabel} placeholder={t.modal.phonePlaceholder}
            value={formatPhoneInput(form.phone)}
            onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhoneInput(v) }))}
            keyboardType="phone-pad" />
        );
      case 'email':
        return (
          <Input key={key} label={t.modal.emailLabel} placeholder={t.modal.emailPlaceholder}
            value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            keyboardType="email-address" autoCapitalize="none" />
        );
      case 'hire_date':
        return (
          <DatePicker key={key} label={t.modal.hireDateLabel} value={form.hire_date}
            onChange={(v) => setForm((f) => ({ ...f, hire_date: v }))} />
        );
      case 'pay_type':
        return (
          <Select key={key} label={t.modal.payTypeLabel} value={form.pay_type}
            onValueChange={(v) => setForm((f) => ({ ...f, pay_type: v }))}
            options={PAY_TYPE_OPTIONS} />
        );
      case 'pay_rate':
        return (
          <View key={key}>
            <Text className="text-sm font-semibold text-ink mb-2">
              {t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[form.pay_type] ?? PAY_UNIT.hourly)}
            </Text>
            <View className="flex-row items-center rounded-2xl border border-border bg-card px-4">
              <DollarSign size={16} color={c.faint} />
              <Input
                containerClassName="flex-1 ml-2"
                placeholder="0.00"
                value={form.pay_rate}
                onChangeText={(v) => {
                  // Keep the RAW text while typing; parse once on save.
                  // Per-keystroke parseFloat ate the decimal point ("15." →
                  // 15), making cents like 15.60 impossible to enter.
                  let clean = v.replace(/[^0-9.]/g, '');
                  const dot = clean.indexOf('.');
                  if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
                  setForm((f) => ({ ...f, pay_rate: clean }));
                }}
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
                  <Text className="text-sm font-medium text-ink">{t.modal.overtimeLabel}</Text>
                  <View className={`w-11 h-6 rounded-full px-0.5 justify-center ${form.overtime_eligible ? 'bg-primary' : 'bg-border'}`}>
                    <View className={`w-5 h-5 rounded-full bg-card ${form.overtime_eligible ? 'self-end' : 'self-start'}`} />
                  </View>
                </Pressable>
                {form.overtime_eligible ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-xs text-muted mb-1">{t.modal.overtimeThresholdLabel}</Text>
                      <TextInput
                        value={form.overtime_threshold}
                        onChangeText={v => setForm(f => ({ ...f, overtime_threshold: v.replace(/[^0-9.]/g, '') }))}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        placeholderTextColor={c.faint}
                        keyboardType="decimal-pad"
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs text-muted mb-1">{t.modal.overtimeMultiplierLabel}</Text>
                      <TextInput
                        value={form.overtime_multiplier}
                        onChangeText={v => setForm(f => ({ ...f, overtime_multiplier: v.replace(/[^0-9.]/g, '') }))}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        placeholderTextColor={c.faint}
                        keyboardType="decimal-pad"
                        className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
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
          <DatePicker key={key} label={t.modal.birthdayLabel} value={form.birthday}
            onChange={(v) => setForm((f) => ({ ...f, birthday: v }))} />
        );
      case 'address':
        return (
          <Input key={key} label={t.modal.addressLabel} placeholder={t.modal.addressPlaceholder}
            value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
        );
      case 'city':
        return (
          <Input key={key} label={t.modal.cityLabel} placeholder={t.modal.cityPlaceholder}
            value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
        );
      case 'state':
        return (
          <Select key={key} label={t.modal.stateLabel} value={form.state}
            onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
            placeholder={t.modal.stateNone}
            searchable
            options={[{ value: '', label: t.modal.stateNone }, ...US_STATES.map((s) => ({ value: s, label: usStateName(s, locale) }))]} />
        );
      case 'zip_code':
        return (
          <Input key={key} label={t.modal.zipLabel} placeholder={t.modal.zipPlaceholder}
            value={form.zip_code} onChangeText={(v) => setForm((f) => ({ ...f, zip_code: v.replace(/[^0-9]/g, '').slice(0, 5) }))}
            keyboardType="number-pad" />
        );
      case 'emergency_contact_name':
        return (
          <Input key={key} label={t.modal.emergencyNameLabel} placeholder={t.modal.emergencyNamePlaceholder}
            value={form.emergency_contact_name}
            onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_name: v }))} />
        );
      case 'emergency_contact_phone':
        return (
          <Input key={key} label={t.modal.emergencyPhoneLabel} placeholder={t.modal.emergencyPhonePlaceholder}
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
        <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-3 px-1">{sectionLabel[section]}</Text>
        <View className="bg-card rounded-2xl border border-border-soft p-4 gap-4">
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

  const load = useCallback(async () => {
    if (!business || !user || !id) return;
    setLoading(true);
    const [empRes, tplRes, { data: rawMembers }, invitesRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', id).single(),
      supabase.from('employee_field_templates').select('*').eq('business_id', business.id).order('sort_order'),
      supabase.rpc('list_business_members', { b_id: business.id }),
      fetch(`${getApiBaseUrl()}/api/v1/invites?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${await getJwt()}` },
      }).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);
    if (empRes.error || !empRes.data) {
      setNotFound(true); setLoading(false); return;
    }
    const e = empRes.data as RawEmployee;
    setEmployee(e);
    // Load this worker's branches: home (primary) + lent-to (the rest).
    fetchEmployeeLocations(supabase, business.id)
      .then(links => {
        const mine = links.filter(l => l.employee_id === e.id);
        setHomeLocation(mine.find(l => l.is_primary)?.location_id ?? '');
        setSharedLocations(mine.filter(l => !l.is_primary).map(l => l.location_id));
      })
      .catch(() => { setHomeLocation(''); setSharedLocations([]); });
    // Pre-select the Invite dialog with the planned access role from import.
    if (e.intended_access_role && (assignableRoles as string[]).includes(e.intended_access_role)) {
      setAccessRole(e.intended_access_role as Role);
    }
    setTemplates(localizeTemplates((tplRes.data ?? []) as FieldTemplate[], locale));
    setMembers(((rawMembers as Array<{ id: string; user_id: string; email: string | null; display_name: string | null; role: string }> | null) ?? []).map((m) => ({
      id: m.id, userId: m.user_id, email: m.email, displayName: m.display_name, role: m.role as Role, isYou: m.user_id === user.id,
    })));
    setInvites(((invitesRes?.data ?? []) as Array<{ id: string; email: string; role: string; acceptUrl?: string }>).map((i) => ({
      id: i.id, email: i.email, role: i.role as Role, acceptUrl: i.acceptUrl,
    })));
    setForm({
      first_name: e.first_name, last_name: e.last_name, check_name: e.check_name ?? '', phone: e.phone ?? '', role: e.role,
      pay_type: e.pay_type, pay_rate: e.pay_rate != null ? String(e.pay_rate) : '',
      overtime_eligible: (e as { overtime_eligible?: boolean | null }).overtime_eligible ?? false,
      overtime_threshold: (e as { overtime_threshold?: number | null }).overtime_threshold != null ? String((e as { overtime_threshold?: number | null }).overtime_threshold) : '',
      overtime_multiplier: (e as { overtime_multiplier?: number | null }).overtime_multiplier != null ? String((e as { overtime_multiplier?: number | null }).overtime_multiplier) : '',
      email: e.email ?? '', birthday: e.birthday ?? '', hire_date: e.hire_date ?? '',
      address: e.address ?? '', city: e.city ?? '', state: e.state ?? '', zip_code: e.zip_code ?? '',
      emergency_contact_name: e.emergency_contact_name ?? '',
      emergency_contact_phone: e.emergency_contact_phone ?? '',
      custom_fields: e.custom_fields ?? {},
    });
    setLoading(false);
  }, [business, user, id, supabase, locale]);

  useEffect(() => { void load(); }, [load]);

  // Lend / un-lend this worker to another branch (never their home branch).
  const toggleShare = async (locationId: string) => {
    if (!business || !employee) return;
    const nowShared = await toggleEmployeeBranch(supabase, business.id, employee.id, locationId);
    setSharedLocations(prev => nowShared ? [...prev, locationId] : prev.filter(x => x !== locationId));
  };

  const save = async () => {
    if (!employee || !business) return;
    if (!form.first_name.trim()) { setError(t.modal.errorFirstNameRequired); return; }
    if (form.email.trim() && !isValidEmail(form.email)) { setError(tc.validation.invalidEmail); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
      pay_rate: parseFloat(form.pay_rate) || 0,
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
    };
    const prev = employee;
    await supabase.from('employees').update(payload).eq('id', employee.id);
    // Update the home branch (preserves any borrowed-branch assignments).
    if (locations.length > 0) await setEmployeePrimaryLocation(supabase, business.id, employee.id, homeLocation || null);
    const milestones = diffEmployeeChanges(
      { pay_rate: prev.pay_rate, pay_type: prev.pay_type, role: prev.role },
      { pay_rate: parseFloat(form.pay_rate) || 0, pay_type: form.pay_type, role: form.role },
    );
    for (const m of milestones) {
      void logEmployeeMilestone(supabase, {
        businessId: business.id,
        employeeId: prev.id,
        eventType: m.eventType,
        details: m.details,
        createdBy: user?.id ?? null,
      });
    }
    await load();
    setSaving(false); setMode('view');
  };

  const toggleActive = async () => {
    if (!employee || !business) return;
    const nextActive = !employee.active;
    await supabase.from('employees').update({ active: nextActive }).eq('id', employee.id);
    void logEmployeeMilestone(supabase, {
      businessId: business.id, employeeId: employee.id,
      eventType: nextActive ? 'rehired' : 'terminated', createdBy: user?.id ?? null,
    });
    setEmployee((prev) => prev ? { ...prev, active: nextActive } : prev);
  };

  // Roster flag — office members (owner/admin) stay ACTIVE but stop being
  // offered as field crew on jobs. Saves instantly, like deactivate.
  const toggleRoster = async () => {
    if (!employee) return;
    const next = !(employee.show_in_roster ?? true);
    await supabase.from('employees').update({ show_in_roster: next }).eq('id', employee.id);
    setEmployee((prev) => prev ? { ...prev, show_in_roster: next } : prev);
  };

  // ─── Access section ────────────────────────────────────────────────
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
    await load(); setAccessBusy(false);
  };

  // Share the invite's accept link (native share sheet incl. copy) for manual
  // sharing — Supabase invite emails can be slow or land in spam.
  const shareInviteLink = async (inviteId: string) => {
    const url = invites.find((i) => i.id === inviteId)?.acceptUrl;
    if (!url) return;
    try { await Share.share({ message: url }); } catch { /* dismissed */ }
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
    await load(); setAccessBusy(false);
  };

  const changeAccessRole = async (memberId: string, role: Role) => {
    const m = members.find((x) => x.id === memberId);
    if (!m || !business) return;
    setAccessBusy(true); setAccessError('');
    await supabase.from('business_members').update({ role }).eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business.id, action: 'member.role_changed',
      entity_type: 'member', entity_id: m.userId,
      details: { email: m.email, from: m.role, to: role },
    });
    await load(); setAccessBusy(false);
  };

  const removeAccess = async (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    if (!m || !business) return;
    if (!(await confirmAsync(teamT.confirmRemove.replace('{{name}}', m.displayName ?? m.email ?? ''), teamT.removeBtn))) return;
    setAccessBusy(true); setAccessError('');
    await supabase.from('business_members').delete().eq('id', memberId);
    await supabase.from('audit_log').insert({
      business_id: business.id, action: 'member.removed',
      entity_type: 'member', entity_id: m.userId,
      details: { email: m.email, role: m.role },
    });
    await load(); setAccessBusy(false);
  };

  // "Ver como" — enter this member's view (read-only). Mirrors the server
  // guardrails so we don't offer a button that would 403.
  const verComoMember = async (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    if (!m) return;
    setAccessBusy(true); setAccessError('');
    try {
      await startImpersonation(m.userId);
      router.replace('/dashboard');
    } catch (e: any) {
      const code = e?.message as string | undefined;
      setAccessError(
        code === 'role_not_allowed' ? teamT.verComoNotAllowed
          : code === 'not_a_member' ? teamT.verComoNotMember
          : teamT.verComoFailed,
      );
      setAccessBusy(false);
    }
  };
  const canVerComo = (role: Role) =>
    can.manageMembers(currentRole) && role !== 'owner' && !(currentRole === 'admin' && role === 'admin');

  const selAccess = useMemo(
    () => employee ? resolveAccess({ userId: employee.user_id ?? null, email: employee.email }, members, invites) : null,
    [employee, members, invites],
  );
  const canManageAccess = can.manageMembers(currentRole);
  // UI-hygiene gate (RLS is the real lock): a read-only viewer never sees the
  // edit pencil or the record-write tiles (deactivate / roster).
  const canEditEmployee = can.editEmployee(currentRole);

  // Hand the whole business to this member: they become Owner (billing and
  // all), the current owner becomes Admin. Owner-only; server-guarded by
  // transfer_business_ownership (migration 153) so nobody else can call it.
  const canTransferOwnership =
    currentRole === 'owner' && selAccess?.kind === 'active' && !selAccess.isYou && selAccess.role !== 'owner';
  const transferOwnership = async () => {
    if (!employee || !business || !selAccess || selAccess.kind !== 'active') return;
    const m = members.find((x) => x.id === selAccess.memberId);
    if (!m) return;
    const name = `${employee.first_name} ${employee.last_name}`.trim() || m.email || '';
    if (!(await confirmAsync(t.transferOwnershipConfirm.replace('{{name}}', name), t.transferOwnershipBtn))) return;
    setAccessBusy(true); setAccessError('');
    const { data, error } = await supabase.rpc('transfer_business_ownership', {
      b_id: business.id, new_owner_user_id: m.userId,
    });
    const res = data as { ok?: boolean } | null;
    if (error || !res?.ok) { setAccessError(t.transferOwnershipError); setAccessBusy(false); return; }
    await supabase.from('audit_log').insert({
      business_id: business.id, action: 'business.ownership_transferred',
      entity_type: 'business', entity_id: business.id,
      details: { to_email: m.email, to_user_id: m.userId },
    });
    // Both parties' roles changed — refetch the business/role state and land
    // back on the dashboard as an Admin.
    await refetchBusiness();
    router.replace('/dashboard');
  };

  // Hard-delete this employee (and revoke their app access if any). Owner/admin
  // only, and never the owner or yourself. FKs are on delete set null / cascade,
  // so this is safe. Soft removal = the deactivate (UserX) toggle in the header.
  const isSelfOrOwner = selAccess?.kind === 'active' && (selAccess.isYou || selAccess.role === 'owner');
  const canDeleteEmployee = canManageAccess && !isSelfOrOwner;
  const deleteEmployee = async () => {
    if (!employee || !business) return;
    const name = `${employee.first_name} ${employee.last_name}`.trim();
    if (!(await confirmAsync(t.deleteConfirm.replace('{{name}}', name), t.deleteBtn))) return;
    setAccessBusy(true); setAccessError('');
    if (selAccess?.kind === 'active' && !selAccess.isYou && selAccess.role !== 'owner') {
      await supabase.from('business_members').delete().eq('id', selAccess.memberId);
    }
    const { error } = await supabase.from('employees').delete().eq('id', employee.id);
    if (error) { setAccessError(error.message); setAccessBusy(false); return; }
    await supabase.from('audit_log').insert({
      business_id: business.id, action: 'employee.deleted',
      entity_type: 'employee', entity_id: employee.id, details: { name },
    });
    router.replace('/dashboard/mas/empleados');
  };

  // Pop back to the existing list screen when there's history (the section
  // has its own Stack, so back() lands on the list with its scroll position
  // and loaded data intact — replace() would rebuild it from scratch).
  // Deep links with no history still replace to the list route.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/dashboard/mas/empleados');
  }, [router]);

  // Snapshot the form when entering edit mode so the back guard only fires
  // when something actually changed this session (re-baselined each entry,
  // so it stays clean after a save → view → edit round-trip).
  const editBaselineRef = useRef('');
  const enterEdit = () => {
    editBaselineRef.current = JSON.stringify(form);
    setMode('edit');
  };
  const dirty = mode === 'edit' && JSON.stringify(form) !== editBaselineRef.current;
  const { confirmLeave: confirmBack, unsavedSheet } = useUnsavedGuard({ dirty, onLeave: goBack });

  // ─── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <Header onBack={goBack} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-faint">{tc.states.loading}...</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (notFound || !employee) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <Header onBack={goBack} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-faint">—</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isView = mode === 'view';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-border-soft">
        <Pressable onPress={confirmBack} hitSlop={12} className="p-2 rounded-lg active:bg-border-soft">
          <ChevronLeft size={22} color={c.ink} />
        </Pressable>
        <Text className="ml-1 flex-1 text-base font-semibold text-ink" numberOfLines={1}>
          {employee.first_name} {employee.last_name}
        </Text>
        <View className="flex-row items-center gap-1">
          {isView ? (
            <>
              {canEditEmployee ? (
                <Pressable onPress={enterEdit} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
                  <Pencil size={18} color={c.faint} />
                </Pressable>
              ) : null}
              {canDeleteEmployee ? (
                <Pressable onPress={deleteEmployee} disabled={accessBusy} hitSlop={8} className="p-2 rounded-lg active:bg-red-500/10 disabled:opacity-50">
                  <Trash2 size={18} color={c.danger} />
                </Pressable>
              ) : null}
            </>
          ) : (
            <Pressable onPress={() => { setMode('view'); setError(''); void load(); }} hitSlop={8} className="p-2 rounded-lg active:bg-border-soft">
              <X size={18} color={c.faint} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-44 gap-5" keyboardShouldPersistTaps="handled">
        {/* Avatar hero */}
        <View className="items-center gap-2 py-1">
          <View className={`w-24 h-24 rounded-full items-center justify-center ${employee.active ? 'bg-primary/10' : 'bg-border-soft'}`}>
            <Text className={`text-3xl font-bold ${employee.active ? 'text-primary' : 'text-faint'}`}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </Text>
          </View>
          <Text className="text-xl font-bold text-ink mt-1 text-center">
            {employee.first_name} {employee.last_name}
          </Text>
          <View className="flex-row items-center gap-2">
            {selAccess?.kind === 'active' ? (
              <View className="rounded-full bg-primary/10 px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-primary">{roleLabel(selAccess.role, lang)}</Text>
              </View>
            ) : null}
            {!employee.active ? (
              <View className="bg-border-soft px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-semibold text-faint">{t.inactiveBadge}</Text>
              </View>
            ) : null}
          </View>
          {(employee.phone || employee.email) ? (
            <View className="flex-row items-center gap-3 mt-2">
              {employee.phone ? (
                <QuickAction Icon={Phone} onPress={() => Linking.openURL(`tel:${employee.phone}`)} />
              ) : null}
              {employee.phone ? (
                <QuickAction Icon={MessageSquare} onPress={() => Linking.openURL(`sms:${employee.phone}`)} />
              ) : null}
              {employee.email ? (
                <QuickAction Icon={Mail} onPress={() => Linking.openURL(`mailto:${employee.email}`)} />
              ) : null}
            </View>
          ) : null}
        </View>

        {isView ? (
          <View className="gap-4">
            {/* Branch sharing — home branch + lend to other branches (they show
                in that branch's team list too). Home is changed via the form. */}
            {locations.length >= 2 ? (
              <View className="bg-card rounded-2xl border border-border-soft shadow-sm p-4 gap-3">
                <View className="flex-row items-center gap-2.5">
                  <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                    <MapPin size={16} color={c.primary} />
                  </View>
                  <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide flex-1">{locale === 'en' ? 'Locations' : 'Ubicaciones'}</Text>
                </View>
                <Text className="text-sm text-ink">
                  {locale === 'en' ? 'Home branch: ' : 'Sucursal principal: '}
                  <Text className="font-semibold">{locations.find(l => l.id === homeLocation)?.name ?? (locale === 'en' ? 'None' : 'Ninguna')}</Text>
                </Text>
                <Text className="text-xs text-faint">{locale === 'en' ? 'Share with other branches:' : 'Compartir con otras sucursales:'}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {locations.filter(l => l.id !== homeLocation).map(l => {
                    const shared = sharedLocations.includes(l.id);
                    return (
                      <Pressable key={l.id} onPress={() => toggleShare(l.id)}
                        className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${shared ? 'border-primary bg-primary/10' : 'border-border'}`}>
                        {shared ? <Check size={12} color={c.primary} /> : null}
                        <Text className={`text-xs font-medium ${shared ? 'text-primary' : 'text-muted'}`}>{l.name}</Text>
                      </Pressable>
                    );
                  })}
                  {locations.filter(l => l.id !== homeLocation).length === 0 ? (
                    <Text className="text-xs text-faint">{locale === 'en' ? 'No other branches.' : 'No hay otras sucursales.'}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {(employee.check_name || employee.phone || employee.email) ? (
              <InfoCard title={t.modal.basicInfoHeading}>
                <InfoRow Icon={Hash} label={t.modal.checkNameLabel} value={employee.check_name} />
                <InfoRow Icon={Phone} label={t.modal.phoneLabel} value={employee.phone}
                  onPress={employee.phone ? () => Linking.openURL(`tel:${employee.phone}`) : undefined} />
                <InfoRow Icon={Mail} label={t.modal.emailLabel} value={employee.email}
                  onPress={employee.email ? () => Linking.openURL(`mailto:${employee.email}`) : undefined} />
              </InfoCard>
            ) : null}

            <InfoCard title={t.modal.employmentHeading}>
              <InfoRow Icon={Calendar} label={t.modal.hireDateLabel}
                value={employee.hire_date ? formatDateLong(employee.hire_date, locale) : null} />
              <InfoRow Icon={Briefcase} label={t.modal.payTypeLabel}
                value={PAY_TYPE_OPTIONS.find((o) => o.value === employee.pay_type)?.label ?? employee.pay_type} />
              {employee.pay_rate ? (
                <InfoRow Icon={DollarSign} label={t.modal.payRateLabel.replace(' ({{unit}})', '')}
                  value={`$${employee.pay_rate.toFixed(2)} / ${PAY_UNIT[employee.pay_type] ?? PAY_UNIT.hourly}`} />
              ) : null}
              {employee.pay_type === 'hourly' ? (
                <InfoRow Icon={Clock} label={t.modal.overtimeLabel}
                  value={((employee as { overtime_eligible?: boolean | null }).overtime_eligible ?? false) ? 'Sí' : 'No'} />
              ) : null}
            </InfoCard>

            {(employee.birthday || employee.address || employee.city || employee.state || employee.zip_code) ? (
              <InfoCard title={t.modal.personalHeading}>
                <InfoRow Icon={Gift} label={t.modal.birthdayLabel}
                  value={employee.birthday ? formatDateLong(employee.birthday, locale) : null} />
                <InfoRow Icon={MapPin} label={t.modal.addressLabel}
                  value={[
                    employee.address,
                    [employee.city, employee.state ? usStateName(employee.state, locale) : ''].filter(Boolean).join(', '),
                    employee.zip_code,
                  ].filter(Boolean).join(' · ') || null} />
              </InfoCard>
            ) : null}

            {(employee.emergency_contact_name || employee.emergency_contact_phone) ? (
              <InfoCard title={t.modal.emergencyContactHeading}>
                <InfoRow Icon={HeartPulse} label={t.modal.emergencyNameLabel} value={employee.emergency_contact_name} />
                <InfoRow Icon={Phone} label={t.modal.emergencyPhoneLabel} value={employee.emergency_contact_phone}
                  onPress={employee.emergency_contact_phone ? () => Linking.openURL(`tel:${employee.emergency_contact_phone}`) : undefined} />
              </InfoCard>
            ) : null}

            {templates.length > 0 && employee.custom_fields && Object.keys(employee.custom_fields).length > 0 ? (
              <InfoCard title={t.modal.customFieldsHeading}>
                {templates.map((tpl) => {
                  const raw = employee.custom_fields?.[tpl.field_key];
                  const value = tpl.field_type === 'number' && raw ? formatNumberGrouped(raw) : raw;
                  return <InfoRow key={tpl.id} Icon={Hash} label={tpl.field_label} value={value} />;
                })}
              </InfoCard>
            ) : null}
          </View>
        ) : (
          /* Edit form */
          <View className="gap-4">
            {EMPLOYEE_FIELD_SECTIONS.map(renderSection)}

            {/* Home branch — multi-location businesses only. */}
            {locations.length >= 2 ? (
              <View>
                <Text className="text-xs font-semibold text-faint uppercase tracking-wide mb-3 px-1">{locale === 'en' ? 'Home location' : 'Ubicación principal'}</Text>
                <View className="bg-card rounded-2xl border border-border-soft p-4">
                  <Select
                    value={homeLocation}
                    onValueChange={setHomeLocation}
                    options={[{ value: '', label: locale === 'en' ? 'No location' : 'Sin ubicación' }, ...locations.map(l => ({ value: l.id, label: l.name }))]}
                  />
                </View>
              </View>
            ) : null}

            {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}
          </View>
        )}

        {/* Access section (both view and edit modes) */}
        {selAccess ? (
          <View className="rounded-2xl border border-border-soft bg-card shadow-sm p-4 gap-3">
            <View className="flex-row items-center gap-2.5">
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                <KeyRound size={16} color={c.primary} />
              </View>
              <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide flex-1">{t.modal.appAccessHeading}</Text>
            </View>
            {selAccess.kind === 'active' ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full bg-primary/10 px-2.5 py-0.5">
                    <Text className="text-xs font-semibold text-primary">{roleLabel(selAccess.role, lang)}</Text>
                  </View>
                  {selAccess.isYou ? <Text className="text-xs text-faint">{teamT.youSuffix}</Text> : null}
                  {selAccess.role === 'owner' ? <Text className="text-xs text-faint">{teamT.ownerSuffix}</Text> : null}
                </View>
                {canManageAccess && !selAccess.isYou && selAccess.role !== 'owner' ? (
                  <>
                    <Select
                      value={selAccess.role}
                      onValueChange={(v) => changeAccessRole(selAccess.memberId, v as Role)}
                      options={assignableRoles.map((r) => ({ value: r, label: roleLabel(r, lang) }))}
                    />
                    <Pressable onPress={() => removeAccess(selAccess.memberId)} disabled={accessBusy}
                      className="py-2.5 rounded-2xl bg-red-500/10 active:bg-red-100 items-center">
                      <Text className="text-sm font-semibold text-red-600">{teamT.removeBtn}</Text>
                    </Pressable>
                  </>
                ) : null}
                {!selAccess.isYou && canVerComo(selAccess.role) ? (
                  <Pressable onPress={() => verComoMember(selAccess.memberId)} disabled={accessBusy}
                    className="flex-row items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-border bg-card active:bg-surface">
                    <Eye size={15} color={c.muted} />
                    <Text className="text-sm font-semibold text-ink">{teamT.verComoBtn}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : selAccess.kind === 'invited' ? (
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-amber-100 px-2.5 py-0.5">
                  <Text className="text-xs font-semibold text-amber-700">{teamT.pendingBadge}</Text>
                </View>
                <Text className="text-xs text-muted">{roleLabel(selAccess.role, lang)}</Text>
                {canManageAccess ? (
                  <View className="ml-auto flex-row items-center gap-1">
                    {invites.find((i) => i.id === selAccess.inviteId)?.acceptUrl ? (
                      <Pressable
                        onPress={() => shareInviteLink(selAccess.inviteId)}
                        className="px-3 py-1.5 rounded-2xl bg-primary/10 active:bg-primary/20"
                      >
                        <Text className="text-sm font-semibold text-primary">{teamT.copyLinkBtn}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => revokeInvite(selAccess.inviteId, employee.email ?? '')}
                      disabled={accessBusy}
                      className="px-3 py-1.5 rounded-2xl bg-red-500/10 active:bg-red-100"
                    >
                      <Text className="text-sm font-semibold text-red-600">{teamT.revokeBtn}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : canManageAccess ? (
              <View className="gap-2">
                <Text className="text-xs text-muted">{t.modal.appAccessNoneHint}</Text>
                <Select
                  value={accessRole}
                  onValueChange={(v) => setAccessRole(v as Role)}
                  options={assignableRoles.map((r) => ({ value: r, label: roleLabel(r, lang) }))}
                />
                <Pressable
                  onPress={() => inviteToApp(form.email.trim(), accessRole)}
                  disabled={accessBusy || !form.email.trim()}
                  className={`py-2.5 rounded-2xl items-center ${form.email.trim() ? 'bg-primary/10 active:bg-primary/20' : 'bg-border-soft'}`}
                >
                  <Text className={`text-sm font-semibold ${form.email.trim() ? 'text-primary' : 'text-faint'}`}>
                    {teamT.inviteBtn}
                  </Text>
                </Pressable>
                {!form.email.trim() ? <Text className="text-xs text-amber-600">{t.modal.appAccessEmailRequired}</Text> : null}
              </View>
            ) : (
              <Text className="text-xs text-faint">{t.modal.appAccessNoManage}</Text>
            )}
            {accessError ? <Text className="text-xs text-red-500">{accessError}</Text> : null}
          </View>
        ) : null}

        {/* Quick actions — 2-column tile grid (icon over label), view mode
           only. Tiles are bg-card + border so they read as buttons in both
           themes. */}
        {isView ? (
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 8 }}>
            <Pressable
              onPress={() => setHistoryOpen(true)}
              style={{ width: '48.75%' }}
              className="items-center justify-center gap-1.5 py-4 px-2 rounded-2xl bg-card border border-border active:bg-surface"
            >
              <Clock size={18} color={c.primary} />
              <Text className="text-xs font-semibold text-primary text-center">{t.history.openBtn}</Text>
            </Pressable>

            {/* Active / inactive toggle. Deactivating keeps the record (and
               history); reactivating brings them back. */}
            {canEditEmployee ? (
              <Pressable
                onPress={toggleActive}
                style={{ width: '48.75%' }}
                className={`items-center justify-center gap-1.5 py-4 px-2 rounded-2xl border ${
                  employee.active ? 'bg-card border-border active:bg-surface' : 'bg-emerald-500/10 border-emerald-200 active:bg-emerald-100'
                }`}
              >
                {employee.active ? (
                  <UserX size={18} color={c.muted} />
                ) : (
                  <UserCheck size={18} color={c.success} />
                )}
                <Text className={`text-xs font-semibold text-center ${employee.active ? 'text-muted' : 'text-emerald-700'}`}>
                  {employee.active ? t.deactivateBtn : t.reactivateBtn}
                </Text>
              </Pressable>
            ) : null}

            {/* Roster flag — keep office members out of job crew pickers. */}
            {canEditEmployee ? (
              <Pressable
                onPress={toggleRoster}
                style={{ width: '48.75%' }}
                className={`items-center justify-center gap-1.5 py-4 px-2 rounded-2xl border ${
                  (employee.show_in_roster ?? true) ? 'bg-card border-border active:bg-surface' : 'bg-amber-500/10 border-amber-200 active:bg-amber-100'
                }`}
              >
                {(employee.show_in_roster ?? true) ? (
                  <UserX size={18} color={c.muted} />
                ) : (
                  <UserCheck size={18} color={c.warning} />
                )}
                <Text className={`text-xs font-semibold text-center ${(employee.show_in_roster ?? true) ? 'text-muted' : 'text-amber-700'}`}>
                  {(employee.show_in_roster ?? true) ? t.rosterRemoveBtn : t.rosterAddBtn}
                </Text>
              </Pressable>
            ) : null}

            {/* Transfer ownership — owner only, on a member with app access. */}
            {canTransferOwnership ? (
              <Pressable
                onPress={() => void transferOwnership()}
                disabled={accessBusy}
                style={{ width: '48.75%' }}
                className="items-center justify-center gap-1.5 py-4 px-2 rounded-2xl border bg-amber-500/10 border-amber-200 active:bg-amber-100"
              >
                <Crown size={18} color={c.warning} />
                <Text className="text-xs font-semibold text-amber-700 text-center">{t.transferOwnershipBtn}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Record timestamps (110 added employees.updated_at) */}
        {isView ? (() => {
          const emp = employee as { created_at?: string; updated_at?: string | null };
          return (
            <View className="items-center gap-0.5 mt-1">
              {emp.created_at ? (
                <Text className="text-[11px] text-faint">
                  {t.createdOnLine.replace('{{date}}', formatDateTimeLong(emp.created_at, locale))}
                </Text>
              ) : null}
              {emp.updated_at && emp.updated_at !== emp.created_at ? (
                <Text className="text-[11px] text-faint">
                  {t.lastEditedOnLine.replace('{{date}}', formatDateTimeLong(emp.updated_at, locale))}
                </Text>
              ) : null}
            </View>
          );
        })() : null}

        {/* Delete moved to the header (top-right Trash icon). */}

        {/* Save row — edit mode only */}
        {!isView ? (
          <View className="flex-row gap-3 pt-1">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => { setMode('view'); setError(''); void load(); }} fullWidth>
                {tc.buttons.cancel}
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={save} loading={saving} fullWidth>{tc.buttons.save}</Button>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Historial modal */}
      <RNModal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setHistoryOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
          <View className="bg-card rounded-t-3xl pt-3" style={{ maxHeight: '85%' }}>
            <View className="items-center mb-2">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>
            <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border-soft">
              <Text className="text-lg font-bold text-ink">{t.history.title}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={8}>
                <X size={20} color={c.faint} />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="px-5 py-5 pb-10">
              <EmployeeHistoryView supabase={supabase} employeeId={employee.id} />
            </ScrollView>
          </View>
        </View>
      </RNModal>
      {unsavedSheet}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const c = useThemeColors();
  return (
    <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-border-soft">
      <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-border-soft">
        <ChevronLeft size={22} color={c.ink} />
      </Pressable>
    </View>
  );
}

// Round icon button for the hero quick actions (call / text / email).
function QuickAction({ Icon, onPress }: { Icon: LucideIcon; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center active:bg-primary/20"
    >
      <Icon size={18} color={c.primary} />
    </Pressable>
  );
}

// White card grouping a labelled section of detail rows.
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-border-soft bg-card shadow-sm p-4 gap-3.5">
      <Text className="text-[11px] font-semibold text-faint uppercase tracking-wide">{title}</Text>
      {children}
    </View>
  );
}

// One detail row: leading icon tile + label/value. Tappable (chevron) when an
// onPress is given (phone → dialer, email → mail client). Renders nothing for
// an empty value so cards stay clean.
function InfoRow({
  Icon,
  label,
  value,
  onPress,
}: {
  Icon?: LucideIcon;
  label: string;
  value: string | null | undefined;
  onPress?: () => void;
}) {
  const c = useThemeColors();
  if (!value) return null;
  const body = (
    <View className="flex-row items-center gap-3">
      {Icon ? (
        <View className="w-9 h-9 rounded-xl bg-surface items-center justify-center">
          <Icon size={16} color={c.muted} />
        </View>
      ) : null}
      <View className="flex-1 min-w-0">
        <Text className="text-[11px] text-faint">{label}</Text>
        <Text className="text-[15px] font-medium text-ink">{value}</Text>
      </View>
      {onPress ? <ChevronRight size={16} color={c.faint} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} className="active:opacity-60">{body}</Pressable>
  ) : (
    body
  );
}

function CustomFieldInput({
  template, value, onChange,
}: { template: FieldTemplate; value: string; onChange: (v: string) => void }) {
  const tc = useLang().t.common;
  const c = useThemeColors();
  const label = template.required ? `${template.field_label} *` : template.field_label;
  const cfg = parseFieldConfig(template.field_config);
  if (template.field_type === 'note') {
    // Long free text — multiline, grows with content.
    return (
      <View>
        <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          numberOfLines={4}
          placeholderTextColor={c.faint}
          className="rounded-2xl border border-border bg-card px-4 py-3 text-base text-ink min-h-[90px]"
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
        <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
        <View className="flex-row gap-2">
          <Pressable onPress={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${yesActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
            <Text className={`text-sm font-semibold ${yesActive ? 'text-white' : 'text-ink'}`}>{tc.states.yes}</Text>
          </Pressable>
          <Pressable onPress={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-2xl border px-4 py-3 items-center ${noActive ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
            <Text className={`text-sm font-semibold ${noActive ? 'text-white' : 'text-ink'}`}>{tc.states.no}</Text>
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
          <Text className="text-sm font-semibold text-ink mb-2">{label}</Text>
          <View className="flex-row flex-wrap gap-2">
            {template.field_options.map((o) => {
              const on = selected.includes(o);
              return (
                <Pressable
                  key={o}
                  onPress={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                >
                  <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-muted'}`}>{o}</Text>
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

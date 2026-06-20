// Employee detail screen (mobile). Routed at /dashboard/mas/empleados/[id]
// so taps from the list become real navigation (back button works, deep
// links work). Mirrors the data + UX the previous in-list modal exposed:
// view ↔ edit, access section, history timeline.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Share,
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
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput } from '@amixos/shared/lib/format';
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
import { INVITABLE_ROLES, ROLE_LABELS, can, type Role } from '@amixos/shared/lib/permissions';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function EmpleadoDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = createSupabaseClient();
  const { business, user, currentRole } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', role: 'worker',
    pay_type: 'hourly', pay_rate: 0, email: '',
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
    setTemplates((tplRes.data ?? []) as FieldTemplate[]);
    setMembers(((rawMembers as Array<{ id: string; user_id: string; email: string | null; display_name: string | null; role: string }> | null) ?? []).map((m) => ({
      id: m.id, userId: m.user_id, email: m.email, displayName: m.display_name, role: m.role as Role, isYou: m.user_id === user.id,
    })));
    setInvites(((invitesRes?.data ?? []) as Array<{ id: string; email: string; role: string; acceptUrl?: string }>).map((i) => ({
      id: i.id, email: i.email, role: i.role as Role, acceptUrl: i.acceptUrl,
    })));
    setForm({
      first_name: e.first_name, last_name: e.last_name, phone: e.phone ?? '', role: e.role,
      pay_type: e.pay_type, pay_rate: e.pay_rate,
      email: e.email ?? '', birthday: e.birthday ?? '', hire_date: e.hire_date ?? '',
      address: e.address ?? '', city: e.city ?? '', state: e.state ?? '', zip_code: e.zip_code ?? '',
      emergency_contact_name: e.emergency_contact_name ?? '',
      emergency_contact_phone: e.emergency_contact_phone ?? '',
      custom_fields: e.custom_fields ?? {},
    });
    setLoading(false);
  }, [business, user, id, supabase]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!employee || !business) return;
    if (!form.first_name.trim()) { setError(t.modal.errorFirstNameRequired); return; }
    if (form.email.trim() && !isValidEmail(form.email)) { setError(tc.validation.invalidEmail); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
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
    const milestones = diffEmployeeChanges(
      { pay_rate: prev.pay_rate, pay_type: prev.pay_type, role: prev.role },
      { pay_rate: form.pay_rate, pay_type: form.pay_type, role: form.role },
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

  const selAccess = useMemo(
    () => employee ? resolveAccess({ userId: employee.user_id ?? null, email: employee.email }, members, invites) : null,
    [employee, members, invites],
  );
  const canManageAccess = can.manageMembers(currentRole);

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

  // Back always returns to the empleados list. router.back() inside the
  // Tabs navigator pops past the list into the home tab when [id] is
  // pushed directly, so replace explicitly to the list route.
  const goBack = useCallback(() => {
    router.replace('/dashboard/mas/empleados');
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
          <Text className="text-sm text-gray-400">{tc.states.loading}...</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (notFound || !employee) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <Header onBack={goBack} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-gray-400">—</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isView = mode === 'view';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100">
        <Pressable onPress={confirmBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
          <ChevronLeft size={22} color="#111827" />
        </Pressable>
        <Text className="ml-1 flex-1 text-base font-semibold text-gray-900" numberOfLines={1}>
          {employee.first_name} {employee.last_name}
        </Text>
        <View className="flex-row items-center gap-1">
          {isView ? (
            <>
              <Pressable onPress={enterEdit} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
                <Pencil size={18} color="#9CA3AF" />
              </Pressable>
              <Pressable onPress={toggleActive} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
                {employee.active ? (
                  <UserX size={18} color="#9CA3AF" />
                ) : (
                  <UserCheck size={18} color="#10B981" />
                )}
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => { setMode('view'); setError(''); void load(); }} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
              <X size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-32 gap-5" keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View className="items-center gap-2 py-2">
          <View className={`w-20 h-20 rounded-full items-center justify-center ${employee.active ? 'bg-primary/10' : 'bg-gray-100'}`}>
            <Text className={`text-2xl font-bold ${employee.active ? 'text-primary' : 'text-gray-400'}`}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </Text>
          </View>
          {!employee.active ? (
            <View className="bg-gray-100 px-2 py-0.5 rounded-full">
              <Text className="text-xs text-gray-400">{t.inactiveBadge}</Text>
            </View>
          ) : null}
        </View>

        {isView ? (
          <View className="gap-4">
            {(employee.phone || employee.email) ? (
              <>
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.basicInfoHeading}</Text>
                <ViewRow label={t.modal.phoneLabel} value={employee.phone} />
                <ViewRow label={t.modal.emailLabel} value={employee.email} />
              </>
            ) : null}

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.employmentHeading}</Text>
            <ViewRow label={t.modal.hireDateLabel} value={employee.hire_date} />
            <ViewRow
              label={t.modal.payTypeLabel}
              value={PAY_TYPE_OPTIONS.find((o) => o.value === employee.pay_type)?.label ?? employee.pay_type}
            />
            {employee.pay_rate ? (
              <ViewRow
                label={t.modal.payRateLabel.replace(' ({{unit}})', '')}
                value={`$${employee.pay_rate.toFixed(2)} / ${PAY_UNIT[employee.pay_type] ?? PAY_UNIT.hourly}`}
              />
            ) : null}

            {(employee.birthday || employee.address || employee.city || employee.state || employee.zip_code) ? (
              <>
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.personalHeading}</Text>
                <ViewRow label={t.modal.birthdayLabel} value={employee.birthday} />
                <ViewRow label={t.modal.addressLabel} value={employee.address} />
                {(employee.city || employee.state || employee.zip_code) ? (
                  <ViewRow
                    label={`${t.modal.cityLabel} / ${t.modal.stateLabel} / ${t.modal.zipLabel}`}
                    value={[employee.city, employee.state, employee.zip_code].filter(Boolean).join(' · ')}
                  />
                ) : null}
              </>
            ) : null}

            {(employee.emergency_contact_name || employee.emergency_contact_phone) ? (
              <>
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.emergencyContactHeading}</Text>
                <ViewRow label={t.modal.emergencyNameLabel} value={employee.emergency_contact_name} />
                <ViewRow label={t.modal.emergencyPhoneLabel} value={employee.emergency_contact_phone} />
              </>
            ) : null}

            {templates.length > 0 && employee.custom_fields && Object.keys(employee.custom_fields).length > 0 ? (
              <>
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{t.modal.customFieldsHeading}</Text>
                {templates.map((tpl) => (
                  <ViewRow key={tpl.id} label={tpl.field_label} value={employee.custom_fields?.[tpl.field_key]} />
                ))}
              </>
            ) : null}
          </View>
        ) : (
          /* Edit form */
          <View className="gap-4">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.basicInfoHeading}</Text>
            <Input label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder}
              value={form.first_name} onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))} />
            <Input label={t.modal.lastNameLabel} placeholder={t.modal.lastNamePlaceholder}
              value={form.last_name} onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))} />
            <Input label={t.modal.phoneLabel} placeholder={t.modal.phonePlaceholder}
              value={formatPhoneInput(form.phone)}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: formatPhoneInput(v) }))}
              keyboardType="phone-pad" />
            <Input label={t.modal.emailLabel} placeholder={t.modal.emailPlaceholder}
              value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              keyboardType="email-address" autoCapitalize="none" />

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.employmentHeading}</Text>
            <DatePicker label={t.modal.hireDateLabel} value={form.hire_date}
              onChange={(v) => setForm((f) => ({ ...f, hire_date: v }))} />
            <Select label={t.modal.payTypeLabel} value={form.pay_type}
              onValueChange={(v) => setForm((f) => ({ ...f, pay_type: v }))}
              options={PAY_TYPE_OPTIONS} />
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2">
                {t.modal.payRateLabel.replace('{{unit}}', PAY_UNIT[form.pay_type] ?? PAY_UNIT.hourly)}
              </Text>
              <View className="flex-row items-center rounded-2xl border border-gray-200 bg-white px-4">
                <DollarSign size={16} color="#9CA3AF" />
                <Input
                  containerClassName="flex-1 ml-2"
                  placeholder="0.00"
                  value={form.pay_rate ? String(form.pay_rate) : ''}
                  onChangeText={(v) => setForm((f) => ({ ...f, pay_rate: parseFloat(v) || 0 }))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.personalHeading}</Text>
            <DatePicker label={t.modal.birthdayLabel} value={form.birthday}
              onChange={(v) => setForm((f) => ({ ...f, birthday: v }))} />
            <Input label={t.modal.addressLabel} placeholder={t.modal.addressPlaceholder}
              value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
            <Input label={t.modal.cityLabel} placeholder={t.modal.cityPlaceholder}
              value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
            <Select label={t.modal.stateLabel} value={form.state}
              onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
              placeholder={t.modal.stateNone}
              searchable
              options={[{ value: '', label: t.modal.stateNone }, ...US_STATES.map((s) => ({ value: s, label: usStateName(s, locale) }))]} />
            <Input label={t.modal.zipLabel} placeholder={t.modal.zipPlaceholder}
              value={form.zip_code} onChangeText={(v) => setForm((f) => ({ ...f, zip_code: v.replace(/[^0-9]/g, '').slice(0, 5) }))}
              keyboardType="number-pad" />

            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2">{t.modal.emergencyContactHeading}</Text>
            <Input label={t.modal.emergencyNameLabel} placeholder={t.modal.emergencyNamePlaceholder}
              value={form.emergency_contact_name}
              onChangeText={(v) => setForm((f) => ({ ...f, emergency_contact_name: v }))} />
            <Input label={t.modal.emergencyPhoneLabel} placeholder={t.modal.emergencyPhonePlaceholder}
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
          </View>
        )}

        {/* Access section (both view and edit modes) */}
        {selAccess ? (
          <View className="gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.appAccessHeading}</Text>
            {selAccess.kind === 'active' ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-full bg-primary/10 px-2.5 py-0.5">
                    <Text className="text-xs font-semibold text-primary">{ROLE_LABELS[selAccess.role][lang]}</Text>
                  </View>
                  {selAccess.isYou ? <Text className="text-xs text-gray-400">{teamT.youSuffix}</Text> : null}
                  {selAccess.role === 'owner' ? <Text className="text-xs text-gray-400">{teamT.ownerSuffix}</Text> : null}
                </View>
                {canManageAccess && !selAccess.isYou && selAccess.role !== 'owner' ? (
                  <>
                    <Select
                      value={selAccess.role}
                      onValueChange={(v) => changeAccessRole(selAccess.memberId, v as Role)}
                      options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r][lang] }))}
                    />
                    <Pressable onPress={() => removeAccess(selAccess.memberId)} disabled={accessBusy}
                      className="py-2.5 rounded-2xl bg-red-50 active:bg-red-100 items-center">
                      <Text className="text-sm font-semibold text-red-600">{teamT.removeBtn}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : selAccess.kind === 'invited' ? (
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-amber-100 px-2.5 py-0.5">
                  <Text className="text-xs font-semibold text-amber-700">{teamT.pendingBadge}</Text>
                </View>
                <Text className="text-xs text-gray-500">{ROLE_LABELS[selAccess.role][lang]}</Text>
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
                      className="px-3 py-1.5 rounded-2xl bg-red-50 active:bg-red-100"
                    >
                      <Text className="text-sm font-semibold text-red-600">{teamT.revokeBtn}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : canManageAccess ? (
              <View className="gap-2">
                <Text className="text-xs text-gray-500">{t.modal.appAccessNoneHint}</Text>
                <Select
                  value={accessRole}
                  onValueChange={(v) => setAccessRole(v as Role)}
                  options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r][lang] }))}
                />
                <Pressable
                  onPress={() => inviteToApp(form.email.trim(), accessRole)}
                  disabled={accessBusy || !form.email.trim()}
                  className={`py-2.5 rounded-2xl items-center ${form.email.trim() ? 'bg-primary/10 active:bg-primary/20' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-semibold ${form.email.trim() ? 'text-primary' : 'text-gray-400'}`}>
                    {teamT.inviteBtn}
                  </Text>
                </Pressable>
                {!form.email.trim() ? <Text className="text-xs text-amber-600">{t.modal.appAccessEmailRequired}</Text> : null}
              </View>
            ) : (
              <Text className="text-xs text-gray-400">{t.modal.appAccessNoManage}</Text>
            )}
            {accessError ? <Text className="text-xs text-red-500">{accessError}</Text> : null}
          </View>
        ) : null}

        {/* Historial — view mode only (edit mode skips it; user re-enters view to access). */}
        {isView ? (
          <Pressable
            onPress={() => setHistoryOpen(true)}
            className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-gray-50 active:bg-gray-100"
          >
            <Clock size={16} color="#4F46E5" />
            <Text className="text-sm font-semibold text-primary">{t.history.openBtn}</Text>
          </Pressable>
        ) : null}

        {/* Delete — view mode, owner/admin only (not self / owner). */}
        {isView && canDeleteEmployee ? (
          <Pressable
            onPress={deleteEmployee}
            disabled={accessBusy}
            className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-red-50 active:bg-red-100 disabled:opacity-50"
          >
            <Trash2 size={16} color="#DC2626" />
            <Text className="text-sm font-semibold text-red-600">{t.deleteBtn}</Text>
          </Pressable>
        ) : null}

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
        <Pressable onPress={() => setHistoryOpen(false)} className="flex-1 justify-end bg-black/60">
          <Pressable onPress={() => {}} className="bg-white rounded-t-3xl pt-3" style={{ maxHeight: '85%' }}>
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
              <EmployeeHistoryView supabase={supabase} employeeId={employee.id} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
      {unsavedSheet}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row items-center px-2 pt-2 pb-3 border-b border-gray-100">
      <Pressable onPress={onBack} hitSlop={12} className="p-2 rounded-lg active:bg-gray-100">
        <ChevronLeft size={22} color="#111827" />
      </Pressable>
    </View>
  );
}

function ViewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="gap-0.5">
      <Text className="text-xs text-gray-400">{label}</Text>
      <Text className="text-sm text-gray-900">{value}</Text>
    </View>
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

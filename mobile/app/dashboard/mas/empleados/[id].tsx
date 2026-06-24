// Employee detail screen (mobile). Routed at /dashboard/mas/empleados/[id]
// so taps from the list become real navigation (back button works, deep
// links work). Mirrors the data + UX the previous in-list modal exposed:
// view ↔ edit, access section, history timeline.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
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
  type LucideIcon,
} from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput, formatDateLong } from '@amixos/shared/lib/format';
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
  check_name: string | null;
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
    first_name: '', last_name: '', check_name: '', phone: '', role: 'worker',
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
      first_name: e.first_name, last_name: e.last_name, check_name: e.check_name ?? '', phone: e.phone ?? '', role: e.role,
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
              {canDeleteEmployee ? (
                <Pressable onPress={deleteEmployee} disabled={accessBusy} hitSlop={8} className="p-2 rounded-lg active:bg-red-50 disabled:opacity-50">
                  <Trash2 size={18} color="#EF4444" />
                </Pressable>
              ) : null}
            </>
          ) : (
            <Pressable onPress={() => { setMode('view'); setError(''); void load(); }} hitSlop={8} className="p-2 rounded-lg active:bg-gray-100">
              <X size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 py-5 pb-32 gap-5" keyboardShouldPersistTaps="handled">
        {/* Avatar hero */}
        <View className="items-center gap-2 py-1">
          <View className={`w-24 h-24 rounded-full items-center justify-center ${employee.active ? 'bg-primary/10' : 'bg-gray-100'}`}>
            <Text className={`text-3xl font-bold ${employee.active ? 'text-primary' : 'text-gray-400'}`}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </Text>
          </View>
          <Text className="text-xl font-bold text-gray-900 mt-1 text-center">
            {employee.first_name} {employee.last_name}
          </Text>
          <View className="flex-row items-center gap-2">
            {selAccess?.kind === 'active' ? (
              <View className="rounded-full bg-primary/10 px-2.5 py-0.5">
                <Text className="text-xs font-semibold text-primary">{ROLE_LABELS[selAccess.role][lang]}</Text>
              </View>
            ) : null}
            {!employee.active ? (
              <View className="bg-gray-100 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-semibold text-gray-400">{t.inactiveBadge}</Text>
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
                {templates.map((tpl) => (
                  <InfoRow key={tpl.id} Icon={Hash} label={tpl.field_label} value={employee.custom_fields?.[tpl.field_key]} />
                ))}
              </InfoCard>
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
            <Input label={t.modal.checkNameLabel} placeholder={t.modal.checkNamePlaceholder}
              hint={t.modal.checkNameHint}
              value={form.check_name} onChangeText={(v) => setForm((f) => ({ ...f, check_name: v }))} />
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
          <View className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 gap-3">
            <View className="flex-row items-center gap-2.5">
              <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                <KeyRound size={16} color="#4F46E5" />
              </View>
              <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex-1">{t.modal.appAccessHeading}</Text>
            </View>
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

        {/* Active / inactive toggle — view mode. Deactivating keeps the record
           (and history); reactivating brings them back. */}
        {isView ? (
          <Pressable
            onPress={toggleActive}
            className={`flex-row items-center justify-center gap-2 py-3 rounded-2xl ${
              employee.active ? 'bg-gray-50 active:bg-gray-100' : 'bg-emerald-50 active:bg-emerald-100'
            }`}
          >
            {employee.active ? (
              <UserX size={16} color="#6B7280" />
            ) : (
              <UserCheck size={16} color="#10B981" />
            )}
            <Text className={`text-sm font-semibold ${employee.active ? 'text-gray-600' : 'text-emerald-700'}`}>
              {employee.active ? t.deactivateBtn : t.reactivateBtn}
            </Text>
          </Pressable>
        ) : null}

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

// Round icon button for the hero quick actions (call / text / email).
function QuickAction({ Icon, onPress }: { Icon: LucideIcon; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center active:bg-primary/20"
    >
      <Icon size={18} color="#4F46E5" />
    </Pressable>
  );
}

// White card grouping a labelled section of detail rows.
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 gap-3.5">
      <Text className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{title}</Text>
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
  if (!value) return null;
  const body = (
    <View className="flex-row items-center gap-3">
      {Icon ? (
        <View className="w-9 h-9 rounded-xl bg-gray-50 items-center justify-center">
          <Icon size={16} color="#6B7280" />
        </View>
      ) : null}
      <View className="flex-1 min-w-0">
        <Text className="text-[11px] text-gray-400">{label}</Text>
        <Text className="text-[15px] font-medium text-gray-900">{value}</Text>
      </View>
      {onPress ? <ChevronRight size={16} color="#D1D5DB" /> : null}
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
  const label = template.required ? `${template.field_label} *` : template.field_label;
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

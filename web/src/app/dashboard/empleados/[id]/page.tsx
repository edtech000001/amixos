'use client';

// Employee detail page (web). Standalone route — taps from the list at
// /dashboard/empleados navigate here. Mirrors the data + UX the
// previous in-list modal exposed (view ↔ edit, access section, history
// timeline) but as a real page with URL state + a back button so the
// browser back stack works.

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { confirm, alertMessage } from '@amixos/shared/ui/confirmBus';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Clock, DollarSign, UserX, UserCheck, Pencil, Save, X, Trash2, Eye, MapPin, Check,
} from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { fetchEmployeeLocations, setEmployeePrimaryLocation, toggleEmployeeBranch } from '@amixos/shared/lib/locations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { formatPhoneInput, formatDateLong, formatNumberGrouped } from '@amixos/shared/lib/format';
import { usStateName } from '@amixos/shared/lib/usStates';
import { useLang } from '@/i18n/LangProvider';
import { EmployeeHistoryView } from '@amixos/shared/screens/dashboard/EmployeeHistoryView';
import { diffEmployeeChanges, logEmployeeMilestone } from '@amixos/shared/lib/employeeHistory';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { resolveAccess, type AccessMember, type AccessInvite } from '@amixos/shared/lib/teamPeople';
import { INVITABLE_ROLES, ROLE_LABELS, can, type Role } from '@amixos/shared/lib/permissions';
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
  overtime_eligible?: boolean | null;
  overtime_threshold?: number | null;
  overtime_multiplier?: number | null;
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

export default function EmpleadoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { t: full, locale } = useLang();
  const t = full.dashboard.employees;
  const tc = full.common;
  const teamT = full.dashboard.settings.team;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';
  const supabase = createSupabaseClient();
  const { business, user, currentRole, startImpersonation, locations } = useApp();

  const PAY_TYPES: Record<string, string> = { hourly: t.payTypes.hourly, salary: t.payTypes.salary, daily: t.payTypes.daily };
  const PAY_UNIT: Record<string, string> = { hourly: t.payRateUnit.hourly, salary: t.payRateUnit.salary, daily: t.payRateUnit.daily };

  const [employee, setEmployee] = useState<RawEmployee | null>(null);
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [invites, setInvites] = useState<AccessInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 'view' = read-only; 'edit' = form. Pencil flips view→edit, Save flips back.
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // Worker's home branch (loaded from employee_locations). Editable here so you
  // set it on the person, not in a separate Ajustes screen.
  const [homeLocation, setHomeLocation] = useState<string>('');
  // Branches this worker is LENT to (non-home). Toggled via the share control.
  const [sharedLocations, setSharedLocations] = useState<string[]>([]);
  const [form, setForm] = useState({
    first_name: '', last_name: '', check_name: '', phone: '', role: 'worker',
    pay_type: 'hourly', pay_rate: '', overtime_eligible: false, overtime_threshold: '', overtime_multiplier: '', email: '', birthday: '', hire_date: '',
    address: '', city: '', state: '', zip_code: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    custom_fields: {} as Record<string, string>,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accessRole, setAccessRole] = useState<Role>('office');
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState('');

  const reqFlags: Record<string, boolean> = business?.employee_field_required ?? {};
  const rLabel = (key: string, base: string) => (reqFlags[key] ? `${base} *` : base);

  // Per-field show/hide (always-shown fields can never be hidden).
  const empHidden = parseHiddenFields(business?.employee_field_hidden);
  const fHidden = (key: string) =>
    !EMPLOYEE_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(empHidden, key);

  // Custom fields grouped by section, in saved layout order.
  const empAllKeys = useMemo(
    () => [
      ...EMPLOYEE_FIELD_SECTIONS.flatMap(s => EMPLOYEE_SECTION_FIELDS[s]),
      ...templates.map(tpl => `custom:${tpl.id}`),
    ],
    [templates],
  );
  const empLayout = useMemo(
    () => parseEmployeeLayout(business?.employee_field_layout ?? null, empAllKeys),
    [business?.employee_field_layout, empAllKeys],
  );

  const REQUIRED_FIELD_LABELS: Record<string, string> = {
    last_name: t.modal.lastNameLabel,
    check_name: t.modal.checkNameLabel,
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

  const load = async () => {
    if (!business || !user) return;
    setLoading(true);
    const [empRes, tplRes, { data: rawMembers }, invitesRes] = await Promise.all([
      supabase.from('employees').select('*').eq('id', params.id).single(),
      supabase.from('employee_field_templates').select('*').eq('business_id', business.id).order('sort_order'),
      supabase.rpc('list_business_members', { b_id: business.id }),
      fetch(`${getApiBaseUrl()}/api/v1/invites?business_id=${business.id}`, {
        headers: { Authorization: `Bearer ${await getJwt()}` },
      }).then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);
    if (empRes.error || !empRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
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
    if (e.intended_access_role && (INVITABLE_ROLES as string[]).includes(e.intended_access_role)) {
      setAccessRole(e.intended_access_role as Role);
    }
    setTemplates(localizeTemplates((tplRes.data ?? []) as FieldTemplate[], locale));
    setMembers(((rawMembers as Array<{ id: string; user_id: string; email: string | null; display_name: string | null; role: string }> | null) ?? []).map(m => ({
      id: m.id, userId: m.user_id, email: m.email, displayName: m.display_name, role: m.role as Role, isYou: m.user_id === user.id,
    })));
    setInvites(((invitesRes?.data ?? []) as Array<{ id: string; email: string; role: string; acceptUrl?: string }>).map(i => ({
      id: i.id, email: i.email, role: i.role as Role, acceptUrl: i.acceptUrl,
    })));
    setForm({
      first_name: e.first_name, last_name: e.last_name, check_name: e.check_name ?? '', phone: e.phone ?? '', role: e.role,
      pay_type: e.pay_type, pay_rate: e.pay_rate ? String(e.pay_rate) : '',
      overtime_eligible: e.overtime_eligible ?? false,
      overtime_threshold: e.overtime_threshold != null ? String(e.overtime_threshold) : '',
      overtime_multiplier: e.overtime_multiplier != null ? String(e.overtime_multiplier) : '',
      email: e.email ?? '', birthday: e.birthday ?? '', hire_date: e.hire_date ?? '',
      address: e.address ?? '', city: e.city ?? '', state: e.state ?? '', zip_code: e.zip_code ?? '',
      emergency_contact_name: e.emergency_contact_name ?? '',
      emergency_contact_phone: e.emergency_contact_phone ?? '',
      custom_fields: e.custom_fields ?? {},
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [business, params.id, locale]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const fieldValues: Record<string, string> = {
      last_name: form.last_name, phone: form.phone, email: form.email,
      birthday: form.birthday, hire_date: form.hire_date, pay_type: form.pay_type,
      pay_rate: form.pay_rate, address: form.address, city: form.city,
      state: form.state, zip_code: form.zip_code,
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
    };
    const missing: string[] = [];
    for (const [key, label] of Object.entries(REQUIRED_FIELD_LABELS)) {
      if (!reqFlags[key] || fHidden(key)) continue;
      const v = fieldValues[key];
      if (!v || !v.trim()) missing.push(label);
    }
    for (const tpl of templates) {
      if (tpl.required && !form.custom_fields[tpl.field_key]?.trim()) missing.push(tpl.field_label);
    }
    if (missing.length > 0) {
      setError(t.modal.requiredError.replace('{{fields}}', missing.join(', ')));
      return;
    }
    setSaving(true); setError('');
    const payRateNum = parseFloat(form.pay_rate) || 0;
    const payload = {
      ...form, pay_rate: payRateNum,
      overtime_eligible: form.overtime_eligible,
      overtime_threshold: form.overtime_threshold.trim() === '' ? null : parseFloat(form.overtime_threshold) || 0,
      overtime_multiplier: form.overtime_multiplier.trim() === '' ? null : parseFloat(form.overtime_multiplier) || 1,
      check_name: form.check_name.trim() || null,
      birthday: form.birthday || null, hire_date: form.hire_date || null,
      email: form.email.trim() || null, address: form.address.trim() || null,
      city: form.city.trim() || null, state: form.state || null,
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
      { pay_rate: payRateNum, pay_type: form.pay_type, role: form.role },
    );
    for (const m of milestones) {
      void logEmployeeMilestone(supabase, {
        businessId: business.id, employeeId: prev.id,
        eventType: m.eventType, details: m.details, createdBy: user?.id ?? null,
      });
    }
    await load();
    setSaving(false);
    setMode('view');
  };

  const toggleActive = async () => {
    if (!employee || !business) return;
    const nextActive = !employee.active;
    await supabase.from('employees').update({ active: nextActive }).eq('id', employee.id);
    void logEmployeeMilestone(supabase, {
      businessId: business.id, employeeId: employee.id,
      eventType: nextActive ? 'rehired' : 'terminated', createdBy: user?.id ?? null,
    });
    setEmployee(prev => prev ? { ...prev, active: nextActive } : prev);
  };

  // Roster flag — office members (owner/admin) stay ACTIVE but stop being
  // offered as field crew on jobs. Saves instantly, like deactivate.
  const toggleRoster = async () => {
    if (!employee) return;
    const next = !(employee.show_in_roster ?? true);
    await supabase.from('employees').update({ show_in_roster: next }).eq('id', employee.id);
    setEmployee(prev => prev ? { ...prev, show_in_roster: next } : prev);
  };

  // ─── Access section handlers ──────────────────────────────────────
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

  const revokeInvite = async (inviteId: string) => {
    if (!(await confirm({ message: teamT.confirmRevoke.replace('{{email}}', employee?.email ?? ''), destructive: true }))) return;
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
    const m = members.find(x => x.id === memberId);
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
    const m = members.find(x => x.id === memberId);
    if (!m || !business) return;
    if (!(await confirm({ message: teamT.confirmRemove.replace('{{name}}', m.displayName ?? m.email ?? ''), destructive: true }))) return;
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
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    setAccessBusy(true); setAccessError('');
    try {
      await startImpersonation(m.userId);
      router.push('/dashboard');
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

  const selAccess = useMemo(
    () => employee ? resolveAccess({ userId: employee.user_id ?? null, email: employee.email }, members, invites) : null,
    [employee, members, invites],
  );
  const canManageAccess = can.manageMembers(currentRole);
  const canVerComoSel =
    !!selAccess && selAccess.kind === 'active' && !selAccess.isYou &&
    canManageAccess && selAccess.role !== 'owner' &&
    !(currentRole === 'admin' && selAccess.role === 'admin');

  // Hard-delete this employee (+ revoke app access if any). Owner/admin only,
  // never the owner or yourself. FKs are set null / cascade, so it's safe.
  const isSelfOrOwner = selAccess?.kind === 'active' && (selAccess.isYou || selAccess.role === 'owner');
  const canDeleteEmployee = canManageAccess && !isSelfOrOwner;
  const deleteEmployee = async () => {
    if (!employee || !business) return;
    const name = `${employee.first_name} ${employee.last_name}`.trim();
    if (!(await confirm({ message: t.deleteConfirm.replace('{{name}}', name), destructive: true }))) return;
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
    router.push('/dashboard/empleados');
  };

  // ─── Render ───────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-6 text-sm text-gray-400">{tc.states.loading}...</div>;
  }
  if (notFound || !employee) {
    return (
      <div className="p-6">
        <Link href="/dashboard/empleados" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ArrowLeft size={16} /> {tc.buttons.back}
        </Link>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          {/* Generic "not found" fallback — kept inline since common.states
             only carries loading/saving today. */}
          —
        </div>
      </div>
    );
  }

  const isView = mode === 'view';

  return (
    <div className="p-6">
      {/* Header — edit mode's back returns to the member's view (no extra ✕);
         delete lives top-right like mobile. Deactivate moved under App Access. */}
      <div className="flex items-center justify-between mb-6">
        {isView ? (
          <Link href="/dashboard/empleados" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft size={16} /> {tc.buttons.back}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => { setMode('view'); setError(''); load(); }}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={16} /> {tc.buttons.back}
          </button>
        )}
        <div className="flex items-center gap-1">
          {isView ? (
            <>
              <button
                type="button"
                onClick={() => setMode('edit')}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Pencil size={16} className="text-gray-500" />
              </button>
              {canDeleteEmployee ? (
                <button
                  type="button"
                  onClick={deleteEmployee}
                  disabled={accessBusy}
                  className="p-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {isView ? (
        /* View mode fills the page: identity + access + record actions on the
           left, the detail sections on the right. Stacks below lg. */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="flex flex-col gap-5">
        {/* Avatar + name — floats above the section cards (matches mobile) */}
        <div className="flex flex-col items-center gap-2 py-2">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${employee.active ? 'bg-primary/10' : 'bg-gray-100'}`}>
            <span className={`text-2xl font-bold ${employee.active ? 'text-primary' : 'text-gray-400'}`}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {employee.first_name} {employee.last_name}
          </h1>
          {!employee.active ? (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-400">{t.inactiveBadge}</span>
          ) : null}
        </div>

        {/* Branch sharing — home branch + lend the worker to other branches
            (so they show in that branch's team list too). View mode only;
            the home branch itself is changed via the edit form. */}
        {isView && locations.length >= 2 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-primary" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{lang === 'en' ? 'Locations' : 'Ubicaciones'}</p>
            </div>
            <p className="text-sm text-gray-700">
              {lang === 'en' ? 'Home branch: ' : 'Sucursal principal: '}
              <span className="font-semibold">{locations.find(l => l.id === homeLocation)?.name ?? (lang === 'en' ? 'None' : 'Ninguna')}</span>
            </p>
            <p className="text-xs text-gray-400">{lang === 'en' ? 'Share with other branches (they appear in that team list too):' : 'Compartir con otras sucursales (aparecen también en esa lista de equipo):'}</p>
            <div className="flex flex-wrap gap-2">
              {locations.filter(l => l.id !== homeLocation).map(l => {
                const shared = sharedLocations.includes(l.id);
                return (
                  <button key={l.id} type="button" onClick={() => toggleShare(l.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${shared ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {shared && <Check size={12} />} {l.name}
                  </button>
                );
              })}
              {locations.filter(l => l.id !== homeLocation).length === 0 ? (
                <p className="text-xs text-gray-400">{lang === 'en' ? 'No other branches.' : 'No hay otras sucursales.'}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {selAccess ? (
          <AccessSection
            selAccess={selAccess} email={form.email.trim()} canManage={canManageAccess}
            lang={lang} role={accessRole} setRole={setAccessRole}
            busy={accessBusy} error={accessError}
            onInvite={inviteToApp} onRevoke={revokeInvite}
            onChangeRole={changeAccessRole} onRemove={removeAccess}
            onVerComo={verComoMember} canVerComo={canVerComoSel}
            teamT={teamT} t={t}
          />
        ) : null}

            {/* Deactivate / reactivate — labeled button under App Access
               (used to be the cryptic person-✕ icon in the header). */}
            <button
              type="button"
              onClick={toggleActive}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors ${
                employee.active ? 'bg-gray-50 hover:bg-gray-100' : 'bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              {employee.active ? (
                <>
                  <UserX size={15} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-600">{t.deactivateBtn}</span>
                </>
              ) : (
                <>
                  <UserCheck size={15} className="text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-600">{t.reactivateBtn}</span>
                </>
              )}
            </button>

            {/* Roster flag — keep office members out of job crew pickers. */}
            <button
              type="button"
              onClick={toggleRoster}
              title={t.rosterHint}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors ${
                (employee.show_in_roster ?? true) ? 'bg-gray-50 hover:bg-gray-100' : 'bg-amber-50 hover:bg-amber-100'
              }`}
            >
              {(employee.show_in_roster ?? true) ? (
                <>
                  <UserX size={15} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-600">{t.rosterRemoveBtn}</span>
                </>
              ) : (
                <>
                  <UserCheck size={15} className="text-amber-600" />
                  <span className="text-sm font-semibold text-amber-600">{t.rosterAddBtn}</span>
                </>
              )}
            </button>

            {/* Historial */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <Clock size={15} className="text-primary" />
            <span className="text-sm font-semibold text-primary">{t.history.openBtn}</span>
          </button>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-5">
            <ViewBody emp={employee} templates={templates} t={t} payTypes={PAY_TYPES} payUnit={PAY_UNIT} lang={lang} />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="flex flex-col gap-5">
        {/* Avatar + name — floats above the section cards (matches mobile) */}
        <div className="flex flex-col items-center gap-2 py-2">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${employee.active ? 'bg-primary/10' : 'bg-gray-100'}`}>
            <span className={`text-2xl font-bold ${employee.active ? 'text-primary' : 'text-gray-400'}`}>
              {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {employee.first_name} {employee.last_name}
          </h1>
          {!employee.active ? (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-400">{t.inactiveBadge}</span>
          ) : null}
        </div>

        {/* Home branch — editable in edit mode (multi-location businesses only). */}
        {!isView && locations.length >= 2 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">{lang === 'en' ? 'Home location' : 'Ubicación principal'}</label>
            <select value={homeLocation} onChange={e => setHomeLocation(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              <option value="">{lang === 'en' ? 'No location' : 'Sin ubicación'}</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="text-xs text-gray-400">{lang === 'en' ? 'Lend them to other branches in Settings → Locations.' : 'Préstalos a otras sucursales en Ajustes → Ubicaciones.'}</p>
          </div>
        ) : null}

          {error && <p className="text-xs text-red-500">{error}</p>}

        {selAccess ? (
          <AccessSection
            selAccess={selAccess} email={form.email.trim()} canManage={canManageAccess}
            lang={lang} role={accessRole} setRole={setAccessRole}
            busy={accessBusy} error={accessError}
            onInvite={inviteToApp} onRevoke={revokeInvite}
            onChangeRole={changeAccessRole} onRemove={removeAccess}
            onVerComo={verComoMember} canVerComo={canVerComoSel}
            teamT={teamT} t={t}
          />
        ) : null}
          </div>

          <div className="lg:col-span-2 flex flex-col gap-5">
            <EditForm
              form={form} setForm={setForm} templates={templates} t={t} tc={tc}
              rLabel={rLabel} payTypes={PAY_TYPES} payUnit={PAY_UNIT} usStates={US_STATES} lang={lang}
              fHidden={fHidden} layout={empLayout}
            />
            {/* Save row — follows the form so it's where editing ends. */}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => { setMode('view'); setError(''); load(); }} fullWidth>
                {tc.buttons.cancel}
              </Button>
              <Button onClick={save} loading={saving} fullWidth>
                <Save size={14} className="mr-1.5" /> {tc.buttons.save}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t.history.title}>
        <EmployeeHistoryView supabase={supabase} employeeId={employee.id} />
      </Modal>
    </div>
  );
}

// ─── Read-only view body ────────────────────────────────────────────────
function ViewBody({ emp, templates, t, payTypes, payUnit, lang }: {
  emp: RawEmployee;
  templates: FieldTemplate[];
  t: ReturnType<typeof useLang>['t']['dashboard']['employees'];
  payTypes: Record<string, string>;
  payUnit: Record<string, string>;
  lang: 'es' | 'en';
}) {
  return (
    <div className="flex flex-col gap-5">
      {(emp.check_name || emp.phone || emp.email) ? (
        <Section title={t.modal.basicInfoHeading}>
          <ViewRow label={t.modal.checkNameLabel} value={emp.check_name} />
          <ViewRow label={t.modal.phoneLabel} value={emp.phone} />
          <ViewRow label={t.modal.emailLabel} value={emp.email} />
        </Section>
      ) : null}
      <Section title={t.modal.employmentHeading}>
        <ViewRow label={t.modal.hireDateLabel} value={emp.hire_date ? formatDateLong(emp.hire_date, lang) : null} />
        <ViewRow label={t.modal.payTypeLabel} value={payTypes[emp.pay_type] ?? emp.pay_type} />
        {emp.pay_rate ? (
          <ViewRow
            label={t.modal.payRateLabel.replace(' ({{unit}})', '')}
            value={`$${emp.pay_rate.toFixed(2)} / ${payUnit[emp.pay_type] ?? payUnit.hourly}`}
          />
        ) : null}
        {emp.pay_type === 'hourly' ? (
          <ViewRow
            label={t.modal.overtimeLabel}
            value={(emp.overtime_eligible ?? false)
              ? `${lang === 'en' ? 'Yes' : 'Sí'}${emp.overtime_threshold != null || emp.overtime_multiplier != null ? ` · ${emp.overtime_threshold ?? '—'} h × ${emp.overtime_multiplier ?? '—'}` : ''}`
              : lang === 'en' ? 'No' : 'No'}
          />
        ) : null}
      </Section>
      {(emp.birthday || emp.address || emp.city || emp.state || emp.zip_code) ? (
        <Section title={t.modal.personalHeading}>
          <ViewRow label={t.modal.birthdayLabel} value={emp.birthday ? formatDateLong(emp.birthday, lang) : null} />
          <ViewRow label={t.modal.addressLabel} value={emp.address} />
          {(emp.city || emp.state || emp.zip_code) ? (
            <ViewRow
              label={`${t.modal.cityLabel} / ${t.modal.stateLabel} / ${t.modal.zipLabel}`}
              value={[emp.city, emp.state, emp.zip_code].filter(Boolean).join(' · ')}
            />
          ) : null}
        </Section>
      ) : null}
      {(emp.emergency_contact_name || emp.emergency_contact_phone) ? (
        <Section title={t.modal.emergencyContactHeading}>
          <ViewRow label={t.modal.emergencyNameLabel} value={emp.emergency_contact_name} />
          <ViewRow label={t.modal.emergencyPhoneLabel} value={emp.emergency_contact_phone} />
        </Section>
      ) : null}
      {templates.length > 0 && emp.custom_fields && Object.keys(emp.custom_fields).length > 0 ? (
        <Section title={t.modal.customFieldsHeading}>
          {templates.map(tpl => {
            const raw = emp.custom_fields?.[tpl.field_key];
            const value = tpl.field_type === 'number' && raw ? formatNumberGrouped(raw) : raw;
            return <ViewRow key={tpl.id} label={tpl.field_label} value={value} />;
          })}
        </Section>
      ) : null}
    </div>
  );
}

// One titled section card in the read-only employee view (mirrors the mobile
// InfoCard so the layout matches across platforms).
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

// ─── Editable form body ─────────────────────────────────────────────────
type FormState = {
  first_name: string; last_name: string; check_name: string; phone: string; role: string;
  pay_type: string; pay_rate: string; overtime_eligible: boolean; overtime_threshold: string; overtime_multiplier: string; email: string;
  birthday: string; hire_date: string; address: string; city: string;
  state: string; zip_code: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  custom_fields: Record<string, string>;
};

function EditForm({
  form, setForm, templates, t, tc, rLabel, payTypes, payUnit, usStates, lang,
  fHidden, layout,
}: {
  form: FormState;
  setForm: (fn: (f: FormState) => FormState) => void;
  templates: FieldTemplate[];
  t: ReturnType<typeof useLang>['t']['dashboard']['employees'];
  tc: ReturnType<typeof useLang>['t']['common'];
  rLabel: (key: string, base: string) => string;
  payTypes: Record<string, string>;
  payUnit: Record<string, string>;
  usStates: string[];
  lang: 'es' | 'en';
  fHidden: (key: string) => boolean;
  layout: { key: string; section: EmployeeFieldSection }[];
}) {
  const sectionLabel = (section: EmployeeFieldSection): string => {
    const es = lang === 'es';
    switch (section) {
      case 'general': return 'General';
      case 'contact': return es ? 'Contacto' : 'Contact';
      case 'employment': return es ? 'Empleo' : 'Employment';
      case 'location': return es ? 'Ubicación' : 'Location';
      case 'emergency': return es ? 'Emergencia' : 'Emergency';
      case 'additional': return es ? 'Detalles adicionales' : 'Additional details';
    }
  };

  const renderCustom = (tpl: FieldTemplate) => (
    <CustomFieldInput
      key={tpl.id}
      template={tpl}
      value={form.custom_fields[tpl.field_key] ?? ''}
      onChange={v => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [tpl.field_key]: v } }))}
    />
  );

  // Full-width / stacked JSX for each built-in employee field key.
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return <Input key={key} label={t.modal.firstNameLabel} placeholder={t.modal.firstNamePlaceholder} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />;
      case 'last_name':
        return <Input key={key} label={rLabel('last_name', t.modal.lastNameLabel)} placeholder={t.modal.lastNamePlaceholder} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />;
      case 'check_name':
        return <Input key={key} label={rLabel('check_name', t.modal.checkNameLabel)} placeholder={t.modal.checkNamePlaceholder} hint={t.modal.checkNameHint} value={form.check_name} onChange={e => setForm(f => ({ ...f, check_name: e.target.value }))} />;
      case 'phone':
        return <Input key={key} label={rLabel('phone', t.modal.phoneLabel)} placeholder={t.modal.phonePlaceholder} value={formatPhoneInput(form.phone)} onChange={e => setForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))} />;
      case 'email':
        return <Input key={key} label={rLabel('email', t.modal.emailLabel)} type="email" placeholder={t.modal.emailPlaceholder} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />;
      case 'hire_date':
        return <Input key={key} label={rLabel('hire_date', t.modal.hireDateLabel)} type="date" value={form.hire_date} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} />;
      case 'birthday':
        return <Input key={key} label={rLabel('birthday', t.modal.birthdayLabel)} type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />;
      case 'pay_type':
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{rLabel('pay_type', t.modal.payTypeLabel)}</label>
            <select value={form.pay_type} onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(payTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        );
      case 'pay_rate':
        return (
          <div key={key} className="flex flex-col gap-2">
            <Input label={rLabel('pay_rate', t.modal.payRateLabel.replace('{{unit}}', payUnit[form.pay_type] ?? payUnit.hourly))} type="number" min="0" step="0.01" value={form.pay_rate} onChange={e => setForm(f => ({ ...f, pay_rate: e.target.value }))} leftIcon={<DollarSign size={15} />} />
            {/* Overtime — hardcoded companion of the pay rate (hourly only). */}
            {form.pay_type === 'hourly' ? (
              <>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-gray-700">{t.modal.overtimeLabel}</span>
                  <input
                    type="checkbox"
                    checked={form.overtime_eligible}
                    onChange={e => setForm(f => ({ ...f, overtime_eligible: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </label>
                {form.overtime_eligible ? (
                  <div className="flex gap-3">
                    <label className="flex-1 text-xs text-gray-500">
                      {t.modal.overtimeThresholdLabel}
                      <input
                        type="number" min="0"
                        value={form.overtime_threshold}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        onChange={e => setForm(f => ({ ...f, overtime_threshold: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                    <label className="flex-1 text-xs text-gray-500">
                      {t.modal.overtimeMultiplierLabel}
                      <input
                        type="number" min="1" step="0.1"
                        value={form.overtime_multiplier}
                        placeholder={t.modal.overtimeDefaultPlaceholder}
                        onChange={e => setForm(f => ({ ...f, overtime_multiplier: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        );
      case 'address':
        return <Input key={key} label={rLabel('address', t.modal.addressLabel)} placeholder={t.modal.addressPlaceholder} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />;
      case 'city':
        return <Input key={key} label={rLabel('city', t.modal.cityLabel)} placeholder={t.modal.cityPlaceholder} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />;
      case 'state':
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{rLabel('state', t.modal.stateLabel)}</label>
            <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              <option value="">{t.modal.stateNone}</option>
              {usStates.map(s => <option key={s} value={s}>{usStateName(s, lang)}</option>)}
            </select>
          </div>
        );
      case 'zip_code':
        return <Input key={key} label={rLabel('zip_code', t.modal.zipLabel)} placeholder={t.modal.zipPlaceholder} value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))} inputMode="numeric" />;
      case 'emergency_contact_name':
        return <Input key={key} label={rLabel('emergency_contact_name', t.modal.emergencyNameLabel)} placeholder={t.modal.emergencyNamePlaceholder} value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />;
      case 'emergency_contact_phone':
        return <Input key={key} label={rLabel('emergency_contact_phone', t.modal.emergencyPhoneLabel)} placeholder={t.modal.emergencyPhonePlaceholder} value={formatPhoneInput(form.emergency_contact_phone)} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: formatPhoneInput(e.target.value) }))} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {EMPLOYEE_FIELD_SECTIONS.map(section => {
        const visibleKeys = employeeFieldsInSection(layout, section)
          .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
        if (visibleKeys.length === 0) return null;
        return (
          <div key={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{sectionLabel(section)}</p>
            {visibleKeys.map(k => {
              if (k.startsWith('custom:')) {
                const tpl = templates.find(tp => `custom:${tp.id}` === k);
                return tpl ? renderCustom(tpl) : null;
              }
              return renderField(k);
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Access section (invite / change role / revoke / remove) ────────────
function AccessSection({
  selAccess, email, canManage, lang, role, setRole, busy, error,
  onInvite, onRevoke, onChangeRole, onRemove, onVerComo, canVerComo, teamT, t,
}: {
  selAccess: ReturnType<typeof resolveAccess>;
  email: string;
  canManage: boolean;
  lang: 'es' | 'en';
  role: Role;
  setRole: (r: Role) => void;
  busy: boolean;
  error: string;
  onInvite: (email: string, role: Role) => void;
  onRevoke: (id: string) => void;
  onChangeRole: (memberId: string, role: Role) => void;
  onRemove: (memberId: string) => void;
  onVerComo: (memberId: string) => void;
  canVerComo: boolean;
  teamT: ReturnType<typeof useLang>['t']['dashboard']['settings']['team'];
  t: ReturnType<typeof useLang>['t']['dashboard']['employees'];
}) {
  const [copied, setCopied] = useState(false);
  const copyInviteLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(teamT.copyLinkBtn, url);
    }
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.modal.appAccessHeading}</p>
      {selAccess?.kind === 'active' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{ROLE_LABELS[selAccess.role][lang]}</span>
            {selAccess.isYou ? <span className="text-xs text-gray-400">{teamT.youSuffix}</span> : null}
            {selAccess.role === 'owner' ? <span className="text-xs text-gray-400">{teamT.ownerSuffix}</span> : null}
          </div>
          {canManage && !selAccess.isYou && selAccess.role !== 'owner' ? (
            <div className="flex items-center gap-2">
              <select value={selAccess.role} disabled={busy} onChange={e => onChangeRole(selAccess.memberId, e.target.value as Role)} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
                {INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r][lang]}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => onRemove(selAccess.memberId)} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                {teamT.removeBtn}
              </button>
            </div>
          ) : null}
          {canVerComo && selAccess.kind === 'active' ? (
            <button type="button" disabled={busy} onClick={() => onVerComo(selAccess.memberId)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <Eye size={14} /> {teamT.verComoBtn}
            </button>
          ) : null}
        </div>
      ) : selAccess?.kind === 'invited' ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{teamT.pendingBadge}</span>
          <span className="text-xs text-gray-500">{ROLE_LABELS[selAccess.role][lang]}</span>
          {canManage ? (
            <div className="ml-auto flex items-center gap-1">
              {selAccess.acceptUrl ? (
                <button type="button" onClick={() => copyInviteLink(selAccess.acceptUrl!)} className="px-3 py-1.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors">
                  {copied ? teamT.linkCopied : teamT.copyLinkBtn}
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={() => onRevoke(selAccess.inviteId)} className="px-3 py-1.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                {teamT.revokeBtn}
              </button>
            </div>
          ) : null}
        </div>
      ) : canManage ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">{t.modal.appAccessNoneHint}</p>
          <div className="flex items-center gap-2">
            <select value={role} disabled={busy} onChange={e => setRole(e.target.value as Role)} className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r][lang]}</option>)}
            </select>
            <button type="button" disabled={busy || !email} onClick={() => onInvite(email, role)} className="px-3 py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
              {teamT.inviteBtn}
            </button>
          </div>
          {!email ? <p className="text-xs text-amber-600">{t.modal.appAccessEmailRequired}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-gray-400">{t.modal.appAccessNoManage}</p>
      )}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

// ─── ViewRow + custom field input helpers ───────────────────────────────
function ViewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  );
}

function CustomFieldInput({ template, value, onChange }: {
  template: FieldTemplate;
  value: string;
  onChange: (v: string) => void;
}) {
  const tc = useLang().t.common;
  const label = template.required ? `${template.field_label} *` : template.field_label;
  const cfg = parseFieldConfig(template.field_config);
  if (template.field_type === 'note') {
    // Long free text — multiline.
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <textarea
          rows={4}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
        />
      </div>
    );
  }
  if (template.field_type === 'boolean') {
    // Two buttons (Yes / No) with three states — '', 'true', 'false'. Nothing
    // is pre-selected, so a required field forces an explicit choice. Clicking
    // the active button clears it back to "unanswered".
    const yesActive = value === 'true';
    const noActive = value === 'false';
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(yesActive ? '' : 'true')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.yes}
          </button>
          <button type="button" onClick={() => onChange(noActive ? '' : 'false')}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {tc.states.no}
          </button>
        </div>
      </div>
    );
  }
  if (template.field_type === 'select' && template.field_options?.length) {
    // Multi-select: chips, value stored comma-joined ("A, B") so display
    // paths read naturally. Single-select keeps the dropdown.
    if (cfg.multi) {
      const selected = splitMultiValue(value);
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <div className="flex flex-wrap gap-2">
            {template.field_options.map(o => {
              const on = selected.includes(o);
              return (
                <button key={o} type="button" onClick={() => onChange(toggleMultiOption(value, o))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
          <option value="">—</option>
          {template.field_options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (template.field_type === 'number') {
    // type="text" + inputMode so we can enforce numeric (and optional
    // whole-number-only) as the user types — type="number" can't be sanitized.
    return (
      <Input
        label={label}
        type="text"
        inputMode={cfg.integerOnly ? 'numeric' : 'decimal'}
        value={cfg.thousands ? groupNumberString(value) : value}
        onChange={e => onChange(sanitizeNumberInput(e.target.value, cfg.integerOnly))}
      />
    );
  }
  return (
    <Input
      label={label}
      type={template.field_type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

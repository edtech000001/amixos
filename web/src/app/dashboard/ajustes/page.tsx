'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Save, Plus, Pencil, Trash2, GripVertical, Sliders, Globe, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Palette, Sparkles, LogOut, Building2, Eye, EyeOff, X, Contrast, LifeBuoy, ShieldCheck, Upload } from 'lucide-react';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { pathFromPublicUrl, PUBLIC_ASSETS_BUCKET } from '@amixos/shared/lib/storageUrls';
import { SUPPORT_EMAIL, buildSupportMailto } from '@amixos/shared/lib/support';
import { logAudit } from '@amixos/shared/lib/audit';
import { usStateName } from '@amixos/shared/lib/usStates';
import { INVOICE_EMAIL_TOKENS } from '@amixos/shared/lib/invoiceEmail';
import { ROLE_LABELS, can } from '@amixos/shared/lib/permissions';
import { parseHiddenFields, JOB_FIELDS_ALWAYS_SHOWN, parseJobLayout, fieldsInSection, JOB_LAYOUT_SECTIONS, type JobFieldEntry, type JobLayoutSection } from '@amixos/shared/lib/jobSections';
import {
  CLIENT_FIELD_SECTIONS, CLIENT_FIELDS_ALWAYS_SHOWN, parseClientLayout, clientFieldsInSection,
  CLIENT_SECTION_FIELDS, type ClientFieldSection, type ClientFieldEntry,
} from '@amixos/shared/lib/clientFieldSections';
import {
  EMPLOYEE_FIELD_SECTIONS, EMPLOYEE_FIELDS_ALWAYS_SHOWN, parseEmployeeLayout, employeeFieldsInSection,
  EMPLOYEE_SECTION_FIELDS, type EmployeeFieldSection, type EmployeeFieldEntry,
} from '@amixos/shared/lib/employeeFieldSections';
import {
  INVOICE_FIELD_SECTIONS, INVOICE_FIELDS_ALWAYS_SHOWN, parseInvoiceLayout, invoiceFieldsInSection,
  INVOICE_SECTION_FIELDS, type InvoiceFieldSection, type InvoiceFieldEntry,
} from '@amixos/shared/lib/invoiceFieldSections';

// Settings-only labels for the layout section headers (the form draws its own
// headings). Bilingual inline — no dict keys needed.
const JOB_SECTION_LABELS: Record<JobLayoutSection, { es: string; en: string }> = {
  general: { es: 'General', en: 'General' },
  location: { es: 'Ubicación', en: 'Location' },
  schedule: { es: 'Horario', en: 'Schedule' },
  workers: { es: 'Trabajadores', en: 'Workers' },
  notes: { es: 'Notas', en: 'Notes' },
  additional: { es: 'Detalles adicionales', en: 'Additional details' },
};

const CLIENT_SECTION_LABELS: Record<ClientFieldSection, { es: string; en: string }> = {
  general: { es: 'General', en: 'General' },
  contact: { es: 'Contacto', en: 'Contact' },
  location: { es: 'Ubicación', en: 'Location' },
  notes: { es: 'Notas', en: 'Notes' },
  additional: { es: 'Detalles adicionales', en: 'Additional details' },
};

const EMPLOYEE_SECTION_LABELS: Record<EmployeeFieldSection, { es: string; en: string }> = {
  general: { es: 'General', en: 'General' },
  contact: { es: 'Contacto', en: 'Contact' },
  employment: { es: 'Empleo', en: 'Employment' },
  location: { es: 'Ubicación', en: 'Location' },
  emergency: { es: 'Emergencia', en: 'Emergency' },
  additional: { es: 'Detalles adicionales', en: 'Additional details' },
};

const INVOICE_SECTION_LABELS: Record<InvoiceFieldSection, { es: string; en: string }> = {
  general: { es: 'General', en: 'General' },
  notes: { es: 'Notas', en: 'Notes' },
  additional: { es: 'Detalles adicionales', en: 'Additional details' },
};

// Standard field keys per entity, in section order — drives `allKeys` and the
// section render (flattened from each entity's *_SECTION_FIELDS).
const CLIENT_STANDARD_KEYS: string[] = CLIENT_FIELD_SECTIONS.flatMap(s => CLIENT_SECTION_FIELDS[s] ?? []);
const EMPLOYEE_STANDARD_KEYS: string[] = EMPLOYEE_FIELD_SECTIONS.flatMap(s => EMPLOYEE_SECTION_FIELDS[s] ?? []);
const INVOICE_STANDARD_KEYS: string[] = INVOICE_FIELD_SECTIONS.flatMap(s => INVOICE_SECTION_FIELDS[s] ?? []);
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsNav, type SettingsTab } from '@/components/dashboard/SettingsNav';
import ImportModal from '@/components/dashboard/ImportModal';
import ImportClientsModal from '@/components/dashboard/ImportClientsModal';
import { ImportPhotosModal } from '@/components/dashboard/ImportPhotosModal';
import { UbicacionesSettings } from '@/components/dashboard/UbicacionesSettings';
import { formatDateTimeLong, formatPhoneInput } from '@amixos/shared/lib/format';
import {
  DAY_KEYS,
  DEFAULT_OPERATING_HOURS,
  normalizeOperatingHours,
  type DayKey,
  type OperatingHours,
} from '@amixos/shared/lib/operatingHours';
import {
  JOB_ALERT_COLORS,
  JOB_ALERT_STYLE,
  normalizeJobAlertThresholds,
  type JobAlertColor,
  type JobAlertThresholds,
} from '@amixos/shared/lib/jobAlerts';
import { moveTemplate, parseFieldConfig } from '@amixos/shared/lib/fieldTemplates';
import { InvoiceDesigner } from '@/components/dashboard/InvoiceDesigner';
import { normalizeBundle, activeBundleConfig, DEFAULT_INVOICE_START_NUMBER, type InvoiceThemeBundle, type InvoiceBranding } from '@amixos/shared/lib/invoiceTemplate';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';
import { diffById, isDirty, isTempId, newTempId } from '@amixos/shared/lib/draftList';
import { SortableList } from '@/components/dashboard/SortableList';
import { PricingModal } from '@/components/PricingModal';
import { PLANS } from '@amixos/shared/lib/plans';
import {
  activePlanKey,
  isTrialExpired,
  trialDaysLeft,
  type SubscriptionInfo,
} from '@amixos/shared/lib/subscription';

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

// Build the field_config payload from a template form. Flags only apply to
// their matching type (integerOnly/thousands → number, multi → select).
function buildFieldConfig(form: {
  field_type: FieldTemplate['field_type'];
  integer_only: boolean;
  thousands: boolean;
  multi: boolean;
}): { integerOnly?: boolean; multi?: boolean; thousands?: boolean } {
  return {
    ...(form.integer_only && form.field_type === 'number' ? { integerOnly: true } : {}),
    ...(form.thousands && form.field_type === 'number' ? { thousands: true } : {}),
    ...(form.multi && form.field_type === 'select' ? { multi: true } : {}),
  };
}

type Tab = 'negocio' | 'trabajos' | 'clientes' | 'empleados' | 'facturas' | 'facturatema' | 'conexiones' | 'importar' | 'cuenta' | 'soporte';

// Tabs that change business config — admin-only. The rest ('cuenta','soporte')
// are personal and visible to every member.
const CONFIG_TABS: Tab[] = ['negocio', 'trabajos', 'clientes', 'empleados', 'facturas', 'facturatema', 'conexiones', 'importar'];

const PIPELINE_STEP_KEYS = ['proposal', 'sent', 'accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'] as const;

const DEFAULT_EMPLOYEE_FIELD_KEYS = [
  'first_name', 'last_name', 'check_name', 'phone', 'email',
  'hire_date', 'birthday',
  'pay_type', 'pay_rate',
  'address', 'city', 'state', 'zip_code',
  'emergency_contact_name', 'emergency_contact_phone',
] as const;

// Standard job fields exposed in Ajustes → Trabajos. `title` omitted on
// purpose — a job without a title isn't usable.
const DEFAULT_JOB_FIELD_KEYS = [
  'client_id', 'priority', 'description',
  'job_address', 'job_city', 'job_state', 'coordinates',
  'scheduled_date', 'time_start', 'total_hours',
  'assigned_workers', 'worker_notes', 'internal_notes',
] as const;

const DEFAULT_CLIENT_FIELD_KEYS = [
  'first_name', 'last_name', 'company', 'phone_cell', 'phone_office',
  'email_office', 'email_home', 'address', 'city', 'state', 'zip_code',
] as const;

const BIZ_US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export default function AjustesPage() {
  const supabase = createSupabaseClient();
  const { business, user, refetchBusiness, currentRole, businesses, roles, activeBusinessId } = useApp();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings;
  const tc = full.common;
  const tFields = full.dashboard.clients.fields;
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'negocio');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  async function openBillingPortal() {
    if (!business) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          data?.error ||
            (locale === 'es' ? 'No se pudo abrir el portal.' : 'Could not open the portal.'),
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setPortalError(
        err instanceof Error
          ? err.message
          : locale === 'es'
            ? 'Ocurrió un error.'
            : 'Something went wrong.',
      );
      setPortalLoading(false);
    }
  }

  // Non-admins can only see their own account + support (SettingsNav hides the
  // config tabs). If one lands on a config tab — via a stale URL or the
  // default 'negocio' — bounce them to 'cuenta' once the role is known.
  useEffect(() => {
    if (currentRole && !can.manageBusinessSettings(currentRole) && CONFIG_TABS.includes(tab)) {
      setTab('cuenta');
    }
  }, [currentRole, tab]);

  // Map default client field keys to translated labels
  const DEFAULT_CLIENT_FIELDS: { key: string; label: string }[] = [
    { key: 'first_name', label: tFields.firstName },
    { key: 'last_name', label: tFields.lastName },
    { key: 'company', label: tFields.company },
    { key: 'phone_cell', label: tFields.phoneCell },
    { key: 'phone_office', label: tFields.phoneOffice },
    { key: 'email_office', label: tFields.emailOffice },
    { key: 'email_home', label: tFields.emailHome },
    { key: 'address', label: tFields.addressLine1 },
    { key: 'city', label: tFields.city },
    { key: 'state', label: tFields.state },
    { key: 'zip_code', label: tFields.zipCode },
  ];

  // Labels for every standard client field key (incl. notes, which the legacy
  // DEFAULT_CLIENT_FIELDS list omitted). Drives the grouped settings render.
  const CLIENT_FIELD_LABELS: Record<string, string> = {
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
    notes: tFields.notes,
  };

  const FIELD_TYPES: Record<string, string> = {
    text: t.fieldTypes.text,
    note: t.fieldTypes.note,
    number: t.fieldTypes.number,
    date: t.fieldTypes.date,
    boolean: t.fieldTypes.boolean,
    select: t.fieldTypes.select,
  };

  // Standard invoice fields that can be toggled required. Order = display
  // order; the new/edit invoice form enforces the flags on save.
  const tInvNew = full.dashboard.invoices.new;
  const DEFAULT_INVOICE_FIELDS: { key: string; label: string }[] = [
    { key: 'invoice_number', label: tInvNew.invoiceNumberLabel },
    { key: 'client', label: tInvNew.clientsLabel },
    { key: 'issue_date', label: tInvNew.issueDateLabel },
    { key: 'due_date', label: tInvNew.dueDateLabel },
    { key: 'notes', label: tInvNew.notesLabel },
  ];
  const INVOICE_FIELD_LABELS: Record<string, string> =
    Object.fromEntries(DEFAULT_INVOICE_FIELDS.map(f => [f.key, f.label]));

  const ALL_PIPELINE_STEPS = PIPELINE_STEP_KEYS.map(key => ({
    key,
    label: t.pipelineSteps[key].label,
    description: t.pipelineSteps[key].description,
  }));

  // ── Business info
  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizEmail, setBizEmail] = useState(business?.email ?? '');
  const [bizPhone, setBizPhone] = useState(business?.phone ?? '');
  const [bizWebsite, setBizWebsite] = useState(business?.website ?? '');
  const [bizAddress, setBizAddress] = useState(business?.address ?? '');
  const [bizCity, setBizCity] = useState(business?.city ?? '');
  const [bizState, setBizState] = useState(business?.state ?? '');
  const [bizZip, setBizZip] = useState(business?.postal_code ?? '');
  const [bizTaxId, setBizTaxId] = useState(business?.tax_id ?? '');
  const [bizLicense, setBizLicense] = useState(business?.license_number ?? '');
  const [bizInvoiceNotes, setBizInvoiceNotes] = useState(business?.invoice_notes_default ?? '');
  const [invoiceDueDays, setInvoiceDueDays] = useState(
    business?.invoice_due_days != null ? String(business.invoice_due_days) : '',
  );
  const [invoiceStartNumber, setInvoiceStartNumber] = useState(
    String(business?.invoice_start_number ?? DEFAULT_INVOICE_START_NUMBER),
  );
  const [invoiceTaxRate, setInvoiceTaxRate] = useState(
    business?.invoice_tax_rate ? String(business.invoice_tax_rate) : '',
  );
  const [invoiceEmailSubject, setInvoiceEmailSubject] = useState(business?.invoice_email_subject ?? '');
  const [invoiceEmailBody, setInvoiceEmailBody] = useState(business?.invoice_email_body ?? '');
  // Clickable {{token}} chips insert at the cursor. Selection is tracked via
  // onSelect (fires on focus/click/keyup); null = never focused → append.
  const invoiceEmailSubjectRef = useRef<HTMLInputElement>(null);
  const invoiceEmailBodyRef = useRef<HTMLTextAreaElement>(null);
  const emailSelRef = useRef<{ subject: { s: number; e: number } | null; body: { s: number; e: number } | null }>({ subject: null, body: null });
  const insertEmailToken = (field: 'subject' | 'body', token: string) => {
    const el = field === 'subject' ? invoiceEmailSubjectRef.current : invoiceEmailBodyRef.current;
    const value = field === 'subject' ? invoiceEmailSubject : invoiceEmailBody;
    const set = field === 'subject' ? setInvoiceEmailSubject : setInvoiceEmailBody;
    const sel = emailSelRef.current[field];
    const start = sel ? Math.min(sel.s, value.length) : value.length;
    const end = sel ? Math.min(sel.e, value.length) : value.length;
    set(value.slice(0, start) + token + value.slice(end));
    const pos = start + token.length;
    emailSelRef.current[field] = { s: pos, e: pos };
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState('');
  const [invoiceMsgIsError, setInvoiceMsgIsError] = useState(false);
  // Invoice theme bundle (businesses.invoice_template) — Structured + Freeform
  // saved independently, switched by the Disposición toggle.
  const [invoiceTheme, setInvoiceTheme] = useState<InvoiceThemeBundle>(() =>
    normalizeBundle(business?.invoice_template),
  );

  // ── Invoice required standard fields (draft pattern)
  const [invoiceFieldRequired, setInvoiceFieldRequired] = useState<Record<string, boolean>>(
    business?.invoice_field_required ?? {},
  );
  const [dbInvoiceFieldRequired, setDbInvoiceFieldRequired] = useState<Record<string, boolean>>(
    business?.invoice_field_required ?? {},
  );
  const [localInvoiceOrder, setLocalInvoiceOrder] = useState<string[]>(
    Array.isArray(business?.invoice_field_order) ? (business!.invoice_field_order as string[]) : []
  );
  const [dbInvoiceOrder, setDbInvoiceOrder] = useState<string[]>(
    Array.isArray(business?.invoice_field_order) ? (business!.invoice_field_order as string[]) : []
  );
  const [savingInvoiceReq, setSavingInvoiceReq] = useState(false);
  const [invoiceReqMsg, setInvoiceReqMsg] = useState('');
  const [invoiceReqMsgIsError, setInvoiceReqMsgIsError] = useState(false);
  const [localInvoiceLayout, setLocalInvoiceLayout] = useState<InvoiceFieldEntry[]>(
    Array.isArray(business?.invoice_field_layout) ? (business!.invoice_field_layout as InvoiceFieldEntry[]) : []
  );
  const [dbInvoiceLayout, setDbInvoiceLayout] = useState<InvoiceFieldEntry[]>(
    Array.isArray(business?.invoice_field_layout) ? (business!.invoice_field_layout as InvoiceFieldEntry[]) : []
  );
  const [invoiceHidden, setInvoiceHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.invoice_field_hidden));
  const [dbInvoiceHidden, setDbInvoiceHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.invoice_field_hidden));

  // ── Custom field templates (invoices) — same shape, separate table.
  const [invoiceTemplates, setInvoiceTemplates] = useState<FieldTemplate[]>([]);
  const [dbInvoiceTemplates, setDbInvoiceTemplates] = useState<FieldTemplate[]>([]);
  const [addInvoiceFieldModal, setAddInvoiceFieldModal] = useState(false);
  const [editInvoiceFieldModal, setEditInvoiceFieldModal] = useState(false);
  const [editingInvoiceTpl, setEditingInvoiceTpl] = useState<FieldTemplate | null>(null);
  const [invoiceTplForm, setInvoiceTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
  const [savingInvoiceTpl, setSavingInvoiceTpl] = useState(false);
  const [invoiceTplError, setInvoiceTplError] = useState('');
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(
    normalizeOperatingHours(business?.operating_hours) ?? DEFAULT_OPERATING_HOURS,
  );
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState('');
  const [bizMsgIsError, setBizMsgIsError] = useState(false);

  // ── Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwMsgIsError, setPwMsgIsError] = useState(false);

  // ── Profile name (first/last) — lives in public.profiles, editable here.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [nameMsgIsError, setNameMsgIsError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
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

  const saveName = async () => {
    if (!user) return;
    setSavingName(true); setNameMsg('');
    const { error } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', user.id);
    setNameMsgIsError(!!error);
    setNameMsg(error ? t.account.nameSaveError : t.account.nameSaveSuccess);
    setSavingName(false);
  };

  // ── Client field preferences (draft-until-save)
  // `fieldRequired` / `templates` / `localClientOrder` are the working copy
  // the form mutates. `db*` mirrors the last DB snapshot so we can diff on
  // Save and tell whether the form is dirty.
  const [fieldRequired, setFieldRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {}
  );
  const [dbFieldRequired, setDbFieldRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {}
  );
  const [localClientOrder, setLocalClientOrder] = useState<string[]>(
    Array.isArray(business?.client_field_order) ? (business!.client_field_order as string[]) : []
  );
  const [dbClientOrder, setDbClientOrder] = useState<string[]>(
    Array.isArray(business?.client_field_order) ? (business!.client_field_order as string[]) : []
  );
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsMsg, setFieldsMsg] = useState('');
  const [fieldsMsgIsError, setFieldsMsgIsError] = useState(false);
  // Grouped layout (section + within-section order) + per-field show/hide.
  const [localClientLayout, setLocalClientLayout] = useState<ClientFieldEntry[]>(
    Array.isArray(business?.client_field_layout) ? (business!.client_field_layout as ClientFieldEntry[]) : []
  );
  const [dbClientLayout, setDbClientLayout] = useState<ClientFieldEntry[]>(
    Array.isArray(business?.client_field_layout) ? (business!.client_field_layout as ClientFieldEntry[]) : []
  );
  // Per-field show/hide (eye toggle). Part of the clients draft — flipping it
  // only edits local state; persisted by the "Save preferences" button.
  const [clientHidden, setClientHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.client_field_hidden));
  const [dbClientHidden, setDbClientHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.client_field_hidden));

  // ── Contacts summary — clients + client_contacts (what syncs to Google).
  // Employees do NOT mirror to Google, so they're excluded from the count.
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [contactsCount, setContactsCount] = useState<number | null>(null);

  // ── Custom field templates (clients) — `templates` is the working copy,
  // `dbTemplates` is the last DB snapshot. Save() diffs the two via diffById.
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [dbTemplates, setDbTemplates] = useState<FieldTemplate[]>([]);
  const [addFieldModal, setAddFieldModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<FieldTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  // ── Custom field templates (employees) — same draft pattern as clients.
  const [empTemplates, setEmpTemplates] = useState<FieldTemplate[]>([]);
  const [dbEmpTemplates, setDbEmpTemplates] = useState<FieldTemplate[]>([]);
  const [addEmpFieldModal, setAddEmpFieldModal] = useState(false);
  const [editEmpFieldModal, setEditEmpFieldModal] = useState(false);
  const [editingEmpTpl, setEditingEmpTpl] = useState<FieldTemplate | null>(null);
  const [empTplForm, setEmpTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
  const [savingEmpTpl, setSavingEmpTpl] = useState(false);
  const [empTplError, setEmpTplError] = useState('');

  // ── Job pipeline config (draft pattern)
  const [pipelineDisabled, setPipelineDisabled] = useState<Record<string, boolean>>(
    business?.job_pipeline_disabled ?? {}
  );
  const [dbPipelineDisabled, setDbPipelineDisabled] = useState<Record<string, boolean>>(
    business?.job_pipeline_disabled ?? {}
  );
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState('');
  const [pipelineMsgIsError, setPipelineMsgIsError] = useState(false);

  // ── Upcoming-job alert thresholds (draft pattern)
  // Tier list lives on businesses.job_alert_thresholds (migration 046);
  // the matching logic + render lives in shared/lib/jobAlerts.ts.
  const [jobAlerts, setJobAlerts] = useState<JobAlertThresholds>(
    normalizeJobAlertThresholds(business?.job_alert_thresholds),
  );
  const [dbJobAlerts, setDbJobAlerts] = useState<JobAlertThresholds>(
    normalizeJobAlertThresholds(business?.job_alert_thresholds),
  );
  const [savingJobAlerts, setSavingJobAlerts] = useState(false);
  const [jobAlertsMsg, setJobAlertsMsg] = useState('');
  const [jobAlertsMsgIsError, setJobAlertsMsgIsError] = useState(false);

  useEffect(() => {
    if (business) {
      setBizName(business.name);
      setBizEmail(business.email ?? '');
      setBizPhone(business.phone ?? '');
      setBizWebsite(business.website ?? '');
      setBizAddress(business.address ?? '');
      setBizCity(business.city ?? '');
      setBizState(business.state ?? '');
      setBizZip(business.postal_code ?? '');
      setBizTaxId(business.tax_id ?? '');
      setBizLicense(business.license_number ?? '');
      setBizInvoiceNotes(business.invoice_notes_default ?? '');
      setInvoiceDueDays(business.invoice_due_days != null ? String(business.invoice_due_days) : '');
      setInvoiceStartNumber(String(business.invoice_start_number ?? DEFAULT_INVOICE_START_NUMBER));
      setInvoiceTaxRate(business.invoice_tax_rate ? String(business.invoice_tax_rate) : '');
      setInvoiceEmailSubject(business.invoice_email_subject ?? '');
      setInvoiceEmailBody(business.invoice_email_body ?? '');
      setInvoiceTheme(normalizeBundle(business.invoice_template));
      const ireq = business.invoice_field_required ?? {};
      setInvoiceFieldRequired(ireq);
      setDbInvoiceFieldRequired(ireq);
      const iord = Array.isArray(business.invoice_field_order) ? (business.invoice_field_order as string[]) : [];
      setLocalInvoiceOrder(iord);
      setDbInvoiceOrder(iord);
      const iLay = Array.isArray(business.invoice_field_layout) ? (business.invoice_field_layout as InvoiceFieldEntry[]) : [];
      setLocalInvoiceLayout(iLay);
      setDbInvoiceLayout(iLay);
      {
        const iHidden = parseHiddenFields(business.invoice_field_hidden);
        setInvoiceHidden(iHidden);
        setDbInvoiceHidden(iHidden);
      }
      setOperatingHours(normalizeOperatingHours(business.operating_hours) ?? DEFAULT_OPERATING_HOURS);
      const cReq = business.client_field_required ?? {};
      setFieldRequired(cReq);
      setDbFieldRequired(cReq);
      const cOrder = Array.isArray(business.client_field_order) ? (business.client_field_order as string[]) : [];
      setLocalClientOrder(cOrder);
      setDbClientOrder(cOrder);
      const cLay = Array.isArray(business.client_field_layout) ? (business.client_field_layout as ClientFieldEntry[]) : [];
      setLocalClientLayout(cLay);
      setDbClientLayout(cLay);
      const cHidden = parseHiddenFields(business.client_field_hidden);
      setClientHidden(cHidden);
      setDbClientHidden(cHidden);
      const pd = business.job_pipeline_disabled ?? {};
      setPipelineDisabled(pd);
      setDbPipelineDisabled(pd);
      const ja = normalizeJobAlertThresholds(business.job_alert_thresholds);
      setJobAlerts(ja);
      setDbJobAlerts(ja);
    }
  }, [business]);

  // (loadTemplates effect moved below loadTemplates' useCallback declaration
  // to avoid the "used before declaration" error.)

  useEffect(() => {
    if (!business) return;
    void (async () => {
      const [clientsRes, contactsRes] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
        supabase.from('client_contacts').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
      ]);
      setClientsCount(clientsRes.count ?? 0);
      setContactsCount(contactsRes.count ?? 0);
    })();
  }, [business]);

  // ── Business
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoViewerOpen, setLogoViewerOpen] = useState(false);
  // Viewer backdrop: dark by default; toggle to white so dark logos are visible.
  const [logoViewerLight, setLogoViewerLight] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Import hub ────────────────────────────────────────────────────────────
  // Every step opens its wizard IN PLACE — the user never leaves the hub
  // while migrating. Configs load when the tab opens.
  const [hubImport, setHubImport] = useState<null | 'clients' | 'jobs' | 'employees' | 'invoices' | 'photos' | 'payroll' | 'equipment' | 'inventory'>(null);
  const [hubJobTemplates, setHubJobTemplates] = useState<{ field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[]>([]);
  const [hubEmpTemplates, setHubEmpTemplates] = useState<{ field_key: string; field_label: string; field_type?: string; field_options?: string[] | null }[]>([]);
  const [hubClientTemplates, setHubClientTemplates] = useState<{ field_key: string; field_label: string }[]>([]);
  const [hubAccessRoles, setHubAccessRoles] = useState<{ key: string; name: string | null }[]>([]);
  useEffect(() => {
    if (tab !== 'importar' || !business) return;
    supabase.from('job_field_templates').select('field_key, field_label, field_type, field_options').eq('business_id', business.id).order('sort_order')
      .then(({ data }: { data: typeof hubJobTemplates | null }) => setHubJobTemplates(data ?? []));
    supabase.from('employee_field_templates').select('field_key, field_label, field_type, field_options').eq('business_id', business.id).order('sort_order')
      .then(({ data }: { data: typeof hubEmpTemplates | null }) => setHubEmpTemplates(data ?? []));
    supabase.from('client_field_templates').select('field_key, field_label').eq('business_id', business.id).order('sort_order')
      .then(({ data }: { data: typeof hubClientTemplates | null }) => setHubClientTemplates(data ?? []));
    supabase.from('business_roles').select('key, name').eq('business_id', business.id)
      .then(({ data }: { data: typeof hubAccessRoles | null }) => setHubAccessRoles(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, business?.id]);

  // Logo upload is immediate (pick → upload → persist → refetch), separate
  // from the form's Save button — same bucket path as onboarding.
  const onPickLogo = async (file: File | null) => {
    if (!file || !business) return;
    if (file.size > 2 * 1024 * 1024) {
      setBizMsgIsError(true);
      setBizMsg(t.business.logoSizeError);
      return;
    }
    setUploadingLogo(true);
    setBizMsg('');
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `logos/${business.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('business-assets')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('business-assets').getPublicUrl(path);
      const { error: updErr } = await supabase.from('businesses').update({ logo_url: data.publicUrl }).eq('id', business.id);
      if (updErr) throw updErr;
      await refetchBusiness();
    } catch {
      setBizMsgIsError(true);
      setBizMsg(t.business.logoError);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Remove the logo: delete the storage object (best-effort) then clear logo_url.
  const onRemoveLogo = async () => {
    if (!business?.logo_url) return;
    if (!window.confirm(t.business.logoRemoveConfirm)) return;
    setUploadingLogo(true);
    setBizMsg('');
    try {
      const path = pathFromPublicUrl(business.logo_url);
      if (path) {
        await supabase.storage.from(PUBLIC_ASSETS_BUCKET).remove([path]);
      }
      const { error: updErr } = await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id);
      if (updErr) throw updErr;
      await refetchBusiness();
    } catch {
      setBizMsgIsError(true);
      setBizMsg(t.business.logoError);
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveBusiness = async () => {
    if (!business) return;
    // Validate the (optional) email before saving — a typo here means the
    // invoices/estimates we send from this address bounce.
    if (bizEmail.trim() && !isValidEmail(bizEmail)) {
      setBizMsgIsError(true);
      setBizMsg(full.common.validation.invalidEmail);
      return;
    }
    setSavingBiz(true); setBizMsg('');
    const { error } = await supabase.from('businesses').update({
      name: bizName,
      email: bizEmail.trim() || null,
      phone: bizPhone.trim() || null,
      website: bizWebsite.trim() || null,
      address: bizAddress.trim() || null,
      city: bizCity.trim() || null,
      state: bizState || null,
      postal_code: bizZip.trim() || null,
      tax_id: bizTaxId.trim() || null,
      license_number: bizLicense.trim() || null,
      operating_hours: operatingHours,
    }).eq('id', business.id);
    setBizMsgIsError(!!error);
    setBizMsg(error ? t.business.saveError : t.business.saveSuccess);
    if (!error) {
      void logAudit(supabase, business.id, 'business.updated', 'business', business.id, { name: bizName });
      await refetchBusiness();
    }
    setSavingBiz(false);
  };

  // ── Invoices (default due window + terms). Notes moved here from Negocio.
  const saveInvoiceSettings = async () => {
    if (!business) return;
    const trimmed = invoiceDueDays.trim();
    const days = trimmed === '' ? null : Number(trimmed);
    if (days != null && (!Number.isInteger(days) || days < 0)) {
      setInvoiceMsgIsError(true);
      setInvoiceMsg(t.invoices.saveError);
      return;
    }
    const startTrim = invoiceStartNumber.trim();
    const startNum = startTrim === '' ? DEFAULT_INVOICE_START_NUMBER : Number(startTrim);
    if (!Number.isInteger(startNum) || startNum < 1) {
      setInvoiceMsgIsError(true);
      setInvoiceMsg(t.invoices.saveError);
      return;
    }
    // Default tax %: 0–100, up to 2 decimals; blank = no tax.
    const taxNum = invoiceTaxRate.trim() === '' ? 0 : Number(invoiceTaxRate);
    if (!Number.isFinite(taxNum) || taxNum < 0 || taxNum > 100) {
      setInvoiceMsgIsError(true);
      setInvoiceMsg(t.invoices.saveError);
      return;
    }
    setSavingInvoice(true); setInvoiceMsg('');
    const { error } = await supabase.from('businesses').update({
      invoice_due_days: days,
      invoice_start_number: startNum,
      invoice_notes_default: bizInvoiceNotes.trim() || null,
      invoice_tax_rate: Math.round(taxNum * 100) / 100,
      invoice_email_subject: invoiceEmailSubject.trim() || null,
      invoice_email_body: invoiceEmailBody.trim() || null,
    }).eq('id', business.id);
    setInvoiceMsgIsError(!!error);
    setInvoiceMsg(error ? t.invoices.saveError : t.invoices.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingInvoice(false);
  };

  // ── Invoice theme (businesses.invoice_template) — its own tab + save.
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeMsg, setThemeMsg] = useState('');
  const [themeMsgIsError, setThemeMsgIsError] = useState(false);
  const saveInvoiceTheme = async () => {
    if (!business) return;
    setSavingTheme(true); setThemeMsg('');
    const { error } = await supabase.from('businesses')
      .update({ invoice_template: invoiceTheme }).eq('id', business.id);
    setThemeMsgIsError(!!error);
    setThemeMsg(error ? t.invoices.saveError : t.invoices.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingTheme(false);
  };

  // ── Invoice required standard fields
  const toggleInvoiceFieldRequired = (key: string) => {
    setInvoiceFieldRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setInvoiceReqMsg('');
  };

  // ── Grouped invoice layout (mirrors jobs/clients/employees) ──
  const allInvoiceKeys = useMemo(
    () => [...INVOICE_STANDARD_KEYS, ...invoiceTemplates.map(tpl => `custom:${tpl.id}`)],
    [invoiceTemplates],
  );
  const invoiceDisplayLayout = useMemo(
    () => parseInvoiceLayout(localInvoiceLayout, allInvoiceKeys),
    [localInvoiceLayout, allInvoiceKeys],
  );
  const moveInvoiceFieldInSection = (key: string, dir: 'up' | 'down') => {
    const layout = [...invoiceDisplayLayout];
    const idx = layout.findIndex(e => e.key === key);
    if (idx < 0) return;
    const section = layout[idx].section;
    let swap = -1;
    if (dir === 'up') { for (let i = idx - 1; i >= 0; i--) if (layout[i].section === section) { swap = i; break; } }
    else { for (let i = idx + 1; i < layout.length; i++) if (layout[i].section === section) { swap = i; break; } }
    if (swap < 0) return;
    [layout[idx], layout[swap]] = [layout[swap], layout[idx]];
    setLocalInvoiceLayout(layout); setInvoiceReqMsg('');
  };
  const moveInvoiceFieldToSection = (key: string, section: InvoiceFieldSection) => {
    const layout = invoiceDisplayLayout.filter(e => e.key !== key);
    let insertAt = -1;
    for (let i = layout.length - 1; i >= 0; i--) if (layout[i].section === section) { insertAt = i + 1; break; }
    if (insertAt < 0) {
      const tIdx = INVOICE_FIELD_SECTIONS.indexOf(section);
      insertAt = layout.findIndex(e => INVOICE_FIELD_SECTIONS.indexOf(e.section) > tIdx);
      if (insertAt < 0) insertAt = layout.length;
    }
    layout.splice(insertAt, 0, { key, section });
    setLocalInvoiceLayout(layout); setInvoiceReqMsg('');
  };
  const reorderInvoiceSection = (section: InvoiceFieldSection, nextKeys: string[]) => {
    let p = 0;
    const layout = invoiceDisplayLayout.map(e =>
      e.section === section ? { key: nextKeys[p++], section } : e,
    );
    setLocalInvoiceLayout(layout); setInvoiceReqMsg('');
  };
  const toggleInvoiceFieldHidden = (key: string) => {
    setInvoiceHidden(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
    setInvoiceReqMsg('');
  };

  // Draft save: diff templates, then write required + order on the business
  // row. Mirrors saveFieldPreferences (clients) / saveEmpRequired (employees).
  const saveInvoiceRequired = async () => {
    if (!business) return;
    setSavingInvoiceReq(true); setInvoiceReqMsg('');
    try {
      const ops = diffById(dbInvoiceTemplates, invoiceTemplates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbInvoiceTemplates.length + i,
          field_config: tpl.field_config ?? {},
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

      const resolvedOrder = localInvoiceOrder
        .map(key => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const resolvedInvoiceLayout: InvoiceFieldEntry[] = invoiceDisplayLayout
        .map(e => {
          if (e.key.startsWith('custom:') && isTempId(e.key.slice('custom:'.length))) {
            const realId = tempToReal[e.key.slice('custom:'.length)];
            return realId ? { key: `custom:${realId}`, section: e.section } : null;
          }
          return e;
        })
        .filter((e): e is InvoiceFieldEntry => e !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        invoice_field_required: invoiceFieldRequired,
        invoice_field_order: resolvedOrder,
        invoice_field_layout: resolvedInvoiceLayout,
        invoice_field_hidden: invoiceHidden,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadInvoiceTemplates();
      setLocalInvoiceOrder(resolvedOrder);
      setDbInvoiceOrder(resolvedOrder);
      setLocalInvoiceLayout(resolvedInvoiceLayout);
      setDbInvoiceLayout(resolvedInvoiceLayout);
      setDbInvoiceFieldRequired(invoiceFieldRequired);
      setDbInvoiceHidden(invoiceHidden);

      setInvoiceReqMsgIsError(false);
      setInvoiceReqMsg(t.requiredFields.saveSuccess);
    } catch {
      setInvoiceReqMsgIsError(true);
      setInvoiceReqMsg(t.requiredFields.saveError);
    }
    setSavingInvoiceReq(false);
  };

  // ── Password
  const savePassword = async () => {
    if (!currentPw) {
      setPwMsgIsError(true);
      setPwMsg(t.password.errorCurrentRequired);
      return;
    }
    if (!newPw || newPw.length < 8) {
      setPwMsgIsError(true);
      setPwMsg(t.password.errorMinLength);
      return;
    }
    setSavingPw(true); setPwMsg('');
    // Re-authenticate with the current password first — updateUser() alone
    // doesn't verify the old password.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPw,
    });
    if (verifyError) {
      setPwMsgIsError(true);
      setPwMsg(t.password.errorCurrentWrong);
      setSavingPw(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwMsgIsError(!!error);
    setPwMsg(error ? t.password.errorPrefix.replace('{{message}}', error.message) : t.password.successMsg);
    if (!error) { setCurrentPw(''); setNewPw(''); }
    setSavingPw(false);
  };

  // ── Client field preferences (draft pattern)
  // Mutations only touch local state; saveFieldPreferences diffs against the
  // DB snapshots and persists everything in one batch.
  const toggleFieldRequired = (key: string) => {
    setFieldRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setFieldsMsg('');
  };

  // ── Grouped client layout (mirrors the jobs model) ──
  const allClientKeys = useMemo(
    () => [...CLIENT_STANDARD_KEYS, ...templates.map(tpl => `custom:${tpl.id}`)],
    [templates],
  );
  const clientDisplayLayout = useMemo(
    () => parseClientLayout(localClientLayout, allClientKeys),
    [localClientLayout, allClientKeys],
  );
  const moveClientFieldInSection = (key: string, dir: 'up' | 'down') => {
    const layout = [...clientDisplayLayout];
    const idx = layout.findIndex(e => e.key === key);
    if (idx < 0) return;
    const section = layout[idx].section;
    let swap = -1;
    if (dir === 'up') { for (let i = idx - 1; i >= 0; i--) if (layout[i].section === section) { swap = i; break; } }
    else { for (let i = idx + 1; i < layout.length; i++) if (layout[i].section === section) { swap = i; break; } }
    if (swap < 0) return;
    [layout[idx], layout[swap]] = [layout[swap], layout[idx]];
    setLocalClientLayout(layout); setFieldsMsg('');
  };
  const moveClientFieldToSection = (key: string, section: ClientFieldSection) => {
    const layout = clientDisplayLayout.filter(e => e.key !== key);
    let insertAt = -1;
    for (let i = layout.length - 1; i >= 0; i--) if (layout[i].section === section) { insertAt = i + 1; break; }
    if (insertAt < 0) {
      const tIdx = CLIENT_FIELD_SECTIONS.indexOf(section);
      insertAt = layout.findIndex(e => CLIENT_FIELD_SECTIONS.indexOf(e.section) > tIdx);
      if (insertAt < 0) insertAt = layout.length;
    }
    layout.splice(insertAt, 0, { key, section });
    setLocalClientLayout(layout); setFieldsMsg('');
  };
  const reorderClientSection = (section: ClientFieldSection, nextKeys: string[]) => {
    let p = 0;
    const layout = clientDisplayLayout.map(e =>
      e.section === section ? { key: nextKeys[p++], section } : e,
    );
    setLocalClientLayout(layout); setFieldsMsg('');
  };
  const toggleClientFieldHidden = (key: string) => {
    setClientHidden(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
    setFieldsMsg('');
  };

  const saveFieldPreferences = async () => {
    if (!business) return;
    setSavingFields(true); setFieldsMsg('');
    try {
      // ── 1. Template CRUD (insert / update / delete) ──
      const ops = diffById(dbTemplates, templates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => {
          // Strip the temp id; let Postgres assign one. sort_order is
          // overwritten by client_field_order anyway, but we set it for
          // legacy callers.
          return {
            business_id: business.id,
            field_key: tpl.field_key,
            field_label: tpl.field_label,
            field_type: tpl.field_type,
            field_options: tpl.field_options,
            required: tpl.required,
            sort_order: dbTemplates.length + i,
            field_config: tpl.field_config ?? {},
          };
        });
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
        const { error } = await supabase.from('client_field_templates')
          .update(rest).eq('id', id);
        if (error) throw error;
      }

      if (ops.deletes.length > 0) {
        const { error } = await supabase.from('client_field_templates')
          .delete().in('id', ops.deletes);
        if (error) throw error;
      }

      // ── 2. Translate temp ids in the order array to their new real ids ──
      const resolvedOrder = localClientOrder
        .map(key => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      // Resolve any temp custom-field ids in the layout to their real ids.
      const resolvedClientLayout: ClientFieldEntry[] = clientDisplayLayout
        .map(e => {
          if (e.key.startsWith('custom:') && isTempId(e.key.slice('custom:'.length))) {
            const realId = tempToReal[e.key.slice('custom:'.length)];
            return realId ? { key: `custom:${realId}`, section: e.section } : null;
          }
          return e;
        })
        .filter((e): e is ClientFieldEntry => e !== null);

      // ── 3. Persist required-flags + order + layout + hidden on the business row ──
      const { error: bizErr } = await supabase.from('businesses').update({
        client_field_required: fieldRequired,
        client_field_order: resolvedOrder,
        client_field_layout: resolvedClientLayout,
        client_field_hidden: clientHidden,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadTemplates();
      setLocalClientOrder(resolvedOrder);
      setDbClientOrder(resolvedOrder);
      setLocalClientLayout(resolvedClientLayout);
      setDbClientLayout(resolvedClientLayout);
      setDbFieldRequired(fieldRequired);
      setDbClientHidden(clientHidden);

      setFieldsMsgIsError(false);
      setFieldsMsg(t.requiredFields.saveSuccess);
    } catch {
      setFieldsMsgIsError(true);
      setFieldsMsg(t.requiredFields.saveError);
    }
    setSavingFields(false);
  };

  // ── Unified field list (standard + custom interleaved) ────────────────
  // `client_field_order` is a single JSONB array of identifiers. Each entry
  // is either a standard field key ("phone_cell") or a custom-template ref
  // ("custom:<uuid>"). Lets users put custom fields above/below default ones.
  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const clientItems: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_CLIENT_FIELDS.map(f => ({
      kind: 'standard', key: f.key, label: f.label,
    }));
    const customItems: UnifiedItem[] = templates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    if (localClientOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localClientOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, localClientOrder, full]);

  // ── Dirty tracking for the Clientes tab (templates + required + order) ──
  const clientsDirty = useMemo(
    () =>
      isDirty(dbTemplates, templates) ||
      JSON.stringify(dbFieldRequired) !== JSON.stringify(fieldRequired) ||
      JSON.stringify(dbClientOrder) !== JSON.stringify(localClientOrder) ||
      JSON.stringify(dbClientLayout) !== JSON.stringify(localClientLayout) ||
      JSON.stringify(dbClientHidden) !== JSON.stringify(clientHidden),
    [dbTemplates, templates, dbFieldRequired, fieldRequired, dbClientOrder, localClientOrder, dbClientLayout, localClientLayout, dbClientHidden, clientHidden],
  );

  // Reset every Clientes-tab working copy back to the last DB snapshot.
  const discardClients = useCallback(() => {
    setTemplates(dbTemplates);
    setFieldRequired(dbFieldRequired);
    setLocalClientOrder(dbClientOrder);
    setLocalClientLayout(dbClientLayout);
    setClientHidden(dbClientHidden);
    setFieldsMsg('');
  }, [dbTemplates, dbFieldRequired, dbClientOrder, dbClientLayout, dbClientHidden]);

  // tryChangeTab, anyDirty, and the beforeunload guard live near the bottom
  // of the component so they can reference every tab's dirty flag.

  // ── Employee field config (same shape as clients) ────────────────────
  const tEmpModal = full.dashboard.employees.modal;
  const EMP_FIELD_LABELS: Record<string, string> = {
    first_name: tEmpModal.firstNameLabel.replace(' *', ''),
    last_name: tEmpModal.lastNameLabel,
    check_name: tEmpModal.checkNameLabel,
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

  const [empRequired, setEmpRequired] = useState<Record<string, boolean>>(
    business?.employee_field_required ?? {}
  );
  const [dbEmpRequired, setDbEmpRequired] = useState<Record<string, boolean>>(
    business?.employee_field_required ?? {}
  );
  const [localEmpOrder, setLocalEmpOrder] = useState<string[]>(
    Array.isArray(business?.employee_field_order) ? (business!.employee_field_order as string[]) : []
  );
  const [dbEmpOrder, setDbEmpOrder] = useState<string[]>(
    Array.isArray(business?.employee_field_order) ? (business!.employee_field_order as string[]) : []
  );
  const [savingEmpRequired, setSavingEmpRequired] = useState(false);
  const [empReqMsg, setEmpReqMsg] = useState('');
  const [empReqMsgIsError, setEmpReqMsgIsError] = useState(false);
  const [localEmpLayout, setLocalEmpLayout] = useState<EmployeeFieldEntry[]>(
    Array.isArray(business?.employee_field_layout) ? (business!.employee_field_layout as EmployeeFieldEntry[]) : []
  );
  const [dbEmpLayout, setDbEmpLayout] = useState<EmployeeFieldEntry[]>(
    Array.isArray(business?.employee_field_layout) ? (business!.employee_field_layout as EmployeeFieldEntry[]) : []
  );
  const [empHidden, setEmpHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.employee_field_hidden));
  const [dbEmpHidden, setDbEmpHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.employee_field_hidden));

  useEffect(() => {
    if (business) {
      const r = business.employee_field_required ?? {};
      setEmpRequired(r);
      setDbEmpRequired(r);
      const o = Array.isArray(business.employee_field_order) ? (business.employee_field_order as string[]) : [];
      setLocalEmpOrder(o);
      setDbEmpOrder(o);
      const lay = Array.isArray(business.employee_field_layout) ? (business.employee_field_layout as EmployeeFieldEntry[]) : [];
      setLocalEmpLayout(lay);
      setDbEmpLayout(lay);
      {
        const eHidden = parseHiddenFields(business.employee_field_hidden);
        setEmpHidden(eHidden);
        setDbEmpHidden(eHidden);
      }
    }
  }, [business]);

  const toggleEmpRequired = (key: string) => {
    setEmpRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setEmpReqMsg('');
  };

  // ── Grouped employee layout (mirrors jobs/clients) ──
  const allEmpKeys = useMemo(
    () => [...EMPLOYEE_STANDARD_KEYS, ...empTemplates.map(tpl => `custom:${tpl.id}`)],
    [empTemplates],
  );
  const empDisplayLayout = useMemo(
    () => parseEmployeeLayout(localEmpLayout, allEmpKeys),
    [localEmpLayout, allEmpKeys],
  );
  const moveEmpFieldInSection = (key: string, dir: 'up' | 'down') => {
    const layout = [...empDisplayLayout];
    const idx = layout.findIndex(e => e.key === key);
    if (idx < 0) return;
    const section = layout[idx].section;
    let swap = -1;
    if (dir === 'up') { for (let i = idx - 1; i >= 0; i--) if (layout[i].section === section) { swap = i; break; } }
    else { for (let i = idx + 1; i < layout.length; i++) if (layout[i].section === section) { swap = i; break; } }
    if (swap < 0) return;
    [layout[idx], layout[swap]] = [layout[swap], layout[idx]];
    setLocalEmpLayout(layout); setEmpReqMsg('');
  };
  const moveEmpFieldToSection = (key: string, section: EmployeeFieldSection) => {
    const layout = empDisplayLayout.filter(e => e.key !== key);
    let insertAt = -1;
    for (let i = layout.length - 1; i >= 0; i--) if (layout[i].section === section) { insertAt = i + 1; break; }
    if (insertAt < 0) {
      const tIdx = EMPLOYEE_FIELD_SECTIONS.indexOf(section);
      insertAt = layout.findIndex(e => EMPLOYEE_FIELD_SECTIONS.indexOf(e.section) > tIdx);
      if (insertAt < 0) insertAt = layout.length;
    }
    layout.splice(insertAt, 0, { key, section });
    setLocalEmpLayout(layout); setEmpReqMsg('');
  };
  const reorderEmpSection = (section: EmployeeFieldSection, nextKeys: string[]) => {
    let p = 0;
    const layout = empDisplayLayout.map(e =>
      e.section === section ? { key: nextKeys[p++], section } : e,
    );
    setLocalEmpLayout(layout); setEmpReqMsg('');
  };
  const toggleEmpFieldHidden = (key: string) => {
    setEmpHidden(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
    setEmpReqMsg('');
  };

  // Save flow (draft): diff templates + persist required-flags + order on
  // the business row. Mirrors saveFieldPreferences (clients).
  const saveEmpRequired = async () => {
    if (!business) return;
    setSavingEmpRequired(true); setEmpReqMsg('');
    try {
      const ops = diffById(dbEmpTemplates, empTemplates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbEmpTemplates.length + i,
          field_config: tpl.field_config ?? {},
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

      const resolvedOrder = localEmpOrder
        .map(key => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      const resolvedEmpLayout: EmployeeFieldEntry[] = empDisplayLayout
        .map(e => {
          if (e.key.startsWith('custom:') && isTempId(e.key.slice('custom:'.length))) {
            const realId = tempToReal[e.key.slice('custom:'.length)];
            return realId ? { key: `custom:${realId}`, section: e.section } : null;
          }
          return e;
        })
        .filter((e): e is EmployeeFieldEntry => e !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        employee_field_required: empRequired,
        employee_field_order: resolvedOrder,
        employee_field_layout: resolvedEmpLayout,
        employee_field_hidden: empHidden,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadEmpTemplates();
      setLocalEmpOrder(resolvedOrder);
      setDbEmpOrder(resolvedOrder);
      setLocalEmpLayout(resolvedEmpLayout);
      setDbEmpLayout(resolvedEmpLayout);
      setDbEmpRequired(empRequired);
      setDbEmpHidden(empHidden);

      setEmpReqMsgIsError(false);
      setEmpReqMsg(t.requiredFields.saveSuccess);
    } catch {
      setEmpReqMsgIsError(true);
      setEmpReqMsg(t.requiredFields.saveError);
    }
    setSavingEmpRequired(false);
  };

  const empItems: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_EMPLOYEE_FIELD_KEYS.map((k) => ({
      kind: 'standard', key: k, label: EMP_FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = empTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    if (localEmpOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localEmpOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empTemplates, localEmpOrder, full]);

  const moveEmpItem = (key: string, direction: 'up' | 'down') => {
    const idx = empItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= empItems.length) return;
    const next = [...empItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalEmpOrder(next.map(i => i.key));
    setEmpReqMsg('');
  };

  const onEmpDragReorder = (next: { id: string }[]) => {
    setLocalEmpOrder(next.map(i => i.id));
    setEmpReqMsg('');
  };

  // Dirty flag for the Empleados tab.
  const employeesDirty = useMemo(
    () =>
      isDirty(dbEmpTemplates, empTemplates) ||
      JSON.stringify(dbEmpRequired) !== JSON.stringify(empRequired) ||
      JSON.stringify(dbEmpOrder) !== JSON.stringify(localEmpOrder) ||
      JSON.stringify(dbEmpLayout) !== JSON.stringify(localEmpLayout) ||
      JSON.stringify(dbEmpHidden) !== JSON.stringify(empHidden),
    [dbEmpTemplates, empTemplates, dbEmpRequired, empRequired, dbEmpOrder, localEmpOrder, dbEmpLayout, localEmpLayout, dbEmpHidden, empHidden],
  );

  const discardEmployees = useCallback(() => {
    setEmpTemplates(dbEmpTemplates);
    setEmpRequired(dbEmpRequired);
    setLocalEmpOrder(dbEmpOrder);
    setLocalEmpLayout(dbEmpLayout);
    setEmpHidden(dbEmpHidden);
    setEmpReqMsg('');
  }, [dbEmpTemplates, dbEmpRequired, dbEmpOrder, dbEmpLayout, dbEmpHidden]);

  // ── Job field config (same shape as clients/employees) ────────────────
  const tJobNew = full.dashboard.jobs.new;
  const JOB_FIELD_LABELS: Record<string, string> = {
    client_id: tJobNew.clientLabel,
    priority: tJobNew.priorityLabel,
    description: tJobNew.descriptionLabel,
    job_address: tJobNew.addressLabel,
    job_city: tJobNew.cityLabel,
    job_state: tJobNew.stateLabel,
    coordinates: tJobNew.coordinatesLabel,
    scheduled_date: tJobNew.dateFieldLabel,
    time_start: tJobNew.timeFieldLabel,
    total_hours: tJobNew.totalHoursLabel,
    assigned_workers: tJobNew.workersHeading,
    worker_notes: tJobNew.workerNoteLabel,
    internal_notes: tJobNew.internalNoteLabelJob,
  };

  // Job-field draft state (mirrors clients/employees/invoices).
  const [jobRequired, setJobRequired] = useState<Record<string, boolean>>(
    business?.job_field_required ?? {}
  );
  const [dbJobRequired, setDbJobRequired] = useState<Record<string, boolean>>(
    business?.job_field_required ?? {}
  );
  const [localJobOrder, setLocalJobOrder] = useState<string[]>(
    Array.isArray(business?.job_field_order) ? (business!.job_field_order as string[]) : []
  );
  const [dbJobOrder, setDbJobOrder] = useState<string[]>(
    Array.isArray(business?.job_field_order) ? (business!.job_field_order as string[]) : []
  );
  // Field layout (section + within-section order). Source of truth for the
  // grouped list + the data-driven job form. Saved with the job-fields card.
  const [localJobLayout, setLocalJobLayout] = useState<JobFieldEntry[]>(
    Array.isArray(business?.job_field_layout) ? (business!.job_field_layout as JobFieldEntry[]) : []
  );
  const [dbJobLayout, setDbJobLayout] = useState<JobFieldEntry[]>(
    Array.isArray(business?.job_field_layout) ? (business!.job_field_layout as JobFieldEntry[]) : []
  );
  const [savingJobRequired, setSavingJobRequired] = useState(false);
  const [jobReqMsg, setJobReqMsg] = useState('');
  const [jobReqMsgIsError, setJobReqMsgIsError] = useState(false);
  const [jobTemplates, setJobTemplates] = useState<FieldTemplate[]>([]);
  const [dbJobTemplates, setDbJobTemplates] = useState<FieldTemplate[]>([]);
  const [addJobFieldModal, setAddJobFieldModal] = useState(false);
  const [editJobFieldModal, setEditJobFieldModal] = useState(false);
  const [editingJobTpl, setEditingJobTpl] = useState<FieldTemplate | null>(null);
  const [jobTplForm, setJobTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
  const [savingJobTpl, setSavingJobTpl] = useState(false);
  const [jobTplError, setJobTplError] = useState('');

  useEffect(() => {
    if (business) {
      const r = business.job_field_required ?? {};
      setJobRequired(r);
      setDbJobRequired(r);
      const o = Array.isArray(business.job_field_order) ? (business.job_field_order as string[]) : [];
      setLocalJobOrder(o);
      setDbJobOrder(o);
      const lay = Array.isArray(business.job_field_layout) ? (business.job_field_layout as JobFieldEntry[]) : [];
      setLocalJobLayout(lay);
      setDbJobLayout(lay);
    }
  }, [business]);

  const loadJobTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.from('job_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    const fetched = (data ?? []) as FieldTemplate[];
    setJobTemplates(fetched);
    setDbJobTemplates(fetched);
  }, [business, supabase]);
  useEffect(() => { loadJobTemplates(); }, [loadJobTemplates]);

  // Every selectable field key (standard + current custom templates).
  const allJobKeys = useMemo(
    () => [...DEFAULT_JOB_FIELD_KEYS, ...jobTemplates.map(tpl => `custom:${tpl.id}`)],
    [jobTemplates],
  );
  // The layout to render/save: stored edits cleaned + every key present (custom
  // fields auto-appear in their default group until explicitly moved).
  const displayLayout = useMemo(
    () => parseJobLayout(localJobLayout, allJobKeys),
    [localJobLayout, allJobKeys],
  );

  // Swap a field with its nearest neighbour in the SAME section.
  const moveFieldInSection = (key: string, dir: 'up' | 'down') => {
    const layout = [...displayLayout];
    const idx = layout.findIndex(e => e.key === key);
    if (idx < 0) return;
    const section = layout[idx].section;
    let swap = -1;
    if (dir === 'up') { for (let i = idx - 1; i >= 0; i--) if (layout[i].section === section) { swap = i; break; } }
    else { for (let i = idx + 1; i < layout.length; i++) if (layout[i].section === section) { swap = i; break; } }
    if (swap < 0) return;
    [layout[idx], layout[swap]] = [layout[swap], layout[idx]];
    setLocalJobLayout(layout);
  };

  // Reassign a field to another section, appended to the end of that group.
  const moveFieldToSection = (key: string, section: JobLayoutSection) => {
    const layout = displayLayout.filter(e => e.key !== key);
    let insertAt = -1;
    for (let i = layout.length - 1; i >= 0; i--) if (layout[i].section === section) { insertAt = i + 1; break; }
    if (insertAt < 0) {
      // Empty target section — slot it in at the right section boundary.
      const tIdx = JOB_LAYOUT_SECTIONS.indexOf(section);
      insertAt = layout.findIndex(e => JOB_LAYOUT_SECTIONS.indexOf(e.section) > tIdx);
      if (insertAt < 0) insertAt = layout.length;
    }
    layout.splice(insertAt, 0, { key, section });
    setLocalJobLayout(layout);
  };

  // Drag-reorder a section: nextKeys is that section's keys in their new order.
  // We refill the section's slots in place so other sections stay put — drag is
  // confined within a section (cross-section moves stay on the dropdown).
  const reorderJobSection = (section: JobLayoutSection, nextKeys: string[]) => {
    let p = 0;
    const layout = displayLayout.map(e =>
      e.section === section ? { key: nextKeys[p++], section } : e,
    );
    setLocalJobLayout(layout);
  };

  const toggleJobRequired = (key: string) => {
    setJobRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setJobReqMsg('');
  };

  // Diff-and-save for jobs (templates + required + order).
  const saveJobRequired = async () => {
    if (!business) return;
    setSavingJobRequired(true); setJobReqMsg('');
    try {
      const ops = diffById(dbJobTemplates, jobTemplates);
      const tempToReal: Record<string, string> = {};

      if (ops.inserts.length > 0) {
        const rows = ops.inserts.map((tpl, i) => ({
          business_id: business.id,
          field_key: tpl.field_key,
          field_label: tpl.field_label,
          field_type: tpl.field_type,
          field_options: tpl.field_options,
          required: tpl.required,
          sort_order: dbJobTemplates.length + i,
          field_config: tpl.field_config ?? {},
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

      const resolvedOrder = localJobOrder
        .map(key => {
          if (key.startsWith('custom:') && isTempId(key.slice('custom:'.length))) {
            const tempId = key.slice('custom:'.length);
            const realId = tempToReal[tempId];
            return realId ? `custom:${realId}` : null;
          }
          return key;
        })
        .filter((k): k is string => k !== null);

      // Resolve any temp custom-field ids in the layout to their real ids.
      const resolvedLayout: JobFieldEntry[] = displayLayout
        .map(e => {
          if (e.key.startsWith('custom:') && isTempId(e.key.slice('custom:'.length))) {
            const realId = tempToReal[e.key.slice('custom:'.length)];
            return realId ? { key: `custom:${realId}`, section: e.section } : null;
          }
          return e;
        })
        .filter((e): e is JobFieldEntry => e !== null);

      const { error: bizErr } = await supabase.from('businesses').update({
        job_field_required: jobRequired,
        job_field_order: resolvedOrder,
        job_field_layout: resolvedLayout,
        job_field_hidden: jobHidden,
      }).eq('id', business.id);
      if (bizErr) throw bizErr;

      await refetchBusiness();
      await loadJobTemplates();
      setLocalJobOrder(resolvedOrder);
      setDbJobOrder(resolvedOrder);
      setLocalJobLayout(resolvedLayout);
      setDbJobLayout(resolvedLayout);
      setDbJobRequired(jobRequired);
      setDbJobHidden(jobHidden);

      setJobReqMsgIsError(false);
      setJobReqMsg(t.requiredFields.saveSuccess);
    } catch {
      setJobReqMsgIsError(true);
      setJobReqMsg(t.requiredFields.saveError);
    }
    setSavingJobRequired(false);
  };

  // Job template CRUD — local-only mutations (saved by saveJobRequired).
  const addJobTemplate = () => {
    if (!jobTplForm.field_label.trim()) { setJobTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(jobTplForm.field_label);
    if (jobTemplates.some(tpl => tpl.field_key === key)) { setJobTplError(t.customFields.errorDuplicate); return; }
    const options = jobTplForm.field_type === 'select'
      ? jobTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const newTpl: FieldTemplate = {
      id: newTempId(),
      field_key: key,
      field_label: jobTplForm.field_label.trim(),
      field_type: jobTplForm.field_type,
      field_options: options,
      required: jobTplForm.required,
      sort_order: jobTemplates.length,
      field_config: buildFieldConfig(jobTplForm),
    };
    setJobTemplates(prev => [...prev, newTpl]);
    setLocalJobOrder(prev => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    setJobTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
    setJobTplError(''); setAddJobFieldModal(false);
  };

  const removeJobTemplate = (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    setJobTemplates(prev => prev.filter(tpl => tpl.id !== id));
    setLocalJobOrder(prev => prev.filter(k => k !== `custom:${id}`));
  };

  const openEditJobTemplate = (tpl: FieldTemplate) => {
    setEditingJobTpl(tpl);
    setJobTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
      integer_only: !!parseFieldConfig(tpl.field_config).integerOnly,
      thousands: !!parseFieldConfig(tpl.field_config).thousands,
      multi: !!parseFieldConfig(tpl.field_config).multi,
    });
    setJobTplError('');
    setEditJobFieldModal(true);
  };

  const updateJobTemplate = () => {
    if (!editingJobTpl || !jobTplForm.field_label.trim()) { setJobTplError(t.customFields.errorNameRequired); return; }
    const options = jobTplForm.field_type === 'select'
      ? jobTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    setJobTemplates(prev => prev.map(tpl => tpl.id === editingJobTpl.id ? {
      ...tpl,
      field_label: jobTplForm.field_label.trim(),
      field_type: jobTplForm.field_type,
      field_options: options,
      required: jobTplForm.required,
      field_config: buildFieldConfig(jobTplForm),
    } : tpl));
    setEditJobFieldModal(false); setEditingJobTpl(null);
  };

  const jobItems: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_JOB_FIELD_KEYS.map((k) => ({
      kind: 'standard', key: k, label: JOB_FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = jobTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    if (localJobOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localJobOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobTemplates, localJobOrder, full]);

  const moveJobItem = (key: string, direction: 'up' | 'down') => {
    const idx = jobItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= jobItems.length) return;
    const next = [...jobItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalJobOrder(next.map(i => i.key));
    setJobReqMsg('');
  };

  const onJobDragReorder = (next: { id: string }[]) => {
    setLocalJobOrder(next.map(i => i.id));
    setJobReqMsg('');
  };

  // Per-field show/hide on the job form (eye toggle in the field list). Part of
  // the job-fields draft — flipping it only edits local state; the change is
  // persisted by the shared "Save preferences" button (saveJobRequired).
  const [jobHidden, setJobHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.job_field_hidden));
  const [dbJobHidden, setDbJobHidden] = useState<Record<string, boolean>>(() => parseHiddenFields(business?.job_field_hidden));

  // Dirty flag for the job-fields sub-card (templates + required + order + hidden).
  const jobFieldsDirty = useMemo(
    () =>
      isDirty(dbJobTemplates, jobTemplates) ||
      JSON.stringify(dbJobRequired) !== JSON.stringify(jobRequired) ||
      JSON.stringify(dbJobOrder) !== JSON.stringify(localJobOrder) ||
      JSON.stringify(dbJobLayout) !== JSON.stringify(localJobLayout) ||
      JSON.stringify(dbJobHidden) !== JSON.stringify(jobHidden),
    [dbJobTemplates, jobTemplates, dbJobRequired, jobRequired, dbJobOrder, localJobOrder, dbJobLayout, localJobLayout, dbJobHidden, jobHidden],
  );

  // Crew mode (draft pattern — single boolean, but unified with the rest).
  const [crewMode, setCrewMode] = useState<boolean>(business?.job_crew_mode ?? true);
  const [dbCrewMode, setDbCrewMode] = useState<boolean>(business?.job_crew_mode ?? true);
  const [savingCrewMode, setSavingCrewMode] = useState(false);
  const [crewModeMsg, setCrewModeMsg] = useState('');
  const [crewModeMsgIsError, setCrewModeMsgIsError] = useState(false);

  // Item-type categories (Labor/Material/Equipment/Other) toggle. Saves on flip.
  const [itemTypesOn, setItemTypesOn] = useState<boolean>(business?.job_item_types_enabled !== false);
  const [savingItemTypes, setSavingItemTypes] = useState(false);

  // Auto-privatize on invoice toggle (trigger in migration 117). Saves on flip.
  const [privateOnInvoice, setPrivateOnInvoice] = useState<boolean>(business?.job_private_on_invoice === true);
  const [savingPrivateOnInvoice, setSavingPrivateOnInvoice] = useState(false);

  useEffect(() => {
    if (business) {
      const cm = business.job_crew_mode ?? true;
      setCrewMode(cm);
      setDbCrewMode(cm);
      setItemTypesOn(business.job_item_types_enabled !== false);
      setPrivateOnInvoice(business.job_private_on_invoice === true);
      const h = parseHiddenFields(business.job_field_hidden);
      setJobHidden(h);
      setDbJobHidden(h);
    }
  }, [business]);

  const toggleJobFieldHidden = (key: string) => {
    setJobHidden(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
    setJobReqMsg('');
  };

  const saveItemTypes = async (value: boolean) => {
    if (!business) return;
    setItemTypesOn(value); setSavingItemTypes(true);
    const { error } = await supabase.from('businesses')
      .update({ job_item_types_enabled: value }).eq('id', business.id);
    if (!error) await refetchBusiness(); else setItemTypesOn(!value);
    setSavingItemTypes(false);
  };

  const savePrivateOnInvoice = async (value: boolean) => {
    if (!business) return;
    setPrivateOnInvoice(value); setSavingPrivateOnInvoice(true);
    const { error } = await supabase.from('businesses')
      .update({ job_private_on_invoice: value }).eq('id', business.id);
    if (!error) await refetchBusiness(); else setPrivateOnInvoice(!value);
    setSavingPrivateOnInvoice(false);
  };

  const saveCrewMode = async () => {
    if (!business) return;
    setSavingCrewMode(true); setCrewModeMsg('');
    const { error } = await supabase.from('businesses')
      .update({ job_crew_mode: crewMode })
      .eq('id', business.id);
    setCrewModeMsgIsError(!!error);
    setCrewModeMsg(error ? t.crewMode.saveError : t.crewMode.saveSuccess);
    if (!error) { await refetchBusiness(); setDbCrewMode(crewMode); }
    setSavingCrewMode(false);
  };

  const crewModeDirty = crewMode !== dbCrewMode;

  const moveClientItem = (key: string, direction: 'up' | 'down') => {
    const idx = clientItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= clientItems.length) return;
    const next = [...clientItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalClientOrder(next.map(i => i.key));
    setFieldsMsg('');
  };

  // DnD reorder: takes the new sorted list and updates the local order.
  const onClientDragReorder = (next: { id: string }[]) => {
    setLocalClientOrder(next.map(i => i.id));
    setFieldsMsg('');
  };

  // ── Job pipeline config
  const togglePipelineStep = (key: string) => {
    setPipelineDisabled(prev => ({ ...prev, [key]: !prev[key] }));
    setPipelineMsg('');
  };

  const savePipelineConfig = async () => {
    if (!business) return;
    setSavingPipeline(true); setPipelineMsg('');
    const { error } = await supabase.from('businesses')
      .update({ job_pipeline_disabled: pipelineDisabled })
      .eq('id', business.id);
    setPipelineMsgIsError(!!error);
    setPipelineMsg(error ? t.pipeline.saveError : t.pipeline.saveSuccess);
    if (!error) { await refetchBusiness(); setDbPipelineDisabled(pipelineDisabled); }
    setSavingPipeline(false);
  };

  const pipelineDirty = JSON.stringify(dbPipelineDisabled) !== JSON.stringify(pipelineDisabled);

  // ── Job alert thresholds — local mutations + persist on save
  const toggleJobAlertsEnabled = () => {
    setJobAlerts(prev => ({ ...prev, enabled: !prev.enabled }));
    setJobAlertsMsg('');
  };
  const toggleJobAlertsOverdue = () => {
    setJobAlerts(prev => ({ ...prev, overdue: !prev.overdue }));
    setJobAlertsMsg('');
  };
  const addJobAlertLevel = () => {
    // Default to "red, 1 day before" — most common first tier. Owner can
    // edit before saving.
    setJobAlerts(prev => ({
      ...prev,
      levels: [...prev.levels, { days: 1, color: 'red' as JobAlertColor }],
    }));
    setJobAlertsMsg('');
  };
  const updateJobAlertLevel = (idx: number, patch: Partial<{ days: number; color: JobAlertColor }>) => {
    setJobAlerts(prev => ({
      ...prev,
      levels: prev.levels.map((lvl, i) => i === idx ? { ...lvl, ...patch } : lvl),
    }));
    setJobAlertsMsg('');
  };
  const removeJobAlertLevel = (idx: number) => {
    setJobAlerts(prev => ({ ...prev, levels: prev.levels.filter((_, i) => i !== idx) }));
    setJobAlertsMsg('');
  };

  const saveJobAlerts = async () => {
    if (!business) return;
    setSavingJobAlerts(true); setJobAlertsMsg('');
    // Sort levels ascending by days so the persisted shape matches what
    // matchJobAlert expects (smallest tier wins for any given job).
    const payload: JobAlertThresholds = {
      enabled: jobAlerts.enabled,
      levels: [...jobAlerts.levels].sort((a, b) => a.days - b.days),
      overdue: jobAlerts.overdue,
    };
    const { error } = await supabase.from('businesses')
      .update({ job_alert_thresholds: payload })
      .eq('id', business.id);
    setJobAlertsMsgIsError(!!error);
    setJobAlertsMsg(error ? t.jobAlerts.saveError : t.jobAlerts.saveSuccess);
    if (!error) {
      await refetchBusiness();
      setJobAlerts(payload);
      setDbJobAlerts(payload);
    }
    setSavingJobAlerts(false);
  };

  const jobAlertsDirty = JSON.stringify(dbJobAlerts) !== JSON.stringify(jobAlerts);

  // ── Custom field template CRUD (draft pattern)
  // loadTemplates seeds both the working copy and the DB snapshot. CRUD
  // handlers mutate only local state; saveFieldPreferences diffs and
  // persists when the user clicks Save.
  const loadTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.from('client_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    const fetched = (data ?? []) as FieldTemplate[];
    setTemplates(fetched);
    setDbTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const toKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addTemplate = () => {
    if (!tplForm.field_label.trim()) { setTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(tplForm.field_label);
    if (templates.some(tpl => tpl.field_key === key)) { setTplError(t.customFields.errorDuplicate); return; }
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const newTpl: FieldTemplate = {
      id: newTempId(),
      field_key: key,
      field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type,
      field_options: options,
      required: tplForm.required,
      sort_order: templates.length,
      field_config: buildFieldConfig(tplForm),
    };
    setTemplates(prev => [...prev, newTpl]);
    setLocalClientOrder(prev => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
    setTplError(''); setAddFieldModal(false);
  };

  const removeTemplate = (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    setTemplates(prev => prev.filter(tpl => tpl.id !== id));
    setLocalClientOrder(prev => prev.filter(k => k !== `custom:${id}`));
  };

  const openEditTemplate = (tpl: FieldTemplate) => {
    setEditingTpl(tpl);
    setTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
      integer_only: !!parseFieldConfig(tpl.field_config).integerOnly,
      thousands: !!parseFieldConfig(tpl.field_config).thousands,
      multi: !!parseFieldConfig(tpl.field_config).multi,
    });
    setTplError('');
    setEditFieldModal(true);
  };

  const updateTemplate = () => {
    if (!editingTpl || !tplForm.field_label.trim()) { setTplError(t.customFields.errorNameRequired); return; }
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    setTemplates(prev => prev.map(tpl => tpl.id === editingTpl.id ? {
      ...tpl,
      field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type,
      field_options: options,
      required: tplForm.required,
      field_config: buildFieldConfig(tplForm),
    } : tpl));
    setEditFieldModal(false); setEditingTpl(null);
  };

  // ── Invoice field template CRUD (draft pattern, mirrors clients) ─────
  const loadInvoiceTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.from('invoice_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    const fetched = (data ?? []) as FieldTemplate[];
    setInvoiceTemplates(fetched);
    setDbInvoiceTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => { loadInvoiceTemplates(); }, [loadInvoiceTemplates]);

  const addInvoiceTemplate = () => {
    if (!invoiceTplForm.field_label.trim()) { setInvoiceTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(invoiceTplForm.field_label);
    if (invoiceTemplates.some(tpl => tpl.field_key === key)) { setInvoiceTplError(t.customFields.errorDuplicate); return; }
    const options = invoiceTplForm.field_type === 'select'
      ? invoiceTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const newTpl: FieldTemplate = {
      id: newTempId(),
      field_key: key,
      field_label: invoiceTplForm.field_label.trim(),
      field_type: invoiceTplForm.field_type,
      field_options: options,
      required: invoiceTplForm.required,
      sort_order: invoiceTemplates.length,
      field_config: buildFieldConfig(invoiceTplForm),
    };
    setInvoiceTemplates(prev => [...prev, newTpl]);
    setLocalInvoiceOrder(prev => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    setInvoiceTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
    setInvoiceTplError(''); setAddInvoiceFieldModal(false);
  };

  const removeInvoiceTemplate = (id: string) => {
    if (!confirm(t.invoices.confirmDeleteField)) return;
    setInvoiceTemplates(prev => prev.filter(tpl => tpl.id !== id));
    setLocalInvoiceOrder(prev => prev.filter(k => k !== `custom:${id}`));
  };

  const openEditInvoiceTemplate = (tpl: FieldTemplate) => {
    setEditingInvoiceTpl(tpl);
    setInvoiceTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
      integer_only: !!parseFieldConfig(tpl.field_config).integerOnly,
      thousands: !!parseFieldConfig(tpl.field_config).thousands,
      multi: !!parseFieldConfig(tpl.field_config).multi,
    });
    setInvoiceTplError('');
    setEditInvoiceFieldModal(true);
  };

  const updateInvoiceTemplate = () => {
    if (!editingInvoiceTpl || !invoiceTplForm.field_label.trim()) { setInvoiceTplError(t.customFields.errorNameRequired); return; }
    const options = invoiceTplForm.field_type === 'select'
      ? invoiceTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    setInvoiceTemplates(prev => prev.map(tpl => tpl.id === editingInvoiceTpl.id ? {
      ...tpl,
      field_label: invoiceTplForm.field_label.trim(),
      field_type: invoiceTplForm.field_type,
      field_options: options,
      required: invoiceTplForm.required,
      field_config: buildFieldConfig(invoiceTplForm),
    } : tpl));
    setEditInvoiceFieldModal(false); setEditingInvoiceTpl(null);
  };

  // ── Unified invoice-fields list (standard + custom interleaved) ───────
  const invoiceItems: UnifiedItem[] = useMemo(() => {
    const standardItems: UnifiedItem[] = DEFAULT_INVOICE_FIELDS.map(f => ({
      kind: 'standard', key: f.key, label: f.label,
    }));
    const customItems: UnifiedItem[] = invoiceTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    if (localInvoiceOrder.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of localInvoiceOrder) {
      const item = byKey.get(k);
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceTemplates, localInvoiceOrder, full]);

  const moveInvoiceItem = (key: string, direction: 'up' | 'down') => {
    const idx = invoiceItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= invoiceItems.length) return;
    const next = [...invoiceItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    setLocalInvoiceOrder(next.map(i => i.key));
    setInvoiceReqMsg('');
  };

  const onInvoiceDragReorder = (next: { id: string }[]) => {
    setLocalInvoiceOrder(next.map(i => i.id));
    setInvoiceReqMsg('');
  };

  // Dirty flag for the Facturas tab — combines the templates/required/order
  // batch (saveInvoiceRequired) with the separate due-days/notes batch
  // (saveInvoiceSettings).
  const invoicesDirty = useMemo(
    () =>
      isDirty(dbInvoiceTemplates, invoiceTemplates) ||
      JSON.stringify(dbInvoiceFieldRequired) !== JSON.stringify(invoiceFieldRequired) ||
      JSON.stringify(dbInvoiceOrder) !== JSON.stringify(localInvoiceOrder) ||
      JSON.stringify(dbInvoiceLayout) !== JSON.stringify(localInvoiceLayout) ||
      JSON.stringify(dbInvoiceHidden) !== JSON.stringify(invoiceHidden) ||
      (business?.invoice_due_days != null ? String(business.invoice_due_days) : '') !== invoiceDueDays ||
      String(business?.invoice_start_number ?? DEFAULT_INVOICE_START_NUMBER) !== invoiceStartNumber ||
      (business?.invoice_tax_rate ? String(business.invoice_tax_rate) : '') !== invoiceTaxRate ||
      (business?.invoice_email_subject ?? '') !== invoiceEmailSubject ||
      (business?.invoice_email_body ?? '') !== invoiceEmailBody ||
      (business?.invoice_notes_default ?? '') !== bizInvoiceNotes,
    [dbInvoiceTemplates, invoiceTemplates, dbInvoiceFieldRequired, invoiceFieldRequired, dbInvoiceOrder, localInvoiceOrder, dbInvoiceLayout, localInvoiceLayout, dbInvoiceHidden, invoiceHidden, business, invoiceDueDays, invoiceStartNumber, invoiceTaxRate, invoiceEmailSubject, invoiceEmailBody, bizInvoiceNotes],
  );

  const invoiceThemeDirty = useMemo(
    () => JSON.stringify(normalizeBundle(business?.invoice_template)) !== JSON.stringify(invoiceTheme),
    [business, invoiceTheme],
  );

  const discardInvoices = useCallback(() => {
    setInvoiceTemplates(dbInvoiceTemplates);
    setInvoiceFieldRequired(dbInvoiceFieldRequired);
    setLocalInvoiceOrder(dbInvoiceOrder);
    setLocalInvoiceLayout(dbInvoiceLayout);
    setInvoiceHidden(dbInvoiceHidden);
    setInvoiceDueDays(business?.invoice_due_days != null ? String(business.invoice_due_days) : '');
    setInvoiceStartNumber(String(business?.invoice_start_number ?? DEFAULT_INVOICE_START_NUMBER));
    setInvoiceTaxRate(business?.invoice_tax_rate ? String(business.invoice_tax_rate) : '');
    setInvoiceEmailSubject(business?.invoice_email_subject ?? '');
    setInvoiceEmailBody(business?.invoice_email_body ?? '');
    setBizInvoiceNotes(business?.invoice_notes_default ?? '');
    setInvoiceReqMsg('');
    setInvoiceMsg('');
  }, [dbInvoiceTemplates, dbInvoiceFieldRequired, dbInvoiceOrder, dbInvoiceLayout, dbInvoiceHidden, business]);

  const discardInvoiceTheme = useCallback(() => {
    setInvoiceTheme(normalizeBundle(business?.invoice_template));
    setThemeMsg('');
  }, [business]);

  // ── Employee field template CRUD (draft pattern, mirrors clients) ────
  const loadEmpTemplates = useCallback(async () => {
    if (!business) return;
    const { data } = await supabase.from('employee_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    const fetched = (data ?? []) as FieldTemplate[];
    setEmpTemplates(fetched);
    setDbEmpTemplates(fetched);
  }, [business, supabase]);

  useEffect(() => { loadEmpTemplates(); }, [loadEmpTemplates]);

  const addEmpTemplate = () => {
    if (!empTplForm.field_label.trim()) { setEmpTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(empTplForm.field_label);
    if (empTemplates.some(tpl => tpl.field_key === key)) { setEmpTplError(t.customFields.errorDuplicate); return; }
    const options = empTplForm.field_type === 'select'
      ? empTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const newTpl: FieldTemplate = {
      id: newTempId(),
      field_key: key,
      field_label: empTplForm.field_label.trim(),
      field_type: empTplForm.field_type,
      field_options: options,
      required: empTplForm.required,
      sort_order: empTemplates.length,
      field_config: buildFieldConfig(empTplForm),
    };
    setEmpTemplates(prev => [...prev, newTpl]);
    setLocalEmpOrder(prev => prev.includes(`custom:${newTpl.id}`) ? prev : [...prev, `custom:${newTpl.id}`]);
    setEmpTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
    setEmpTplError(''); setAddEmpFieldModal(false);
  };

  const removeEmpTemplate = (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    setEmpTemplates(prev => prev.filter(tpl => tpl.id !== id));
    setLocalEmpOrder(prev => prev.filter(k => k !== `custom:${id}`));
  };

  const openEditEmpTemplate = (tpl: FieldTemplate) => {
    setEditingEmpTpl(tpl);
    setEmpTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
      integer_only: !!parseFieldConfig(tpl.field_config).integerOnly,
      thousands: !!parseFieldConfig(tpl.field_config).thousands,
      multi: !!parseFieldConfig(tpl.field_config).multi,
    });
    setEmpTplError('');
    setEditEmpFieldModal(true);
  };

  const updateEmpTemplate = () => {
    if (!editingEmpTpl || !empTplForm.field_label.trim()) { setEmpTplError(t.customFields.errorNameRequired); return; }
    const options = empTplForm.field_type === 'select'
      ? empTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    setEmpTemplates(prev => prev.map(tpl => tpl.id === editingEmpTpl.id ? {
      ...tpl,
      field_label: empTplForm.field_label.trim(),
      field_type: empTplForm.field_type,
      field_options: options,
      required: empTplForm.required,
      field_config: buildFieldConfig(empTplForm),
    } : tpl));
    setEditEmpFieldModal(false); setEditingEmpTpl(null);
  };

  // ── Cross-tab dirty + discard plumbing ───────────────────────────────
  // Each entity's dirty flag is OR'd into `anyDirty` (used by the browser
  // beforeunload guard). When the user clicks a different SettingsNav tab,
  // tryChangeTab confirms with t.unsavedChangesMessage and runs the
  // matching discard helper for the tab they're leaving.
  // Trabajos tab has FIVE sub-cards (pipeline / job fields / alerts /
  // crew mode / assignment fields); each saves on its own button but a
  // switch away from the tab with any pending edits triggers the unified
  // discard.
  const trabajosDirty = pipelineDirty || jobFieldsDirty || jobAlertsDirty || crewModeDirty;

  const discardTrabajos = useCallback(() => {
    setPipelineDisabled(dbPipelineDisabled);
    setJobTemplates(dbJobTemplates);
    setJobRequired(dbJobRequired);
    setLocalJobOrder(dbJobOrder);
    setLocalJobLayout(dbJobLayout);
    setJobAlerts(dbJobAlerts);
    setCrewMode(dbCrewMode);
    setPipelineMsg(''); setJobReqMsg(''); setJobAlertsMsg(''); setCrewModeMsg('');
  }, [dbPipelineDisabled, dbJobTemplates, dbJobRequired, dbJobOrder, dbJobLayout, dbJobAlerts, dbCrewMode]);

  const anyDirty = clientsDirty || employeesDirty || invoicesDirty || invoiceThemeDirty || trabajosDirty;

  const tryChangeTab = (next: Tab) => {
    if (next === tab) return;
    const dirtyByTab: Partial<Record<Tab, boolean>> = {
      clientes: clientsDirty,
      empleados: employeesDirty,
      facturas: invoicesDirty,
      facturatema: invoiceThemeDirty,
      trabajos: trabajosDirty,
    };
    if (dirtyByTab[tab]) {
      if (!confirm(t.unsavedChangesMessage)) return;
      if (tab === 'clientes') discardClients();
      else if (tab === 'empleados') discardEmployees();
      else if (tab === 'facturas') discardInvoices();
      else if (tab === 'facturatema') discardInvoiceTheme();
      else if (tab === 'trabajos') discardTrabajos();
    }
    setTab(next);
  };

  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  return (
    <div className="md:flex md:min-h-screen">
      {/* Settings rail — shared with the Equipo/Actividad sub-pages so the nav
          stays consistent across the whole Settings section. */}
      <SettingsNav activeTab={tab as SettingsTab} onTabClick={(next) => tryChangeTab(next as Tab)} />

      {/* Content */}
      <div className="flex-1 min-w-0 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.title}</h1>

          {/* ══ NEGOCIO ══════════════════════════════════════════════ */}
          {tab === 'negocio' && (
            <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="mb-5 max-w-4xl">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.business.heading}</h2>
                <p className="text-xs text-gray-400">{t.business.subtitle}</p>
              </div>

              {/* Logo — centered over the fields (mirrors mobile). `contain` so
                 round/wide logos aren't clipped. Uploads on pick. */}
              <div className="flex flex-col items-center gap-3 mb-6 max-w-4xl">
                {business?.logo_url ? (
                  <button type="button" onClick={() => setLogoViewerOpen(true)} title={t.business.logoLabel}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={business.logo_url} alt="" className="w-36 h-36 rounded-2xl object-contain bg-gray-50 border border-gray-100 cursor-zoom-in hover:opacity-90" />
                  </button>
                ) : (
                  <div className="w-36 h-36 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Building2 size={44} className="text-gray-400" />
                  </div>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => onPickLogo(e.target.files?.[0] ?? null)} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-3.5 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-60"
                  >
                    {uploadingLogo ? t.business.logoUploading : (business?.logo_url ? t.business.logoChangeBtn : t.business.logoUploadBtn)}
                  </button>
                  {business?.logo_url && !uploadingLogo && (
                    <button
                      onClick={onRemoveLogo}
                      className="px-3.5 py-1.5 rounded-xl text-red-500 text-sm font-semibold hover:bg-red-50"
                    >
                      {t.business.logoRemoveBtn}
                    </button>
                  )}
                </div>
              </div>

              {/* Full-screen logo viewer — click the logo to zoom; click anywhere to close. */}
              {logoViewerOpen && business?.logo_url && (
                <div
                  onClick={() => setLogoViewerOpen(false)}
                  className={`fixed inset-0 z-50 flex items-center justify-center p-8 cursor-zoom-out ${logoViewerLight ? 'bg-white/95' : 'bg-black/70 backdrop-blur-md'}`}
                >
                  {/* Background toggle (dark ⇄ white) for dark logos. */}
                  <button
                    onClick={e => { e.stopPropagation(); setLogoViewerLight(v => !v); }}
                    className={`absolute top-5 left-5 p-2 rounded-lg hover:bg-black/10 ${logoViewerLight ? 'text-gray-900' : 'text-white'}`}
                  >
                    <Contrast size={22} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setLogoViewerOpen(false); }}
                    className={`absolute top-5 right-5 p-2 rounded-lg hover:bg-black/10 ${logoViewerLight ? 'text-gray-900' : 'text-white'}`}
                  >
                    <X size={24} />
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={business.logo_url} alt="" className="max-w-[85%] max-h-[85%] object-contain" />
                </div>
              )}

              {/* Fields — 2-column grid so they fill the width instead of a
                 single narrow column. Long fields (name, website, street) span
                 both columns; section headers span both too. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5 max-w-4xl">
                <div className="sm:col-span-2"><Input label={t.business.nameLabel} value={bizName} onChange={e => setBizName(e.target.value)}/></div>

                <p className="sm:col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">{t.business.contactHeading}</p>
                <Input label={t.business.emailLabel} type="email" value={bizEmail} onChange={e => setBizEmail(e.target.value)}/>
                <Input label={t.business.phoneLabel} value={formatPhoneInput(bizPhone)} onChange={e => setBizPhone(formatPhoneInput(e.target.value))}/>
                <div className="sm:col-span-2"><Input label={t.business.websiteLabel} value={bizWebsite} onChange={e => setBizWebsite(e.target.value)}/></div>

                <p className="sm:col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">{t.business.addressHeading}</p>
                <div className="sm:col-span-2"><Input label={t.business.addressLabel} value={bizAddress} onChange={e => setBizAddress(e.target.value)}/></div>
                <Input label={t.business.cityLabel} value={bizCity} onChange={e => setBizCity(e.target.value)}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.business.stateLabel}</label>
                  <select
                    value={bizState}
                    onChange={e => setBizState(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
                  >
                    <option value="">—</option>
                    {/* Full state names — the DB keeps the 2-letter code. */}
                    {BIZ_US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
                  </select>
                </div>
                <Input label={t.business.zipLabel} value={bizZip} onChange={e => setBizZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric"/>

                <p className="sm:col-span-2 text-xs font-semibold text-gray-400 uppercase mt-2">{t.business.legalHeading}</p>
                <Input label={t.business.taxIdLabel} value={bizTaxId} onChange={e => setBizTaxId(e.target.value)}/>
                <Input label={t.business.licenseLabel} value={bizLicense} onChange={e => setBizLicense(e.target.value)}/>
              </div>

              {/* Operating hours — 2-column grid of days to use the width. */}
              <p className="text-xs font-semibold text-gray-400 uppercase mt-6">{t.business.operatingHoursHeading}</p>
              <p className="text-xs text-gray-400 mb-1">{t.business.operatingHoursSub}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 max-w-4xl">
                {DAY_KEYS.map((dk: DayKey) => {
                  const d = operatingHours[dk];
                  const setDay = (patch: Partial<typeof d>) =>
                    setOperatingHours(prev => ({ ...prev, [dk]: { ...prev[dk], ...patch } }));
                  return (
                    <div key={dk} className="flex items-center py-2.5 border-b border-gray-50">
                      <span className="w-28 text-sm text-gray-800">{t.business.days[dk]}</span>
                      <Toggle checked={d.enabled} onChange={(v) => setDay({ enabled: v })} />
                      <div className="flex-1" />
                      {d.enabled ? (
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                          <input
                            type="time"
                            value={d.start}
                            onChange={e => setDay({ start: e.target.value })}
                            className="bg-transparent border-0 p-0 text-gray-900 focus:outline-none focus:ring-0"
                          />
                          <span className="text-gray-400 font-normal">–</span>
                          <input
                            type="time"
                            value={d.end}
                            onChange={e => setDay({ end: e.target.value })}
                            className="bg-transparent border-0 p-0 text-gray-900 focus:outline-none focus:ring-0"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">{t.business.closedLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {bizMsg && <p className={`text-xs mt-3 ${bizMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{bizMsg}</p>}
              <div className="mt-5">
                <Button onClick={saveBusiness} loading={savingBiz}>
                  <Save size={14} className="mr-1.5"/> {tc.buttons.saveChanges}
                </Button>
              </div>
            </div>
            {/* Locations / branches — managed inline under Negocio (not its own tab). */}
            <UbicacionesSettings />
            </div>
          )}

          {/* ══ TRABAJOS ══════════════════════════════════════════════ */}
          {tab === 'trabajos' && (
            <div className="flex flex-col gap-5">
              {/* Pipeline step config */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.pipeline.heading}</h2>
                <p className="text-xs text-gray-400 mb-5">{t.pipeline.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {ALL_PIPELINE_STEPS.map(step => {
                    const isDisabled = !!pipelineDisabled[step.key];
                    return (
                      <div key={step.key} className={`flex items-center justify-between px-4 py-3 transition-colors ${isDisabled ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50/50'}`}>
                        <div className="min-w-0">
                          <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}>{step.label}</span>
                          <p className={`text-xs mt-0.5 ${isDisabled ? 'text-gray-300' : 'text-gray-400'}`}>{step.description}</p>
                        </div>
                        <Toggle checked={!isDisabled} onChange={() => togglePipelineStep(step.key)} />
                      </div>
                    );
                  })}
                </div>

                {pipelineMsg && <p className={`text-xs mb-3 ${pipelineMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{pipelineMsg}</p>}
                <Button onClick={savePipelineConfig} loading={savingPipeline} disabled={!pipelineDirty}>
                  <Save size={14} className="mr-1.5"/> {t.pipeline.saveBtn}
                </Button>
              </div>

              {/* Unified job-fields list (standard + custom interleaved). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.jobsSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setJobTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
                    setJobTplError(''); setAddJobFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-2">{t.jobsSection.subtitle}</p>

                {/* Legend: what the grip + switch on each row mean. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <GripVertical size={13} className="text-gray-400"/>
                    {locale === 'en' ? 'Drag to reorder' : 'Arrastra para mover'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className="inline-flex w-7 h-4 rounded-full bg-primary items-center justify-end px-0.5">
                      <span className="w-3 h-3 rounded-full bg-white"/>
                    </span>
                    {locale === 'en' ? 'Switch = required field' : 'El interruptor lo hace obligatorio'}
                  </span>
                </div>

                <div className="space-y-4 mb-5">
                  {JOB_LAYOUT_SECTIONS.map((section) => {
                    const keys = fieldsInSection(displayLayout, section);
                    if (keys.length === 0) return null;
                    const secLabel = locale === 'en' ? JOB_SECTION_LABELS[section].en : JOB_SECTION_LABELS[section].es;
                    return (
                      <div key={section}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 px-1">{secLabel}</div>
                        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                          <SortableList<{ id: string }>
                            items={keys.map(k => ({ id: k }))}
                            onReorder={(next) => reorderJobSection(section, next.map(n => n.id))}
                            renderItem={(item, i, { attributes, listeners }) => {
                            const key = item.id;
                            const isCustom = key.startsWith('custom:');
                            const tpl = isCustom ? jobTemplates.find(jt => `custom:${jt.id}` === key) : null;
                            const label = isCustom ? (tpl?.field_label ?? key) : (JOB_FIELD_LABELS[key] ?? key);
                            const firstInSec = i === 0;
                            const lastInSec = i === keys.length - 1;
                            return (
                              <div className="flex items-center gap-2 px-4 py-3 bg-white">
                                <button type="button" {...attributes} {...listeners}
                                  className="p-1 -ml-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
                                  aria-label="Drag to reorder">
                                  <GripVertical size={14} />
                                </button>
                                <div className="flex flex-col shrink-0">
                                  <button onClick={() => moveFieldInSection(key, 'up')} disabled={firstInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move up">
                                    <ChevronUp size={14} className="text-gray-500"/>
                                  </button>
                                  <button onClick={() => moveFieldInSection(key, 'down')} disabled={lastInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move down">
                                    <ChevronDown size={14} className="text-gray-500"/>
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {isCustom && <Sparkles size={12} className="text-primary shrink-0"/>}
                                    <span className="text-sm text-gray-900">{label}</span>
                                    {isCustom && tpl?.required && (
                                      <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                                    )}
                                  </div>
                                  {isCustom && tpl && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {FIELD_TYPES[tpl.field_type]}
                                      {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                                    </p>
                                  )}
                                </div>
                                {!isCustom ? (
                                  <>
                                    {!JOB_FIELDS_ALWAYS_SHOWN.includes(key) && (
                                      <button onClick={() => toggleJobFieldHidden(key)}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                                        aria-label={jobHidden[key] ? (locale === 'en' ? 'Show field' : 'Mostrar campo') : (locale === 'en' ? 'Hide field' : 'Ocultar campo')}>
                                        {jobHidden[key] ? <EyeOff size={15} className="text-gray-400"/> : <Eye size={15} className="text-gray-500"/>}
                                      </button>
                                    )}
                                    <Toggle checked={!!jobRequired[key]} onChange={() => toggleJobRequired(key)} />
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={section}
                                      onChange={(e) => moveFieldToSection(key, e.target.value as JobLayoutSection)}
                                      className="text-xs border border-gray-200 rounded-lg pl-1.5 pr-6 py-1 text-gray-600 bg-white shrink-0 max-w-[160px]"
                                      aria-label={locale === 'en' ? 'Move to section' : 'Mover a sección'}
                                    >
                                      {JOB_LAYOUT_SECTIONS.map(s => (
                                        <option key={s} value={s}>{locale === 'en' ? JOB_SECTION_LABELS[s].en : JOB_SECTION_LABELS[s].es}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => tpl && openEditJobTemplate(tpl)}
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0" aria-label={tc.buttons.edit}>
                                      <Pencil size={13} className="text-blue-400"/>
                                    </button>
                                    <button onClick={() => tpl && removeJobTemplate(tpl.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0" aria-label={tc.buttons.delete}>
                                      <Trash2 size={13} className="text-red-400"/>
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {jobReqMsg && <p className={`text-xs mb-3 ${jobReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{jobReqMsg}</p>}
                <Button onClick={saveJobRequired} loading={savingJobRequired} disabled={!jobFieldsDirty}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>

              {/* Upcoming-job alert tiers. When enabled, jobs whose
                 scheduled_date falls inside a tier get a colored left
                 border + chip on the job list card. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{t.jobAlerts.heading}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{t.jobAlerts.subtitle}</p>
                  </div>
                  <Toggle checked={jobAlerts.enabled} onChange={toggleJobAlertsEnabled} />
                </div>

                {jobAlerts.enabled && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t.jobAlerts.levelsHeading}</p>
                      <Button size="sm" variant="secondary" onClick={addJobAlertLevel}>
                        <Plus size={14} className="mr-1"/> {t.jobAlerts.addLevelBtn}
                      </Button>
                    </div>

                    {jobAlerts.levels.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-3">{t.jobAlerts.levelsEmpty}</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {jobAlerts.levels.map((level, idx) => {
                          const style = JOB_ALERT_STYLE[level.color as JobAlertColor];
                          return (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-100 bg-white border-l-4 ${style?.borderClass ?? 'border-l-gray-300'}`}
                            >
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={level.days}
                                  onChange={e => updateJobAlertLevel(idx, { days: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                  className="w-16 px-2 py-1 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-primary"
                                />
                                <span className="text-xs text-gray-500">
                                  {level.days === 1 ? t.jobAlerts.daysSuffixOne : t.jobAlerts.daysSuffixMany}
                                </span>
                              </div>
                              <select
                                value={level.color}
                                onChange={e => updateJobAlertLevel(idx, { color: e.target.value as JobAlertColor })}
                                className="text-sm rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:border-primary"
                              >
                                {JOB_ALERT_COLORS.map(c => (
                                  <option key={c} value={c}>{t.jobAlerts.colors[c]}</option>
                                ))}
                              </select>
                              <div className="flex-1" />
                              <button
                                onClick={() => removeJobAlertLevel(idx)}
                                aria-label={t.jobAlerts.removeLevelLabel}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={14} className="text-red-400" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Overdue indicator — independent of the upcoming-day tiers
                   above; flags jobs already past their scheduled date. */}
                <div className="flex items-start justify-between gap-4 mt-5 pt-4 border-t border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t.jobAlerts.overdueHeading}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.jobAlerts.overdueSubtitle}</p>
                  </div>
                  <Toggle checked={jobAlerts.overdue} onChange={toggleJobAlertsOverdue} />
                </div>

                {jobAlertsMsg && <p className={`text-xs mt-4 ${jobAlertsMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{jobAlertsMsg}</p>}
                {jobAlertsDirty && (
                  <div className="mt-4">
                    <Button onClick={saveJobAlerts} loading={savingJobAlerts}>
                      <Save size={14} className="mr-1.5"/> {t.jobAlerts.saveBtn}
                    </Button>
                  </div>
                )}
              </div>

              {/* Item-type categories toggle — grouped with the other toggles
                 near the bottom (matches the mobile section order). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{locale === 'en' ? 'Materials & labor' : 'Materiales y mano de obra'}</h2>
                    <p className="text-xs text-gray-400 mt-1">
                      {locale === 'en'
                        ? 'Shows the Materials & Labor section (with Labor / Material / Equipment / Other tags) on jobs. Turn off to hide the section entirely — for businesses that don’t itemize. Proposals always keep it.'
                        : 'Muestra la sección de Materiales y mano de obra (con etiquetas Mano de obra / Material / Equipo / Otro) en los trabajos. Desactívalo para ocultarla por completo — para negocios que no detallan líneas. Las propuestas siempre la mantienen.'}
                    </p>
                  </div>
                  <Toggle checked={itemTypesOn} onChange={() => saveItemTypes(!itemTypesOn)} disabled={savingItemTypes} />
                </div>
              </div>

              {/* Auto-privatize on invoice — hides billed jobs from crews
                 (DB trigger covers every invoicing path, migration 117). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{t.privateOnInvoice.heading}</h2>
                    <p className="text-xs text-gray-400 mt-1">{t.privateOnInvoice.subtitle}</p>
                  </div>
                  <Toggle checked={privateOnInvoice} onChange={() => savePrivateOnInvoice(!privateOnInvoice)} disabled={savingPrivateOnInvoice} />
                </div>
              </div>

              {/* Crew mode toggle — hides the per-worker fields card + the
                 lead picker on the new-job form when off. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{t.crewMode.heading}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{t.crewMode.subtitle}</p>
                  </div>
                  <Toggle checked={crewMode} onChange={() => { setCrewMode(v => !v); setCrewModeMsg(''); }} />
                </div>
                {crewModeMsg && <p className={`text-xs mt-3 ${crewModeMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{crewModeMsg}</p>}
                {crewModeDirty && (
                  <div className="mt-4">
                    <Button onClick={saveCrewMode} loading={savingCrewMode}>
                      <Save size={14} className="mr-1.5"/> {t.crewMode.saveBtn}
                    </Button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ══ CLIENTES ═════════════════════════════════════════════ */}
          {tab === 'clientes' && (
            <div className="flex flex-col gap-5">
              {/* Contacts summary — total clients + employees so the user can
                 reconcile against their Google Contacts count when sync is on. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">{t.contactsStats.heading}</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-indigo-50 rounded-xl p-4 flex flex-col items-center">
                    <span className="text-xs text-indigo-600 font-medium">{t.contactsStats.clientsLabel}</span>
                    <span className="text-2xl font-bold text-indigo-700 mt-1">{clientsCount ?? '—'}</span>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-4 flex flex-col items-center text-center">
                    <span className="text-xs text-emerald-600 font-medium">{t.contactsStats.contactsLabel}</span>
                    <span className="text-2xl font-bold text-emerald-700 mt-1">{contactsCount ?? '—'}</span>
                  </div>
                  <div className="bg-gray-100 rounded-xl p-4 flex flex-col items-center">
                    <span className="text-xs text-gray-600 font-medium">{t.contactsStats.totalLabel}</span>
                    <span className="text-2xl font-bold text-gray-900 mt-1">
                      {clientsCount !== null && contactsCount !== null ? clientsCount + contactsCount : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-3 leading-4">{t.contactsStats.googleHint}</p>
              </div>

              {/* Unified client-fields list: standard + custom in one order.
                 Custom items are marked with a Sparkles glyph. Use the up/down
                 arrows to interleave them however you like. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.requiredFields.heading}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
                    setTplError(''); setAddFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-2">{t.requiredFields.subtitle}</p>

                {/* Legend: what the grip + switch on each row mean. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <GripVertical size={13} className="text-gray-400"/>
                    {locale === 'en' ? 'Drag to reorder' : 'Arrastra para mover'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className="inline-flex w-7 h-4 rounded-full bg-primary items-center justify-end px-0.5">
                      <span className="w-3 h-3 rounded-full bg-white"/>
                    </span>
                    {locale === 'en' ? 'Switch = required field' : 'El interruptor lo hace obligatorio'}
                  </span>
                </div>

                <div className="space-y-4 mb-5">
                  {CLIENT_FIELD_SECTIONS.map((section) => {
                    const keys = clientFieldsInSection(clientDisplayLayout, section);
                    if (keys.length === 0) return null;
                    const secLabel = locale === 'en' ? CLIENT_SECTION_LABELS[section].en : CLIENT_SECTION_LABELS[section].es;
                    return (
                      <div key={section}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 px-1">{secLabel}</div>
                        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                          <SortableList<{ id: string }>
                            items={keys.map(k => ({ id: k }))}
                            onReorder={(next) => reorderClientSection(section, next.map(n => n.id))}
                            renderItem={(item, i, { attributes, listeners }) => {
                            const key = item.id;
                            const isCustom = key.startsWith('custom:');
                            const tpl = isCustom ? templates.find(ct => `custom:${ct.id}` === key) : null;
                            const label = isCustom ? (tpl?.field_label ?? key) : (CLIENT_FIELD_LABELS[key] ?? key);
                            const firstInSec = i === 0;
                            const lastInSec = i === keys.length - 1;
                            return (
                              <div className="flex items-center gap-2 px-4 py-3 bg-white">
                                <button type="button" {...attributes} {...listeners}
                                  className="p-1 -ml-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
                                  aria-label="Drag to reorder">
                                  <GripVertical size={14} />
                                </button>
                                <div className="flex flex-col shrink-0">
                                  <button onClick={() => moveClientFieldInSection(key, 'up')} disabled={firstInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move up">
                                    <ChevronUp size={14} className="text-gray-500"/>
                                  </button>
                                  <button onClick={() => moveClientFieldInSection(key, 'down')} disabled={lastInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move down">
                                    <ChevronDown size={14} className="text-gray-500"/>
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {isCustom && <Sparkles size={12} className="text-primary shrink-0"/>}
                                    <span className="text-sm text-gray-900">{label}</span>
                                    {isCustom && tpl?.required && (
                                      <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                                    )}
                                  </div>
                                  {isCustom && tpl && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {FIELD_TYPES[tpl.field_type]}
                                      {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                                    </p>
                                  )}
                                </div>
                                {!isCustom ? (
                                  <>
                                    {!CLIENT_FIELDS_ALWAYS_SHOWN.includes(key) && (
                                      <button onClick={() => toggleClientFieldHidden(key)}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                                        aria-label={clientHidden[key] ? (locale === 'en' ? 'Show field' : 'Mostrar campo') : (locale === 'en' ? 'Hide field' : 'Ocultar campo')}>
                                        {clientHidden[key] ? <EyeOff size={15} className="text-gray-400"/> : <Eye size={15} className="text-gray-500"/>}
                                      </button>
                                    )}
                                    <Toggle checked={!!fieldRequired[key]} onChange={() => toggleFieldRequired(key)} />
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={section}
                                      onChange={(e) => moveClientFieldToSection(key, e.target.value as ClientFieldSection)}
                                      className="text-xs border border-gray-200 rounded-lg pl-1.5 pr-6 py-1 text-gray-600 bg-white shrink-0 max-w-[160px]"
                                      aria-label={locale === 'en' ? 'Move to section' : 'Mover a sección'}
                                    >
                                      {CLIENT_FIELD_SECTIONS.map(s => (
                                        <option key={s} value={s}>{locale === 'en' ? CLIENT_SECTION_LABELS[s].en : CLIENT_SECTION_LABELS[s].es}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => tpl && openEditTemplate(tpl)}
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0" aria-label={tc.buttons.edit}>
                                      <Pencil size={13} className="text-blue-400"/>
                                    </button>
                                    <button onClick={() => tpl && removeTemplate(tpl.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0" aria-label={tc.buttons.delete}>
                                      <Trash2 size={13} className="text-red-400"/>
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {fieldsMsg && <p className={`text-xs mb-3 ${fieldsMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{fieldsMsg}</p>}
                <Button onClick={saveFieldPreferences} loading={savingFields} disabled={!clientsDirty}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>
            </div>
          )}

          {/* ══ EMPLEADOS ═══════════════════════════════════════════════ */}
          {tab === 'empleados' && (
            <div className="flex flex-col gap-5">
              {/* Roles editor lives inside Team settings. */}
              {can.manageMembers(currentRole) && (
                <Link
                  href="/dashboard/ajustes/equipo"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-3 hover:border-primary transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900">{full.dashboard.roles.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{full.dashboard.roles.subtitle}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0" />
                </Link>
              )}
              {/* Unified employee-fields list (standard + custom interleaved). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.employeesSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEmpTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
                    setEmpTplError(''); setAddEmpFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-2">{t.employeesSection.subtitle}</p>

                {/* Legend: what the grip + switch on each row mean. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <GripVertical size={13} className="text-gray-400"/>
                    {locale === 'en' ? 'Drag to reorder' : 'Arrastra para mover'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className="inline-flex w-7 h-4 rounded-full bg-primary items-center justify-end px-0.5">
                      <span className="w-3 h-3 rounded-full bg-white"/>
                    </span>
                    {locale === 'en' ? 'Switch = required field' : 'El interruptor lo hace obligatorio'}
                  </span>
                </div>

                <div className="space-y-4 mb-5">
                  {EMPLOYEE_FIELD_SECTIONS.map((section) => {
                    const keys = employeeFieldsInSection(empDisplayLayout, section);
                    if (keys.length === 0) return null;
                    const secLabel = locale === 'en' ? EMPLOYEE_SECTION_LABELS[section].en : EMPLOYEE_SECTION_LABELS[section].es;
                    return (
                      <div key={section}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 px-1">{secLabel}</div>
                        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                          <SortableList<{ id: string }>
                            items={keys.map(k => ({ id: k }))}
                            onReorder={(next) => reorderEmpSection(section, next.map(n => n.id))}
                            renderItem={(item, i, { attributes, listeners }) => {
                            const key = item.id;
                            const isCustom = key.startsWith('custom:');
                            const tpl = isCustom ? empTemplates.find(et => `custom:${et.id}` === key) : null;
                            const label = isCustom ? (tpl?.field_label ?? key) : (EMP_FIELD_LABELS[key] ?? key);
                            const firstInSec = i === 0;
                            const lastInSec = i === keys.length - 1;
                            return (
                              <div className="flex items-center gap-2 px-4 py-3 bg-white">
                                <button type="button" {...attributes} {...listeners}
                                  className="p-1 -ml-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
                                  aria-label="Drag to reorder">
                                  <GripVertical size={14} />
                                </button>
                                <div className="flex flex-col shrink-0">
                                  <button onClick={() => moveEmpFieldInSection(key, 'up')} disabled={firstInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move up">
                                    <ChevronUp size={14} className="text-gray-500"/>
                                  </button>
                                  <button onClick={() => moveEmpFieldInSection(key, 'down')} disabled={lastInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move down">
                                    <ChevronDown size={14} className="text-gray-500"/>
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {isCustom && <Sparkles size={12} className="text-primary shrink-0"/>}
                                    <span className="text-sm text-gray-900">{label}</span>
                                    {isCustom && tpl?.required && (
                                      <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                                    )}
                                  </div>
                                  {isCustom && tpl && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {FIELD_TYPES[tpl.field_type]}
                                      {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                                    </p>
                                  )}
                                </div>
                                {!isCustom ? (
                                  <>
                                    {!EMPLOYEE_FIELDS_ALWAYS_SHOWN.includes(key) && (
                                      <button onClick={() => toggleEmpFieldHidden(key)}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                                        aria-label={empHidden[key] ? (locale === 'en' ? 'Show field' : 'Mostrar campo') : (locale === 'en' ? 'Hide field' : 'Ocultar campo')}>
                                        {empHidden[key] ? <EyeOff size={15} className="text-gray-400"/> : <Eye size={15} className="text-gray-500"/>}
                                      </button>
                                    )}
                                    <Toggle checked={!!empRequired[key]} onChange={() => toggleEmpRequired(key)} />
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={section}
                                      onChange={(e) => moveEmpFieldToSection(key, e.target.value as EmployeeFieldSection)}
                                      className="text-xs border border-gray-200 rounded-lg pl-1.5 pr-6 py-1 text-gray-600 bg-white shrink-0 max-w-[160px]"
                                      aria-label={locale === 'en' ? 'Move to section' : 'Mover a sección'}
                                    >
                                      {EMPLOYEE_FIELD_SECTIONS.map(s => (
                                        <option key={s} value={s}>{locale === 'en' ? EMPLOYEE_SECTION_LABELS[s].en : EMPLOYEE_SECTION_LABELS[s].es}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => tpl && openEditEmpTemplate(tpl)}
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0" aria-label={tc.buttons.edit}>
                                      <Pencil size={13} className="text-blue-400"/>
                                    </button>
                                    <button onClick={() => tpl && removeEmpTemplate(tpl.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0" aria-label={tc.buttons.delete}>
                                      <Trash2 size={13} className="text-red-400"/>
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {empReqMsg && <p className={`text-xs mb-3 ${empReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{empReqMsg}</p>}
                <Button onClick={saveEmpRequired} loading={savingEmpRequired} disabled={!employeesDirty}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>
            </div>
          )}

          {/* ══ CUENTA ═══════════════════════════════════════════════ */}
          {tab === 'cuenta' && (
            <div className="flex flex-col gap-5">
              {/* Account info */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.account.heading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.account.subtitle}</p>
                <div className="max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label={t.account.firstNameLabel} value={firstName} onChange={e => setFirstName(e.target.value)} />
                  <Input label={t.account.lastNameLabel} value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
                {nameMsg && <p className={`text-xs mt-3 ${nameMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{nameMsg}</p>}
                <div className="mt-4">
                  <Button onClick={saveName} loading={savingName}>
                    <Save size={14} className="mr-1.5"/> {t.account.saveNameBtn}
                  </Button>
                </div>
                <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">{t.account.emailLabel}: <span className="font-medium text-gray-900">{user?.email}</span></p>
                  <p className="text-sm text-gray-500">{t.account.roleLabel}: <span className="font-medium text-gray-900">{currentRole ? ROLE_LABELS[currentRole][locale] : '—'}</span></p>
                </div>
              </div>

              {/* Businesses you belong to — read-only list; switching active
                  business still happens via the header BusinessSwitcher. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">{t.account.businessesHeading}</h2>
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/onboarding')}
                    className="shrink-0 flex items-center gap-1.5"
                  >
                    <Plus size={16} />
                    {full.dashboard.workspaces.createBusiness}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-4">{t.account.businessesSubtitle}</p>
                {businesses.length === 0 ? (
                  <p className="text-sm text-gray-500">{t.account.businessesEmpty}</p>
                ) : (
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    {businesses.map((b, i) => {
                      const role = roles[b.id];
                      const isActive = b.id === activeBusinessId;
                      return (
                        <div
                          key={b.id}
                          className={`flex items-center gap-3 px-4 py-3 ${
                            i < businesses.length - 1 ? 'border-b border-gray-100' : ''
                          }`}
                        >
                          <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 size={14} className="text-primary" />
                          </span>
                          <span className="flex-1 text-sm font-semibold text-gray-900 break-words">
                            {b.name}
                            {isActive ? ' •' : ''}
                          </span>
                          {role ? (
                            <span className="bg-primary/10 rounded-full px-2.5 py-1 text-xs font-semibold text-primary shrink-0">
                              {ROLE_LABELS[role][locale]}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subscription — reflects the active business billing state */}
              {(() => {
                const es = locale === 'es';
                const sub: SubscriptionInfo = {
                  plan: business?.plan ?? null,
                  subscription_status: business?.subscription_status ?? null,
                  trial_ends_at: business?.trial_ends_at ?? null,
                  current_period_end: business?.current_period_end ?? null,
                };
                const status = sub.subscription_status;
                const daysLeft = trialDaysLeft(sub);
                const expired = isTrialExpired(sub);
                const trialing = !expired && daysLeft !== null;

                let heading: string;
                let subtitle: string | null = null;
                let action: 'plans' | 'manage' = 'plans';

                if (trialing) {
                  heading = es
                    ? `Prueba gratis — te quedan ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
                    : `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
                  action = 'plans';
                } else if (status === 'active') {
                  const planKey = activePlanKey(sub);
                  const plan = PLANS.find((p) => p.key === planKey);
                  const planName = plan ? plan.copy[locale].name : null;
                  // Only show a period for a real paid sub. A grandfathered/free
                  // 'active' business has no plan + no period — don't invent one.
                  const periodLabel =
                    business?.billing_period === 'annual'
                      ? es ? 'Anual' : 'Annual'
                      : business?.billing_period === 'monthly'
                        ? es ? 'Mensual' : 'Monthly'
                        : null;
                  heading = planName
                    ? `Plan ${planName}${periodLabel ? ` · ${periodLabel}` : ''}`
                    : es ? 'Cuenta activa' : 'Active account';
                  action = 'manage';
                } else if (status === 'past_due') {
                  heading = es
                    ? 'Pago pendiente — actualiza tu método de pago'
                    : 'Payment due — update your payment method';
                  action = 'manage';
                } else {
                  heading = es ? 'Sin plan activo' : 'No active plan';
                  action = 'plans';
                }

                return (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 mb-1">
                        {es ? 'Suscripción' : 'Subscription'}
                      </h2>
                      <p className="text-sm text-gray-600">{heading}</p>
                      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                      {portalError && (
                        <p className="text-xs text-red-500 mt-2">{portalError}</p>
                      )}
                    </div>
                    {action === 'manage' ? (
                      <Button
                        variant="secondary"
                        onClick={openBillingPortal}
                        loading={portalLoading}
                        className="shrink-0 flex items-center gap-1.5"
                      >
                        {es ? 'Administrar suscripción' : 'Manage subscription'}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => setPricingOpen(true)}
                        className="shrink-0 flex items-center gap-1.5"
                      >
                        <Sparkles size={16} />
                        {es ? 'Ver planes' : 'View plans'}
                      </Button>
                    )}
                  </div>
                );
              })()}

              <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />

              {/* Language */}
              <LanguageCard />

              {/* Password */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.password.heading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.password.subtitle}</p>
                <div className="max-w-md flex flex-col gap-3">
                  <Input
                    label={t.password.currentPasswordLabel}
                    type={showCurrentPw ? 'text' : 'password'}
                    placeholder={t.password.currentPasswordPlaceholder}
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(v => !v)}
                        aria-label={showCurrentPw ? t.password.hidePassword : t.password.showPassword}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                  <Input
                    label={t.password.newPasswordLabel}
                    type={showNewPw ? 'text' : 'password'}
                    placeholder={t.password.newPasswordPlaceholder}
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowNewPw(v => !v)}
                        aria-label={showNewPw ? t.password.hidePassword : t.password.showPassword}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                </div>
                {pwMsg && <p className={`text-xs mt-3 ${pwMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{pwMsg}</p>}
                <div className="mt-5">
                  <Button onClick={savePassword} loading={savingPw}>
                    <Save size={14} className="mr-1.5"/> {t.password.saveBtn}
                  </Button>
                </div>
              </div>

              {/* Sign out — lives here so it's the single canonical logout
                  (removed from the sidebar to avoid two competing entry points). */}
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="flex items-center justify-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} /> {full.dashboard.sidebar.logout}
              </button>

              {logoutOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setLogoutOpen(false)} />
                  <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center"><LogOut size={22} className="text-red-600" /></div>
                    <div className="text-lg font-bold text-gray-900">{full.dashboard.sidebar.logout}</div>
                    <div className="text-sm text-gray-500">{t.account.logoutConfirm}</div>
                    <div className="flex gap-3 w-full mt-2">
                      <button type="button" onClick={() => setLogoutOpen(false)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-200">
                        {full.common.buttons.cancel}
                      </button>
                      <button type="button"
                        onClick={async () => { await supabase.auth.signOut(); window.location.href = '/auth/login'; }}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700">
                        {full.dashboard.sidebar.logout}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ FACTURAS ═════════════════════════════════════════════ */}
          {/* ══ TEMA DE FACTURA (invoice design) ═════════════════════ */}
          {tab === 'facturatema' && (
            <div className="flex flex-col gap-5">
              <button
                type="button"
                onClick={() => tryChangeTab('facturas')}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 self-start"
              >
                <ChevronLeft size={16} /> {t.tabs.facturas}
              </button>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.invoices.design.title}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.invoices.design.subtitle}</p>
                <InvoiceDesigner
                  key={invoiceTheme.active}
                  value={activeBundleConfig(invoiceTheme)}
                  onChange={c => setInvoiceTheme(b => ({ ...b, [b.active]: c }))}
                  onSwitchMode={m => setInvoiceTheme(b => ({ ...b, active: m }))}
                  customFields={invoiceTemplates.filter(tpl => tpl.field_key).map(tpl => ({ key: tpl.field_key, label: tpl.field_label }))}
                  branding={{
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
                  } satisfies InvoiceBranding}
                />
                {themeMsg && <p className={`text-xs mt-3 ${themeMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{themeMsg}</p>}
                <div className="mt-5">
                  <Button onClick={saveInvoiceTheme} loading={savingTheme}>
                    <Save size={14} className="mr-1.5" /> {tc.buttons.saveChanges}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'facturas' && (
            <div className="flex flex-col gap-5">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.invoices.heading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.invoices.subtitle}</p>
                <div className="flex flex-col gap-4 max-w-md">
                  <div>
                    <Input
                      label={t.invoices.dueDaysLabel}
                      type="number"
                      min="0"
                      value={invoiceDueDays}
                      onChange={e => setInvoiceDueDays(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">{t.invoices.dueDaysHint}</p>
                  </div>
                  <div>
                    <Input
                      label={t.invoices.taxRateLabel}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={invoiceTaxRate}
                      onChange={e => setInvoiceTaxRate(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">{t.invoices.taxRateHint}</p>
                  </div>
                  <div>
                    <Input
                      label={t.invoices.startNumberLabel}
                      type="number"
                      min="1"
                      value={invoiceStartNumber}
                      onChange={e => setInvoiceStartNumber(e.target.value)}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">{t.invoices.startNumberHint}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">{t.invoices.notesLabel}</label>
                    <textarea
                      rows={3}
                      placeholder={t.invoices.notesPlaceholder}
                      value={bizInvoiceNotes}
                      onChange={e => setBizInvoiceNotes(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
                    />
                  </div>

                </div>
                {invoiceMsg && <p className={`text-xs mt-3 ${invoiceMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{invoiceMsg}</p>}
                <div className="mt-5">
                  <Button onClick={saveInvoiceSettings} loading={savingInvoice}>
                    <Save size={14} className="mr-1.5"/> {tc.buttons.saveChanges}
                  </Button>
                </div>
              </div>

              {/* Email al enviar factura — its OWN card: these fields
                 customize the send EMAIL, not the invoice document. Saved by
                 the same handler as the terms card. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.invoices.emailHeading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.invoices.emailSubtitle}</p>
                <div className="flex flex-col gap-4 max-w-md">
                  <div className="flex flex-col gap-1.5">
                    <Input
                      ref={invoiceEmailSubjectRef}
                      label={t.invoices.emailSubjectLabel}
                      value={invoiceEmailSubject}
                      onChange={e => setInvoiceEmailSubject(e.target.value)}
                      onSelect={e => { emailSelRef.current.subject = { s: e.currentTarget.selectionStart ?? 0, e: e.currentTarget.selectionEnd ?? 0 }; }}
                      placeholder={full.dashboard.invoices.emailSubject}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {INVOICE_EMAIL_TOKENS.map(tok => {
                        const label = locale === 'en' ? tok.en : tok.es;
                        return (
                          <button
                            key={tok.key}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => insertEmailToken('subject', label)}
                            className="rounded-full bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 text-[11px] font-mono transition"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-gray-700">{t.invoices.emailBodyLabel}</label>
                    <textarea
                      ref={invoiceEmailBodyRef}
                      rows={4}
                      placeholder={full.dashboard.invoices.emailBody}
                      value={invoiceEmailBody}
                      onChange={e => setInvoiceEmailBody(e.target.value)}
                      onSelect={e => { emailSelRef.current.body = { s: e.currentTarget.selectionStart ?? 0, e: e.currentTarget.selectionEnd ?? 0 }; }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {INVOICE_EMAIL_TOKENS.map(tok => {
                        const label = locale === 'en' ? tok.en : tok.es;
                        return (
                          <button
                            key={tok.key}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => insertEmailToken('body', label)}
                            className="rounded-full bg-primary/10 text-primary hover:bg-primary/20 px-2 py-0.5 text-[11px] font-mono transition"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400">{t.invoices.emailVarsHint}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <Button onClick={saveInvoiceSettings} loading={savingInvoice}>
                    <Save size={14} className="mr-1.5"/> {tc.buttons.saveChanges}
                  </Button>
                </div>
              </div>

              {/* Unified invoice-fields list: standard (required toggle) +
                 custom (edit/delete), reorderable. Same UX as Trabajos. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.invoicesSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setInvoiceTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '', integer_only: false, thousands: false, multi: false });
                    setInvoiceTplError(''); setAddInvoiceFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-2">{t.invoicesSection.subtitle}</p>

                {/* Legend: what the grip + switch on each row mean. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <GripVertical size={13} className="text-gray-400"/>
                    {locale === 'en' ? 'Drag to reorder' : 'Arrastra para mover'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className="inline-flex w-7 h-4 rounded-full bg-primary items-center justify-end px-0.5">
                      <span className="w-3 h-3 rounded-full bg-white"/>
                    </span>
                    {locale === 'en' ? 'Switch = required field' : 'El interruptor lo hace obligatorio'}
                  </span>
                </div>

                <div className="space-y-4 mb-5">
                  {INVOICE_FIELD_SECTIONS.map((section) => {
                    const keys = invoiceFieldsInSection(invoiceDisplayLayout, section);
                    if (keys.length === 0) return null;
                    const secLabel = locale === 'en' ? INVOICE_SECTION_LABELS[section].en : INVOICE_SECTION_LABELS[section].es;
                    return (
                      <div key={section}>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 px-1">{secLabel}</div>
                        <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                          <SortableList<{ id: string }>
                            items={keys.map(k => ({ id: k }))}
                            onReorder={(next) => reorderInvoiceSection(section, next.map(n => n.id))}
                            renderItem={(item, i, { attributes, listeners }) => {
                            const key = item.id;
                            const isCustom = key.startsWith('custom:');
                            const tpl = isCustom ? invoiceTemplates.find(it => `custom:${it.id}` === key) : null;
                            const label = isCustom ? (tpl?.field_label ?? key) : (INVOICE_FIELD_LABELS[key] ?? key);
                            const firstInSec = i === 0;
                            const lastInSec = i === keys.length - 1;
                            return (
                              <div className="flex items-center gap-2 px-4 py-3 bg-white">
                                <button type="button" {...attributes} {...listeners}
                                  className="p-1 -ml-1 rounded cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
                                  aria-label="Drag to reorder">
                                  <GripVertical size={14} />
                                </button>
                                <div className="flex flex-col shrink-0">
                                  <button onClick={() => moveInvoiceFieldInSection(key, 'up')} disabled={firstInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move up">
                                    <ChevronUp size={14} className="text-gray-500"/>
                                  </button>
                                  <button onClick={() => moveInvoiceFieldInSection(key, 'down')} disabled={lastInSec}
                                    className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Move down">
                                    <ChevronDown size={14} className="text-gray-500"/>
                                  </button>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    {isCustom && <Sparkles size={12} className="text-primary shrink-0"/>}
                                    <span className="text-sm text-gray-900">{label}</span>
                                    {isCustom && tpl?.required && (
                                      <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                                    )}
                                  </div>
                                  {isCustom && tpl && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {FIELD_TYPES[tpl.field_type]}
                                      {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                                    </p>
                                  )}
                                </div>
                                {!isCustom ? (
                                  <>
                                    {!INVOICE_FIELDS_ALWAYS_SHOWN.includes(key) && (
                                      <button onClick={() => toggleInvoiceFieldHidden(key)}
                                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
                                        aria-label={invoiceHidden[key] ? (locale === 'en' ? 'Show field' : 'Mostrar campo') : (locale === 'en' ? 'Hide field' : 'Ocultar campo')}>
                                        {invoiceHidden[key] ? <EyeOff size={15} className="text-gray-400"/> : <Eye size={15} className="text-gray-500"/>}
                                      </button>
                                    )}
                                    <Toggle checked={!!invoiceFieldRequired[key]} onChange={() => toggleInvoiceFieldRequired(key)} />
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={section}
                                      onChange={(e) => moveInvoiceFieldToSection(key, e.target.value as InvoiceFieldSection)}
                                      className="text-xs border border-gray-200 rounded-lg pl-1.5 pr-6 py-1 text-gray-600 bg-white shrink-0 max-w-[160px]"
                                      aria-label={locale === 'en' ? 'Move to section' : 'Mover a sección'}
                                    >
                                      {INVOICE_FIELD_SECTIONS.map(s => (
                                        <option key={s} value={s}>{locale === 'en' ? INVOICE_SECTION_LABELS[s].en : INVOICE_SECTION_LABELS[s].es}</option>
                                      ))}
                                    </select>
                                    <button onClick={() => tpl && openEditInvoiceTemplate(tpl)}
                                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0" aria-label={tc.buttons.edit}>
                                      <Pencil size={13} className="text-blue-400"/>
                                    </button>
                                    <button onClick={() => tpl && removeInvoiceTemplate(tpl.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0" aria-label={tc.buttons.delete}>
                                      <Trash2 size={13} className="text-red-400"/>
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {invoiceReqMsg && <p className={`text-xs mb-3 ${invoiceReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{invoiceReqMsg}</p>}
                <Button onClick={saveInvoiceRequired} loading={savingInvoiceReq} disabled={!invoicesDirty}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>

              {/* Invoice theme lives here — a drill-in rather than a top nav item. */}
              <button
                type="button"
                onClick={() => tryChangeTab('facturatema')}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-3 text-left hover:border-gray-200 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Palette size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t.invoices.design.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.invoices.design.subtitle}</p>
                </div>
                <ChevronRight size={18} className="text-gray-400 shrink-0" />
              </button>
            </div>
          )}

          {/* ══ CONEXIONES ═══════════════════════════════════════════ */}
          {tab === 'conexiones' && (
            <div className="flex flex-col gap-5">
              <GoogleSyncCard />
            </div>
          )}

          {/* ══ IMPORTAR DATOS ══════════════════════════════════════════
             Guided migration hub — the four importers as ordered steps, since
             the order matters: jobs match clients + team by name, invoices
             link to jobs by Project ID. Each step opens the existing wizard
             on its list page via ?import=1. */}
          {tab === 'importar' && (
            <div className="flex flex-col gap-5 max-w-3xl">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t.tabs.importar}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{t.importHub.subtitle}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-800">{t.importHub.orderHint}</p>
              </div>
              <div className="flex flex-col gap-3">
                {([
                  { key: 'clients', title: t.importHub.step1Title, desc: t.importHub.step1Desc },
                  { key: 'employees', title: t.importHub.step2Title, desc: t.importHub.step2Desc },
                  { key: 'jobs', title: t.importHub.step3Title, desc: t.importHub.step3Desc },
                  { key: 'photos', title: t.importHub.step4Title, desc: t.importHub.step4Desc },
                  { key: 'invoices', title: t.importHub.step5Title, desc: t.importHub.step5Desc },
                  { key: 'payroll', title: t.importHub.step6Title, desc: t.importHub.step6Desc },
                  { key: 'equipment', title: t.importHub.step7Title, desc: t.importHub.step7Desc },
                  { key: 'inventory', title: t.importHub.step8Title, desc: t.importHub.step8Desc },
                ] as const).map((step, i) => {
                  const inner = (
                    <>
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                      </div>
                      <span className="text-xl text-gray-400">›</span>
                    </>
                  );
                  const cls = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors w-full';
                  return (
                    <button key={step.key} type="button" onClick={() => setHubImport(step.key)} className={cls}>
                      {inner}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Import wizards for the hub steps — mounted here so the user
             stays on this tab throughout the migration. */}
          {hubImport === 'clients' && business && (
            <ImportClientsModal
              open
              businessId={business.id}
              templates={hubClientTemplates}
              onClose={() => setHubImport(null)}
              doneLabel={full.common.buttons.close}
            />
          )}
          {hubImport === 'photos' && business && (
            <ImportPhotosModal
              open
              businessId={business.id}
              onClose={() => setHubImport(null)}
            />
          )}
          {hubImport && hubImport !== 'clients' && hubImport !== 'photos' && business && (
            <ImportModal
              open
              mode={hubImport}
              businessId={business.id}
              supabase={supabase}
              templates={hubImport === 'jobs' ? hubJobTemplates : hubImport === 'employees' ? hubEmpTemplates : []}
              accessRoles={hubAccessRoles}
              invoiceTemplate={business.invoice_template}
              onClose={() => setHubImport(null)}
            />
          )}

          {/* ══ SOPORTE ══════════════════════════════════════════════ */}
          {tab === 'soporte' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <LifeBuoy size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.support.heading}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{t.support.subtitle}</p>
                  <a
                    href={buildSupportMailto({ subject: t.support.emailSubject, userEmail: user?.email, businessName: business?.name, platform: 'Web' })}
                    className="inline-flex items-center gap-1.5 mt-4 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    <LifeBuoy size={15} /> {t.support.contactBtn}
                  </a>
                  <p className="text-xs text-gray-400 mt-2">{SUPPORT_EMAIL}</p>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* ── Add field modal ─────────────────────────────────────── */}
      <Modal open={addFieldModal} onClose={() => setAddFieldModal(false)} title={t.customFields.addModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {tplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              {t.customFields.keyLabel}: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(tplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={tplForm.options_raw}
                onChange={e => setTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {tplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.integer_only} onChange={(v) => setTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {tplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.thousands} onChange={(v) => setTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.multi} onChange={(v) => setTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={tplForm.required} onChange={(v) => setTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {tplError && <p className="text-xs text-red-500">{tplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={addTemplate} loading={savingTpl} fullWidth>{t.customFields.addFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit field modal ────────────────────────────────────── */}
      <Modal open={editFieldModal} onClose={() => setEditFieldModal(false)} title={t.customFields.editModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={tplForm.options_raw}
                onChange={e => setTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {tplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.integer_only} onChange={(v) => setTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {tplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.thousands} onChange={(v) => setTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={tplForm.multi} onChange={(v) => setTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={tplForm.required} onChange={(v) => setTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {tplError && <p className="text-xs text-red-500">{tplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateTemplate} loading={savingTpl} fullWidth>{t.customFields.updateFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Add EMPLOYEE field modal ───────────────────────────── */}
      <Modal open={addEmpFieldModal} onClose={() => setAddEmpFieldModal(false)} title={t.customFields.addModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={empTplForm.field_label}
            onChange={e => setEmpTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {empTplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              {t.customFields.keyLabel}: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(empTplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={empTplForm.field_type}
              onChange={e => setEmpTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {empTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={empTplForm.options_raw}
                onChange={e => setEmpTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {empTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.integer_only} onChange={(v) => setEmpTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {empTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.thousands} onChange={(v) => setEmpTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {empTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.multi} onChange={(v) => setEmpTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={empTplForm.required} onChange={(v) => setEmpTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {empTplError && <p className="text-xs text-red-500">{empTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddEmpFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={addEmpTemplate} loading={savingEmpTpl} fullWidth>{t.customFields.addFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit EMPLOYEE field modal ──────────────────────────── */}
      <Modal open={editEmpFieldModal} onClose={() => setEditEmpFieldModal(false)} title={t.customFields.editModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={empTplForm.field_label}
            onChange={e => setEmpTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={empTplForm.field_type}
              onChange={e => setEmpTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {empTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={empTplForm.options_raw}
                onChange={e => setEmpTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {empTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.integer_only} onChange={(v) => setEmpTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {empTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.thousands} onChange={(v) => setEmpTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {empTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={empTplForm.multi} onChange={(v) => setEmpTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={empTplForm.required} onChange={(v) => setEmpTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {empTplError && <p className="text-xs text-red-500">{empTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditEmpFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateEmpTemplate} loading={savingEmpTpl} fullWidth>{t.customFields.updateFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Add JOB field modal ─────────────────────────────────── */}
      <Modal open={addJobFieldModal} onClose={() => setAddJobFieldModal(false)} title={t.customFields.addModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={jobTplForm.field_label}
            onChange={e => setJobTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {jobTplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              {t.customFields.keyLabel}: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(jobTplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={jobTplForm.field_type}
              onChange={e => setJobTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {jobTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={jobTplForm.options_raw}
                onChange={e => setJobTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {jobTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.integer_only} onChange={(v) => setJobTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {jobTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.thousands} onChange={(v) => setJobTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {jobTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.multi} onChange={(v) => setJobTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={jobTplForm.required} onChange={(v) => setJobTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {jobTplError && <p className="text-xs text-red-500">{jobTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddJobFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={addJobTemplate} loading={savingJobTpl} fullWidth>{t.customFields.addFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit JOB field modal ────────────────────────────────── */}
      <Modal open={editJobFieldModal} onClose={() => setEditJobFieldModal(false)} title={t.customFields.editModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={jobTplForm.field_label}
            onChange={e => setJobTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={jobTplForm.field_type}
              onChange={e => setJobTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {jobTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={jobTplForm.options_raw}
                onChange={e => setJobTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {jobTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.integer_only} onChange={(v) => setJobTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {jobTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.thousands} onChange={(v) => setJobTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {jobTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={jobTplForm.multi} onChange={(v) => setJobTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={jobTplForm.required} onChange={(v) => setJobTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {jobTplError && <p className="text-xs text-red-500">{jobTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditJobFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateJobTemplate} loading={savingJobTpl} fullWidth>{t.customFields.updateFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Add INVOICE field modal ─────────────────────────────── */}
      <Modal open={addInvoiceFieldModal} onClose={() => setAddInvoiceFieldModal(false)} title={t.customFields.addModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={invoiceTplForm.field_label}
            onChange={e => setInvoiceTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {invoiceTplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              {t.customFields.keyLabel}: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(invoiceTplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={invoiceTplForm.field_type}
              onChange={e => setInvoiceTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {invoiceTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={invoiceTplForm.options_raw}
                onChange={e => setInvoiceTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {invoiceTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.integer_only} onChange={(v) => setInvoiceTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {invoiceTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.thousands} onChange={(v) => setInvoiceTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {invoiceTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.multi} onChange={(v) => setInvoiceTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={invoiceTplForm.required} onChange={(v) => setInvoiceTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {invoiceTplError && <p className="text-xs text-red-500">{invoiceTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddInvoiceFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={addInvoiceTemplate} loading={savingInvoiceTpl} fullWidth>{t.customFields.addFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit INVOICE field modal ────────────────────────────── */}
      <Modal open={editInvoiceFieldModal} onClose={() => setEditInvoiceFieldModal(false)} title={t.customFields.editModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={invoiceTplForm.field_label}
            onChange={e => setInvoiceTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={invoiceTplForm.field_type}
              onChange={e => setInvoiceTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {invoiceTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={invoiceTplForm.options_raw}
                onChange={e => setInvoiceTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          {invoiceTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.integer_only} onChange={(v) => setInvoiceTplForm(f => ({ ...f, integer_only: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.integerOnlyToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.integerOnlyHint}</p>
            </div>
          )}
          {invoiceTplForm.field_type === 'number' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.thousands} onChange={(v) => setInvoiceTplForm(f => ({ ...f, thousands: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.thousandsToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.thousandsHint}</p>
            </div>
          )}
          {invoiceTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle checked={invoiceTplForm.multi} onChange={(v) => setInvoiceTplForm(f => ({ ...f, multi: v }))} />
                <span className="text-sm text-gray-700 select-none">{t.customFields.multiToggleLabel}</span>
              </div>
              <p className="text-xs text-gray-400">{t.customFields.multiHint}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={invoiceTplForm.required} onChange={(v) => setInvoiceTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {invoiceTplError && <p className="text-xs text-red-500">{invoiceTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditInvoiceFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateInvoiceTemplate} loading={savingInvoiceTpl} fullWidth>{t.customFields.updateFieldBtn}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Language card ────────────────────────────────────────────────────────────
function LanguageCard() {
  const { t: full, locale, setLocale, locales, labels } = useLang();
  const t = full.dashboard.settings.language;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={16} className="text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">{t.heading}</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">{t.subtitle}</p>
      <div className="max-w-xs flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">{t.label}</label>
        <select
          value={locale}
          onChange={e => setLocale(e.target.value as typeof locale)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
        >
          {locales.map(l => (
            <option key={l} value={l}>{labels[l]}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-400 mt-3">{t.savedNote}</p>
    </div>
  );
}

// ─── Google Contacts sync card ────────────────────────────────────────────
interface GoogleStatusData {
  connected: boolean;
  enabled?: boolean;
  contactGroupId?: string | null;
  contactGroupName?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
}

function GoogleSyncCard() {
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const t = full.dashboard.settings.google;
  const tc = full.common;
  // Per-business sync: every Google Sync action targets the active business.
  // Switching workspaces re-fetches status for that business independently.
  const { business } = useApp();
  const businessId = business?.id ?? null;

  const [status, setStatus] = useState<GoogleStatusData>({ connected: false });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // True when the status CHECK failed (missing API config, network, non-2xx)
  // — rendered differently from a real "disconnected" answer so a broken
  // env var doesn't masquerade as a disconnected account.
  const [statusError, setStatusError] = useState(false);

  // Disconnect dialog state. Two options for the user: keep contacts or also
  // remove them from Google. Count is fetched before showing the dialog so
  // they see the real impact.
  const [disconnectModal, setDisconnectModal] = useState(false);
  const [disconnectCount, setDisconnectCount] = useState(0);

  // Backfill prompt state. Shown right after connect if the user has clients
  // that haven't been pushed to Google yet.
  const [backfillModal, setBackfillModal] = useState(false);
  const [backfillCount, setBackfillCount] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ created: number; linked: number } | null>(null);

  // Notes-template state — stuffs custom-field values into the Google
  // biography so they show up on iPhone Contacts.
  const [notesTemplate, setNotesTemplate] = useState('');
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  const fetchStatus = async () => {
    if (!businessId) { setLoading(false); return; }
    if (!apiBaseUrl) {
      // NEXT_PUBLIC_API_URL not configured for this deployment — that's a
      // config problem, not a disconnected account.
      setStatusError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
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
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
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

  // Load the saved template + available custom field labels so the
  // template editor knows which placeholders are valid. Runs once we
  // know which business we're in.
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      const [{ data: biz }, { data: tpl }] = await Promise.all([
        supabase.from('businesses').select('google_sync_notes_template').eq('id', businessId).maybeSingle(),
        supabase.from('client_field_templates').select('field_label').eq('business_id', businessId).order('sort_order'),
      ]);
      if (cancelled) return;
      setNotesTemplate(((biz as { google_sync_notes_template: string | null } | null)?.google_sync_notes_template) ?? '');
      setTemplateLoaded(true);
      // {{Notas}} is always offered as a default placeholder so the user
      // can position their own notes anywhere in the template.
      const customLabels = ((tpl as { field_label: string }[] | null) ?? [])
        .map(r => r.field_label)
        .filter(Boolean);
      setAvailableFields(['Notas', ...customLabels]);
    })();
    return () => { cancelled = true; };
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
    setTemplateMsg(
      error
        ? { text: `${t.templateSaveError} (${error.message})`, isError: true }
        : { text: t.templateSaved, isError: false },
    );
  };

  // Re-apply the current template to every already-synced Google contact.
  // Throttled + cancellable via the banner's update queue.
  const syncBanner = useGoogleSyncBanner();
  const onReapplyTemplate = async () => {
    if (!businessId) return;
    // Synced clients AND synced client_contacts — see mobile equivalent
    // for why both are needed (template renders on contact bios too).
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
    const ok = window.confirm(
      `${t.templateReapplyConfirmTitle}\n\n${t.templateReapplyConfirmBody.replace('{{count}}', String(total))}`,
    );
    if (!ok) return;
    syncBanner.runUpdateBatch(clientIds, contactIds);
  };

  // Re-fetch status whenever the active business changes — connection state
  // is per-business, so switching workspaces should immediately reflect
  // that business's own credentials.
  useEffect(() => {
    void fetchStatus();
    // If we just got back from an OAuth link flow, the URL has ?google_synced=1.
    // Status is fetched fresh anyway — strip the param to keep the URL clean.
    const params = new URLSearchParams(window.location.search);
    if (params.has('google_synced')) {
      params.delete('google_synced');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      // Prompt the user to backfill existing clients now that we're connected.
      void maybeOfferBackfill();
    }
  }, [businessId]);

  // Check how many clients still need to be pushed to Google. If > 0, open
  // the backfill modal so the user can choose to sync them all at once.
  const maybeOfferBackfill = async () => {
    if (!businessId) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
      if (!jwt || !apiBaseUrl) return;
      const r = await fetch(`${apiBaseUrl}/api/v1/google-sync/unsynced-count?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!r.ok) return;
      const json = await r.json();
      const count = json?.data?.count ?? 0;
      if (count > 0) {
        setBackfillCount(count);
        setBackfillModal(true);
        setBackfillResult(null);
      }
    } catch {
      // ignore
    }
  };

  const runBackfill = async () => {
    if (!businessId) return;
    setBackfilling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ business_id: businessId }),
      });
      if (res.ok) {
        const json = await res.json();
        setBackfillResult({
          created: json?.data?.created ?? 0,
          linked: json?.data?.linked ?? 0,
        });
      } else {
        setBackfillResult({ created: 0, linked: 0 });
      }
    } catch {
      setBackfillResult({ created: 0, linked: 0 });
    }
    setBackfilling(false);
  };

  useEffect(() => {
    if (status.connected) void fetchGroups();
  }, [status.connected, businessId]);

  const onConnect = async () => {
    if (!businessId) return;
    setBusy(true);

    // Direct OAuth against Google — bypasses Supabase's linkIdentity flow,
    // same reasoning as mobile (Supabase strips refresh_token on relink).
    // The Web OAuth client_id is public; the secret stays on the API
    // server and is only used in the /exchange-code endpoint we hit from
    // /auth/google-callback.
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!googleClientId) {
      setBusy(false);
      // eslint-disable-next-line no-alert
      alert('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in web/.env.local');
      return;
    }

    // CSRF protection: random nonce stored in sessionStorage; the callback
    // verifies the state param matches. business_id is encoded in the
    // same state blob so the callback knows which business to attach to.
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('amixos-google-oauth-state', nonce);
    const state = btoa(JSON.stringify({ nonce, business_id: businessId }));
    const redirectUri = `${window.location.origin}/auth/google-callback`;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/contacts');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('include_granted_scopes', 'true');

    window.location.href = authUrl.toString();
    // Page redirects — busy state will reset on full reload after callback.
  };

  const openDisconnectDialog = async () => {
    if (!businessId) return;
    // Fetch the count of synced contacts so the dialog can show the real
    // impact before the user picks Keep / Remove.
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
      const res = await fetch(`${apiBaseUrl}/api/v1/google-sync/synced-count?business_id=${businessId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDisconnectCount(json?.data?.count ?? 0);
      } else {
        setDisconnectCount(0);
      }
    } catch {
      setDisconnectCount(0);
    }
    setBusy(false);
    setDisconnectModal(true);
  };

  const performDisconnect = async (deleteContacts: boolean) => {
    if (!businessId) return;
    setDisconnectModal(false);
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? '';
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ delete_contacts: deleteContacts, business_id: businessId }),
      });
    } catch {
      // ignore
    }
    await fetchStatus();
    setBusy(false);
  };

  const onGroupChange = async (groupId: string) => {
    if (!businessId) return;
    const found = groups.find(g => g.id === groupId);
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? '';
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
    } catch {
      // ignore
    }
    await fetchStatus();
    setBusy(false);
  };

  const statusLabel = !status.connected
    ? t.disconnected
    : status.enabled === false
      ? t.reconnectNeeded
      : t.connected;
  const statusColor = !status.connected
    ? 'text-gray-500'
    : status.enabled === false
      ? 'text-amber-600'
      : 'text-emerald-600';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">{t.heading}</h2>
      <p className="text-xs text-gray-400 mb-1">{t.subtitle}</p>
      {business?.name ? (
        <p className="text-xs text-gray-500 font-medium mb-4">
          {t.scopeNote.replace('{{name}}', business.name)}
        </p>
      ) : null}

      {statusError ? (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-700">
          {t.statusCheckError}
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className={`text-sm font-semibold ${statusColor}`}>
            {loading ? '…' : statusLabel}
          </p>
          {status.lastSyncAt ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {t.lastSyncedAt}: {formatDateTimeLong(status.lastSyncAt, locale)}
            </p>
          ) : null}
          {status.lastSyncError ? (
            <p className="text-xs text-red-500 mt-0.5">
              {t.lastSyncError}: {status.lastSyncError}
            </p>
          ) : null}
        </div>
      </div>

      {status.connected && status.enabled !== false ? (
        <div className="max-w-xs flex flex-col gap-1.5 mb-4">
          <label className="text-sm font-medium text-gray-700">{t.contactGroupLabel}</label>
          <select
            value={status.contactGroupId ?? ''}
            onChange={e => onGroupChange(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          >
            <option value="">{t.contactGroupNoneOption}</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Force-sync sits above Disconnect — same handler as the
          "Apply to existing contacts" button down in the template card,
          but surfaced near the connection controls where users naturally
          look for sync actions. Re-pushes every synced client + contact
          using the current template. */}
      {status.connected && status.enabled !== false ? (
        <div className="mb-4 flex flex-col gap-2">
          <Button onClick={onReapplyTemplate}>{t.forceSyncBtn}</Button>
          <Button variant="secondary" onClick={openDisconnectDialog} loading={busy}>
            {t.disconnectBtn}
          </Button>
        </div>
      ) : null}

      {/* Notes-template editor — visible when connected. Lets the user
          stuff custom-field values into the Google biography so they
          show on iPhone Contacts (which hides Google's userDefined fields). */}
      {status.connected && status.enabled !== false && templateLoaded ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col gap-2 mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t.templateTitle}</h3>
          <p className="text-xs text-gray-500 leading-5">{t.templateHint}</p>
          <textarea
            value={notesTemplate}
            onChange={e => setNotesTemplate(e.target.value)}
            placeholder={t.templatePlaceholder}
            rows={5}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-y"
          />
          {availableFields.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-gray-500 mr-1">{t.templateAvailable}:</span>
              {availableFields.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNotesTemplate(prev => {
                    const sep = prev && !prev.endsWith('\n') ? '\n' : '';
                    const insertion = label === 'Notas'
                      ? `{{${label}}}`
                      : `${label}: {{${label}}}`;
                    return `${prev}${sep}${insertion}`;
                  })}
                  className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-gray-200 text-xs text-gray-700 font-mono"
                >
                  {`{{${label}}}`}
                </button>
              ))}
            </div>
          ) : null}
          {templateMsg ? (
            <p className={`text-xs ${templateMsg.isError ? 'text-red-600' : 'text-emerald-600'}`}>
              {templateMsg.text}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveTemplate} loading={savingTemplate}>
              {savingTemplate ? t.templateSaving : t.templateSaveBtn}
            </Button>
            <Button variant="secondary" onClick={onReapplyTemplate}>
              {t.templateReapplyBtn}
            </Button>
          </div>
        </div>
      ) : null}

      {!status.connected || status.enabled === false ? (
        <Button onClick={onConnect} loading={busy}>
          {status.enabled === false ? t.reconnectBtn : t.connectBtn}
        </Button>
      ) : null}

      <Modal open={disconnectModal} onClose={() => setDisconnectModal(false)} title={t.disconnectTitle} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">{t.disconnectBody}</p>
          <p className="text-sm text-gray-900 font-medium">
            {disconnectCount > 0
              ? t.disconnectCountWithNumber.replace('{{count}}', String(disconnectCount))
              : t.disconnectCountGeneric}
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => performDisconnect(false)} fullWidth>
              {t.disconnectKeepBtn}
            </Button>
            <button
              onClick={() => performDisconnect(true)}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              {t.disconnectDeleteBtn}
            </button>
            <Button variant="secondary" onClick={() => setDisconnectModal(false)} fullWidth>
              {tc.buttons.cancel}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Backfill prompt — shown automatically after connect if there are
          un-synced clients. After the API call finishes we keep the modal
          open to show "X added, Y linked" then a Close button. */}
      <Modal
        open={backfillModal}
        onClose={() => !backfilling && setBackfillModal(false)}
        title={t.backfillTitle}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          {!backfillResult ? (
            <>
              <p className="text-sm text-gray-600">
                {t.backfillBody.replace('{{count}}', String(backfillCount))}
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={runBackfill} loading={backfilling} fullWidth>
                  {backfilling
                    ? t.backfillProgress.replace('{{count}}', String(backfillCount))
                    : t.backfillSyncBtn}
                </Button>
                <Button variant="secondary" onClick={() => setBackfillModal(false)} disabled={backfilling} fullWidth>
                  {t.backfillSkipBtn}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-900 font-semibold">{t.backfillDoneTitle}</p>
              <p className="text-sm text-gray-600">
                {t.backfillDoneBody
                  .replace('{{created}}', String(backfillResult.created))
                  .replace('{{linked}}', String(backfillResult.linked))}
              </p>
              <Button onClick={() => setBackfillModal(false)} fullWidth>
                {tc.buttons.close}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

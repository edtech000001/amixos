'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, Save, Plus, Pencil, Trash2, GripVertical, Sliders, Globe, ChevronUp, ChevronDown, Sparkles, LogOut } from 'lucide-react';
import { isValidEmail } from '@amixos/shared/lib/validation';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsNav, type SettingsTab } from '@/components/dashboard/SettingsNav';
import { formatDateTimeLong, formatPhoneInput } from '@amixos/shared/lib/format';
import {
  DAY_KEYS,
  DEFAULT_OPERATING_HOURS,
  normalizeOperatingHours,
  type DayKey,
  type OperatingHours,
} from '@amixos/shared/lib/operatingHours';
import { moveTemplate } from '@amixos/shared/lib/fieldTemplates';
import { useGoogleSyncBanner } from '@amixos/shared/lib/googleSyncBanner';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

type Tab = 'negocio' | 'trabajos' | 'clientes' | 'empleados' | 'facturas' | 'conexiones' | 'cuenta';

const PIPELINE_STEP_KEYS = ['proposal', 'sent', 'accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'] as const;

const DEFAULT_EMPLOYEE_FIELD_KEYS = [
  'first_name', 'last_name', 'phone', 'email',
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
  'scheduled_date', 'time_start', 'time_end',
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
  const { business, user, refetchBusiness, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tc = full.common;
  const tFields = full.dashboard.clients.fields;
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'negocio');

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

  const FIELD_TYPES: Record<string, string> = {
    text: t.fieldTypes.text,
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
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState('');
  const [invoiceMsgIsError, setInvoiceMsgIsError] = useState(false);

  // ── Invoice required standard fields
  const [invoiceFieldRequired, setInvoiceFieldRequired] = useState<Record<string, boolean>>(
    business?.invoice_field_required ?? {},
  );
  const [savingInvoiceReq, setSavingInvoiceReq] = useState(false);
  const [invoiceReqMsg, setInvoiceReqMsg] = useState('');
  const [invoiceReqMsgIsError, setInvoiceReqMsgIsError] = useState(false);

  // ── Custom field templates (invoices) — same shape as clients/jobs, but
  // invoices have no standard fields, so it's a flat custom-only list.
  const [invoiceTemplates, setInvoiceTemplates] = useState<FieldTemplate[]>([]);
  const [addInvoiceFieldModal, setAddInvoiceFieldModal] = useState(false);
  const [editInvoiceFieldModal, setEditInvoiceFieldModal] = useState(false);
  const [editingInvoiceTpl, setEditingInvoiceTpl] = useState<FieldTemplate | null>(null);
  const [invoiceTplForm, setInvoiceTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
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
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwMsgIsError, setPwMsgIsError] = useState(false);

  // ── Client field preferences
  const [fieldRequired, setFieldRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {}
  );
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsMsg, setFieldsMsg] = useState('');
  const [fieldsMsgIsError, setFieldsMsgIsError] = useState(false);

  // ── Contacts summary — clients + client_contacts (what syncs to Google).
  // Employees do NOT mirror to Google, so they're excluded from the count.
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [contactsCount, setContactsCount] = useState<number | null>(null);

  // ── Custom field templates (clients)
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [addFieldModal, setAddFieldModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<FieldTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  // ── Custom field templates (employees) — same shape, separate table.
  const [empTemplates, setEmpTemplates] = useState<FieldTemplate[]>([]);
  const [addEmpFieldModal, setAddEmpFieldModal] = useState(false);
  const [editEmpFieldModal, setEditEmpFieldModal] = useState(false);
  const [editingEmpTpl, setEditingEmpTpl] = useState<FieldTemplate | null>(null);
  const [empTplForm, setEmpTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingEmpTpl, setSavingEmpTpl] = useState(false);
  const [empTplError, setEmpTplError] = useState('');

  // ── Job pipeline config
  const [pipelineDisabled, setPipelineDisabled] = useState<Record<string, boolean>>(
    business?.job_pipeline_disabled ?? {}
  );
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState('');
  const [pipelineMsgIsError, setPipelineMsgIsError] = useState(false);

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
      setInvoiceFieldRequired(business.invoice_field_required ?? {});
      setOperatingHours(normalizeOperatingHours(business.operating_hours) ?? DEFAULT_OPERATING_HOURS);
      setFieldRequired(business.client_field_required ?? {});
      setPipelineDisabled(business.job_pipeline_disabled ?? {});
    }
  }, [business]);

  useEffect(() => { loadTemplates(); }, [business]);

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
    if (!error) await refetchBusiness();
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
    setSavingInvoice(true); setInvoiceMsg('');
    const { error } = await supabase.from('businesses').update({
      invoice_due_days: days,
      invoice_notes_default: bizInvoiceNotes.trim() || null,
    }).eq('id', business.id);
    setInvoiceMsgIsError(!!error);
    setInvoiceMsg(error ? t.invoices.saveError : t.invoices.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingInvoice(false);
  };

  // ── Invoice required standard fields
  const toggleInvoiceFieldRequired = (key: string) => {
    setInvoiceFieldRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setInvoiceReqMsg('');
  };

  const saveInvoiceRequired = async () => {
    if (!business) return;
    setSavingInvoiceReq(true); setInvoiceReqMsg('');
    const { error } = await supabase.from('businesses')
      .update({ invoice_field_required: invoiceFieldRequired })
      .eq('id', business.id);
    setInvoiceReqMsgIsError(!!error);
    setInvoiceReqMsg(error ? t.requiredFields.saveError : t.requiredFields.saveSuccess);
    if (!error) await refetchBusiness();
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

  // ── Client field preferences
  const toggleFieldRequired = (key: string) => {
    setFieldRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setFieldsMsg('');
  };

  const saveFieldPreferences = async () => {
    if (!business) return;
    setSavingFields(true); setFieldsMsg('');
    const { error } = await supabase.from('businesses')
      .update({ client_field_required: fieldRequired })
      .eq('id', business.id);
    setFieldsMsgIsError(!!error);
    setFieldsMsg(error ? t.requiredFields.saveError : t.requiredFields.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingFields(false);
  };

  // ── Unified field list (standard + custom interleaved) ────────────────
  // `client_field_order` is a single JSONB array of identifiers. Each entry
  // is either a standard field key ("phone_cell") or a custom-template ref
  // ("custom:<uuid>"). Lets users put custom fields above/below default ones.
  type UnifiedItem =
    | { kind: 'standard'; key: string; label: string }
    | { kind: 'custom'; key: string; label: string; tpl: FieldTemplate };

  const clientItems: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_CLIENT_FIELDS.map(f => ({
      kind: 'standard', key: f.key, label: f.label,
    }));
    const customItems: UnifiedItem[] = templates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    const saved = business?.client_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  })();

  // ── Employee field config (same shape as clients) ────────────────────
  const tEmpModal = full.dashboard.employees.modal;
  const EMP_FIELD_LABELS: Record<string, string> = {
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

  const [empRequired, setEmpRequired] = useState<Record<string, boolean>>(
    business?.employee_field_required ?? {}
  );
  const [savingEmpRequired, setSavingEmpRequired] = useState(false);
  const [empReqMsg, setEmpReqMsg] = useState('');
  const [empReqMsgIsError, setEmpReqMsgIsError] = useState(false);

  useEffect(() => {
    if (business) setEmpRequired(business.employee_field_required ?? {});
  }, [business]);

  const toggleEmpRequired = (key: string) => {
    setEmpRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setEmpReqMsg('');
  };

  const saveEmpRequired = async () => {
    if (!business) return;
    setSavingEmpRequired(true); setEmpReqMsg('');
    const { error } = await supabase.from('businesses')
      .update({ employee_field_required: empRequired })
      .eq('id', business.id);
    setEmpReqMsgIsError(!!error);
    setEmpReqMsg(error ? t.requiredFields.saveError : t.requiredFields.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingEmpRequired(false);
  };

  const empItems: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_EMPLOYEE_FIELD_KEYS.map((k) => ({
      kind: 'standard', key: k, label: EMP_FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = empTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    const saved = business?.employee_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  })();

  const moveEmpItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = empItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= empItems.length) return;
    const next = [...empItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ employee_field_order: next.map(i => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

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
    scheduled_date: tJobNew.dateLabel,
    time_start: tJobNew.timeStartLabel,
    time_end: tJobNew.timeEndLabel,
    assigned_workers: tJobNew.workersHeading,
    worker_notes: tJobNew.workerNoteLabel,
    internal_notes: tJobNew.internalNoteLabelJob,
  };

  const [jobRequired, setJobRequired] = useState<Record<string, boolean>>(
    business?.job_field_required ?? {}
  );
  const [savingJobRequired, setSavingJobRequired] = useState(false);
  const [jobReqMsg, setJobReqMsg] = useState('');
  const [jobReqMsgIsError, setJobReqMsgIsError] = useState(false);
  const [jobTemplates, setJobTemplates] = useState<FieldTemplate[]>([]);
  const [addJobFieldModal, setAddJobFieldModal] = useState(false);
  const [editJobFieldModal, setEditJobFieldModal] = useState(false);
  const [editingJobTpl, setEditingJobTpl] = useState<FieldTemplate | null>(null);
  const [jobTplForm, setJobTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingJobTpl, setSavingJobTpl] = useState(false);
  const [jobTplError, setJobTplError] = useState('');

  useEffect(() => {
    if (business) setJobRequired(business.job_field_required ?? {});
  }, [business]);

  const loadJobTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('job_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setJobTemplates(data ?? []);
  };
  useEffect(() => { loadJobTemplates(); }, [business]);

  const toggleJobRequired = (key: string) => {
    setJobRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setJobReqMsg('');
  };

  const saveJobRequired = async () => {
    if (!business) return;
    setSavingJobRequired(true); setJobReqMsg('');
    const { error } = await supabase.from('businesses')
      .update({ job_field_required: jobRequired })
      .eq('id', business.id);
    setJobReqMsgIsError(!!error);
    setJobReqMsg(error ? t.requiredFields.saveError : t.requiredFields.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingJobRequired(false);
  };

  // Job template CRUD — same shape as employee templates.
  const addJobTemplate = async () => {
    if (!jobTplForm.field_label.trim()) { setJobTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(jobTplForm.field_label);
    if (jobTemplates.some(tpl => tpl.field_key === key)) { setJobTplError(t.customFields.errorDuplicate); return; }
    setSavingJobTpl(true); setJobTplError('');
    const options = jobTplForm.field_type === 'select'
      ? jobTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('job_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: jobTplForm.field_label.trim(),
      field_type: jobTplForm.field_type, field_options: options,
      required: jobTplForm.required, sort_order: jobTemplates.length,
    });
    if (error) { setJobTplError(t.customFields.errorSave); setSavingJobTpl(false); return; }
    await loadJobTemplates();
    setJobTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingJobTpl(false); setAddJobFieldModal(false);
  };

  const removeJobTemplate = async (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    await supabase.from('job_field_templates').delete().eq('id', id);
    setJobTemplates(prev => prev.filter(tpl => tpl.id !== id));
  };

  const openEditJobTemplate = (tpl: FieldTemplate) => {
    setEditingJobTpl(tpl);
    setJobTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setJobTplError('');
    setEditJobFieldModal(true);
  };

  const updateJobTemplate = async () => {
    if (!editingJobTpl || !jobTplForm.field_label.trim()) { setJobTplError(t.customFields.errorNameRequired); return; }
    setSavingJobTpl(true); setJobTplError('');
    const options = jobTplForm.field_type === 'select'
      ? jobTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('job_field_templates').update({
      field_label: jobTplForm.field_label.trim(), field_type: jobTplForm.field_type,
      field_options: options, required: jobTplForm.required,
    }).eq('id', editingJobTpl.id);
    if (error) { setJobTplError(t.customFields.errorSave); setSavingJobTpl(false); return; }
    await loadJobTemplates();
    setSavingJobTpl(false); setEditJobFieldModal(false); setEditingJobTpl(null);
  };

  const jobItems: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_JOB_FIELD_KEYS.map((k) => ({
      kind: 'standard', key: k, label: JOB_FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = jobTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    const saved = business?.job_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  })();

  const moveJobItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = jobItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= jobItems.length) return;
    const next = [...jobItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ job_field_order: next.map(i => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  // ── Crew mode + per-worker assignment field config ─────────────────────
  // Mirrors the job-template UI but targets job_assignment_field_templates
  // and businesses.assignment_field_required / assignment_field_order.
  const DEFAULT_ASSIGNMENT_FIELD_KEYS = ['hours_worked'] as const;
  const ASGN_FIELD_LABELS: Record<string, string> = {
    hours_worked: full.dashboard.jobs.actuals.hoursWorkedLabel,
  };

  const [crewMode, setCrewMode] = useState<boolean>(business?.job_crew_mode ?? true);
  const [savingCrewMode, setSavingCrewMode] = useState(false);
  const [crewModeMsg, setCrewModeMsg] = useState('');
  const [crewModeMsgIsError, setCrewModeMsgIsError] = useState(false);

  const [asgnRequired, setAsgnRequired] = useState<Record<string, boolean>>(
    business?.assignment_field_required ?? {}
  );
  const [savingAsgnRequired, setSavingAsgnRequired] = useState(false);
  const [asgnReqMsg, setAsgnReqMsg] = useState('');
  const [asgnReqMsgIsError, setAsgnReqMsgIsError] = useState(false);
  const [asgnTemplates, setAsgnTemplates] = useState<FieldTemplate[]>([]);
  const [addAsgnFieldModal, setAddAsgnFieldModal] = useState(false);
  const [editAsgnFieldModal, setEditAsgnFieldModal] = useState(false);
  const [editingAsgnTpl, setEditingAsgnTpl] = useState<FieldTemplate | null>(null);
  const [asgnTplForm, setAsgnTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingAsgnTpl, setSavingAsgnTpl] = useState(false);
  const [asgnTplError, setAsgnTplError] = useState('');

  useEffect(() => {
    if (business) {
      setCrewMode(business.job_crew_mode ?? true);
      setAsgnRequired(business.assignment_field_required ?? {});
    }
  }, [business]);

  const loadAsgnTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('job_assignment_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setAsgnTemplates(data ?? []);
  };
  useEffect(() => { loadAsgnTemplates(); }, [business]);

  const saveCrewMode = async () => {
    if (!business) return;
    setSavingCrewMode(true); setCrewModeMsg('');
    const { error } = await supabase.from('businesses')
      .update({ job_crew_mode: crewMode })
      .eq('id', business.id);
    setCrewModeMsgIsError(!!error);
    setCrewModeMsg(error ? t.crewMode.saveError : t.crewMode.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingCrewMode(false);
  };

  const toggleAsgnRequired = (key: string) => {
    setAsgnRequired(prev => ({ ...prev, [key]: !prev[key] }));
    setAsgnReqMsg('');
  };

  const saveAsgnRequired = async () => {
    if (!business) return;
    setSavingAsgnRequired(true); setAsgnReqMsg('');
    const { error } = await supabase.from('businesses')
      .update({ assignment_field_required: asgnRequired })
      .eq('id', business.id);
    setAsgnReqMsgIsError(!!error);
    setAsgnReqMsg(error ? t.requiredFields.saveError : t.requiredFields.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingAsgnRequired(false);
  };

  const addAsgnTemplate = async () => {
    if (!asgnTplForm.field_label.trim()) { setAsgnTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(asgnTplForm.field_label);
    if (asgnTemplates.some(tpl => tpl.field_key === key)) { setAsgnTplError(t.customFields.errorDuplicate); return; }
    setSavingAsgnTpl(true); setAsgnTplError('');
    const options = asgnTplForm.field_type === 'select'
      ? asgnTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('job_assignment_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: asgnTplForm.field_label.trim(),
      field_type: asgnTplForm.field_type, field_options: options,
      required: asgnTplForm.required, sort_order: asgnTemplates.length,
    });
    if (error) { setAsgnTplError(t.customFields.errorSave); setSavingAsgnTpl(false); return; }
    await loadAsgnTemplates();
    setAsgnTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingAsgnTpl(false); setAddAsgnFieldModal(false);
  };

  const removeAsgnTemplate = async (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    await supabase.from('job_assignment_field_templates').delete().eq('id', id);
    setAsgnTemplates(prev => prev.filter(tpl => tpl.id !== id));
  };

  const openEditAsgnTemplate = (tpl: FieldTemplate) => {
    setEditingAsgnTpl(tpl);
    setAsgnTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setAsgnTplError('');
    setEditAsgnFieldModal(true);
  };

  const updateAsgnTemplate = async () => {
    if (!editingAsgnTpl || !asgnTplForm.field_label.trim()) { setAsgnTplError(t.customFields.errorNameRequired); return; }
    setSavingAsgnTpl(true); setAsgnTplError('');
    const options = asgnTplForm.field_type === 'select'
      ? asgnTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('job_assignment_field_templates').update({
      field_label: asgnTplForm.field_label.trim(), field_type: asgnTplForm.field_type,
      field_options: options, required: asgnTplForm.required,
    }).eq('id', editingAsgnTpl.id);
    if (error) { setAsgnTplError(t.customFields.errorSave); setSavingAsgnTpl(false); return; }
    await loadAsgnTemplates();
    setSavingAsgnTpl(false); setEditAsgnFieldModal(false); setEditingAsgnTpl(null);
  };

  const asgnItems: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_ASSIGNMENT_FIELD_KEYS.map((k) => ({
      kind: 'standard', key: k, label: ASGN_FIELD_LABELS[k] ?? k,
    }));
    const customItems: UnifiedItem[] = asgnTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    const saved = business?.assignment_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  })();

  const moveAsgnItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = asgnItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= asgnItems.length) return;
    const next = [...asgnItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ assignment_field_order: next.map(i => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  const moveClientItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = clientItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= clientItems.length) return;
    const next = [...clientItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ client_field_order: next.map(i => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
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
    if (!error) await refetchBusiness();
    setSavingPipeline(false);
  };

  // ── Custom field template CRUD
  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('client_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setTemplates(data ?? []);
  };

  const toKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addTemplate = async () => {
    if (!tplForm.field_label.trim()) { setTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(tplForm.field_label);
    if (templates.some(tpl => tpl.field_key === key)) { setTplError(t.customFields.errorDuplicate); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('client_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type, field_options: options,
      required: tplForm.required, sort_order: templates.length,
    });
    if (error) { setTplError(t.customFields.errorSave); setSavingTpl(false); return; }
    await loadTemplates();
    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingTpl(false); setAddFieldModal(false);
  };

  const removeTemplate = async (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    await supabase.from('client_field_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(tpl => tpl.id !== id));
  };

  const openEditTemplate = (tpl: FieldTemplate) => {
    setEditingTpl(tpl);
    setTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setTplError('');
    setEditFieldModal(true);
  };

  const updateTemplate = async () => {
    if (!editingTpl || !tplForm.field_label.trim()) { setTplError(t.customFields.errorNameRequired); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('client_field_templates').update({
      field_label: tplForm.field_label.trim(), field_type: tplForm.field_type,
      field_options: options, required: tplForm.required,
    }).eq('id', editingTpl.id);
    if (error) { setTplError(t.customFields.errorSave); setSavingTpl(false); return; }
    await loadTemplates();
    setSavingTpl(false); setEditFieldModal(false); setEditingTpl(null);
  };

  // ── Invoice field template CRUD — same shape, separate table. No standard
  // fields, so this list is custom-only.
  const loadInvoiceTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('invoice_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setInvoiceTemplates(data ?? []);
  };

  const addInvoiceTemplate = async () => {
    if (!invoiceTplForm.field_label.trim()) { setInvoiceTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(invoiceTplForm.field_label);
    if (invoiceTemplates.some(tpl => tpl.field_key === key)) { setInvoiceTplError(t.customFields.errorDuplicate); return; }
    setSavingInvoiceTpl(true); setInvoiceTplError('');
    const options = invoiceTplForm.field_type === 'select'
      ? invoiceTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('invoice_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: invoiceTplForm.field_label.trim(),
      field_type: invoiceTplForm.field_type, field_options: options,
      required: invoiceTplForm.required, sort_order: invoiceTemplates.length,
    });
    if (error) { setInvoiceTplError(t.customFields.errorSave); setSavingInvoiceTpl(false); return; }
    await loadInvoiceTemplates();
    setInvoiceTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingInvoiceTpl(false); setAddInvoiceFieldModal(false);
  };

  const removeInvoiceTemplate = async (id: string) => {
    if (!confirm(t.invoices.confirmDeleteField)) return;
    await supabase.from('invoice_field_templates').delete().eq('id', id);
    setInvoiceTemplates(prev => prev.filter(tpl => tpl.id !== id));
  };

  const openEditInvoiceTemplate = (tpl: FieldTemplate) => {
    setEditingInvoiceTpl(tpl);
    setInvoiceTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setInvoiceTplError('');
    setEditInvoiceFieldModal(true);
  };

  const updateInvoiceTemplate = async () => {
    if (!editingInvoiceTpl || !invoiceTplForm.field_label.trim()) { setInvoiceTplError(t.customFields.errorNameRequired); return; }
    setSavingInvoiceTpl(true); setInvoiceTplError('');
    const options = invoiceTplForm.field_type === 'select'
      ? invoiceTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('invoice_field_templates').update({
      field_label: invoiceTplForm.field_label.trim(), field_type: invoiceTplForm.field_type,
      field_options: options, required: invoiceTplForm.required,
    }).eq('id', editingInvoiceTpl.id);
    if (error) { setInvoiceTplError(t.customFields.errorSave); setSavingInvoiceTpl(false); return; }
    await loadInvoiceTemplates();
    setSavingInvoiceTpl(false); setEditInvoiceFieldModal(false); setEditingInvoiceTpl(null);
  };

  useEffect(() => { loadInvoiceTemplates(); }, [business]);

  // ── Unified invoice-fields list (standard + custom interleaved) ───────
  const invoiceItems: UnifiedItem[] = (() => {
    const standardItems: UnifiedItem[] = DEFAULT_INVOICE_FIELDS.map(f => ({
      kind: 'standard', key: f.key, label: f.label,
    }));
    const customItems: UnifiedItem[] = invoiceTemplates.map(tpl => ({
      kind: 'custom', key: `custom:${tpl.id}`, label: tpl.field_label, tpl,
    }));
    const all = [...standardItems, ...customItems];
    const byKey = new Map(all.map(it => [it.key, it]));

    const saved = business?.invoice_field_order ?? null;
    if (!Array.isArray(saved) || saved.length === 0) return all;

    const ordered: UnifiedItem[] = [];
    for (const k of saved) {
      const item = typeof k === 'string' ? byKey.get(k) : undefined;
      if (item) ordered.push(item);
    }
    const used = new Set(ordered.map(i => i.key));
    return [...ordered, ...all.filter(i => !used.has(i.key))];
  })();

  const moveInvoiceItem = async (key: string, direction: 'up' | 'down') => {
    if (!business) return;
    const idx = invoiceItems.findIndex(i => i.key === key);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || otherIdx < 0 || otherIdx >= invoiceItems.length) return;
    const next = [...invoiceItems];
    [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
    await supabase
      .from('businesses')
      .update({ invoice_field_order: next.map(i => i.key) })
      .eq('id', business.id);
    await refetchBusiness();
  };

  // ── Employee field template CRUD — same shape, separate table.
  const loadEmpTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('employee_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setEmpTemplates(data ?? []);
  };

  const addEmpTemplate = async () => {
    if (!empTplForm.field_label.trim()) { setEmpTplError(t.customFields.errorNameRequired); return; }
    const key = toKey(empTplForm.field_label);
    if (empTemplates.some(tpl => tpl.field_key === key)) { setEmpTplError(t.customFields.errorDuplicate); return; }
    setSavingEmpTpl(true); setEmpTplError('');
    const options = empTplForm.field_type === 'select'
      ? empTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('employee_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: empTplForm.field_label.trim(),
      field_type: empTplForm.field_type, field_options: options,
      required: empTplForm.required, sort_order: empTemplates.length,
    });
    if (error) { setEmpTplError(t.customFields.errorSave); setSavingEmpTpl(false); return; }
    await loadEmpTemplates();
    setEmpTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingEmpTpl(false); setAddEmpFieldModal(false);
  };

  const removeEmpTemplate = async (id: string) => {
    if (!confirm(t.customFields.confirmDelete)) return;
    await supabase.from('employee_field_templates').delete().eq('id', id);
    setEmpTemplates(prev => prev.filter(tpl => tpl.id !== id));
  };

  const openEditEmpTemplate = (tpl: FieldTemplate) => {
    setEditingEmpTpl(tpl);
    setEmpTplForm({
      field_label: tpl.field_label, field_type: tpl.field_type,
      required: tpl.required, options_raw: tpl.field_options?.join('\n') ?? '',
    });
    setEmpTplError('');
    setEditEmpFieldModal(true);
  };

  const updateEmpTemplate = async () => {
    if (!editingEmpTpl || !empTplForm.field_label.trim()) { setEmpTplError(t.customFields.errorNameRequired); return; }
    setSavingEmpTpl(true); setEmpTplError('');
    const options = empTplForm.field_type === 'select'
      ? empTplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('employee_field_templates').update({
      field_label: empTplForm.field_label.trim(), field_type: empTplForm.field_type,
      field_options: options, required: empTplForm.required,
    }).eq('id', editingEmpTpl.id);
    if (error) { setEmpTplError(t.customFields.errorSave); setSavingEmpTpl(false); return; }
    await loadEmpTemplates();
    setSavingEmpTpl(false); setEditEmpFieldModal(false); setEditingEmpTpl(null);
  };

  useEffect(() => { loadEmpTemplates(); }, [business]);

  return (
    <div className="md:flex md:min-h-screen">
      {/* Settings rail — shared with the Equipo/Actividad sub-pages so the nav
          stays consistent across the whole Settings section. */}
      <SettingsNav activeTab={tab as SettingsTab} onTabClick={(next) => setTab(next as Tab)} />

      {/* Content */}
      <div className="flex-1 min-w-0 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.title}</h1>

          {/* ══ NEGOCIO ══════════════════════════════════════════════ */}
          {tab === 'negocio' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">{t.business.heading}</h2>
              <p className="text-xs text-gray-400 mb-5">{t.business.subtitle}</p>
              <div className="flex flex-col gap-3 max-w-md">
                <Input label={t.business.nameLabel} value={bizName} onChange={e => setBizName(e.target.value)}/>

                <p className="text-xs font-semibold text-gray-400 uppercase mt-3">{t.business.contactHeading}</p>
                <Input label={t.business.emailLabel} type="email" value={bizEmail} onChange={e => setBizEmail(e.target.value)}/>
                <Input label={t.business.phoneLabel} value={formatPhoneInput(bizPhone)} onChange={e => setBizPhone(formatPhoneInput(e.target.value))}/>
                <Input label={t.business.websiteLabel} value={bizWebsite} onChange={e => setBizWebsite(e.target.value)}/>

                <p className="text-xs font-semibold text-gray-400 uppercase mt-3">{t.business.addressHeading}</p>
                <Input label={t.business.addressLabel} value={bizAddress} onChange={e => setBizAddress(e.target.value)}/>
                <Input label={t.business.cityLabel} value={bizCity} onChange={e => setBizCity(e.target.value)}/>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">{t.business.stateLabel}</label>
                  <select
                    value={bizState}
                    onChange={e => setBizState(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none"
                  >
                    <option value="">—</option>
                    {BIZ_US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Input label={t.business.zipLabel} value={bizZip} onChange={e => setBizZip(e.target.value)}/>

                <p className="text-xs font-semibold text-gray-400 uppercase mt-3">{t.business.legalHeading}</p>
                <Input label={t.business.taxIdLabel} value={bizTaxId} onChange={e => setBizTaxId(e.target.value)}/>
                <Input label={t.business.licenseLabel} value={bizLicense} onChange={e => setBizLicense(e.target.value)}/>

                <p className="text-xs font-semibold text-gray-400 uppercase mt-3">{t.business.operatingHoursHeading}</p>
                <p className="text-xs text-gray-400 -mt-1">{t.business.operatingHoursSub}</p>
                <div className="flex flex-col divide-y divide-gray-50">
                  {DAY_KEYS.map((dk: DayKey) => {
                    const d = operatingHours[dk];
                    const setDay = (patch: Partial<typeof d>) =>
                      setOperatingHours(prev => ({ ...prev, [dk]: { ...prev[dk], ...patch } }));
                    return (
                      <div key={dk} className="flex items-center py-2.5">
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
              </div>
              {bizMsg && <p className={`text-xs mt-3 ${bizMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{bizMsg}</p>}
              <div className="mt-5">
                <Button onClick={saveBusiness} loading={savingBiz}>
                  <Save size={14} className="mr-1.5"/> {tc.buttons.saveChanges}
                </Button>
              </div>
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
                <Button onClick={savePipelineConfig} loading={savingPipeline}>
                  <Save size={14} className="mr-1.5"/> {t.pipeline.saveBtn}
                </Button>
              </div>

              {/* Unified job-fields list (standard + custom interleaved). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.jobsSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setJobTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                    setJobTplError(''); setAddJobFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-5">{t.jobsSection.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {jobItems.map((item, i) => {
                    const isLast = i === jobItems.length - 1;
                    return (
                      <div key={item.key} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.kind === 'custom' && (
                              <Sparkles size={12} className="text-primary shrink-0"/>
                            )}
                            <span className="text-sm text-gray-900">{item.label}</span>
                            {item.kind === 'custom' && item.tpl.required && (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                            )}
                          </div>
                          {item.kind === 'custom' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {FIELD_TYPES[item.tpl.field_type]}
                              {item.tpl.field_type === 'select' && item.tpl.field_options?.length ? ` · ${item.tpl.field_options.join(', ')}` : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col shrink-0">
                          <button
                            onClick={() => moveJobItem(item.key, 'up')}
                            disabled={i === 0}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} className="text-gray-500"/>
                          </button>
                          <button
                            onClick={() => moveJobItem(item.key, 'down')}
                            disabled={isLast}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} className="text-gray-500"/>
                          </button>
                        </div>

                        {item.kind === 'standard' ? (
                          <Toggle checked={!!jobRequired[item.key]} onChange={() => toggleJobRequired(item.key)} />
                        ) : (
                          <>
                            <button onClick={() => openEditJobTemplate(item.tpl)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                              aria-label={tc.buttons.edit}>
                              <Pencil size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => removeJobTemplate(item.tpl.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                              aria-label={tc.buttons.delete}>
                              <Trash2 size={13} className="text-red-400"/>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {jobReqMsg && <p className={`text-xs mb-3 ${jobReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{jobReqMsg}</p>}
                <Button onClick={saveJobRequired} loading={savingJobRequired}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
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
                {crewMode !== (business?.job_crew_mode ?? true) && (
                  <div className="mt-4">
                    <Button onClick={saveCrewMode} loading={savingCrewMode}>
                      <Save size={14} className="mr-1.5"/> {t.crewMode.saveBtn}
                    </Button>
                  </div>
                )}
              </div>

              {/* Per-worker custom fields — what the lead fills out for each
                 worker after the job. Hidden when crew mode is off. */}
              {crewMode && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold text-gray-900">{t.assignmentFieldsSection.title}</h2>
                    <Button size="sm" variant="secondary" onClick={() => {
                      setAsgnTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                      setAsgnTplError(''); setAddAsgnFieldModal(true);
                    }}>
                      <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mb-5">{t.assignmentFieldsSection.subtitle}</p>

                  <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                    {asgnItems.map((item, i) => {
                      const isLast = i === asgnItems.length - 1;
                      return (
                        <div key={item.key} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {item.kind === 'custom' && (
                                <Sparkles size={12} className="text-primary shrink-0"/>
                              )}
                              <span className="text-sm text-gray-900">{item.label}</span>
                              {item.kind === 'custom' && item.tpl.required && (
                                <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                              )}
                            </div>
                            {item.kind === 'custom' && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {FIELD_TYPES[item.tpl.field_type]}
                                {item.tpl.field_type === 'select' && item.tpl.field_options?.length ? ` · ${item.tpl.field_options.join(', ')}` : ''}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col shrink-0">
                            <button
                              onClick={() => moveAsgnItem(item.key, 'up')}
                              disabled={i === 0}
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label="Move up"
                            >
                              <ChevronUp size={14} className="text-gray-500"/>
                            </button>
                            <button
                              onClick={() => moveAsgnItem(item.key, 'down')}
                              disabled={isLast}
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label="Move down"
                            >
                              <ChevronDown size={14} className="text-gray-500"/>
                            </button>
                          </div>

                          {item.kind === 'standard' ? (
                            <Toggle checked={!!asgnRequired[item.key]} onChange={() => toggleAsgnRequired(item.key)} />
                          ) : (
                            <>
                              <button onClick={() => openEditAsgnTemplate(item.tpl)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                                aria-label={tc.buttons.edit}>
                                <Pencil size={13} className="text-blue-400"/>
                              </button>
                              <button onClick={() => removeAsgnTemplate(item.tpl.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                                aria-label={tc.buttons.delete}>
                                <Trash2 size={13} className="text-red-400"/>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {asgnReqMsg && <p className={`text-xs mb-3 ${asgnReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{asgnReqMsg}</p>}
                  <Button onClick={saveAsgnRequired} loading={savingAsgnRequired}>
                    <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ══ CLIENTES ═════════════════════════════════════════════ */}
          {tab === 'clientes' && (
            <div className="flex flex-col gap-5">
              {/* Import CSV — lives here in Ajustes since it's an
                 onboarding/migration action, not a daily one. Navigates
                 to /dashboard/clientes?import=1 which auto-opens the
                 existing import modal there. */}
              <Link
                href="/dashboard/clientes?import=1"
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{full.dashboard.clients.importBtn}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{full.dashboard.clients.importHint}</p>
                </div>
                <span className="text-xl text-gray-400">›</span>
              </Link>

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
                    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                    setTplError(''); setAddFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-5">{t.requiredFields.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {clientItems.map((item, i) => {
                    const isLast = i === clientItems.length - 1;
                    return (
                      <div key={item.key} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.kind === 'custom' && (
                              <Sparkles size={12} className="text-primary shrink-0"/>
                            )}
                            <span className="text-sm text-gray-900">{item.label}</span>
                            {item.kind === 'custom' && item.tpl.required && (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                            )}
                          </div>
                          {item.kind === 'custom' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {FIELD_TYPES[item.tpl.field_type]}
                              {item.tpl.field_type === 'select' && item.tpl.field_options?.length ? ` · ${item.tpl.field_options.join(', ')}` : ''}
                            </p>
                          )}
                        </div>

                        {/* Reorder arrows — operate across the whole list. */}
                        <div className="flex flex-col shrink-0">
                          <button
                            onClick={() => moveClientItem(item.key, 'up')}
                            disabled={i === 0}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} className="text-gray-500"/>
                          </button>
                          <button
                            onClick={() => moveClientItem(item.key, 'down')}
                            disabled={isLast}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} className="text-gray-500"/>
                          </button>
                        </div>

                        {/* Right-side controls differ by kind. */}
                        {item.kind === 'standard' ? (
                          <Toggle checked={!!fieldRequired[item.key]} onChange={() => toggleFieldRequired(item.key)} />
                        ) : (
                          <>
                            <button onClick={() => openEditTemplate(item.tpl)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                              aria-label={tc.buttons.edit}>
                              <Pencil size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => removeTemplate(item.tpl.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                              aria-label={tc.buttons.delete}>
                              <Trash2 size={13} className="text-red-400"/>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {fieldsMsg && <p className={`text-xs mb-3 ${fieldsMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{fieldsMsg}</p>}
                <Button onClick={saveFieldPreferences} loading={savingFields}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>
            </div>
          )}

          {/* ══ EMPLEADOS ═══════════════════════════════════════════════ */}
          {tab === 'empleados' && (
            <div className="flex flex-col gap-5">
              {/* Unified employee-fields list (standard + custom interleaved). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.employeesSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEmpTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                    setEmpTplError(''); setAddEmpFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-5">{t.employeesSection.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {empItems.map((item, i) => {
                    const isLast = i === empItems.length - 1;
                    return (
                      <div key={item.key} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.kind === 'custom' && (
                              <Sparkles size={12} className="text-primary shrink-0"/>
                            )}
                            <span className="text-sm text-gray-900">{item.label}</span>
                            {item.kind === 'custom' && item.tpl.required && (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                            )}
                          </div>
                          {item.kind === 'custom' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {FIELD_TYPES[item.tpl.field_type]}
                              {item.tpl.field_type === 'select' && item.tpl.field_options?.length ? ` · ${item.tpl.field_options.join(', ')}` : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col shrink-0">
                          <button
                            onClick={() => moveEmpItem(item.key, 'up')}
                            disabled={i === 0}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} className="text-gray-500"/>
                          </button>
                          <button
                            onClick={() => moveEmpItem(item.key, 'down')}
                            disabled={isLast}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} className="text-gray-500"/>
                          </button>
                        </div>

                        {item.kind === 'standard' ? (
                          <Toggle checked={!!empRequired[item.key]} onChange={() => toggleEmpRequired(item.key)} />
                        ) : (
                          <>
                            <button onClick={() => openEditEmpTemplate(item.tpl)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                              aria-label={tc.buttons.edit}>
                              <Pencil size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => removeEmpTemplate(item.tpl.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                              aria-label={tc.buttons.delete}>
                              <Trash2 size={13} className="text-red-400"/>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {empReqMsg && <p className={`text-xs mb-3 ${empReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{empReqMsg}</p>}
                <Button onClick={saveEmpRequired} loading={savingEmpRequired}>
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
                <p className="text-sm text-gray-500">{t.account.emailLabel}: <span className="font-medium text-gray-900">{user?.email}</span></p>
              </div>

              {/* Language */}
              <LanguageCard />

              {/* Password */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.password.heading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.password.subtitle}</p>
                <div className="max-w-md flex flex-col gap-3">
                  <Input label={t.password.currentPasswordLabel} type="password" placeholder={t.password.currentPasswordPlaceholder} value={currentPw} onChange={e => setCurrentPw(e.target.value)}/>
                  <Input label={t.password.newPasswordLabel} type="password" placeholder={t.password.newPasswordPlaceholder} value={newPw} onChange={e => setNewPw(e.target.value)}/>
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
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/auth/login';
                }}
                className="flex items-center justify-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} /> {full.dashboard.sidebar.logout}
              </button>
            </div>
          )}

          {/* ══ FACTURAS ═════════════════════════════════════════════ */}
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

              {/* Unified invoice-fields list: standard (required toggle) +
                 custom (edit/delete), reorderable. Same UX as Trabajos. */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.invoicesSection.title}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setInvoiceTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                    setInvoiceTplError(''); setAddInvoiceFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-5">{t.invoicesSection.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {invoiceItems.map((item, i) => {
                    const isLast = i === invoiceItems.length - 1;
                    return (
                      <div key={item.key} className="flex items-center gap-2 px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.kind === 'custom' && (
                              <Sparkles size={12} className="text-primary shrink-0"/>
                            )}
                            <span className="text-sm text-gray-900">{item.label}</span>
                            {item.kind === 'custom' && item.tpl.required && (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                            )}
                          </div>
                          {item.kind === 'custom' && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {FIELD_TYPES[item.tpl.field_type]}
                              {item.tpl.field_type === 'select' && item.tpl.field_options?.length ? ` · ${item.tpl.field_options.join(', ')}` : ''}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col shrink-0">
                          <button
                            onClick={() => moveInvoiceItem(item.key, 'up')}
                            disabled={i === 0}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} className="text-gray-500"/>
                          </button>
                          <button
                            onClick={() => moveInvoiceItem(item.key, 'down')}
                            disabled={isLast}
                            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} className="text-gray-500"/>
                          </button>
                        </div>

                        {item.kind === 'standard' ? (
                          <Toggle checked={!!invoiceFieldRequired[item.key]} onChange={() => toggleInvoiceFieldRequired(item.key)} />
                        ) : (
                          <>
                            <button onClick={() => openEditInvoiceTemplate(item.tpl)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                              aria-label={tc.buttons.edit}>
                              <Pencil size={13} className="text-blue-400"/>
                            </button>
                            <button onClick={() => removeInvoiceTemplate(item.tpl.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                              aria-label={tc.buttons.delete}>
                              <Trash2 size={13} className="text-red-400"/>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {invoiceReqMsg && <p className={`text-xs mb-3 ${invoiceReqMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{invoiceReqMsg}</p>}
                <Button onClick={saveInvoiceRequired} loading={savingInvoiceReq}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>
            </div>
          )}

          {/* ══ CONEXIONES ═══════════════════════════════════════════ */}
          {tab === 'conexiones' && (
            <div className="flex flex-col gap-5">
              <GoogleSyncCard />
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
          <div className="flex items-center gap-3">
            <Toggle checked={tplForm.required} onChange={(v) => setTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {tplError && <p className="text-xs text-red-500">{tplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateTemplate} loading={savingTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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
          <div className="flex items-center gap-3">
            <Toggle checked={empTplForm.required} onChange={(v) => setEmpTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {empTplError && <p className="text-xs text-red-500">{empTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditEmpFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateEmpTemplate} loading={savingEmpTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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

      {/* ── Add ASSIGNMENT (per-worker) field modal ────────────── */}
      <Modal open={addAsgnFieldModal} onClose={() => setAddAsgnFieldModal(false)} title={t.customFields.addModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={asgnTplForm.field_label}
            onChange={e => setAsgnTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {asgnTplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              {t.customFields.keyLabel}: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(asgnTplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={asgnTplForm.field_type}
              onChange={e => setAsgnTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {asgnTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={asgnTplForm.options_raw}
                onChange={e => setAsgnTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={asgnTplForm.required} onChange={(v) => setAsgnTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {asgnTplError && <p className="text-xs text-red-500">{asgnTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddAsgnFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={addAsgnTemplate} loading={savingAsgnTpl} fullWidth>{t.customFields.addFieldBtn}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit ASSIGNMENT field modal ────────────────────────── */}
      <Modal open={editAsgnFieldModal} onClose={() => setEditAsgnFieldModal(false)} title={t.customFields.editModalTitle} size="sm">
        <div className="flex flex-col gap-4">
          <Input label={t.customFields.fieldNameLabel} placeholder={t.customFields.fieldNamePlaceholder}
            value={asgnTplForm.field_label}
            onChange={e => setAsgnTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t.customFields.fieldTypeLabel}</label>
            <select value={asgnTplForm.field_type}
              onChange={e => setAsgnTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {asgnTplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t.customFields.optionsLabel} <span className="text-gray-400 font-normal">{t.customFields.optionsHint}</span>
              </label>
              <textarea rows={4} placeholder={t.customFields.optionsPlaceholder}
                value={asgnTplForm.options_raw}
                onChange={e => setAsgnTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"/>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Toggle checked={asgnTplForm.required} onChange={(v) => setAsgnTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {asgnTplError && <p className="text-xs text-red-500">{asgnTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditAsgnFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateAsgnTemplate} loading={savingAsgnTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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
          <div className="flex items-center gap-3">
            <Toggle checked={jobTplForm.required} onChange={(v) => setJobTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {jobTplError && <p className="text-xs text-red-500">{jobTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditJobFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateJobTemplate} loading={savingJobTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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
          <div className="flex items-center gap-3">
            <Toggle checked={invoiceTplForm.required} onChange={(v) => setInvoiceTplForm(f => ({ ...f, required: v }))} />
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {invoiceTplError && <p className="text-xs text-red-500">{invoiceTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditInvoiceFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateInvoiceTemplate} loading={savingInvoiceTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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
    if (!apiBaseUrl || !businessId) { setLoading(false); return; }
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
      }
    } catch {
      setStatus({ connected: false });
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
      <p className="text-xs text-gray-400 mb-4">{t.subtitle}</p>

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

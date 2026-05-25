'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, User, Save, Users, Plus, Pencil, Trash2, GripVertical, Sliders, ClipboardList, Globe, UserPlus, Activity, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { can } from '@amixos/shared/lib/permissions';
import { formatDateTimeLong } from '@amixos/shared/lib/format';
import { moveTemplate } from '@amixos/shared/lib/fieldTemplates';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

type Tab = 'negocio' | 'trabajos' | 'clientes' | 'empleados' | 'cuenta';

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

export default function AjustesPage() {
  const supabase = createSupabaseClient();
  const { business, user, refetchBusiness, currentRole } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.settings;
  const tc = full.common;
  const tFields = full.dashboard.clients.fields;
  const [tab, setTab] = useState<Tab>('negocio');

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

  const ALL_PIPELINE_STEPS = PIPELINE_STEP_KEYS.map(key => ({
    key,
    label: t.pipelineSteps[key].label,
    description: t.pipelineSteps[key].description,
  }));

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'negocio', label: t.tabs.negocio, icon: Building2 },
    { key: 'trabajos', label: t.tabs.trabajos, icon: ClipboardList },
    { key: 'clientes', label: t.tabs.clientes, icon: Users },
    { key: 'empleados', label: t.tabs.empleados, icon: Users },
    { key: 'cuenta', label: t.tabs.cuenta, icon: User },
  ];

  // ── Business info
  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizCity, setBizCity] = useState(business?.city ?? '');
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState('');
  const [bizMsgIsError, setBizMsgIsError] = useState(false);

  // ── Password
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
      setBizCity(business.city);
      setFieldRequired(business.client_field_required ?? {});
      setPipelineDisabled(business.job_pipeline_disabled ?? {});
    }
  }, [business]);

  useEffect(() => { loadTemplates(); }, [business]);

  // ── Business
  const saveBusiness = async () => {
    if (!business) return;
    setSavingBiz(true); setBizMsg('');
    const { error } = await supabase.from('businesses').update({ name: bizName, city: bizCity }).eq('id', business.id);
    setBizMsgIsError(!!error);
    setBizMsg(error ? t.business.saveError : t.business.saveSuccess);
    if (!error) await refetchBusiness();
    setSavingBiz(false);
  };

  // ── Password
  const savePassword = async () => {
    if (!newPw || newPw.length < 6) {
      setPwMsgIsError(true);
      setPwMsg(t.password.errorMinLength);
      return;
    }
    setSavingPw(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwMsgIsError(!!error);
    setPwMsg(error ? t.password.errorPrefix.replace('{{message}}', error.message) : t.password.successMsg);
    if (!error) setNewPw('');
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
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t.title}</h1>

      <div className="flex gap-6">
        {/* ── Sidebar nav ─────────────────────────────────────────── */}
        <nav className="w-52 shrink-0">
          <div className="flex flex-col gap-1 sticky top-6">
            {TABS.map(tabItem => {
              const Icon = tabItem.icon;
              const active = tab === tabItem.key;
              return (
                <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left w-full ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}>
                  <Icon size={16} className={active ? 'text-primary' : 'text-gray-400'}/>
                  {tabItem.label}
                </button>
              );
            })}
            <Link href="/dashboard/ajustes/equipo"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full">
              <UserPlus size={16} className="text-gray-400"/>
              {t.tabs.equipo}
            </Link>
            {can.seeAuditLog(currentRole) && (
              <Link href="/dashboard/ajustes/actividad"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full">
                <Activity size={16} className="text-gray-400"/>
                {t.tabs.actividad}
              </Link>
            )}
          </div>
        </nav>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* ══ NEGOCIO ══════════════════════════════════════════════ */}
          {tab === 'negocio' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">{t.business.heading}</h2>
              <p className="text-xs text-gray-400 mb-5">{t.business.subtitle}</p>
              <div className="flex flex-col gap-3 max-w-md">
                <Input label={t.business.nameLabel} value={bizName} onChange={e => setBizName(e.target.value)}/>
                <Input label={t.business.cityLabel} value={bizCity} onChange={e => setBizCity(e.target.value)}/>
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
                        <button
                          type="button" role="switch" aria-checked={!isDisabled}
                          onClick={() => togglePipelineStep(step.key)}
                          style={{ width: '44px', height: '24px', flexShrink: 0 }}
                          className={`relative rounded-full transition-colors ${!isDisabled ? 'bg-primary' : 'bg-gray-200'}`}>
                          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            !isDisabled ? 'translate-x-6' : 'translate-x-1'
                          }`}/>
                        </button>
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
                          <button
                            type="button" role="switch" aria-checked={!!jobRequired[item.key]}
                            onClick={() => toggleJobRequired(item.key)}
                            style={{ width: '44px', height: '24px', flexShrink: 0 }}
                            className={`relative rounded-full transition-colors ${jobRequired[item.key] ? 'bg-primary' : 'bg-gray-200'}`}>
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              jobRequired[item.key] ? 'translate-x-6' : 'translate-x-1'
                            }`}/>
                          </button>
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
            </div>
          )}

          {/* ══ CLIENTES ═════════════════════════════════════════════ */}
          {tab === 'clientes' && (
            <div className="flex flex-col gap-5">
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
                          <button
                            type="button" role="switch" aria-checked={!!fieldRequired[item.key]}
                            onClick={() => toggleFieldRequired(item.key)}
                            style={{ width: '44px', height: '24px', flexShrink: 0 }}
                            className={`relative rounded-full transition-colors ${fieldRequired[item.key] ? 'bg-primary' : 'bg-gray-200'}`}>
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              fieldRequired[item.key] ? 'translate-x-6' : 'translate-x-1'
                            }`}/>
                          </button>
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
                          <button
                            type="button" role="switch" aria-checked={!!empRequired[item.key]}
                            onClick={() => toggleEmpRequired(item.key)}
                            style={{ width: '44px', height: '24px', flexShrink: 0 }}
                            className={`relative rounded-full transition-colors ${empRequired[item.key] ? 'bg-primary' : 'bg-gray-200'}`}>
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              empRequired[item.key] ? 'translate-x-6' : 'translate-x-1'
                            }`}/>
                          </button>
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

              {/* Google Contacts sync */}
              <GoogleSyncCard />

              {/* Password */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.password.heading}</h2>
                <p className="text-xs text-gray-400 mb-4">{t.password.subtitle}</p>
                <div className="max-w-md">
                  <Input label={t.password.newPasswordLabel} type="password" placeholder={t.password.newPasswordPlaceholder} value={newPw} onChange={e => setNewPw(e.target.value)}/>
                </div>
                {pwMsg && <p className={`text-xs mt-3 ${pwMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{pwMsg}</p>}
                <div className="mt-5">
                  <Button onClick={savePassword} loading={savingPw}>
                    <Save size={14} className="mr-1.5"/> {t.password.saveBtn}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
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
            <button type="button" role="switch" aria-checked={tplForm.required}
              onClick={() => setTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${tplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                tplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
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
            <button type="button" role="switch" aria-checked={tplForm.required}
              onClick={() => setTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${tplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                tplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
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
            <button type="button" role="switch" aria-checked={empTplForm.required}
              onClick={() => setEmpTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${empTplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                empTplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
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
            <button type="button" role="switch" aria-checked={empTplForm.required}
              onClick={() => setEmpTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${empTplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                empTplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
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
            <button type="button" role="switch" aria-checked={jobTplForm.required}
              onClick={() => setJobTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${jobTplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                jobTplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
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
          <div className="flex items-center gap-3">
            <button type="button" role="switch" aria-checked={jobTplForm.required}
              onClick={() => setJobTplForm(f => ({ ...f, required: !f.required }))}
              style={{ width: '44px', height: '24px', flexShrink: 0 }}
              className={`relative rounded-full transition-colors ${jobTplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                jobTplForm.required ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
            <span className="text-sm text-gray-700 select-none">{t.customFields.requiredToggleLabel}</span>
          </div>
          {jobTplError && <p className="text-xs text-red-500">{jobTplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditJobFieldModal(false)} fullWidth>{tc.buttons.cancel}</Button>
            <Button onClick={updateJobTemplate} loading={savingJobTpl} fullWidth>{tc.buttons.saveChanges}</Button>
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
    const { data: sessionData } = await supabase.auth.getSession();
    const hasGoogle = sessionData.session?.user?.identities?.some(i => i.provider === 'google');

    // Encode the active business id into the redirect_uri so the callback
    // page knows which business this connection should be attached to.
    const oauthOptions = {
      redirectTo: `${window.location.origin}/auth/callback?google_link=1&business_id=${encodeURIComponent(businessId)}`,
      scopes: 'openid email profile https://www.googleapis.com/auth/contacts',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    };

    // linkIdentity isn't on every Supabase TS surface; cast to access it.
    const supabaseAny = supabase as unknown as {
      auth: {
        linkIdentity: (args: { provider: 'google'; options: typeof oauthOptions }) => Promise<{ data: { url?: string }; error: { message: string } | null }>;
      };
    };

    if (hasGoogle) {
      await supabase.auth.signInWithOAuth({ provider: 'google', options: oauthOptions });
    } else {
      await supabaseAny.auth.linkIdentity({ provider: 'google', options: oauthOptions });
    }
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

      {!status.connected || status.enabled === false ? (
        <Button onClick={onConnect} loading={busy}>
          {status.enabled === false ? t.reconnectBtn : t.connectBtn}
        </Button>
      ) : (
        <Button variant="secondary" onClick={openDisconnectDialog} loading={busy}>
          {t.disconnectBtn}
        </Button>
      )}

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

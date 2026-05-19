'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, User, Save, Users, Plus, Pencil, Trash2, GripVertical, Sliders, Briefcase, Globe, UserPlus, Activity } from 'lucide-react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { can } from '@amixos/shared/lib/permissions';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

type Tab = 'negocio' | 'trabajos' | 'clientes' | 'cuenta';

const PIPELINE_STEP_KEYS = ['proposal', 'sent', 'accepted', 'scheduled', 'in_progress', 'completed', 'invoiced'] as const;

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
    { key: 'trabajos', label: t.tabs.trabajos, icon: Briefcase },
    { key: 'clientes', label: t.tabs.clientes, icon: Users },
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

  // ── Custom field templates
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [addFieldModal, setAddFieldModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<FieldTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

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
          )}

          {/* ══ CLIENTES ═════════════════════════════════════════════ */}
          {tab === 'clientes' && (
            <div className="flex flex-col gap-5">
              {/* Required fields */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{t.requiredFields.heading}</h2>
                <p className="text-xs text-gray-400 mb-5">{t.requiredFields.subtitle}</p>

                <div className="space-y-0 divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-5">
                  {DEFAULT_CLIENT_FIELDS.map(f => (
                    <div key={f.key} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50/50 transition-colors">
                      <span className="text-sm text-gray-700">{f.label}</span>
                      <button
                        type="button" role="switch" aria-checked={!!fieldRequired[f.key]}
                        onClick={() => toggleFieldRequired(f.key)}
                        style={{ width: '44px', height: '24px', flexShrink: 0 }}
                        className={`relative rounded-full transition-colors ${fieldRequired[f.key] ? 'bg-primary' : 'bg-gray-200'}`}>
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          fieldRequired[f.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}/>
                      </button>
                    </div>
                  ))}
                </div>

                {fieldsMsg && <p className={`text-xs mb-3 ${fieldsMsgIsError ? 'text-red-500' : 'text-emerald-600'}`}>{fieldsMsg}</p>}
                <Button onClick={saveFieldPreferences} loading={savingFields}>
                  <Save size={14} className="mr-1.5"/> {t.requiredFields.saveBtn}
                </Button>
              </div>

              {/* Custom fields */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-semibold text-gray-900">{t.customFields.heading}</h2>
                  <Button size="sm" variant="secondary" onClick={() => {
                    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                    setTplError(''); setAddFieldModal(true);
                  }}>
                    <Plus size={14} className="mr-1"/> {t.customFields.addBtn}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mb-5">{t.customFields.subtitle}</p>

                {templates.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                    <Sliders size={24} className="mx-auto mb-1.5 opacity-30"/>
                    <p className="text-xs">{t.customFields.emptyState}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    {templates.map(tpl => (
                      <div key={tpl.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                        <GripVertical size={14} className="text-gray-300 shrink-0"/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{tpl.field_label}</span>
                            {tpl.required && (
                              <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">{t.customFields.requiredBadge}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {FIELD_TYPES[tpl.field_type]}
                            {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                          </p>
                        </div>
                        <button onClick={() => openEditTemplate(tpl)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                          aria-label={tc.buttons.edit}>
                          <Pencil size={13} className="text-blue-400"/>
                        </button>
                        <button onClick={() => removeTemplate(tpl.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                          aria-label={tc.buttons.delete}>
                          <Trash2 size={13} className="text-red-400"/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
  const { t: full } = useLang();
  const t = full.dashboard.settings.google;

  const [status, setStatus] = useState<GoogleStatusData>({ connected: false });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  const fetchStatus = async () => {
    if (!apiBaseUrl) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
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
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? '';
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
    // If we just got back from an OAuth link flow, the URL has ?google_synced=1.
    // Status is fetched fresh anyway — strip the param to keep the URL clean.
    const params = new URLSearchParams(window.location.search);
    if (params.has('google_synced')) {
      params.delete('google_synced');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  }, []);

  useEffect(() => {
    if (status.connected) void fetchGroups();
  }, [status.connected]);

  const onConnect = async () => {
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const hasGoogle = sessionData.session?.user?.identities?.some(i => i.provider === 'google');

    const oauthOptions = {
      redirectTo: `${window.location.origin}/auth/callback?google_link=1`,
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

  const onDisconnect = async () => {
    if (!confirm('Disconnect Google Contacts sync?')) return;
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? '';
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch {
      // ignore
    }
    await fetchStatus();
    setBusy(false);
  };

  const onGroupChange = async (groupId: string) => {
    const found = groups.find(g => g.id === groupId);
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const jwt = sessionData.session?.access_token ?? '';
    try {
      await fetch(`${apiBaseUrl}/api/v1/google-sync/contact-group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
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
              {t.lastSyncedAt}: {new Date(status.lastSyncAt).toLocaleString()}
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
        <Button variant="secondary" onClick={onDisconnect} loading={busy}>
          {t.disconnectBtn}
        </Button>
      )}
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, User, Lock, Save, Users, Plus, Pencil, Trash2, GripVertical, Sliders } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface FieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  sort_order: number;
}

const DEFAULT_CLIENT_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'Nombre' },
  { key: 'last_name', label: 'Apellido' },
  { key: 'company', label: 'Empresa' },
  { key: 'phone_cell', label: 'Celular' },
  { key: 'phone_office', label: 'Teléfono oficina' },
  { key: 'email_office', label: 'Correo oficina' },
  { key: 'email_home', label: 'Correo personal' },
  { key: 'address', label: 'Dirección' },
  { key: 'city', label: 'Ciudad' },
  { key: 'state', label: 'Estado' },
  { key: 'zip_code', label: 'Código postal' },
];

const FIELD_TYPES: Record<string, string> = {
  text: 'Texto', number: 'Número', date: 'Fecha', boolean: 'Sí / No', select: 'Lista de opciones',
};

export default function AjustesPage() {
  const supabase = createSupabaseClient();
  const { business, user, refetchBusiness } = useApp();

  // ── Business info
  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizCity, setBizCity] = useState(business?.city ?? '');
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState('');

  // ── Password
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  // ── Client field preferences
  const [fieldRequired, setFieldRequired] = useState<Record<string, boolean>>(
    business?.client_field_required ?? {}
  );
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsMsg, setFieldsMsg] = useState('');

  // ── Custom field templates
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [addFieldModal, setAddFieldModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(false);
  const [editingTpl, setEditingTpl] = useState<FieldTemplate | null>(null);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  useEffect(() => {
    if (business) {
      setBizName(business.name);
      setBizCity(business.city);
      setFieldRequired(business.client_field_required ?? {});
    }
  }, [business]);

  useEffect(() => { loadTemplates(); }, [business]);

  // ── Business
  const saveBusiness = async () => {
    if (!business) return;
    setSavingBiz(true); setBizMsg('');
    const { error } = await supabase.from('businesses').update({ name: bizName, city: bizCity }).eq('id', business.id);
    setBizMsg(error ? 'Error al guardar.' : '¡Guardado!');
    if (!error) await refetchBusiness();
    setSavingBiz(false);
  };

  // ── Password
  const savePassword = async () => {
    if (!newPw || newPw.length < 6) { setPwMsg('Mínimo 6 caracteres'); return; }
    setSavingPw(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwMsg(error ? 'Error: ' + error.message : '¡Contraseña actualizada!');
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
    setFieldsMsg(error ? 'Error al guardar.' : '¡Guardado!');
    if (!error) await refetchBusiness();
    setSavingFields(false);
  };

  // ── Custom field template CRUD
  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('client_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setTemplates(data ?? []);
  };

  const toKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addTemplate = async () => {
    if (!tplForm.field_label.trim()) { setTplError('El nombre del campo es requerido'); return; }
    const key = toKey(tplForm.field_label);
    if (templates.some(t => t.field_key === key)) { setTplError('Ya existe un campo con ese nombre'); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('client_field_templates').insert({
      business_id: business!.id,
      field_key: key, field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type, field_options: options,
      required: tplForm.required, sort_order: templates.length,
    });
    if (error) { setTplError('Error al guardar.'); setSavingTpl(false); return; }
    await loadTemplates();
    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingTpl(false); setAddFieldModal(false);
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('¿Eliminar este campo? Los datos en clientes existentes se perderán.')) return;
    await supabase.from('client_field_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
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
    if (!editingTpl || !tplForm.field_label.trim()) { setTplError('El nombre del campo es requerido'); return; }
    setSavingTpl(true); setTplError('');
    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('client_field_templates').update({
      field_label: tplForm.field_label.trim(), field_type: tplForm.field_type,
      field_options: options, required: tplForm.required,
    }).eq('id', editingTpl.id);
    if (error) { setTplError('Error al guardar.'); setSavingTpl(false); return; }
    await loadTemplates();
    setSavingTpl(false); setEditFieldModal(false); setEditingTpl(null);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Ajustes</h1>

      <div className="flex flex-col gap-5">
        {/* ── Business info ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Información del negocio</h2>
          </div>
          <div className="flex flex-col gap-3">
            <Input label="Nombre del negocio" value={bizName} onChange={e => setBizName(e.target.value)}/>
            <Input label="Ciudad" value={bizCity} onChange={e => setBizCity(e.target.value)}/>
          </div>
          {bizMsg && <p className={`text-xs mt-3 ${bizMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{bizMsg}</p>}
          <div className="mt-4">
            <Button onClick={saveBusiness} loading={savingBiz}>
              <Save size={14} className="mr-1.5"/> Guardar cambios
            </Button>
          </div>
        </div>

        {/* ── Client preferences ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <Users size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Preferencias de clientes</h2>
          </div>
          <p className="text-xs text-gray-400 mb-5">Elige cuáles campos son obligatorios al crear o editar un cliente.</p>

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

          {fieldsMsg && <p className={`text-xs mb-3 ${fieldsMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{fieldsMsg}</p>}
          <Button onClick={saveFieldPreferences} loading={savingFields}>
            <Save size={14} className="mr-1.5"/> Guardar preferencias
          </Button>

          {/* ── Custom fields ─────────────────────────────────────── */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Campos personalizados</h3>
                <p className="text-xs text-gray-400 mt-0.5">Campos extra que aparecen en el formulario de cada cliente.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
                setTplError(''); setAddFieldModal(true);
              }}>
                <Plus size={14} className="mr-1"/> Agregar
              </Button>
            </div>

            {templates.length === 0 ? (
              <div className="py-6 text-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <Sliders size={24} className="mx-auto mb-1.5 opacity-30"/>
                <p className="text-xs">Sin campos personalizados.</p>
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
                          <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full font-medium">Requerido</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {FIELD_TYPES[tpl.field_type]}
                        {tpl.field_type === 'select' && tpl.field_options?.length ? ` · ${tpl.field_options.join(', ')}` : ''}
                      </p>
                    </div>
                    <button onClick={() => openEditTemplate(tpl)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0">
                      <Pencil size={13} className="text-blue-400"/>
                    </button>
                    <button onClick={() => removeTemplate(tpl.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 size={13} className="text-red-400"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Account ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Cuenta</h2>
          </div>
          <p className="text-sm text-gray-500">Correo: <span className="font-medium text-gray-900">{user?.email}</span></p>
        </div>

        {/* ── Password ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Cambiar contraseña</h2>
          </div>
          <Input label="Nueva contraseña" type="password" placeholder="Mínimo 6 caracteres" value={newPw} onChange={e => setNewPw(e.target.value)}/>
          {pwMsg && <p className={`text-xs mt-3 ${pwMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{pwMsg}</p>}
          <div className="mt-4">
            <Button onClick={savePassword} loading={savingPw}>
              <Save size={14} className="mr-1.5"/> Actualizar contraseña
            </Button>
          </div>
        </div>
      </div>

      {/* ── Add field modal ─────────────────────────────────────── */}
      <Modal open={addFieldModal} onClose={() => setAddFieldModal(false)} title="Nuevo campo personalizado" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nombre del campo *" placeholder="ej. Número de contrato"
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {tplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">
              Clave: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{toKey(tplForm.field_label)}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de campo</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Opciones <span className="text-gray-400 font-normal">(una por línea)</span>
              </label>
              <textarea rows={4} placeholder={"Opción 1\nOpción 2\nOpción 3"}
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
            <span className="text-sm text-gray-700 select-none">Campo requerido</span>
          </div>
          {tplError && <p className="text-xs text-red-500">{tplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setAddFieldModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={addTemplate} loading={savingTpl} fullWidth>Agregar campo</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit field modal ────────────────────────────────────── */}
      <Modal open={editFieldModal} onClose={() => setEditFieldModal(false)} title="Editar campo personalizado" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nombre del campo *" placeholder="ej. Número de contrato"
            value={tplForm.field_label}
            onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de campo</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Opciones <span className="text-gray-400 font-normal">(una por línea)</span>
              </label>
              <textarea rows={4} placeholder={"Opción 1\nOpción 2\nOpción 3"}
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
            <span className="text-sm text-gray-700 select-none">Campo requerido</span>
          </div>
          {tplError && <p className="text-xs text-red-500">{tplError}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setEditFieldModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={updateTemplate} loading={savingTpl} fullWidth>Guardar cambios</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

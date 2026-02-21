'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Building2, User, Lock, Save, Sliders, Plus, Trash2, GripVertical } from 'lucide-react';
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

const FIELD_TYPES: Record<string, string> = {
  text: 'Texto',
  number: 'Número',
  date: 'Fecha',
  boolean: 'Sí / No',
  select: 'Lista de opciones',
};

type Tab = 'negocio' | 'cuenta' | 'campos';

export default function AjustesPage() {
  const supabase = createSupabaseClient();
  const { business, user, refetchBusiness } = useApp();
  const [tab, setTab] = useState<Tab>('negocio');

  // ── Business
  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizCity, setBizCity] = useState(business?.city ?? '');
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState('');

  // ── Password
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  // ── Custom fields
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [tplModal, setTplModal] = useState(false);
  const [tplForm, setTplForm] = useState({ field_label: '', field_type: 'text' as FieldTemplate['field_type'], required: false, options_raw: '' });
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplError, setTplError] = useState('');

  const loadTemplates = async () => {
    if (!business) return;
    const { data } = await supabase.from('client_field_templates').select('*')
      .eq('business_id', business.id).order('sort_order');
    setTemplates(data ?? []);
  };

  useEffect(() => { loadTemplates(); }, [business]);

  const saveBusiness = async () => {
    if (!business) return;
    setSavingBiz(true); setBizMsg('');
    const { error } = await supabase.from('businesses').update({ name: bizName, city: bizCity }).eq('id', business.id);
    setBizMsg(error ? 'Error al guardar.' : '¡Guardado!');
    if (!error) await refetchBusiness();
    setSavingBiz(false);
  };

  const savePassword = async () => {
    if (!newPw || newPw.length < 6) { setPwMsg('Mínimo 6 caracteres'); return; }
    setSavingPw(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwMsg(error ? 'Error: ' + error.message : '¡Contraseña actualizada!');
    if (!error) setNewPw('');
    setSavingPw(false);
  };

  // Convert label to a safe key slug
  const toKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const addTemplate = async () => {
    if (!tplForm.field_label.trim()) { setTplError('El nombre del campo es requerido'); return; }
    const key = toKey(tplForm.field_label);
    if (templates.some(t => t.field_key === key)) { setTplError('Ya existe un campo con ese nombre'); return; }
    setSavingTpl(true); setTplError('');

    const options = tplForm.field_type === 'select'
      ? tplForm.options_raw.split('\n').map(s => s.trim()).filter(Boolean)
      : null;

    const { error } = await supabase.from('client_field_templates').insert({
      business_id: business!.id,
      field_key: key,
      field_label: tplForm.field_label.trim(),
      field_type: tplForm.field_type,
      field_options: options,
      required: tplForm.required,
      sort_order: templates.length,
    });

    if (error) { setTplError('Error al guardar.'); setSavingTpl(false); return; }
    await loadTemplates();
    setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' });
    setSavingTpl(false); setTplModal(false);
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('¿Eliminar este campo? Los datos guardados en clientes se perderán.')) return;
    await supabase.from('client_field_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'negocio', label: 'Negocio' },
    { key: 'cuenta',  label: 'Cuenta' },
    { key: 'campos',  label: 'Campos personalizados' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Ajustes</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Negocio */}
      {tab === 'negocio' && (
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
      )}

      {/* ── Cuenta */}
      {tab === 'cuenta' && (
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-primary"/>
              <h2 className="text-sm font-semibold text-gray-900">Cuenta</h2>
            </div>
            <p className="text-sm text-gray-500">Correo: <span className="font-medium text-gray-900">{user?.email}</span></p>
          </div>
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
      )}

      {/* ── Campos personalizados */}
      {tab === 'campos' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-primary"/>
                <h2 className="text-sm font-semibold text-gray-900">Campos de clientes</h2>
              </div>
              <Button size="sm" onClick={() => { setTplForm({ field_label: '', field_type: 'text', required: false, options_raw: '' }); setTplError(''); setTplModal(true); }}>
                <Plus size={14} className="mr-1.5"/> Agregar campo
              </Button>
            </div>

            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
              <p className="text-xs text-blue-600">
                Los campos que agregues aquí aparecerán en el formulario de cada cliente. Ideal para datos específicos de tu negocio (ej. "Número de contrato", "Tipo de servicio").
              </p>
            </div>

            {templates.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Sliders size={32} className="mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Sin campos personalizados aún.</p>
                <button onClick={() => setTplModal(true)} className="text-primary text-sm font-medium hover:underline mt-1">Agregar el primero →</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {templates.map(tpl => (
                  <div key={tpl.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <GripVertical size={15} className="text-gray-300 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{tpl.field_label}</span>
                        {tpl.required && <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">Requerido</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {FIELD_TYPES[tpl.field_type]}
                        {tpl.field_type === 'select' && tpl.field_options ? ` · ${tpl.field_options.join(', ')}` : ''}
                        {` · Clave: ${tpl.field_key}`}
                      </p>
                    </div>
                    <button onClick={() => removeTemplate(tpl.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 size={14} className="text-red-400"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add field modal */}
      <Modal open={tplModal} onClose={() => setTplModal(false)} title="Nuevo campo personalizado" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Nombre del campo *" placeholder="ej. Número de contrato"
            value={tplForm.field_label} onChange={e => setTplForm(f => ({ ...f, field_label: e.target.value }))}/>
          {tplForm.field_label && (
            <p className="text-xs text-gray-400 -mt-2">Clave: <code className="bg-gray-100 px-1 rounded">{toKey(tplForm.field_label)}</code></p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Tipo de campo</label>
            <select value={tplForm.field_type}
              onChange={e => setTplForm(f => ({ ...f, field_type: e.target.value as FieldTemplate['field_type'] }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
              {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {tplForm.field_type === 'select' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Opciones <span className="text-gray-400 font-normal">(una por línea)</span></label>
              <textarea rows={4} placeholder={"Opción 1\nOpción 2\nOpción 3"}
                value={tplForm.options_raw}
                onChange={e => setTplForm(f => ({ ...f, options_raw: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"/>
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer">
            <button type="button" onClick={() => setTplForm(f => ({ ...f, required: !f.required }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${tplForm.required ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${tplForm.required ? 'translate-x-6' : 'translate-x-1'}`}/>
            </button>
            <span className="text-sm text-gray-700">Campo requerido</span>
          </label>

          {tplError && <p className="text-xs text-red-500">{tplError}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={() => setTplModal(false)} fullWidth>Cancelar</Button>
            <Button onClick={addTemplate} loading={savingTpl} fullWidth>Agregar campo</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

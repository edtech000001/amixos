'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Building2, User, Lock, Save } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function AjustesPage() {
  const supabase = createSupabaseClient();
  const { business, user, refetchBusiness } = useApp();

  const [bizName, setBizName] = useState(business?.name ?? '');
  const [bizCity, setBizCity] = useState(business?.city ?? '');
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  const saveBusiness = async () => {
    if (!business) return;
    setSavingBiz(true); setBizMsg('');
    const { error } = await supabase.from('businesses').update({ name: bizName, city: bizCity }).eq('id', business.id);
    if (error) { setBizMsg('Error al guardar.'); } else { setBizMsg('¡Guardado!'); await refetchBusiness(); }
    setSavingBiz(false);
  };

  const savePassword = async () => {
    if (!newPw || newPw.length < 6) { setPwMsg('Mínimo 6 caracteres'); return; }
    setSavingPw(true); setPwMsg('');
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { setPwMsg('Error: ' + error.message); } else { setPwMsg('¡Contraseña actualizada!'); setCurrentPw(''); setNewPw(''); }
    setSavingPw(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Ajustes</h1>

      <div className="flex flex-col gap-5">
        {/* Business info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Información del negocio</h2>
          </div>
          <div className="flex flex-col gap-3">
            <Input label="Nombre del negocio" value={bizName} onChange={e => setBizName(e.target.value)} />
            <Input label="Ciudad" value={bizCity} onChange={e => setBizCity(e.target.value)} />
          </div>
          {bizMsg && <p className={`text-xs mt-3 ${bizMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{bizMsg}</p>}
          <div className="mt-4">
            <Button onClick={saveBusiness} loading={savingBiz} size="md">
              <Save size={14} className="mr-1.5"/> Guardar cambios
            </Button>
          </div>
        </div>

        {/* Account */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Cuenta</h2>
          </div>
          <p className="text-sm text-gray-500">Correo: <span className="font-medium text-gray-900">{user?.email}</span></p>
        </div>

        {/* Password */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} className="text-primary"/>
            <h2 className="text-sm font-semibold text-gray-900">Cambiar contraseña</h2>
          </div>
          <div className="flex flex-col gap-3">
            <Input label="Nueva contraseña" type="password" placeholder="Mínimo 6 caracteres" value={newPw} onChange={e => setNewPw(e.target.value)} />
          </div>
          {pwMsg && <p className={`text-xs mt-3 ${pwMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>{pwMsg}</p>}
          <div className="mt-4">
            <Button onClick={savePassword} loading={savingPw} size="md">
              <Save size={14} className="mr-1.5"/> Actualizar contraseña
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

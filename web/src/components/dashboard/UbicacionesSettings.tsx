'use client';

// Ajustes → Ubicaciones. Manage a business's branches (locations). Each worker's
// home branch is set on the employee record (Empleados → detail), and lending a
// worker to another branch is the "Compartir" button there — so this screen is
// purely branch CRUD. Admin-only (the parent tab is gated by
// can.manageBusinessSettings).

import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createLocation, updateLocation, archiveLocation } from '@amixos/shared/lib/locations';

export function UbicacionesSettings() {
  const supabase = createSupabaseClient();
  const { business, locations, refetchLocations } = useApp();
  const { locale } = useLang();
  const es = locale !== 'en';

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const addLocation = async () => {
    if (!business || !newName.trim() || busy) return;
    setBusy(true);
    const created = await createLocation(supabase, business.id, { name: newName.trim() });
    if (created) { setNewName(''); await refetchLocations(); }
    setBusy(false);
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) { setEditId(null); return; }
    await updateLocation(supabase, id, { name: editName.trim() });
    setEditId(null);
    await refetchLocations();
  };

  const remove = async (id: string) => {
    if (!confirm(es ? '¿Archivar esta ubicación? Los trabajos asignados quedan sin ubicación.' : 'Archive this location? Assigned jobs become unassigned.')) return;
    await archiveLocation(supabase, id);
    await refetchLocations();
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-gray-500">
        {es
          ? 'Crea sucursales para separar trabajos, equipo e inventario por ubicación. Los reportes siguen mostrando el total combinado. La sucursal de cada empleado se define en su perfil.'
          : 'Create branches to split jobs, team and inventory by location. Reports still show the combined total. Each employee’s branch is set on their profile.'}
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{es ? 'Sucursales' : 'Branches'}</p>
        <div className="flex flex-col gap-2">
          {locations.length === 0 && (
            <p className="text-sm text-gray-400 py-2">{es ? 'Aún no tienes ubicaciones.' : 'No locations yet.'}</p>
          )}
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <MapPin size={16} className="text-gray-400 shrink-0" />
              {editId === l.id ? (
                <input
                  autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => saveRename(l.id)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(l.id); }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <button type="button" onClick={() => { setEditId(l.id); setEditName(l.name); }} className="flex-1 text-left text-sm font-medium text-gray-900">
                  {l.name}
                </button>
              )}
              <button type="button" onClick={() => remove(l.id)} className="text-gray-300 hover:text-red-500" title={es ? 'Archivar' : 'Archive'}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLocation(); }}
            placeholder={es ? 'Nombre de la sucursal (ej. Lexington)' : 'Branch name (e.g. Lexington)'}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button type="button" onClick={addLocation} disabled={!newName.trim() || busy}
            className="flex items-center gap-1.5 rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            <Plus size={16} /> {es ? 'Agregar' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

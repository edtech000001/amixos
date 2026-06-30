import { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { MapPin, Plus, Trash2 } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { createLocation, updateLocation, archiveLocation } from '@amixos/shared/lib/locations';

// Ajustes → Ubicaciones (mobile). Branch CRUD only — each worker's home branch
// is on their profile, and lending lives on the employee detail "Compartir"
// button (mirrors web UbicacionesSettings).
export function UbicacionesSection() {
  const supabase = createSupabaseClient();
  const { business, locations, refetchLocations } = useApp();
  const { locale } = useLang();
  const es = locale !== 'en';

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const addLocation = async () => {
    if (!business || !newName.trim() || busy) return;
    setBusy(true);
    const created = await createLocation(supabase, business.id, { name: newName.trim() });
    if (created) { setNewName(''); await refetchLocations(); }
    setBusy(false);
  };

  const remove = (id: string) => {
    Alert.alert(
      es ? 'Archivar ubicación' : 'Archive location',
      es ? 'Los trabajos asignados quedan sin ubicación.' : 'Assigned jobs become unassigned.',
      [
        { text: es ? 'Cancelar' : 'Cancel', style: 'cancel' },
        { text: es ? 'Archivar' : 'Archive', style: 'destructive', onPress: async () => { await archiveLocation(supabase, id); await refetchLocations(); } },
      ],
    );
  };

  const rename = (id: string, current: string) => {
    Alert.prompt?.(
      es ? 'Renombrar' : 'Rename',
      undefined,
      async (value?: string) => {
        if (!value?.trim()) return;
        await updateLocation(supabase, id, { name: value.trim() });
        await refetchLocations();
      },
      'plain-text',
      current,
    );
  };

  return (
    <View className="gap-5 px-1">
      <Text className="text-sm text-gray-500">
        {es
          ? 'Crea sucursales para separar trabajos, equipo e inventario por ubicación. Los reportes siguen mostrando el total combinado. La sucursal de cada empleado se define en su perfil.'
          : 'Create branches to split jobs, team and inventory by location. Reports still show the combined total. Each employee’s branch is set on their profile.'}
      </Text>

      <View className="bg-white rounded-2xl border border-gray-100 p-4 gap-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{es ? 'Sucursales' : 'Branches'}</Text>
        {locations.length === 0 ? (
          <Text className="text-sm text-gray-400 py-2">{es ? 'Aún no tienes ubicaciones.' : 'No locations yet.'}</Text>
        ) : null}
        {locations.map((l) => (
          <View key={l.id} className="flex-row items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
            <MapPin size={16} color="#9CA3AF" />
            <Pressable className="flex-1" onPress={() => rename(l.id, l.name)}>
              <Text className="text-sm font-medium text-gray-900">{l.name}</Text>
            </Pressable>
            <Pressable onPress={() => remove(l.id)} hitSlop={8}>
              <Trash2 size={16} color="#D1D5DB" />
            </Pressable>
          </View>
        ))}

        <View className="flex-row items-center gap-2 mt-2">
          <TextInput
            value={newName} onChangeText={setNewName}
            placeholder={es ? 'Nombre (ej. Lexington)' : 'Name (e.g. Lexington)'}
            placeholderTextColor="#9CA3AF"
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900"
          />
          {/* Always rendered (faded when empty/busy) so the row keeps a stable
              shape and the name field doesn't look orphaned at half width. */}
          <Pressable onPress={addLocation} disabled={!newName.trim() || busy}
            style={{ opacity: !newName.trim() || busy ? 0.45 : 1 }}
            className="flex-row items-center gap-1.5 rounded-xl px-4 py-2.5 bg-primary">
            <Plus size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white">{es ? 'Agregar' : 'Add'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

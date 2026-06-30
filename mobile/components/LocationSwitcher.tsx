import { View } from 'react-native';
import { Select } from '@amixos/shared/ui';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';

// Branch switcher (mobile). Scopes day-to-day lists to one location or "All".
// Renders nothing for single-location businesses. Reports stay business-wide.
export function LocationSwitcher({ className }: { className?: string }) {
  const { locations, activeLocationId, setActiveLocation } = useApp();
  const { locale } = useLang();
  const es = locale !== 'en';

  if (locations.length < 2) return null;

  const allLabel = es ? 'Todas las ubicaciones' : 'All locations';
  const options = [{ value: '', label: allLabel }, ...locations.map((l) => ({ value: l.id, label: l.name }))];

  return (
    <View className={className ?? 'px-5 pt-3'}>
      <Select
        value={activeLocationId ?? ''}
        onValueChange={(v) => setActiveLocation(v || null)}
        options={options}
      />
    </View>
  );
}

import { useState } from 'react';
import { View, Text, Pressable, Modal as RNModal, ScrollView } from 'react-native';
import { MapPin, ChevronDown, Check } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { can } from '@amixos/shared/lib/permissions';

// Branch switcher (mobile). A compact pill that opens a bottom sheet to scope
// day-to-day lists to one location or "All" — much lighter than a full-width
// dropdown bar. Renders nothing for single-location businesses, and is hidden
// for assigned-only roles (field crew) locked to their home branch.
export function LocationSwitcher({ className }: { className?: string }) {
  const { locations, activeLocationId, setActiveLocation, currentRole } = useApp();
  const { locale } = useLang();
  const c = useThemeColors();
  const es = locale !== 'en';
  const [open, setOpen] = useState(false);

  // Single-location businesses + roles locked to their home branch never see it.
  if (locations.length < 2 || !can.switchLocations(currentRole)) return null;

  const allLabel = es ? 'Todas las ubicaciones' : 'All locations';
  const current = activeLocationId
    ? locations.find((l) => l.id === activeLocationId)?.name ?? allLabel
    : allLabel;

  const pick = (id: string | null) => {
    setActiveLocation(id);
    setOpen(false);
  };

  const Row = ({ id, label }: { id: string | null; label: string }) => {
    const selected = (activeLocationId ?? null) === id;
    return (
      <Pressable
        onPress={() => pick(id)}
        className="flex-row items-center justify-between px-5 py-3.5 active:bg-border-soft"
      >
        <Text className={`text-base ${selected ? 'text-primary font-semibold' : 'text-ink'}`}>{label}</Text>
        {selected ? <Check size={18} color={c.primary} /> : null}
      </Pressable>
    );
  };

  return (
    <View className={className ?? 'px-5 pt-3'}>
      <Pressable
        onPress={() => setOpen(true)}
        className="self-start flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 active:opacity-80"
      >
        <MapPin size={14} color={c.faint} />
        <Text className="text-sm font-medium text-ink" numberOfLines={1}>{current}</Text>
        <ChevronDown size={14} color={c.faint} />
      </Pressable>

      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
          />
          <View className="bg-card rounded-t-3xl pb-8 pt-2 max-h-[70%]">
            <View className="items-center pb-2">
              <View className="w-10 h-1 rounded-full bg-border" />
            </View>
            <Text className="px-5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-faint">
              {es ? 'Ver datos de' : 'View data from'}
            </Text>
            <ScrollView>
              <Row id={null} label={allLabel} />
              {locations.map((l) => (
                <Row key={l.id} id={l.id} label={l.name} />
              ))}
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </View>
  );
}

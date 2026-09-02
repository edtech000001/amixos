import { useEffect, useMemo, useState } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Check, X, Search, MapPin } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import type { FieldClient, FieldJobLocation } from '@amixos/shared/lib/fieldHome';

// expo-location is loaded lazily + guarded. Importing it eagerly triggers a
// native-module lookup (`requireNativeModule('ExpoLocation')`) at module load,
// which THROWS on a dev client built before the dependency was added — taking
// down the whole field home. Capturing the geostamp is best-effort, so a
// missing/old native module just means "location unavailable".
type LocationModule = typeof import('expo-location');
function loadLocation(): LocationModule | null {
  try {
    return require('expo-location') as LocationModule;
  } catch {
    return null;
  }
}

// Field-crew quick-log bottom sheet. Records a completed job (title + optional
// client + notes); date is "today" and status is completed (set by the parent
// via logFieldJob). One-handed: bottom sheet, not a centered dialog. On open it
// auto-captures the tech's current GPS as the job's location (geostamp).
export interface LogJobSheetProps {
  visible: boolean;
  onClose: () => void;
  clients: FieldClient[];
  clientsLoading: boolean;
  onSubmit: (input: { title: string; clientId: string | null; description: string | null; location: FieldJobLocation | null }) => Promise<boolean>;
}

type LocState = 'idle' | 'capturing' | 'done' | 'unavailable';

export function LogJobSheet({ visible, onClose, clients, clientsLoading, onSubmit }: LogJobSheetProps) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const f = full.dashboard.fieldHome;
  const tc = full.common;

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [location, setLocation] = useState<FieldJobLocation | null>(null);

  // Auto-capture the current location each time the sheet opens. Prompts for
  // permission the first time; silent on later opens. Failure is non-blocking —
  // the job still logs without a geostamp.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLocState('capturing');
      const Location = loadLocation();
      if (!Location) { if (!cancelled) setLocState('unavailable'); return; }
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { if (!cancelled) setLocState('unavailable'); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const loc: FieldJobLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Best-effort reverse geocode for a readable address.
        try {
          const [g] = await Location.reverseGeocodeAsync({ latitude: loc.lat, longitude: loc.lng });
          if (g && !cancelled) {
            loc.address = [g.streetNumber, g.street].filter(Boolean).join(' ') || g.name || null;
            loc.city = g.city ?? g.subregion ?? null;
            loc.state = g.region ?? null;
          }
        } catch { /* keep coords only */ }
        if (!cancelled) { setLocation(loc); setLocState('done'); }
      } catch {
        if (!cancelled) setLocState('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const reset = () => {
    setTitle(''); setClientId(null); setNotes(''); setSearch(''); setError(null); setBusy(false);
    setLocState('idle'); setLocation(null);
  };
  const close = () => { reset(); onClose(); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => c.name.toLowerCase().includes(q));
  }, [clients, search]);

  const submit = async () => {
    if (busy) return;
    if (!title.trim()) { setError(f.titleRequired); return; }
    setBusy(true);
    setError(null);
    const ok = await onSubmit({ title: title.trim(), clientId, description: notes.trim() || null, location });
    setBusy(false);
    if (ok) close();
    else setError(f.saveError2);
  };

  const locText = location
    ? ([location.address, location.city, location.state].filter(Boolean).join(', ')
        || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`)
    : '';

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={close}>
      {/* KeyboardAvoidingView: the sheet is anchored to the bottom, exactly
          where the keyboard opens. Backdrop is an absolute FIRST child and the
          card a plain sibling, per the sheet contract in CLAUDE.md — the
          nested-card + no-op-onPress shape this replaces also stopped the
          ScrollView inside from receiving drags. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={close}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        />
        <View className="bg-card rounded-t-3xl px-5 pb-10 pt-4 max-h-[88%]">
          <View className="items-center mb-3">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-ink">{f.logTitle}</Text>
            <Pressable onPress={close} hitSlop={8} className="p-1">
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Title */}
            <Text className="text-sm font-medium text-ink mb-1.5">{f.jobTitleLabel}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={f.jobTitlePlaceholder}
              placeholderTextColor={c.faint}
              className="border border-border rounded-xl px-4 py-3 text-base text-ink mb-4"
            />

            {/* Location geostamp (auto-captured) */}
            <View className="flex-row items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-surface border border-border-soft">
              <MapPin size={15} color={locState === 'done' ? c.success : c.faint} />
              {locState === 'capturing' ? (
                <Text className="text-xs text-muted flex-1">{f.locCapturing}</Text>
              ) : locState === 'done' ? (
                <Text className="text-xs text-ink flex-1" numberOfLines={1}>{locText}</Text>
              ) : (
                <Text className="text-xs text-faint flex-1">{f.locUnavailable}</Text>
              )}
            </View>

            {/* Client */}
            <Text className="text-sm font-medium text-ink mb-1.5">{f.clientLabel}</Text>
            <View className="flex-row items-center border border-border rounded-xl px-3 mb-2">
              <Search size={16} color={c.faint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={f.clientSearch}
                placeholderTextColor={c.faint}
                className="flex-1 px-2 py-3 text-base text-ink"
              />
            </View>
            <View className="border border-border-soft rounded-xl overflow-hidden mb-4 max-h-56">
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                <Pressable
                  onPress={() => setClientId(null)}
                  className="flex-row items-center justify-between px-4 py-3 active:bg-surface border-b border-border-soft"
                >
                  <Text className={`text-sm ${clientId === null ? 'text-primary font-semibold' : 'text-muted'}`}>
                    {f.noClientOption}
                  </Text>
                  {clientId === null ? <Check size={16} color={c.primary} /> : null}
                </Pressable>
                {clientsLoading ? (
                  <View className="py-6 items-center"><ActivityIndicator size="small" color={c.primary} /></View>
                ) : filtered.length === 0 ? (
                  <Text className="text-sm text-faint text-center py-6">{f.noResults}</Text>
                ) : (
                  filtered.map(cl => (
                    <Pressable
                      key={cl.id}
                      onPress={() => setClientId(cl.id)}
                      className="flex-row items-center justify-between px-4 py-3 active:bg-surface border-b border-border-soft"
                    >
                      <Text className={`text-sm flex-1 ${clientId === cl.id ? 'text-primary font-semibold' : 'text-ink'}`} numberOfLines={1}>
                        {cl.name}
                      </Text>
                      {clientId === cl.id ? <Check size={16} color={c.primary} /> : null}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>

            {/* Notes */}
            <Text className="text-sm font-medium text-ink mb-1.5">{f.notesLabel}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              className="border border-border rounded-xl px-4 py-3 text-base text-ink mb-4 min-h-[72px]"
              style={{ textAlignVertical: 'top' }}
            />

            {error ? (
              <View className="mb-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="gap-2.5 mt-1">
            <Pressable
              onPress={submit}
              disabled={busy}
              className={`py-3.5 rounded-2xl items-center bg-primary active:opacity-90 ${busy ? 'opacity-50' : ''}`}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text className="text-base font-semibold text-white">{tc.buttons.save}</Text>
              )}
            </Pressable>
            <Pressable onPress={close} className="py-3.5 rounded-2xl bg-border-soft items-center active:bg-border">
              <Text className="text-base font-semibold text-ink">{tc.buttons.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

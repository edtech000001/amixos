import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal as RNModal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, MapPin, Check, Clock, Navigation, UserPlus } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useLang } from '@/lib/i18n/LangProvider';
import { formatDateLong } from '@amixos/shared/lib/format';
import { fetchCrewFinderData, type CrewFinderTarget } from '@amixos/shared/lib/crewFinderData';
import { buildCrewSuggestions, type CrewSuggestion } from '@amixos/shared/lib/crewFinder';
import { useThemeColors } from '@/lib/ThemeProvider';

interface Props {
  visible: boolean;
  businessId: string;
  target: CrewFinderTarget;
  currentCrew: string[];
  onAddCrew: (employeeId: string) => void;
  onSetDate: (dateStr: string) => void;
  onClose: () => void;
}

// Crew Finder (mobile) — bottom sheet mirroring the web panel. Ranks crew by
// proximity + availability with route-aware hints.
export function CrewFinderSheet({ visible, businessId, target, currentCrew, onAddCrew, onSetDate, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { t: full, locale } = useLang();
  const t = full.dashboard.crewFinder;
  const c = useThemeColors();

  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState<CrewSuggestion[]>([]);
  const [needsAddresses, setNeedsAddresses] = useState(0);
  const [targetNoCoords, setTargetNoCoords] = useState(false);

  const load = useCallback(async () => {
    const supabase = createSupabaseClient();
    setLoading(true);
    let data = await fetchCrewFinderData(supabase, businessId, target);
    if (data.needsGeocodeCount > 0) {
      setGeocoding(true);
      try {
        await fetch(`${getApiBaseUrl()}/api/v1/map/geocode-employees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getJwt()}` },
          body: JSON.stringify({ business_id: businessId }),
        });
        data = await fetchCrewFinderData(supabase, businessId, target);
      } catch {
        /* offline / API down */
      }
      setGeocoding(false);
    }
    setNeedsAddresses(data.needsGeocodeCount);
    setTargetNoCoords(!data.targetHasCoords);
    setSuggestions(buildCrewSuggestions(data));
    setLoading(false);
  }, [businessId, target.jobId, target.lat, target.lng, target.scheduledDate, target.clientId]);

  useEffect(() => { if (visible) void load(); }, [visible, load]);

  const shortDate = (ymd: string) => formatDateLong(ymd, locale);
  const basisLabel = (basis: CrewSuggestion['basis']) =>
    basis === 'current-job' ? t.basisCurrentJob : basis === 'job' ? t.basisJob : t.basisHome;

  return (
    <RNModal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        <View
          className="bg-card rounded-3xl pt-3 mx-3 overflow-hidden"
          style={{ height: '82%', marginBottom: insets.bottom + 12 }}
        >
          <View className="items-center mb-2">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>
          <View className="px-5 pb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1">
              <Navigation size={16} color={c.primary} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">{t.title}</Text>
                <Text className="text-xs text-faint">{t.subtitle}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 rounded-lg">
              <X size={18} color={c.faint} />
            </Pressable>
          </View>

          {(needsAddresses > 0 || targetNoCoords) && !loading ? (
            <View className="px-5 py-2 bg-amber-500/10 border-y border-amber-100 gap-0.5">
              {targetNoCoords ? <Text className="text-xs text-amber-700">{t.targetNoCoords}</Text> : null}
              {needsAddresses > 0 ? <Text className="text-xs text-amber-700">{t.needsAddresses.replace('{{n}}', String(needsAddresses))}</Text> : null}
            </View>
          ) : null}

          {loading ? (
            <View className="flex-1 items-center justify-center gap-2">
              <ActivityIndicator color={c.primary} />
              {geocoding ? <Text className="text-sm text-faint">{t.geocoding}</Text> : null}
            </View>
          ) : suggestions.length === 0 ? (
            <Text className="text-center text-sm text-faint py-16">{t.empty}</Text>
          ) : (
            <ScrollView className="flex-1" contentContainerClassName="pb-6">
              {suggestions.map(s => {
                const isOn = currentCrew.includes(s.employeeId);
                const nearby = s.nearbyJobs[0];
                return (
                  <View key={s.employeeId} className="px-5 py-3 border-b border-border-soft">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{s.name}</Text>
                        <View className="flex-row items-center gap-1 mt-1">
                          <MapPin size={12} color={c.faint} />
                          <Text className="text-xs text-muted">
                            {s.distanceMi != null
                              ? `${t.distanceMi.replace('{{n}}', String(s.distanceMi))} · ${basisLabel(s.basis)}`
                              : t.noLocation}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1 mt-1">
                          <Clock size={12} color={s.isFreeOnDate ? c.success : c.warning} />
                          <Text className={`text-xs ${s.isFreeOnDate ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {s.isFreeOnDate
                              ? t.freeOnDate
                              : s.nextFreeDate
                                ? t.busyNextFree.replace('{{date}}', shortDate(s.nextFreeDate))
                                : t.busyNoFree}
                          </Text>
                        </View>
                        {nearby ? (
                          <Pressable onPress={() => onSetDate(nearby.date)} className="mt-1.5 flex-row items-center gap-1">
                            <Navigation size={11} color={c.primary} />
                            <Text className="text-xs font-medium text-primary">
                              {t.scheduleThatDay.replace('{{day}}', shortDate(nearby.date))} · {nearby.distanceMi} mi
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Pressable
                        disabled={isOn}
                        onPress={() => onAddCrew(s.employeeId)}
                        className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 ${isOn ? 'bg-emerald-500/10' : 'bg-primary'}`}
                      >
                        {isOn ? <Check size={13} color={c.success} /> : <UserPlus size={13} color="#fff" />}
                        <Text className={`text-xs font-semibold ${isOn ? 'text-emerald-600' : 'text-white'}`}>{isOn ? t.added : t.add}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </RNModal>
  );
}

// Weather alerts settings — pluggable section rendered inside MapSettingsSheet.
// Visible only to businesses in WEATHER_ALPHA_BUSINESS_IDS (alpha gate).
//
// Controlled component: parent owns the WeatherConfig state and the save
// action. This keeps a single "Guardar" button at the bottom of the sheet
// for both pin styling + weather settings.

import { useEffect, useMemo, useState } from 'react';
import { Modal as RNModal, View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { Plus, Trash2, ChevronDown, X, Search, Check } from 'lucide-react-native';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  isWeatherFeatureEnabled,
  NOAA_EVENT_CATEGORIES,
  eventCarriesWind,
  type WeatherConfig,
} from '@amixos/shared/lib/weather';

interface Props {
  config: WeatherConfig;
  onChange: (next: WeatherConfig) => void;
}

export function WeatherSettingsSection({ config, onChange }: Props) {
  const { business } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.modules.map.weather;
  const gated = isWeatherFeatureEnabled(business?.id);
  // Open picker for a specific event row. null = closed.
  const [pickerForIdx, setPickerForIdx] = useState<number | null>(null);
  // Local draft of the excluded-states input. Parsing on every keystroke
  // would strip the user's comma before they can type the next state, so
  // we hold the raw string here and only normalize → array on blur.
  const [excludedDraft, setExcludedDraft] = useState(() => config.excluded_states.join(', '));
  // Collapsed by default so the save button isn't buried under a long list
  // of NOAA event rows. User taps the header to expand.
  const [eventsExpanded, setEventsExpanded] = useState(false);

  // Re-sync the draft when the saved config changes externally (e.g. the
  // sheet was just reopened with fresh business data).
  useEffect(() => {
    setExcludedDraft(config.excluded_states.join(', '));
  }, [config.excluded_states.join(',')]);

  if (!gated) return null;

  const commitExcluded = () => {
    const list = excludedDraft
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);
    onChange({ ...config, excluded_states: list });
    setExcludedDraft(list.join(', '));
  };

  const updateEvent = (idx: number, patch: Partial<WeatherConfig['events'][number]>) => {
    onChange({
      ...config,
      events: config.events.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    });
  };

  const addEvent = () => {
    // Append empty row + immediately open the picker so the user picks
    // a name before doing anything else. No more silent empty rows.
    const nextIdx = config.events.length;
    onChange({ ...config, events: [...config.events, { event: '', min_wind_speed: null, enabled: true }] });
    setEventsExpanded(true);
    setPickerForIdx(nextIdx);
  };

  const removeEvent = (idx: number) => {
    onChange({ ...config, events: config.events.filter((_, i) => i !== idx) });
  };

  // Events already chosen — disable them in the picker so a user can't
  // add the same alert type twice.
  const takenSet = useMemo(() => new Set(config.events.map((e) => e.event.toLowerCase())), [config.events]);

  return (
    <View>
      <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">{t.sectionTitle}</Text>
      <Text className="text-xs text-gray-500 mb-3">{t.sectionSubtitle}</Text>

      <View className="bg-gray-50 rounded-2xl p-4 gap-4">
        {/* Enabled toggle */}
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900">{t.enabledLabel}</Text>
            <Text className="text-xs text-gray-500 mt-0.5">{t.enabledSubtitle}</Text>
          </View>
          <Pressable
            onPress={() => onChange({ ...config, enabled: !config.enabled })}
            style={{ width: 44, height: 24 }}
            className={`relative rounded-full ${config.enabled ? 'bg-primary' : 'bg-gray-200'}`}
          >
            <View
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
              style={{ transform: [{ translateX: config.enabled ? 24 : 4 }] }}
            />
          </Pressable>
        </View>

        {/* Retention window — how long expired alerts persist before purge. */}
        <View>
          <Text className="text-xs text-gray-500 mb-1">{t.retentionLabel}</Text>
          <TextInput
            value={String(config.retention_days)}
            onChangeText={(v) => {
              const n = parseInt(v.replace(/\D/g, ''), 10);
              onChange({ ...config, retention_days: isNaN(n) ? 15 : Math.max(1, Math.min(90, n)) });
            }}
            keyboardType="number-pad"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
          <Text className="text-[10px] text-gray-400 mt-1">{t.retentionSubtitle}</Text>
        </View>

        {/* Focus radius — used by the map's "Storm focus" toggle. */}
        <View>
          <Text className="text-xs text-gray-500 mb-1">{t.proximityRadiusLabel}</Text>
          <TextInput
            value={String(config.proximity_radius_miles)}
            onChangeText={(v) => {
              const n = parseInt(v.replace(/\D/g, ''), 10);
              onChange({ ...config, proximity_radius_miles: isNaN(n) ? 50 : Math.max(1, Math.min(500, n)) });
            }}
            keyboardType="number-pad"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
          <Text className="text-[10px] text-gray-400 mt-1">{t.proximityRadiusSubtitle}</Text>
        </View>

        {/* Excluded states — comma-separated. Parsed on blur so commas can
            be typed without being stripped on every keystroke. */}
        <View>
          <Text className="text-xs text-gray-500 mb-1">{t.excludedStatesLabel}</Text>
          <TextInput
            value={excludedDraft}
            onChangeText={setExcludedDraft}
            onBlur={commitExcluded}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t.excludedStatesPlaceholder}
            placeholderTextColor="#9CA3AF"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </View>

        {/* Events — collapsible. Collapsed by default so the long NOAA list
            doesn't bury the Guardar button. */}
        <View>
          <Pressable
            onPress={() => setEventsExpanded((v) => !v)}
            className="flex-row items-center justify-between py-1 active:opacity-70"
          >
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-700">
                {t.eventsHeading}{' '}
                <Text className="text-gray-400 font-normal">({config.events.length})</Text>
              </Text>
              <Text className="text-[10px] text-gray-400 mt-0.5">{t.eventsSubtitle}</Text>
            </View>
            <View style={{ transform: [{ rotate: eventsExpanded ? '180deg' : '0deg' }] }}>
              <ChevronDown size={16} color="#6B7280" />
            </View>
          </Pressable>

          {eventsExpanded ? (
          <View className="gap-2 mt-2">
            {config.events.length === 0 ? (
              <Text className="text-xs text-gray-500 italic">{t.eventsEmpty}</Text>
            ) : (
              config.events.map((ev, idx) => {
                const isEnabled = ev.enabled !== false;
                // Container stays full opacity so the toggle is always
                // clearly visible + tappable. Dim only the inner content
                // (event picker + delete + min-wind input) when disabled.
                const dimStyle = { opacity: isEnabled ? 1 : 0.4 };
                return (
                  <View
                    key={idx}
                    className="rounded-xl bg-white border border-gray-200 p-3 gap-2"
                  >
                    <View className="flex-row items-center gap-2">
                      {/* Enable switch — same shape/colors as the master
                         "Activar alertas de clima" toggle so it reads as a
                         standard switch even when off. Smaller toggles with
                         gray-300 ended up invisible against the white row. */}
                      <Pressable
                        onPress={() => updateEvent(idx, { enabled: !isEnabled })}
                        style={{ width: 44, height: 24 }}
                        className={`relative rounded-full ${isEnabled ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <View
                          className="absolute top-1 w-4 h-4 rounded-full bg-white"
                          style={{ transform: [{ translateX: isEnabled ? 24 : 4 }] }}
                        />
                      </Pressable>
                      {/* Event name — opens canonical picker */}
                      <Pressable
                        onPress={() => setPickerForIdx(idx)}
                        style={dimStyle}
                        className="flex-1 flex-row items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 active:bg-gray-50"
                      >
                        <Text
                          className={`flex-1 text-sm ${ev.event ? 'text-gray-900' : 'text-gray-400'}`}
                          numberOfLines={1}
                        >
                          {ev.event || t.eventNamePlaceholder}
                        </Text>
                        <ChevronDown size={14} color="#6B7280" />
                      </Pressable>
                      <Pressable
                        onPress={() => removeEvent(idx)}
                        hitSlop={8}
                        style={dimStyle}
                        className="p-2 rounded-lg active:bg-gray-100"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                    {eventCarriesWind(ev.event) ? (
                      <View style={dimStyle}>
                        <Text className="text-[10px] text-gray-500 mb-1">{t.minWindLabel}</Text>
                        <TextInput
                          value={ev.min_wind_speed != null ? String(ev.min_wind_speed) : ''}
                          onChangeText={(v) => {
                            const n = parseInt(v.replace(/\D/g, ''), 10);
                            updateEvent(idx, { min_wind_speed: isNaN(n) || n <= 0 ? null : n });
                          }}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor="#9CA3AF"
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
            <Pressable
              onPress={addEvent}
              className="flex-row items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 active:bg-gray-100"
            >
              <Plus size={14} color="#4F46E5" />
              <Text className="text-sm text-primary font-semibold">{t.addEventBtn}</Text>
            </Pressable>
          </View>
          ) : null}
        </View>
      </View>

      {pickerForIdx !== null ? (
        <EventPicker
          currentValue={config.events[pickerForIdx]?.event ?? ''}
          taken={takenSet}
          onSelect={(name) => {
            updateEvent(pickerForIdx, { event: name });
            setPickerForIdx(null);
          }}
          onClose={() => setPickerForIdx(null)}
        />
      ) : null}
    </View>
  );
}

// ─── Event picker modal ────────────────────────────────────────────────
// Grouped + searchable list of canonical NOAA NWS event names. Greys out
// names already chosen for another row so the user can't pick duplicates.
function EventPicker({
  currentValue,
  taken,
  onSelect,
  onClose,
}: {
  currentValue: string;
  taken: Set<string>;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.modules.map.weather;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Build the rendered list: when search is empty, group by category;
  // when searching, show a flat filtered list (groups feel noisy in search).
  const filteredGroups = useMemo(() => {
    if (!q) return NOAA_EVENT_CATEGORIES.map((g) => ({ ...g }));
    return [{
      category: 'general',
      events: NOAA_EVENT_CATEGORIES.flatMap((g) => g.events).filter((e) =>
        e.toLowerCase().includes(q),
      ),
    }];
  }, [q]);
  const isEmpty = filteredGroups.every((g) => g.events.length === 0);

  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/40 items-center justify-center px-6">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
          style={{ maxHeight: '80%' }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-3 bg-gray-50 border-b border-gray-200">
            <Text className="text-lg font-bold text-gray-900">{t.eventPickerTitle}</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1.5 rounded-lg active:bg-gray-200">
              <X size={20} color="#374151" />
            </Pressable>
          </View>

          {/* Search */}
          <View className="px-4 pt-3 pb-2">
            <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-gray-100">
              <Search size={14} color="#9CA3AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t.eventPickerSearchPlaceholder}
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-sm text-gray-900"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>

          <ScrollView className="px-2 pb-3" contentContainerStyle={{ paddingBottom: 16 }}>
            {isEmpty ? (
              <Text className="text-xs text-gray-400 italic mt-4 text-center">
                {t.eventPickerNoResults}
              </Text>
            ) : (
              filteredGroups.map((group) =>
                group.events.length === 0 ? null : (
                  <View key={group.category} className="mt-2">
                    {!q ? (
                      <Text className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-gray-400">
                        {t.eventCategories[group.category as keyof typeof t.eventCategories] ?? group.category}
                      </Text>
                    ) : null}
                    {group.events.map((name) => {
                      const isTaken = taken.has(name.toLowerCase()) && name !== currentValue;
                      const isCurrent = name === currentValue;
                      return (
                        <Pressable
                          key={name}
                          onPress={() => !isTaken && onSelect(name)}
                          disabled={isTaken}
                          className={`flex-row items-center justify-between px-3 py-2.5 rounded-lg ${
                            isTaken ? 'opacity-40' : 'active:bg-gray-100'
                          }`}
                        >
                          <Text className={`text-sm ${isCurrent ? 'text-primary font-semibold' : 'text-gray-800'}`}>
                            {name}
                          </Text>
                          {isCurrent ? <Check size={16} color="#4F46E5" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ),
              )
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

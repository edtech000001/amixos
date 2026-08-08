// Map settings sheet — full-screen page with all customization controls:
//   - Map type (standard / satellite / hybrid / terrain)
//   - Clustering toggle
//   - Pin size (S / M / L)
//   - Per-layer pin style:
//       Default style (always shown) — single clickable pin badge
//       Mode: "Sin regla" or "Regla personalizada"
//       If custom: field picker + rules list (each rule has its own pin badge)
//
// Persistence:
//   - Device prefs (map type, clustering, pin size) — caller owns these
//     via deviceSettings + onDeviceSettingsChange.
//   - Pin config (default style + rules) — saved to businesses.map_pin_config
//     when "Guardar" is tapped.

import { useEffect, useState } from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Plus, Trash2, ChevronDown, ChevronLeft, Check, Search, X, Eye, EyeOff } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import { createSupabaseClient } from '@/lib/supabase';
import {
  PIN_COLORS,
  ALL_PIN_ICONS,
  PIN_ICON_CATEGORIES,
  STANDARD_FIELDS_BY_LAYER,
  type MapPinIcon,
  type PinIconCategory,
} from '@amixos/shared/lib/mapPinPresets';
import type {
  MapPinConfig,
  MapPinLayerConfig,
  MapPinRule,
} from '@/lib/auth/store';
import { PinIcon, PinBadge } from '@/lib/mapPinIcons';
import { WeatherSettingsSection } from './WeatherSettingsSection';
import {
  DEFAULT_WEATHER_CONFIG,
  isWeatherFeatureEnabled,
  normalizeWeatherConfig,
  type WeatherConfig,
} from '@amixos/shared/lib/weather';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { ChipScroll } from '@amixos/shared/ui/ChipScroll';

export type MapType = 'standard' | 'satellite' | 'hybrid' | 'terrain';
export type PinSize = 'small' | 'medium' | 'large';

export interface DeviceMapSettings {
  mapType: MapType;
  clustering: boolean;
  pinSize: PinSize;
  // Outreach mode: a client pin is flagged "contacted" (green ✓ + dimmed)
  // when its last communication is within this many days. Persisted so the
  // window syncs across the owner's devices. Always >= 1.
  outreachDays: number;
}

interface FieldOption { key: string; label: string; }

type Layer = 'clients' | 'jobs' | 'employees' | 'weather';
const BASE_LAYERS: Layer[] = ['clients', 'jobs', 'employees'];

const DEFAULT_LAYER_CONFIG: Record<Layer, MapPinLayerConfig> = {
  clients:   { default_color: '#0EA5E9', default_icon: 'map-pin',          field_key: null, rules: [] },
  jobs:      { default_color: '#10B981', default_icon: 'map-pin',          field_key: null, rules: [] },
  employees: { default_color: '#F59E0B', default_icon: 'map-pin',          field_key: null, rules: [] },
  weather:   { default_color: '#DC2626', default_icon: 'cloud-lightning',  field_key: null, rules: [] },
};

// Map a Layer key → the Supabase table that backs its match-count query.
// Same for all standard layers; weather points at the alerts cache.
const LAYER_TABLE: Record<Layer, string> = {
  clients: 'clients',
  jobs: 'jobs',
  employees: 'employees',
  weather: 'weather_alerts',
};

export function MapSettingsSheet({
  open,
  onClose,
  deviceSettings,
  onPinConfigSaved,
  onOpenClient,
}: {
  open: boolean;
  onClose: () => void;
  deviceSettings: DeviceMapSettings;
  onPinConfigSaved: () => void;
  // Fired from the Ignored Clients section when the user taps a row.
  // Parent decides what to do (typically close this sheet + navigate to
  // the client detail page).
  onOpenClient: (id: string) => void;
}) {
  const { business, refetchBusiness } = useApp();
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.modules.map;

  const [config, setConfig] = useState<Required<MapPinConfig>>({
    clients: { ...DEFAULT_LAYER_CONFIG.clients },
    jobs: { ...DEFAULT_LAYER_CONFIG.jobs },
    employees: { ...DEFAULT_LAYER_CONFIG.employees },
    weather: { ...DEFAULT_LAYER_CONFIG.weather },
  });
  const [fieldOptionsByLayer, setFieldOptionsByLayer] = useState<Record<Layer, FieldOption[]>>({
    clients: [], jobs: [], employees: [], weather: [],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
  // Layers collapsed by default — opening the sheet shouldn't dump a
  // wall of expanded rules in the user's face. They tap a layer header
  // to expand it.
  const [openLayer, setOpenLayer] = useState<Layer | null>(null);
  // Combined color+icon picker target. ruleIdx 'default' edits the layer's
  // default style; a number edits the rule at that index.
  const [picker, setPicker] = useState<
    | { layer: Layer; ruleIdx: number | 'default' }
    | null
  >(null);
  // Per-rule live match counts. Indexed by layer, then by rule index.
  // null means "loading" or "not yet fetched"; a number is the resolved
  // count. Fetched (debounced) whenever the rule list of any layer
  // changes — see the effect below.
  const [matchCounts, setMatchCounts] = useState<Record<Layer, (number | null)[]>>({
    clients: [], jobs: [], employees: [], weather: [],
  });
  // Weather config — only meaningful when the business is in the alpha
  // gate. Saved alongside pin config on the single Guardar tap below.
  const weatherGated = isWeatherFeatureEnabled(business?.id);
  const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>(DEFAULT_WEATHER_CONFIG);
  // Staged device settings — radios + toggles inside the sheet edit this
  // local copy; only on Save do we commit upward via onDeviceSettingsChange.
  // Closing the sheet without saving discards the changes.
  const [stagedDeviceSettings, setStagedDeviceSettings] = useState<DeviceMapSettings>(deviceSettings);

  useEffect(() => {
    if (!open || !business) return;
    const fromDb = (business.map_pin_config ?? {}) as MapPinConfig;
    setConfig({
      clients:   { ...DEFAULT_LAYER_CONFIG.clients,   ...(fromDb.clients ?? {}),   rules: fromDb.clients?.rules ?? [] },
      jobs:      { ...DEFAULT_LAYER_CONFIG.jobs,      ...(fromDb.jobs ?? {}),      rules: fromDb.jobs?.rules ?? [] },
      employees: { ...DEFAULT_LAYER_CONFIG.employees, ...(fromDb.employees ?? {}), rules: fromDb.employees?.rules ?? [] },
      weather:   { ...DEFAULT_LAYER_CONFIG.weather,   ...(fromDb.weather ?? {}),   rules: fromDb.weather?.rules ?? [] },
    });
    setMsg(null);
    // Weather config hydrate (normalizer guards against missing fields /
    // legacy shapes).
    if (weatherGated) {
      setWeatherConfig(normalizeWeatherConfig(business.weather_config));
    }
    // Snapshot the persisted device settings into local staging state
    // so edits in the sheet don't take effect until Save.
    setStagedDeviceSettings(deviceSettings);
    // Always start with all layer cards collapsed so the sheet doesn't
    // open to a wall of rules on the second+ visit.
    setOpenLayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, business?.id, business?.map_pin_config, business?.weather_config]);

  useEffect(() => {
    if (!open || !business) return;
    let cancelled = false;
    (async () => {
      const tFields = full.dashboard.clients.fields;
      const tJobsNew = full.dashboard.jobs.new;
      const tEmpModal = full.dashboard.employees.modal;
      // Full label map keyed by `${layer}.${field_key}`. Falls back to
      // the raw key if we missed one — better than crashing.
      const standardLabel = (layer: Layer, key: string): string => {
        if (layer === 'clients') {
          switch (key) {
            case 'first_name':   return tFields.firstName;
            case 'last_name':    return tFields.lastName;
            case 'company':      return tFields.company;
            case 'phone_cell':   return tFields.phoneCell;
            case 'phone_office': return tFields.phoneOffice;
            case 'email_office': return tFields.emailOffice;
            case 'email_home':   return tFields.emailHome;
            case 'address':      return tFields.addressLine1;
            case 'city':         return tFields.city;
            case 'state':        return tFields.state;
            case 'zip_code':     return tFields.zipCode;
          }
        }
        if (layer === 'jobs') {
          switch (key) {
            case 'title':          return tJobsNew.titleLabelJob;
            case 'description':    return tJobsNew.descriptionLabel;
            case 'status':         return tJobsNew.statusLabel;
            case 'priority':       return tJobsNew.priorityLabel;
            case 'job_address':    return tJobsNew.addressLabel;
            case 'job_city':       return tJobsNew.cityLabel;
            case 'job_state':      return tJobsNew.stateLabel;
            case 'scheduled_date': return tJobsNew.dateLabel;
          }
        }
        if (layer === 'weather') {
          // Just title-case the column names — weather field labels are
          // close enough to their column names that translation would feel
          // forced (event="Event", severity="Severity", etc.).
          switch (key) {
            case 'event':      return 'Event';
            case 'severity':   return 'Severity';
            case 'headline':   return 'Headline';
            case 'area_desc':  return 'Area';
            case 'county':     return 'County';
            case 'state':      return 'State';
          }
        }
        if (layer === 'employees') {
          switch (key) {
            case 'first_name': return tEmpModal.firstNameLabel.replace(' *', '');
            case 'last_name':  return tEmpModal.lastNameLabel;
            case 'role':       return tEmpModal.roleLabel;
            case 'phone':      return tEmpModal.phoneLabel;
            case 'email':      return tEmpModal.emailLabel;
            case 'address':    return tEmpModal.addressLabel;
            case 'city':       return tEmpModal.cityLabel;
            case 'state':      return tEmpModal.stateLabel;
            case 'zip_code':   return tEmpModal.zipLabel;
            case 'pay_type':   return tEmpModal.payTypeLabel;
            case 'hire_date':  return tEmpModal.hireDateLabel;
          }
        }
        return key;
      };
      type Custom = { field_key: string; field_label: string };
      const [cl, jb, em] = await Promise.all([
        supabase.from('client_field_templates').select('field_key, field_label, field_label_es, field_label_en').eq('business_id', business.id).order('sort_order'),
        supabase.from('job_field_templates').select('field_key, field_label, field_label_es, field_label_en').eq('business_id', business.id).order('sort_order'),
        supabase.from('employee_field_templates').select('field_key, field_label, field_label_es, field_label_en').eq('business_id', business.id).order('sort_order'),
      ]);
      if (cancelled) return;
      const build = (layer: Layer, customs: Custom[]): FieldOption[] => {
        const std = STANDARD_FIELDS_BY_LAYER[layer].map(key => ({ key, label: standardLabel(layer, key) }));
        return [...std, ...customs.map(c => ({ key: c.field_key, label: c.field_label }))];
      };
      setFieldOptionsByLayer({
        clients:   build('clients',   localizeTemplates((cl.data ?? []) as Custom[], locale)),
        jobs:      build('jobs',      localizeTemplates((jb.data ?? []) as Custom[], locale)),
        employees: build('employees', localizeTemplates((em.data ?? []) as Custom[], locale)),
        // Weather has no per-business custom fields — just the standard
        // alert columns from NOAA.
        weather:   build('weather', []),
      });
    })();
    return () => { cancelled = true; };
  }, [open, business?.id, locale]);

  // Debounced per-rule match counts. Runs DIRECT Supabase queries —
  // RLS already scopes to the business so no server round-trip needed.
  // 500ms debounce so typing in a value field doesn't fire on every keystroke.
  useEffect(() => {
    if (!open || !business) return;
    const timer = setTimeout(() => {
      void (async () => {
        const activeLayers: Layer[] = weatherGated ? [...BASE_LAYERS, 'weather'] : BASE_LAYERS;
        for (const layer of activeLayers) {
          const rules = config[layer].rules;
          if (rules.length === 0) {
            setMatchCounts(prev => ({ ...prev, [layer]: [] }));
            continue;
          }
          const standardCols = STANDARD_FIELDS_BY_LAYER[layer] ?? [];
          const counts = await Promise.all(rules.map(async (r) => {
            const fieldKey = r.field_key ?? config[layer].field_key ?? null;
            const op = r.operator ?? 'equals';
            if (!fieldKey) return 0;
            // Operators that require a value: skip if the user hasn't
            // typed one yet (avoids matching everything).
            const valueRequired = op !== 'has_value';
            if (valueRequired && (typeof r.value !== 'string' || !r.value.trim())) return 0;
            const value = r.value?.trim() ?? '';
            // weather_alerts has no custom_fields column — fall back to the
            // raw key (rules on unknown columns will just return 0).
            const column = standardCols.includes(fieldKey)
              ? fieldKey
              : (layer === 'weather' ? fieldKey : `custom_fields->>${fieldKey}`);
            let q = supabase.from(LAYER_TABLE[layer]).select('id', { count: 'exact', head: true })
              .eq('business_id', business.id);
            if (layer === 'jobs') {
              q = q.not('status', 'in', '("cancelled","declined")');
            }
            switch (op) {
              case 'equals':
                q = q.ilike(column, value);
                break;
              case 'not_equals':
                // Supabase doesn't have a built-in case-insensitive neq;
                // fall back to case-sensitive — close enough for counts.
                q = q.neq(column, value);
                break;
              case 'has_value':
                q = q.not(column, 'is', null).neq(column, '');
                break;
              case 'contains':
                q = q.ilike(column, `%${value}%`);
                break;
              case 'gt':  q = q.gt(column, value);  break;
              case 'gte': q = q.gte(column, value); break;
              case 'lt':  q = q.lt(column, value);  break;
              case 'lte': q = q.lte(column, value); break;
            }
            const { count } = await q;
            return count ?? 0;
          }));
          setMatchCounts(prev => ({ ...prev, [layer]: counts }));
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, business?.id, JSON.stringify(config)]);

  const updateLayer = (layer: Layer, patch: Partial<MapPinLayerConfig>) =>
    setConfig(prev => ({ ...prev, [layer]: { ...prev[layer], ...patch } }));
  const updateRule = (layer: Layer, idx: number, patch: Partial<MapPinRule>) =>
    setConfig(prev => ({
      ...prev,
      [layer]: { ...prev[layer], rules: prev[layer].rules.map((r, i) => i === idx ? { ...r, ...patch } : r) },
    }));
  const addRule = (layer: Layer) =>
    setConfig(prev => ({
      ...prev,
      [layer]: {
        ...prev[layer],
        rules: [
          ...prev[layer].rules,
          {
            // Per-rule field — default to the first available field on
            // the layer so the dropdown isn't empty out of the gate. Falls
            // back to '' if there are no fields (rare).
            field_key: fieldOptionsByLayer[layer][0]?.key ?? '',
            value: '',
            color: prev[layer].default_color,
            icon: prev[layer].default_icon,
          },
        ],
      },
    }));
  const removeRule = (layer: Layer, idx: number) =>
    setConfig(prev => ({
      ...prev,
      [layer]: { ...prev[layer], rules: prev[layer].rules.filter((_, i) => i !== idx) },
    }));

  const onSave = async () => {
    if (!business) return;
    setSaving(true);
    setMsg(null);

    // Pin config + view settings save — direct Supabase write (RLS handles
    // auth). View settings (map type / clustering / pin size) live on the
    // business row so they sync across the owner's devices.
    const { error: pinErr } = await supabase
      .from('businesses')
      .update({ map_pin_config: config, map_view_settings: stagedDeviceSettings })
      .eq('id', business.id);
    if (pinErr) {
      setSaving(false);
      setMsg({ text: t.saveError, isError: true });
      return;
    }

    // Weather config save — routes through API so the alpha gate is
    // enforced server-side. Skipped when not gated for this business.
    if (weatherGated) {
      const apiBaseUrl = getApiBaseUrl();
      if (apiBaseUrl) {
        try {
          const jwt = await getJwt();
          const r = await fetch(`${apiBaseUrl}/api/v1/weather/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ business_id: business.id, config: weatherConfig }),
          });
          if (!r.ok) {
            setSaving(false);
            setMsg({ text: t.saveError, isError: true });
            return;
          }
        } catch {
          setSaving(false);
          setMsg({ text: t.saveError, isError: true });
          return;
        }
      }
    }

    setSaving(false);
    // refetchBusiness re-reads map_view_settings → MapScreen re-derives its
    // view prefs and re-renders with the new map type / clustering / size.
    await refetchBusiness();
    onPinConfigSaved();
    // Bounce back to the map so the user sees the result of their edits
    // immediately. Sheet stays usable on re-open.
    onClose();
  };

  const layerLabel: Record<Layer, string> = {
    clients: t.pinLayerClients,
    jobs: t.pinLayerJobs,
    employees: t.pinLayerEmployees,
    weather: t.weather.layerName,
  };
  // Render order — weather only shown to alpha-gated businesses, appended
  // after the standard three so it doesn't push core layers down.
  const visibleLayers: Layer[] = weatherGated ? [...BASE_LAYERS, 'weather'] : BASE_LAYERS;
  const mapTypeOptions: { key: MapType; label: string }[] = [
    { key: 'standard',  label: t.mapTypeStandard },
    { key: 'satellite', label: t.mapTypeSatellite },
    { key: 'hybrid',    label: t.mapTypeHybrid },
    { key: 'terrain',   label: t.mapTypeTerrain },
  ];
  const pinSizeOptions: { key: PinSize; label: string }[] = [
    { key: 'small',  label: t.pinSizeSmall },
    { key: 'medium', label: t.pinSizeMedium },
    { key: 'large',  label: t.pinSizeLarge },
  ];

  return (
    <RNModal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      {/* SafeAreaProvider required inside the modal — iOS modals with
         presentationStyle="fullScreen" render in a new window context. */}
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
          <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft bg-card">
            <Pressable onPress={onClose} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
              <ChevronLeft size={22} color={c.ink} />
            </Pressable>
            <Text className="ml-1 flex-1 text-lg font-semibold text-ink">{t.settingsTitle}</Text>
          </View>

          <ScrollView className="flex-1 bg-card" contentContainerClassName="px-5 py-5 pb-10 gap-5">
            {/* Map type */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-2">{t.mapTypeLabel}</Text>
              <View className="flex-row flex-wrap gap-2">
                {mapTypeOptions.map(opt => {
                  const on = stagedDeviceSettings.mapType === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setStagedDeviceSettings(prev => ({ ...prev, mapType: opt.key }))}
                      className={`px-3 py-2 rounded-xl border ${on ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                    >
                      <Text className={`text-sm font-medium ${on ? 'text-primary' : 'text-ink'}`}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Clustering */}
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-ink">{t.clusteringLabel}</Text>
                <Text className="text-xs text-muted mt-0.5">{t.clusteringSubtitle}</Text>
              </View>
              <Pressable
                onPress={() => setStagedDeviceSettings(prev => ({ ...prev, clustering: !prev.clustering }))}
                style={{ width: 44, height: 24 }}
                className={`relative rounded-full ${stagedDeviceSettings.clustering ? 'bg-primary' : 'bg-border'}`}
              >
                <View
                  className="absolute top-1 w-4 h-4 rounded-full bg-card"
                  style={{ transform: [{ translateX: stagedDeviceSettings.clustering ? 24 : 4 }] }}
                />
              </Pressable>
            </View>

            {/* Pin size */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-2">{t.pinSizeLabel}</Text>
              <View className="flex-row gap-2">
                {pinSizeOptions.map(opt => {
                  const on = stagedDeviceSettings.pinSize === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setStagedDeviceSettings(prev => ({ ...prev, pinSize: opt.key }))}
                      className={`flex-1 px-3 py-2 rounded-xl border ${on ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                    >
                      <Text className={`text-sm font-medium text-center ${on ? 'text-primary' : 'text-ink'}`}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Outreach window — how recent a contact must be to flag a pin
               with the green ✓ when outreach mode is on. */}
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-ink">{t.outreachDaysLabel}</Text>
                <Text className="text-xs text-muted mt-0.5">{t.outreachDaysSubtitle}</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => setStagedDeviceSettings(prev => ({ ...prev, outreachDays: Math.max(1, prev.outreachDays - 1) }))}
                  disabled={stagedDeviceSettings.outreachDays <= 1}
                  hitSlop={6}
                  style={{ width: 32, height: 32 }}
                  className={`rounded-lg border border-border bg-card items-center justify-center ${stagedDeviceSettings.outreachDays <= 1 ? 'opacity-40' : 'active:bg-surface'}`}
                >
                  <Text className="text-lg font-semibold text-ink">−</Text>
                </Pressable>
                <Text className="text-sm font-semibold text-ink text-center" style={{ minWidth: 56 }}>
                  {t.outreachDaysValue.replace('{{days}}', String(stagedDeviceSettings.outreachDays))}
                </Text>
                <Pressable
                  onPress={() => setStagedDeviceSettings(prev => ({ ...prev, outreachDays: Math.min(365, prev.outreachDays + 1) }))}
                  disabled={stagedDeviceSettings.outreachDays >= 365}
                  hitSlop={6}
                  style={{ width: 32, height: 32 }}
                  className={`rounded-lg border border-border bg-card items-center justify-center ${stagedDeviceSettings.outreachDays >= 365 ? 'opacity-40' : 'active:bg-surface'}`}
                >
                  <Text className="text-lg font-semibold text-ink">+</Text>
                </Pressable>
              </View>
            </View>

            {/* Layer style cards */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-1">{t.pinRulesHeading}</Text>
              <Text className="text-xs text-muted mb-3">{t.pinRulesSubtitle}</Text>

              <View className="gap-2">
                {visibleLayers.map(layer => {
                  const cfg = config[layer];
                  const expanded = openLayer === layer;
                  const fieldOpts = fieldOptionsByLayer[layer];
                  // Custom mode = any rule exists OR the legacy layer-level
                  // field_key is set (pre-existing rows). Clearing either
                  // returns the layer to "Sin regla".
                  const ruleMode: 'none' | 'custom' = (cfg.rules.length > 0 || cfg.field_key) ? 'custom' : 'none';
                  return (
                    <View key={layer} className="bg-surface rounded-2xl overflow-hidden">
                      <Pressable
                        onPress={() => setOpenLayer(expanded ? null : layer)}
                        className="flex-row items-center gap-4 px-4 py-3"
                      >
                        <View className="w-7 h-9 items-center justify-center">
                          <PinBadge iconKey={cfg.default_icon} color={cfg.default_color} iconColor={cfg.default_icon_color ?? '#FFFFFF'} size={24} />
                        </View>
                        <Text className="flex-1 text-sm font-semibold text-ink">{layerLabel[layer]}</Text>
                        {ruleMode === 'custom' ? (
                          <Text className="text-xs text-muted mr-2">
                            {fieldOpts.find(f => f.key === cfg.field_key)?.label ?? cfg.field_key} · {cfg.rules.length}
                          </Text>
                        ) : null}
                        <ChevronDown
                          size={16}
                          color={c.muted}
                          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                        />
                      </Pressable>

                      {expanded ? (
                        <View className="px-4 pb-4 gap-3 border-t border-border-soft">
                          {/* Default style — single clickable pin badge. */}
                          <View className="mt-3">
                            <Text className="text-xs text-muted mb-2">{t.defaultStyleLabel}</Text>
                            <Pressable
                              onPress={() => setPicker({ layer, ruleIdx: 'default' })}
                              className="self-start flex-row items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card active:bg-surface"
                            >
                              <PinBadge iconKey={cfg.default_icon} color={cfg.default_color} iconColor={cfg.default_icon_color ?? '#FFFFFF'} size={26} />
                              <Text className="text-xs text-muted">{t.editStylePinHint}</Text>
                            </Pressable>
                          </View>

                          {/* Mode toggle */}
                          <View>
                            <Text className="text-xs text-muted mb-2">{t.modeLabel}</Text>
                            <View className="flex-row gap-2">
                              <Pressable
                                onPress={() => updateLayer(layer, { field_key: null, rules: [] })}
                                className={`flex-1 px-3 py-2 rounded-xl border ${
                                  ruleMode === 'none' ? 'border-primary bg-primary/5' : 'border-border bg-card'
                                }`}
                              >
                                <Text className={`text-sm font-medium text-center ${ruleMode === 'none' ? 'text-primary' : 'text-ink'}`}>
                                  {t.modeNoRule}
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  // Switching INTO custom mode: seed with one
                                  // empty rule so the editor isn't blank. The
                                  // rule's field_key defaults to the first
                                  // available field. Layer-level field_key
                                  // stays null — that's the legacy path.
                                  if (ruleMode !== 'custom') addRule(layer);
                                }}
                                className={`flex-1 px-3 py-2 rounded-xl border ${
                                  ruleMode === 'custom' ? 'border-primary bg-primary/5' : 'border-border bg-card'
                                }`}
                              >
                                <Text className={`text-sm font-medium text-center ${ruleMode === 'custom' ? 'text-primary' : 'text-ink'}`}>
                                  {t.modeCustom}
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          {ruleMode === 'custom' ? (
                            <View className="gap-2">
                              {/* Order-matters note — short reminder that
                                 first-match-wins. Placed once at the top
                                 of the rule list so it's seen but not
                                 repeated per row. */}
                              <View className="flex-row items-start gap-1.5 bg-amber-500/10 border border-amber-100 rounded-lg px-2.5 py-2">
                                <Text className="text-[10px] text-amber-700 leading-4 flex-1">
                                  💡 {t.ruleOrderNote}
                                </Text>
                              </View>
                              <Text className="text-xs text-muted">{t.applyRuleToLabel}</Text>
                              {cfg.rules.length === 0 ? (
                                <Text className="text-xs text-faint italic">{t.rulesEmpty}</Text>
                              ) : (
                                cfg.rules.map((rule, idx) => {
                                  // Resolve effective field for this rule —
                                  // per-rule wins; fall back to legacy layer
                                  // field_key for pre-existing rows.
                                  const effectiveField = rule.field_key ?? cfg.field_key ?? '';
                                  const count = matchCounts[layer]?.[idx];
                                  const isLoading = count == null;
                                  const isHide = !!rule.hide;
                                  // Chip text + color depends on three states:
                                  // loading / hide-mode / normal match.
                                  const countText = isLoading
                                    ? '…'
                                    : isHide
                                      ? count === 1
                                        ? t.ruleHiddenCountSingle
                                        : t.ruleHiddenCount.replace('{{count}}', String(count))
                                      : count === 0
                                        ? t.ruleMatchCountZero
                                        : count === 1
                                          ? t.ruleMatchCountSingle
                                          : t.ruleMatchCount.replace('{{count}}', String(count));
                                  const chipBg = isLoading
                                    ? 'bg-border-soft'
                                    : isHide && count && count > 0
                                      ? 'bg-amber-500/10'
                                      : count && count > 0
                                        ? 'bg-emerald-500/10'
                                        : 'bg-border-soft';
                                  const chipText = isLoading
                                    ? 'text-faint'
                                    : isHide && count && count > 0
                                      ? 'text-amber-700'
                                      : count && count > 0
                                        ? 'text-emerald-700'
                                        : 'text-muted';
                                  return (
                                    <View key={idx} className="gap-1">
                                      <View className="flex-row ml-1">
                                        <View className={`px-2 py-0.5 rounded-full ${chipBg}`}>
                                          <Text className={`text-[10px] font-semibold ${chipText}`}>
                                            {countText}
                                          </Text>
                                        </View>
                                      </View>
                                      {/* Two-line layout: action row on top
                                         (pin, field, op, eye, trash), value
                                         input full-width on bottom. Gives
                                         the value field all the horizontal
                                         room it needs for long values. */}
                                      <View className="gap-2 bg-card rounded-xl border border-border-soft p-2">
                                        <View className="flex-row items-center gap-2">
                                          <Pressable
                                            onPress={() => setPicker({ layer, ruleIdx: idx })}
                                            className="items-center justify-center"
                                            hitSlop={6}
                                          >
                                            <PinBadge iconKey={rule.icon} color={rule.color} iconColor={rule.icon_color ?? cfg.default_icon_color ?? '#FFFFFF'} size={28} />
                                          </Pressable>
                                          <View className="flex-1">
                                            <FieldDropdown
                                              value={effectiveField}
                                              options={fieldOpts}
                                              placeholder={t.ruleFieldPlaceholder}
                                              onChange={(key) => updateRule(layer, idx, { field_key: key })}
                                            />
                                          </View>
                                          <OperatorPicker
                                            value={rule.operator ?? 'equals'}
                                            onChange={(op) => updateRule(layer, idx, { operator: op })}
                                            labels={{
                                              equals: t.operatorEquals,
                                              not_equals: t.operatorNotEquals,
                                              has_value: t.operatorHasValue,
                                              contains: t.operatorContains,
                                              gt: t.operatorGt,
                                              gte: t.operatorGte,
                                              lt: t.operatorLt,
                                              lte: t.operatorLte,
                                            }}
                                          />
                                          <Pressable
                                            onPress={() => updateRule(layer, idx, { hide: !rule.hide })}
                                            hitSlop={6}
                                            className={`p-2 rounded-lg ${
                                              rule.hide ? 'bg-amber-500/10 active:bg-amber-100' : 'active:bg-border-soft'
                                            }`}
                                          >
                                            {rule.hide
                                              ? <EyeOff size={14} color={c.warning} />
                                              : <Eye size={14} color={c.muted} />}
                                          </Pressable>
                                          <Pressable
                                            onPress={() => removeRule(layer, idx)}
                                            hitSlop={6}
                                            className="p-2 rounded-lg active:bg-red-500/10"
                                          >
                                            <Trash2 size={14} color={c.danger} />
                                          </Pressable>
                                        </View>
                                        {/* Value row — hidden when operator is
                                           has_value (no value needed). Otherwise
                                           full-width input below the action row. */}
                                        {(rule.operator ?? 'equals') === 'has_value' ? null : (
                                          <TextInput
                                            value={rule.value}
                                            onChangeText={v => updateRule(layer, idx, { value: v })}
                                            placeholder={t.ruleValuePlaceholder}
                                            placeholderTextColor={c.faint}
                                            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
                                          />
                                        )}
                                      </View>
                                    </View>
                                  );
                                })
                              )}
                              <Pressable
                                onPress={() => addRule(layer)}
                                className="flex-row items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-border active:bg-border-soft"
                              >
                                <Plus size={14} color={c.primary} />
                                <Text className="text-sm text-primary font-semibold">{t.addRuleBtn}</Text>
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Weather alerts — alpha feature. Renders nothing unless the
               business is in WEATHER_ALPHA_BUSINESS_IDS. State lives in the
               parent so the single Guardar below saves both pin + weather. */}
            <WeatherSettingsSection config={weatherConfig} onChange={setWeatherConfig} />

            {/* Ignored clients — restore-from-trash section. Renders nothing
               when no rows have geocoding_ignored=true. Reuses the existing
               pin-config-saved callback to trigger a parent re-fetch on
               restore (same effect: pin counts change). Collapsible since
               a long-running business can accumulate hundreds of rows. */}
            <IgnoredClientsSection onChanged={onPinConfigSaved} onOpenClient={onOpenClient} />

            {msg ? (
              <Text className={`text-xs ${msg.isError ? 'text-red-500' : 'text-emerald-600'}`}>{msg.text}</Text>
            ) : null}
            <Pressable
              onPress={onSave}
              disabled={saving}
              className="flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-primary active:opacity-80"
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text className="text-white font-semibold text-sm">{t.saveBtn}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>

      {/* Combined color + icon picker. Stays open until user taps Done so
         they can change both color and icon in a single interaction. */}
      {picker ? (
        <StylePickerModal
          picker={picker}
          config={config}
          onClose={() => setPicker(null)}
          onSelectColor={(color) => {
            if (picker.ruleIdx === 'default') updateLayer(picker.layer, { default_color: color });
            else updateRule(picker.layer, picker.ruleIdx, { color });
          }}
          onSelectIcon={(icon) => {
            if (picker.ruleIdx === 'default') updateLayer(picker.layer, { default_icon: icon });
            else updateRule(picker.layer, picker.ruleIdx, { icon });
          }}
          onSelectIconColor={(iconColor) => {
            if (picker.ruleIdx === 'default') updateLayer(picker.layer, { default_icon_color: iconColor });
            else updateRule(picker.layer, picker.ruleIdx, { icon_color: iconColor });
          }}
        />
      ) : null}
    </RNModal>
  );
}

// ─── Ignored clients section ────────────────────────────────────────────
// Lists every client the user has tagged with geocoding_ignored=true so
// they can un-ignore (restore) from one place, or tap through to the
// client detail page. Collapsible — a long-running business can
// accumulate hundreds, so the section opens closed by default and shows
// the count in its header.
function IgnoredClientsSection({
  onChanged,
  onOpenClient,
}: {
  onChanged: () => void;
  onOpenClient: (id: string) => void;
}) {
  const { business } = useApp();
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.modules.map;
  const supabase = createSupabaseClient();
  type Row = { id: string; first_name: string | null; last_name: string | null; company: string | null };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company')
        .eq('business_id', business.id)
        .eq('geocoding_ignored', true)
        .order('first_name', { ascending: true });
      if (!cancelled) {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [business?.id]);

  // Flip geocoding_ignored back to false. Optimistic removal; revert on
  // error so the user can retry.
  const restore = async (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase
      .from('clients')
      .update({ geocoding_ignored: false })
      .eq('id', id);
    if (error) {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company')
        .eq('id', id)
        .maybeSingle();
      if (data) setRows(prev => [...prev, data as Row]
        .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? '')));
      return;
    }
    onChanged();
  };

  // Don't render anything when there's nothing to manage — a permanent
  // empty card adds noise. The user only sees this section when there's
  // actually something to restore.
  if (loading || rows.length === 0) return null;

  return (
    <View>
      <Pressable
        onPress={() => setExpanded(v => !v)}
        className="flex-row items-center justify-between py-1 active:opacity-70"
      >
        <View className="flex-1 pr-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold text-faint uppercase">{t.ignoredSectionTitle}</Text>
            <View className="px-1.5 py-0.5 rounded-full bg-border-soft">
              <Text className="text-[10px] font-bold text-muted">{rows.length}</Text>
            </View>
          </View>
          <Text className="text-xs text-muted mt-1">{t.ignoredSectionSubtitle}</Text>
        </View>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown size={16} color={c.faint} />
        </View>
      </Pressable>
      {expanded ? (
        <View className="mt-3 rounded-2xl border border-border-soft bg-card overflow-hidden">
          {rows.map((r, i) => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || t.geocodeListUnnamed;
            return (
              <View
                key={r.id}
                className={`flex-row items-center ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                {/* Whole name area is a Pressable that navigates to the
                   client detail — handy when the user wants to inspect /
                   fix the address before restoring. */}
                <Pressable
                  onPress={() => onOpenClient(r.id)}
                  className="flex-1 min-w-0 px-4 py-3 active:bg-surface"
                >
                  <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{name}</Text>
                  {r.company ? (
                    <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>{r.company}</Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => void restore(r.id)}
                  accessibilityLabel={t.geocodeRestoreBtn}
                  hitSlop={6}
                  className="mr-3 flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 active:opacity-70"
                >
                  <Eye size={14} color={c.primary} />
                  <Text className="text-xs font-semibold text-primary">{t.geocodeRestoreBtn}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ─── Combined color + icon picker ───────────────────────────────────────
// Full-screen modal with the same SafeAreaProvider trick as the parent.
// Shows current preview, color row, category tabs, icon grid. Selections
// apply immediately to the underlying state via callbacks; Done just
// closes the modal.
function StylePickerModal({
  picker,
  config,
  onClose,
  onSelectColor,
  onSelectIcon,
  onSelectIconColor,
}: {
  picker: { layer: Layer; ruleIdx: number | 'default' };
  config: Required<MapPinConfig>;
  onClose: () => void;
  onSelectColor: (c: string) => void;
  onSelectIcon: (i: MapPinIcon) => void;
  onSelectIconColor: (c: string) => void;
}) {
  const { t: full } = useLang();
  const c = useThemeColors();
  const t = full.dashboard.modules.map;

  const layerCfg = config[picker.layer];
  const currentColor =
    picker.ruleIdx === 'default'
      ? layerCfg.default_color
      : layerCfg.rules[picker.ruleIdx]?.color ?? layerCfg.default_color;
  const currentIcon =
    picker.ruleIdx === 'default'
      ? layerCfg.default_icon
      : layerCfg.rules[picker.ruleIdx]?.icon ?? layerCfg.default_icon;
  const currentIconColor =
    picker.ruleIdx === 'default'
      ? (layerCfg.default_icon_color ?? '#FFFFFF')
      : (layerCfg.rules[picker.ruleIdx]?.icon_color ?? layerCfg.default_icon_color ?? '#FFFFFF');

  // Icon color palette = white + black (most common) + the standard pin
  // palette. White is the default so it's first.
  // White + near-black up front (most common icon colors), then the rest of
  // the palette. Dedupe by lowercased hex so adding #FFFFFF to PIN_COLORS
  // (or any future overlap) doesn't trip React's duplicate-key warning.
  const ICON_COLOR_PALETTE = Array.from(
    new Map(
      ['#FFFFFF', '#111827', ...PIN_COLORS].map((c) => [c.toLowerCase(), c]),
    ).values(),
  );

  const [activeCategory, setActiveCategory] = useState<PinIconCategory>(() => {
    // Default to the category that contains the current icon, so the
    // user sees their selection highlighted on open.
    return PIN_ICON_CATEGORIES.find(c => c.icons.includes(currentIcon as MapPinIcon)) ?? PIN_ICON_CATEGORIES[0];
  });
  // Substring search across all icons. When non-empty, the category tabs
  // are ignored and the grid shows everything that matches the query.
  const [query, setQuery] = useState('');
  const filteredIcons = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_PIN_ICONS.filter(k => k.includes(q));
  })();
  const visibleIcons = filteredIcons ?? activeCategory.icons;

  const categoryLabel = (i18nKey: PinIconCategory['i18nKey']): string => {
    const map = t.iconCategories;
    return map[i18nKey];
  };

  return (
    <RNModal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaProvider>
        <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
          <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-border-soft bg-card">
            <Pressable onPress={onClose} hitSlop={12} className="p-2 -ml-2 rounded-lg active:bg-border-soft">
              <ChevronLeft size={22} color={c.ink} />
            </Pressable>
            <Text className="ml-1 flex-1 text-lg font-semibold text-ink">{t.stylePickerTitle}</Text>
            <Pressable
              onPress={onClose}
              className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-primary active:opacity-80"
            >
              <Check size={14} color="#FFFFFF" />
              <Text className="text-white text-xs font-semibold">{full.common.buttons.done}</Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 bg-card" contentContainerClassName="px-5 py-5 pb-10 gap-5">
            {/* Preview */}
            <View className="items-center py-4 bg-surface rounded-2xl">
              <PinBadge iconKey={currentIcon} color={currentColor} iconColor={currentIconColor} size={56} />
            </View>

            {/* Pin color */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-2">{t.colorLabel}</Text>
              <View className="flex-row flex-wrap gap-2">
                {PIN_COLORS.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => onSelectColor(c)}
                    style={{ backgroundColor: c, width: 36, height: 36 }}
                    // White swatch needs a visible border so it's not lost
                    // against the picker's white panel background.
                    className={`rounded-xl border-2 ${
                      currentColor.toLowerCase() === c.toLowerCase()
                        ? 'border-gray-900'
                        : c.toLowerCase() === '#ffffff' ? 'border-border' : 'border-transparent'
                    }`}
                  />
                ))}
              </View>
            </View>

            {/* Icon color — white default, can switch to dark or any palette
               color when white contrast is poor (e.g. on yellow pins). */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-2">{t.iconColorLabel}</Text>
              <View className="flex-row flex-wrap gap-2">
                {ICON_COLOR_PALETTE.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => onSelectIconColor(c)}
                    style={{ backgroundColor: c, width: 36, height: 36 }}
                    className={`rounded-xl border-2 ${
                      currentIconColor.toLowerCase() === c.toLowerCase()
                        ? 'border-gray-900'
                        : c === '#FFFFFF' ? 'border-border' : 'border-transparent'
                    }`}
                  />
                ))}
              </View>
            </View>

            {/* Icon search + categories + grid */}
            <View>
              <Text className="text-xs font-semibold text-faint uppercase mb-2">{t.iconLabel}</Text>
              {/* Search box — substring match against the icon key. Typing
                 hides the category tabs and shows all matching icons. */}
              <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card mb-3">
                <Search size={14} color={c.faint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t.iconSearchPlaceholder}
                  placeholderTextColor={c.faint}
                  className="flex-1 text-sm text-ink"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={6}>
                    <X size={14} color={c.faint} />
                  </Pressable>
                ) : null}
              </View>

              {/* Category tabs — hidden during search since results span all categories. */}
              {!query ? (
                <ChipScroll contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                  {PIN_ICON_CATEGORIES.map(cat => {
                    const on = activeCategory.i18nKey === cat.i18nKey;
                    return (
                      <Pressable
                        key={cat.i18nKey}
                        onPress={() => setActiveCategory(cat)}
                        className={`px-3 py-1.5 rounded-full border ${on ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                      >
                        <Text className={`text-xs ${on ? 'text-primary font-semibold' : 'text-ink'}`}>
                          {categoryLabel(cat.i18nKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ChipScroll>
              ) : null}

              {/* Icon grid — visibleIcons is either the active category or the search results. */}
              {visibleIcons.length === 0 ? (
                <Text className="text-xs text-faint italic mt-3">{t.iconSearchNoResults}</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {visibleIcons.map(icon => {
                    const on = currentIcon === icon;
                    return (
                      <Pressable
                        key={icon}
                        onPress={() => onSelectIcon(icon)}
                        style={{ width: 56, height: 56 }}
                        className={`rounded-xl border items-center justify-center ${
                          on ? 'border-primary bg-primary/5' : 'border-border bg-card'
                        }`}
                      >
                        <PinIcon iconKey={icon} color={currentColor} size={26} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </RNModal>
  );
}

// ─── Per-rule operator picker ───────────────────────────────────────────
// Compact button shows the operator glyph; tapping opens a list with all
// 8 comparison operators. Default is `equals`.
type Operator =
  | 'equals' | 'not_equals' | 'has_value' | 'contains'
  | 'gt' | 'gte' | 'lt' | 'lte';

const OPERATOR_GLYPHS: Record<Operator, string> = {
  equals: '=',
  not_equals: '≠',
  has_value: '∗',
  contains: '⊃',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

function OperatorPicker({
  value,
  onChange,
  labels,
}: {
  value: Operator;
  onChange: (op: Operator) => void;
  labels: Record<Operator, string>;
}) {
  const [open, setOpen] = useState(false);
  const c = useThemeColors();
  const orderedOps: Operator[] = ['equals', 'not_equals', 'contains', 'has_value', 'gt', 'gte', 'lt', 'lte'];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        className={`w-7 h-7 rounded-lg border items-center justify-center ${
          value !== 'equals' ? 'border-primary bg-primary/5' : 'border-border bg-card'
        }`}
      >
        <Text className={`text-sm font-bold ${value !== 'equals' ? 'text-primary' : 'text-muted'}`}>
          {OPERATOR_GLYPHS[value]}
        </Text>
      </Pressable>
      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 bg-black/40 items-center justify-center px-6">
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl w-full max-w-sm overflow-hidden"
          >
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {orderedOps.map((op, i) => {
                const on = op === value;
                return (
                  <Pressable
                    key={op}
                    onPress={() => { onChange(op); setOpen(false); }}
                    className={`flex-row items-center gap-3 px-4 py-3 ${
                      i < orderedOps.length - 1 ? 'border-b border-border-soft' : ''
                    } ${on ? 'bg-primary/5' : 'active:bg-surface'}`}
                  >
                    <View className="w-7 h-7 rounded-lg border border-border items-center justify-center">
                      <Text className="text-sm font-bold text-ink">{OPERATOR_GLYPHS[op]}</Text>
                    </View>
                    <Text className={`flex-1 text-sm ${on ? 'text-primary font-semibold' : 'text-ink'}`}>
                      {labels[op]}
                    </Text>
                    {on ? <Check size={14} color={c.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

// ─── Per-rule field dropdown ────────────────────────────────────────────
// Lightweight dropdown: opens a nested modal listing fields. Compact
// trigger so the rule row stays single-line on phones.
function FieldDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: FieldOption[];
  placeholder: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t: full } = useLang();
  const c = useThemeColors();
  const tMap = full.dashboard.modules.map;
  const selected = options.find(o => o.key === value);
  // Show fade affordance only when there's enough content to scroll.
  // Threshold matches roughly the visible area at maxHeight 340 / row ~50px.
  const isScrollable = options.length > 7;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1 px-2 py-1.5 rounded-lg border border-border bg-card"
      >
        <Text className="text-xs text-ink flex-1" numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={12} color={c.muted} />
      </Pressable>
      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} className="flex-1 bg-black/40 items-center justify-center px-6">
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl w-full max-w-sm overflow-hidden"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            {/* Header — clearly distinct from the list rows below.
               Larger type, bolder weight, and a subtle gray background
               so it reads as a sheet title, not "row 0". */}
            <View className="flex-row items-center justify-between px-5 pt-4 pb-3 bg-surface border-b border-border">
              <Text className="text-lg font-bold text-ink">{tMap.applyRuleToLabel}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={8}
                className="p-1.5 rounded-lg active:bg-border"
              >
                <X size={20} color={c.muted} />
              </Pressable>
            </View>

            {/* List + bottom fade. ScrollView shows the native iOS scrollbar
               on touch; the fade is a permanent visual hint that there's
               more below. Wrap in a relative View so the fade can absolute
               on top of the bottom of the list. */}
            <View style={{ position: 'relative' }}>
              <ScrollView
                style={{ maxHeight: 340 }}
                // Extra bottom padding so the last item sits above the
                // fade gradient + the modal's rounded bottom edge.
                contentContainerStyle={{ paddingBottom: 28 }}
                showsVerticalScrollIndicator
                indicatorStyle="black"
              >
                {options.map((opt, i) => {
                  const on = opt.key === value;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => { onChange(opt.key); setOpen(false); }}
                      className={`flex-row items-center justify-between px-4 py-3 ${
                        i < options.length - 1 ? 'border-b border-border-soft' : ''
                      } ${on ? 'bg-primary/5' : 'active:bg-surface'}`}
                    >
                      <Text className={`text-sm ${on ? 'text-primary font-semibold' : 'text-ink'}`}>
                        {opt.label}
                      </Text>
                      {on ? <Check size={14} color={c.primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* Faked linear gradient — three stacked translucent views.
                 No extra dependency needed; effect is subtle but clear. */}
              {isScrollable ? (
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
                >
                  <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.35)' }} />
                  <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.65)' }} />
                  <View style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.95)' }} />
                </View>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

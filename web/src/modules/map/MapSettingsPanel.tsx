'use client';

// Web counterpart of mobile/modules/map/MapSettingsSheet.tsx — same data
// model, same UX. Renders inside the shared Modal component; the icon
// picker is a nested Modal so users can change both color and icon in
// one interaction before tapping Done.

import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown, Check, X, Search, Eye, EyeOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useApp, type MapPinConfig, type MapPinLayerConfig, type MapPinRule, type MapPinIcon } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { localizeTemplates } from '@amixos/shared/lib/fieldTemplates';
import {
  ALL_PIN_ICONS,
  PIN_COLORS,
  PIN_ICON_CATEGORIES,
  STANDARD_FIELDS_BY_LAYER,
  type PinIconCategory,
} from '@amixos/shared/lib/mapPinPresets';
import { PinIcon, PinBadge } from './pinIcons';
import { WeatherSettingsSection } from './WeatherSettingsSection';
import {
  DEFAULT_WEATHER_CONFIG,
  isWeatherFeatureEnabled,
  normalizeWeatherConfig,
  type WeatherConfig,
} from '@amixos/shared/lib/weather';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

export type MapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
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

type Layer = 'clients' | 'jobs' | 'employees' | 'weather';
const BASE_LAYERS: Layer[] = ['clients', 'jobs', 'employees'];

const DEFAULT_LAYER_CONFIG: Record<Layer, MapPinLayerConfig> = {
  clients:   { default_color: '#0EA5E9', default_icon: 'map-pin',         field_key: null, rules: [] },
  jobs:      { default_color: '#10B981', default_icon: 'map-pin',         field_key: null, rules: [] },
  employees: { default_color: '#F59E0B', default_icon: 'map-pin',         field_key: null, rules: [] },
  weather:   { default_color: '#DC2626', default_icon: 'cloud-lightning', field_key: null, rules: [] },
};

// Map a Layer key → the Supabase table that backs its match-count query.
const LAYER_TABLE: Record<Layer, string> = {
  clients: 'clients',
  jobs: 'jobs',
  employees: 'employees',
  weather: 'weather_alerts',
};

interface FieldOption { key: string; label: string; }

export function MapSettingsPanel({
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
  // Parent typically closes this panel + navigates to the client detail.
  onOpenClient: (id: string) => void;
}) {
  const { business, refetchBusiness } = useApp();
  const supabase = createSupabaseClient();
  const { t: full, locale } = useLang();
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
  // Collapsed by default — opening the panel shouldn't dump a wall of
  // rules in the user's face. Reset on each open via the effect below.
  const [openLayer, setOpenLayer] = useState<Layer | null>(null);
  const [picker, setPicker] = useState<{ layer: Layer; ruleIdx: number | 'default' } | null>(null);
  // Per-rule live match counts, indexed by layer + rule index. Fetched
  // (debounced) on every rule edit so users see "X matches" inline.
  const [matchCounts, setMatchCounts] = useState<Record<Layer, (number | null)[]>>({
    clients: [], jobs: [], employees: [], weather: [],
  });
  // Weather config — only meaningful when the alpha gate is on. Saved
  // alongside pin config on the single Guardar tap below.
  const weatherGated = isWeatherFeatureEnabled(business?.id);
  const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>(DEFAULT_WEATHER_CONFIG);
  // Staged device settings — radios + toggles edit this local copy; only
  // on Save do we commit upward via onDeviceSettingsChange. Closing the
  // panel without saving discards the changes.
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
    if (weatherGated) {
      setWeatherConfig(normalizeWeatherConfig(business.weather_config));
    }
    // Snapshot the persisted device settings — edits don't take effect
    // until Save.
    setStagedDeviceSettings(deviceSettings);
    // Always reset to collapsed state on open.
    setOpenLayer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, business?.id, business?.map_pin_config, business?.weather_config, weatherGated]);

  useEffect(() => {
    if (!open || !business) return;
    let cancelled = false;
    (async () => {
      const tFields = full.dashboard.clients.fields;
      const tJobsNew = full.dashboard.jobs.new;
      const tEmpModal = full.dashboard.employees.modal;
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
        if (layer === 'weather') {
          // Title-case the NOAA weather_alerts columns directly — no i18n.
          switch (key) {
            case 'event':     return 'Event';
            case 'severity':  return 'Severity';
            case 'headline':  return 'Headline';
            case 'area_desc': return 'Area';
            case 'county':    return 'County';
            case 'state':     return 'State';
          }
        }
        return key;
      };
      type Custom = { field_key: string; field_label: string; field_label_es?: string | null; field_label_en?: string | null };
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
        // Weather has no per-business custom fields — just the alert columns.
        weather:   build('weather',   []),
      });
    })();
    return () => { cancelled = true; };
  }, [open, business?.id, locale]);

  // Debounced per-rule match counts via direct Supabase queries. RLS
  // already scopes to the business, so no API round-trip needed.
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
            const valueRequired = op !== 'has_value';
            if (valueRequired && (typeof r.value !== 'string' || !r.value.trim())) return 0;
            const value = r.value?.trim() ?? '';
            // weather_alerts has no custom_fields column — fall back to the raw key.
            const column = standardCols.includes(fieldKey)
              ? fieldKey
              : (layer === 'weather' ? fieldKey : `custom_fields->>${fieldKey}`);
            let q = supabase.from(LAYER_TABLE[layer]).select('id', { count: 'exact', head: true })
              .eq('business_id', business.id);
            if (layer === 'jobs') {
              q = q.not('status', 'in', '("cancelled","declined")');
            }
            switch (op) {
              case 'equals':     q = q.ilike(column, value); break;
              case 'not_equals': q = q.neq(column, value); break;
              case 'has_value':  q = q.not(column, 'is', null).neq(column, ''); break;
              case 'contains':   q = q.ilike(column, `%${value}%`); break;
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
            // Per-rule field — defaults to the first available field so
            // the dropdown isn't empty out of the gate.
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

    // Pin config + view settings — direct Supabase write (RLS handles auth).
    // View settings (map type / clustering / pin size) live on the business
    // row so they sync across the owner's devices.
    const { error: pinErr } = await supabase
      .from('businesses')
      .update({ map_pin_config: config, map_view_settings: stagedDeviceSettings })
      .eq('id', business.id);
    if (pinErr) {
      setSaving(false);
      setMsg({ text: t.saveError, isError: true });
      return;
    }

    // Weather config — through API so the alpha gate is enforced server-side.
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
    // refetchBusiness re-reads map_view_settings → the map re-derives its
    // view prefs and re-renders with the new map type / clustering / size.
    await refetchBusiness();
    onPinConfigSaved();
    // Auto-close so the user lands back on the map with the new pins.
    onClose();
  };

  const layerLabel: Record<Layer, string> = {
    clients: t.pinLayerClients,
    jobs: t.pinLayerJobs,
    employees: t.pinLayerEmployees,
    weather: t.weather.layerName,
  };
  // Render order — weather only shown to alpha-gated businesses.
  const visibleLayers: Layer[] = weatherGated ? [...BASE_LAYERS, 'weather'] : BASE_LAYERS;
  const mapTypeOptions: { key: MapType; label: string }[] = [
    { key: 'roadmap',   label: t.mapTypeStandard },
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
    <>
      <Modal open={open} onClose={onClose} title={t.settingsTitle} size="lg">
        <div className="flex flex-col gap-5">
          {/* Map type */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.mapTypeLabel}</p>
            <div className="flex flex-wrap gap-2">
              {mapTypeOptions.map(opt => {
                const on = stagedDeviceSettings.mapType === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStagedDeviceSettings(prev => ({ ...prev, mapType: opt.key }))}
                    className={`px-3 py-1.5 rounded-xl border text-sm font-medium ${
                      on ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clustering */}
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-3">
              <p className="text-sm font-semibold text-gray-900">{t.clusteringLabel}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.clusteringSubtitle}</p>
            </div>
            <button
              type="button" role="switch" aria-checked={stagedDeviceSettings.clustering}
              onClick={() => setStagedDeviceSettings(prev => ({ ...prev, clustering: !prev.clustering }))}
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${stagedDeviceSettings.clustering ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: stagedDeviceSettings.clustering ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* Pin size */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.pinSizeLabel}</p>
            <div className="grid grid-cols-3 gap-2">
              {pinSizeOptions.map(opt => {
                const on = stagedDeviceSettings.pinSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStagedDeviceSettings(prev => ({ ...prev, pinSize: opt.key }))}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium text-center ${
                      on ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Outreach window — how recent a contact must be to flag a pin
             with the green ✓ when outreach mode is on. */}
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-3">
              <p className="text-sm font-semibold text-gray-900">{t.outreachDaysLabel}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.outreachDaysSubtitle}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setStagedDeviceSettings(prev => ({ ...prev, outreachDays: Math.max(1, prev.outreachDays - 1) }))}
                disabled={stagedDeviceSettings.outreachDays <= 1}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center"
                aria-label="-1"
              >
                −
              </button>
              <span className="min-w-[3.5rem] text-center text-sm font-semibold text-gray-900">
                {t.outreachDaysValue.replace('{{days}}', String(stagedDeviceSettings.outreachDays))}
              </span>
              <button
                type="button"
                onClick={() => setStagedDeviceSettings(prev => ({ ...prev, outreachDays: Math.min(365, prev.outreachDays + 1) }))}
                disabled={stagedDeviceSettings.outreachDays >= 365}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center"
                aria-label="+1"
              >
                +
              </button>
            </div>
          </div>

          {/* Layer style cards */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase">{t.pinRulesHeading}</p>
            <p className="text-xs text-gray-500 mb-3">{t.pinRulesSubtitle}</p>
            <div className="flex flex-col gap-2">
              {visibleLayers.map(layer => {
                const cfg = config[layer];
                const expanded = openLayer === layer;
                const fieldOpts = fieldOptionsByLayer[layer];
                // Custom mode = any rule exists OR the legacy layer-level
                // field_key is set (pre-existing rows).
                const ruleMode: 'none' | 'custom' = (cfg.rules.length > 0 || cfg.field_key) ? 'custom' : 'none';
                return (
                  <div key={layer} className="bg-gray-50 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setOpenLayer(expanded ? null : layer)}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-100/50"
                    >
                      <PinBadge iconKey={cfg.default_icon} color={cfg.default_color} iconColor={cfg.default_icon_color ?? '#FFFFFF'} size={24} />
                      <span className="flex-1 text-sm font-semibold text-gray-900 text-left">{layerLabel[layer]}</span>
                      {ruleMode === 'custom' && (
                        <span className="text-xs text-gray-500 mr-2">
                          {fieldOpts.find(f => f.key === cfg.field_key)?.label ?? cfg.field_key} · {cfg.rules.length}
                        </span>
                      )}
                      <ChevronDown size={16} className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
                        {/* Default style — clickable pin badge. */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">{t.defaultStyleLabel}</p>
                          <button
                            type="button"
                            onClick={() => setPicker({ layer, ruleIdx: 'default' })}
                            className="self-start flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                          >
                            <PinBadge iconKey={cfg.default_icon} color={cfg.default_color} iconColor={cfg.default_icon_color ?? '#FFFFFF'} size={26} />
                            <span className="text-xs text-gray-500">{t.editStylePinHint}</span>
                          </button>
                        </div>

                        {/* Mode toggle */}
                        <div>
                          <p className="text-xs text-gray-500 mb-2">{t.modeLabel}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => updateLayer(layer, { field_key: null, rules: [] })}
                              className={`px-3 py-2 rounded-xl border text-sm font-medium ${
                                ruleMode === 'none' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              {t.modeNoRule}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                // Seed one empty rule on entry so the editor
                                // isn't blank. Per-rule field_key defaults to
                                // first available field.
                                if (ruleMode !== 'custom') addRule(layer);
                              }}
                              className={`px-3 py-2 rounded-xl border text-sm font-medium ${
                                ruleMode === 'custom' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-700'
                              }`}
                            >
                              {t.modeCustom}
                            </button>
                          </div>
                        </div>

                        {ruleMode === 'custom' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-amber-700 leading-4 flex-1">
                                💡 {t.ruleOrderNote}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500">{t.applyRuleToLabel}</p>
                            {cfg.rules.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">{t.rulesEmpty}</p>
                            ) : (
                              cfg.rules.map((rule, idx) => {
                                const effectiveField = rule.field_key ?? cfg.field_key ?? '';
                                const count = matchCounts[layer]?.[idx];
                                const isLoading = count == null;
                                const isHide = !!rule.hide;
                                const countText = isLoading
                                  ? '…'
                                  : isHide
                                    ? count === 1 ? t.ruleHiddenCountSingle : t.ruleHiddenCount.replace('{{count}}', String(count))
                                    : count === 0 ? t.ruleMatchCountZero
                                    : count === 1 ? t.ruleMatchCountSingle
                                    : t.ruleMatchCount.replace('{{count}}', String(count));
                                const chipClass = isLoading
                                  ? 'bg-gray-100 text-gray-400'
                                  : isHide && count && count > 0
                                    ? 'bg-amber-50 text-amber-700'
                                    : count && count > 0
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-gray-100 text-gray-500';
                                return (
                                  <div key={idx} className="flex flex-col gap-1">
                                    <div className="flex ml-1">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${chipClass}`}>
                                        {countText}
                                      </span>
                                    </div>
                                    {/* Two-line layout: action row on top
                                       (pin, field, op, eye, trash), value
                                       input full-width on bottom. */}
                                    <div className="flex flex-col gap-2 bg-white rounded-xl border border-gray-100 p-2">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setPicker({ layer, ruleIdx: idx })}
                                          className="flex items-center justify-center shrink-0 hover:opacity-80"
                                          aria-label="Edit pin style"
                                        >
                                          <PinBadge iconKey={rule.icon} color={rule.color} iconColor={rule.icon_color ?? cfg.default_icon_color ?? '#FFFFFF'} size={28} />
                                        </button>
                                        <select
                                          value={effectiveField}
                                          onChange={(e) => updateRule(layer, idx, { field_key: e.target.value })}
                                          className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                        >
                                          {!effectiveField && (
                                            <option value="">{t.ruleFieldPlaceholder}</option>
                                          )}
                                          {fieldOpts.map(f => (
                                            <option key={f.key} value={f.key}>{f.label}</option>
                                          ))}
                                        </select>
                                        <select
                                          value={rule.operator ?? 'equals'}
                                          onChange={(e) => updateRule(layer, idx, { operator: e.target.value as 'equals' | 'not_equals' | 'has_value' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' })}
                                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                        >
                                          <option value="equals">= {t.operatorEquals}</option>
                                          <option value="not_equals">≠ {t.operatorNotEquals}</option>
                                          <option value="contains">⊃ {t.operatorContains}</option>
                                          <option value="has_value">∗ {t.operatorHasValue}</option>
                                          <option value="gt">&gt; {t.operatorGt}</option>
                                          <option value="gte">≥ {t.operatorGte}</option>
                                          <option value="lt">&lt; {t.operatorLt}</option>
                                          <option value="lte">≤ {t.operatorLte}</option>
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => updateRule(layer, idx, { hide: !rule.hide })}
                                          className={`p-2 rounded-lg ${
                                            rule.hide ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-100'
                                          }`}
                                          title={t.ruleHideTooltip}
                                        >
                                          {rule.hide
                                            ? <EyeOff size={14} className="text-amber-700" />
                                            : <Eye size={14} className="text-gray-500" />}
                                        </button>
                                        <button
                                          onClick={() => removeRule(layer, idx)}
                                          className="p-2 rounded-lg hover:bg-red-50"
                                          aria-label="Delete"
                                        >
                                          <Trash2 size={14} className="text-red-500" />
                                        </button>
                                      </div>
                                      {/* Value row — hidden when operator is
                                         has_value. Full-width input below the
                                         action row so long values fit. */}
                                      {(rule.operator ?? 'equals') === 'has_value' ? null : (
                                        <input
                                          value={rule.value}
                                          onChange={(e) => updateRule(layer, idx, { value: e.target.value })}
                                          placeholder={t.ruleValuePlaceholder}
                                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                            <button
                              onClick={() => addRule(layer)}
                              className="flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-gray-300 hover:bg-gray-100 text-sm font-semibold text-primary"
                            >
                              <Plus size={14} /> {t.addRuleBtn}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weather alerts — alpha feature. Renders nothing unless the
             business is in WEATHER_ALPHA_BUSINESS_IDS. State lives in the
             parent so the single Guardar below saves both pin + weather. */}
          <WeatherSettingsSection config={weatherConfig} onChange={setWeatherConfig} />

          {/* Ignored clients — restore-from-trash section. Renders nothing
             when no rows have geocoding_ignored=true. Reuses the pin-config
             saved callback to trigger the parent map re-fetch. Collapsible
             since the list can grow large over time. */}
          <IgnoredClientsSection onChanged={onPinConfigSaved} onOpenClient={onOpenClient} />

          {msg && (
            <p className={`text-xs ${msg.isError ? 'text-red-500' : 'text-emerald-600'}`}>{msg.text}</p>
          )}
          <Button onClick={onSave} loading={saving} fullWidth>{t.saveBtn}</Button>
        </div>
      </Modal>

      {picker && (
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
      )}
    </>
  );
}

// ─── Ignored clients section (web) ──────────────────────────────────────
// Mirrors the mobile counterpart in MapSettingsSheet.tsx. Lists clients
// the user has tagged geocoding_ignored=true and offers a one-tap restore
// or a click-through to the client detail. Hidden entirely when there's
// nothing to restore so it doesn't clutter the settings dialog.
// Collapsible — a long-running business can accumulate hundreds.
function IgnoredClientsSection({
  onChanged,
  onOpenClient,
}: {
  onChanged: () => void;
  onOpenClient: (id: string) => void;
}) {
  const { business } = useApp();
  const { t: full } = useLang();
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

  if (loading || rows.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between py-1 hover:opacity-70 text-left"
      >
        <div className="flex-1 pr-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">{t.ignoredSectionTitle}</p>
            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
              {rows.length}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t.ignoredSectionSubtitle}</p>
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded ? (
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white overflow-hidden">
          {rows.map((r, i) => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || t.geocodeListUnnamed;
            return (
              <div
                key={r.id}
                className={`flex items-center ${i < rows.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                {/* Whole name area routes to the client detail page so
                   the user can inspect / fix the address before restoring. */}
                <button
                  type="button"
                  onClick={() => onOpenClient(r.id)}
                  className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-gray-50"
                >
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  {r.company ? <p className="text-xs text-gray-500 mt-0.5 truncate">{r.company}</p> : null}
                </button>
                <button
                  type="button"
                  onClick={() => void restore(r.id)}
                  aria-label={t.geocodeRestoreBtn}
                  className="mr-3 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:opacity-70"
                >
                  <Eye size={14} className="text-primary" />
                  <span className="text-xs font-semibold text-primary">{t.geocodeRestoreBtn}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Combined color + icon picker (web) ─────────────────────────────────
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
  const t = full.dashboard.modules.map;

  const layerCfg = config[picker.layer];
  const currentColor = picker.ruleIdx === 'default'
    ? layerCfg.default_color
    : layerCfg.rules[picker.ruleIdx]?.color ?? layerCfg.default_color;
  const currentIcon = picker.ruleIdx === 'default'
    ? layerCfg.default_icon
    : layerCfg.rules[picker.ruleIdx]?.icon ?? layerCfg.default_icon;
  const currentIconColor = picker.ruleIdx === 'default'
    ? (layerCfg.default_icon_color ?? '#FFFFFF')
    : (layerCfg.rules[picker.ruleIdx]?.icon_color ?? layerCfg.default_icon_color ?? '#FFFFFF');
  // Dedupe by lowercased hex so adding #FFFFFF to PIN_COLORS doesn't trip
  // React's duplicate-key warning.
  const ICON_COLOR_PALETTE = Array.from(
    new Map(
      ['#FFFFFF', '#111827', ...PIN_COLORS].map((c) => [c.toLowerCase(), c]),
    ).values(),
  );

  const [activeCategory, setActiveCategory] = useState<PinIconCategory>(() => {
    return PIN_ICON_CATEGORIES.find(c => c.icons.includes(currentIcon as never)) ?? PIN_ICON_CATEGORIES[0];
  });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-900">{t.stylePickerTitle}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary hover:opacity-80"
            >
              <Check size={14} className="text-white" />
              <span className="text-white text-xs font-semibold">{full.common.buttons.done}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Preview */}
          <div className="flex items-center justify-center py-4 bg-gray-50 rounded-2xl">
            <PinBadge iconKey={currentIcon} color={currentColor} iconColor={currentIconColor} size={56} />
          </div>

          {/* Pin color */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.colorLabel}</p>
            <div className="grid grid-cols-8 gap-2">
              {PIN_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onSelectColor(c)}
                  style={{ backgroundColor: c, width: 36, height: 36 }}
                  // White swatch needs a visible border so it's not lost
                  // against the picker's white panel background.
                  className={`rounded-xl border-2 ${
                    currentColor.toLowerCase() === c.toLowerCase()
                      ? 'border-gray-900'
                      : c.toLowerCase() === '#ffffff' ? 'border-gray-200' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Icon color — white default. Switch when contrast is poor. */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.iconColorLabel}</p>
            <div className="grid grid-cols-9 gap-2">
              {ICON_COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => onSelectIconColor(c)}
                  style={{ backgroundColor: c, width: 36, height: 36 }}
                  className={`rounded-xl border-2 ${
                    currentIconColor.toLowerCase() === c.toLowerCase()
                      ? 'border-gray-900'
                      : c === '#FFFFFF' ? 'border-gray-200' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Search + categories + icon grid */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">{t.iconLabel}</p>
            {/* Search box — substring match against the icon key. Typing
               hides the category tabs and shows all matching icons. */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white mb-3">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.iconSearchPlaceholder}
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                autoCorrect="off"
                autoCapitalize="none"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear">
                  <X size={14} className="text-gray-400" />
                </button>
              )}
            </div>

            {!query && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PIN_ICON_CATEGORIES.map(cat => {
                  const on = activeCategory.i18nKey === cat.i18nKey;
                  return (
                    <button
                      key={cat.i18nKey}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap ${
                        on ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {categoryLabel(cat.i18nKey)}
                    </button>
                  );
                })}
              </div>
            )}

            {visibleIcons.length === 0 ? (
              <p className="text-xs text-gray-400 italic mt-3">{t.iconSearchNoResults}</p>
            ) : (
              <div className="grid grid-cols-5 gap-2 mt-3">
                {visibleIcons.map(icon => {
                  const on = currentIcon === icon;
                  return (
                    <button
                      key={icon}
                      onClick={() => onSelectIcon(icon)}
                      className={`flex items-center justify-center aspect-square rounded-xl border ${
                        on ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <PinIcon iconKey={icon} color={currentColor} size={24} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

// Web counterpart of mobile/modules/map/WeatherSettingsSection.tsx — same
// data model, same alpha gate. Controlled component: parent owns state +
// save so a single Guardar button covers both pin + weather settings.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronDown, Search, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
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
  const [pickerForIdx, setPickerForIdx] = useState<number | null>(null);
  // See mobile WeatherSettingsSection: keep a local draft so commas can
  // be typed without being stripped on every keystroke.
  const [excludedDraft, setExcludedDraft] = useState(() => config.excluded_states.join(', '));
  // Collapsed by default so the save button isn't buried under a long list
  // of NOAA event rows. Header click expands.
  const [eventsExpanded, setEventsExpanded] = useState(false);

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
    onChange({ ...config, events: config.events.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
  };
  const addEvent = () => {
    const nextIdx = config.events.length;
    onChange({ ...config, events: [...config.events, { event: '', min_wind_speed: null, enabled: true }] });
    setEventsExpanded(true);
    setPickerForIdx(nextIdx);
  };
  const removeEvent = (idx: number) => onChange({ ...config, events: config.events.filter((_, i) => i !== idx) });

  const takenSet = useMemo(() => new Set(config.events.map((e) => e.event.toLowerCase())), [config.events]);

  return (
    <div>
      <p className="text-xs font-semibold text-faint uppercase mb-1">{t.sectionTitle}</p>
      <p className="text-xs text-muted mb-3">{t.sectionSubtitle}</p>

      <div className="bg-surface rounded-2xl p-4 space-y-4">
        {/* Enabled */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{t.enabledLabel}</p>
            <p className="text-xs text-muted mt-0.5">{t.enabledSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...config, enabled: !config.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${config.enabled ? 'bg-primary' : 'bg-border'}`}
            aria-pressed={config.enabled}
          >
            <span
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-card transition-transform"
              style={{ transform: config.enabled ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </button>
        </div>

        {/* Retention window — how long expired alerts persist before purge. */}
        <div>
          <label className="block text-xs text-muted mb-1">{t.retentionLabel}</label>
          <input
            type="number"
            min={1}
            max={90}
            value={config.retention_days}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...config, retention_days: isNaN(n) ? 15 : Math.max(1, Math.min(90, n)) });
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
          <p className="text-[10px] text-faint mt-1">{t.retentionSubtitle}</p>
        </div>

        {/* Focus radius — used by the map's "Storm focus" toggle. */}
        <div>
          <label className="block text-xs text-muted mb-1">{t.proximityRadiusLabel}</label>
          <input
            type="number"
            min={1}
            max={500}
            value={config.proximity_radius_miles}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...config, proximity_radius_miles: isNaN(n) ? 50 : Math.max(1, Math.min(500, n)) });
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
          <p className="text-[10px] text-faint mt-1">{t.proximityRadiusSubtitle}</p>
        </div>

        {/* Excluded states — parsed on blur (see mobile section comment). */}
        <div>
          <label className="block text-xs text-muted mb-1">{t.excludedStatesLabel}</label>
          <input
            type="text"
            value={excludedDraft}
            onChange={(e) => setExcludedDraft(e.target.value)}
            onBlur={commitExcluded}
            placeholder={t.excludedStatesPlaceholder}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
        </div>

        {/* Events — collapsible. Collapsed by default so the long NOAA list
            doesn't bury the Guardar button. */}
        <div>
          <button
            type="button"
            onClick={() => setEventsExpanded((v) => !v)}
            className="w-full flex items-center justify-between py-1 text-left hover:opacity-70"
            aria-expanded={eventsExpanded}
          >
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink">
                {t.eventsHeading}{' '}
                <span className="text-faint font-normal">({config.events.length})</span>
              </p>
              <p className="text-[10px] text-faint mt-0.5">{t.eventsSubtitle}</p>
            </div>
            <ChevronDown
              size={16}
              className={`text-muted shrink-0 transition-transform ${eventsExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {eventsExpanded && (
          <div className="space-y-2 mt-2">
            {config.events.length === 0 ? (
              <p className="text-xs text-muted italic">{t.eventsEmpty}</p>
            ) : (
              config.events.map((ev, idx) => {
                const isEnabled = ev.enabled !== false;
                // Container at full opacity so the toggle stays clearly
                // visible + clickable when disabled. Only dim the inner
                // content (event picker, delete, min-wind input).
                const dimClass = isEnabled ? '' : 'opacity-40';
                return (
                  <div
                    key={idx}
                    className="rounded-xl bg-card border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      {/* Enable switch — same shape/colors as the master
                         "Enable weather alerts" toggle so the off state is
                         clearly visible. */}
                      <button
                        type="button"
                        onClick={() => updateEvent(idx, { enabled: !isEnabled })}
                        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${isEnabled ? 'bg-primary' : 'bg-border'}`}
                        aria-pressed={isEnabled}
                      >
                        <span
                          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-card transition-transform"
                          style={{ transform: isEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerForIdx(idx)}
                        className={`flex-1 flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 hover:bg-surface text-left ${dimClass}`}
                      >
                        <span className={`flex-1 text-sm truncate ${ev.event ? 'text-ink' : 'text-faint'}`}>
                          {ev.event || t.eventNamePlaceholder}
                        </span>
                        <ChevronDown size={14} className="text-muted shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEvent(idx)}
                        className={`p-2 rounded-lg hover:bg-border-soft ${dimClass}`}
                        aria-label="Remove"
                      >
                        <Trash2 size={16} color="#EF4444" />
                      </button>
                    </div>
                    {eventCarriesWind(ev.event) ? (
                      <div className={dimClass}>
                        <label className="block text-[10px] text-muted mb-1">{t.minWindLabel}</label>
                        <input
                          type="number"
                          min={0}
                          value={ev.min_wind_speed ?? ''}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateEvent(idx, { min_wind_speed: isNaN(n) || n <= 0 ? null : n });
                          }}
                          placeholder="—"
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            <button
              type="button"
              onClick={addEvent}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-xl border border-dashed border-border hover:bg-border-soft"
            >
              <Plus size={14} color="#4F46E5" />
              <span className="text-sm text-primary font-semibold">{t.addEventBtn}</span>
            </button>
          </div>
          )}
        </div>
      </div>

      {pickerForIdx !== null && (
        <EventPicker
          currentValue={config.events[pickerForIdx]?.event ?? ''}
          taken={takenSet}
          onSelect={(name) => {
            updateEvent(pickerForIdx, { event: name });
            setPickerForIdx(null);
          }}
          onClose={() => setPickerForIdx(null)}
        />
      )}
    </div>
  );
}

// ─── Event picker modal ────────────────────────────────────────────────
// Grouped + searchable canonical NOAA NWS event names. Greys out names
// already chosen so the user can't pick duplicates.
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
    <Modal open onClose={onClose} title={t.eventPickerTitle} size="sm">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-border-soft mb-3">
        <Search size={14} className="text-faint shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.eventPickerSearchPlaceholder}
          className="flex-1 text-sm text-ink placeholder-faint focus:outline-none bg-transparent"
          autoFocus
        />
      </div>

      <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
        {isEmpty ? (
          <p className="text-xs text-faint italic mt-4 text-center">{t.eventPickerNoResults}</p>
        ) : (
          filteredGroups.map((group) =>
            group.events.length === 0 ? null : (
              <div key={group.category} className="mt-2 first:mt-0">
                {!q && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-faint">
                    {t.eventCategories[group.category as keyof typeof t.eventCategories] ?? group.category}
                  </p>
                )}
                {group.events.map((name) => {
                  const isTaken = taken.has(name.toLowerCase()) && name !== currentValue;
                  const isCurrent = name === currentValue;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => !isTaken && onSelect(name)}
                      disabled={isTaken}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left ${
                        isTaken ? 'opacity-40 cursor-not-allowed' : 'hover:bg-border-soft'
                      }`}
                    >
                      <span className={`text-sm ${isCurrent ? 'text-primary font-semibold' : 'text-ink'}`}>
                        {name}
                      </span>
                      {isCurrent && <Check size={16} color="#4F46E5" />}
                    </button>
                  );
                })}
              </div>
            ),
          )
        )}
      </div>
    </Modal>
  );
}

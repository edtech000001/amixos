'use client';

// Crew Finder (web) — ranks the business's crew for a job by proximity +
// availability, with route-aware "already near there on <day>" hints. Opens as
// a modal from the job form / job detail crew section.

import { useCallback, useEffect, useState } from 'react';
import { X, MapPin, Check, Clock, Navigation, Loader2, UserPlus } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useLang } from '@/i18n/LangProvider';
import { formatDateLong } from '@amixos/shared/lib/format';
import { fetchCrewFinderData, type CrewFinderTarget } from '@amixos/shared/lib/crewFinderData';
import { buildCrewSuggestions, type CrewSuggestion } from '@amixos/shared/lib/crewFinder';

interface Props {
  businessId: string;
  target: CrewFinderTarget;
  currentCrew: string[];
  onAddCrew: (employeeId: string) => void;
  onSetDate: (dateStr: string) => void;
  onClose: () => void;
}

export function CrewFinderPanel({ businessId, target, currentCrew, onAddCrew, onSetDate, onClose }: Props) {
  const { t: full, locale } = useLang();
  const t = full.dashboard.crewFinder;

  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState<CrewSuggestion[]>([]);
  const [needsAddresses, setNeedsAddresses] = useState(0);
  const [targetNoCoords, setTargetNoCoords] = useState(false);

  const load = useCallback(async () => {
    const supabase = createSupabaseClient();
    setLoading(true);
    let data = await fetchCrewFinderData(supabase, businessId, target);
    // Lazy geocode of employees missing home coords, then refetch once.
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
        /* offline / API down — fall back to whatever we have */
      }
      setGeocoding(false);
    }
    setNeedsAddresses(data.needsGeocodeCount);
    setTargetNoCoords(!data.targetHasCoords);
    setSuggestions(buildCrewSuggestions(data));
    setLoading(false);
  }, [businessId, target.jobId, target.lat, target.lng, target.scheduledDate, target.clientId]);

  useEffect(() => { void load(); }, [load]);

  const shortDate = (ymd: string) => formatDateLong(ymd, locale);
  const basisLabel = (basis: CrewSuggestion['basis']) =>
    basis === 'current-job' ? t.basisCurrentJob : basis === 'job' ? t.basisJob : t.basisHome;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-xl border border-border-soft w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2">
            <Navigation size={16} className="text-primary" />
            <div>
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              <p className="text-xs text-faint">{t.subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-border-soft" aria-label={t.close}>
            <X size={16} className="text-muted" />
          </button>
        </div>

        {(needsAddresses > 0 || targetNoCoords) && !loading ? (
          <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-100 flex flex-col gap-0.5">
            {targetNoCoords ? <p className="text-xs text-amber-700">{t.targetNoCoords}</p> : null}
            {needsAddresses > 0 ? (
              <p className="text-xs text-amber-700">{t.needsAddresses.replace('{{n}}', String(needsAddresses))}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-faint">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">{geocoding ? t.geocoding : ''}</span>
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-center text-sm text-faint py-16">{t.empty}</p>
          ) : (
            <div className="divide-y divide-border-soft">
              {suggestions.map(s => {
                const isOn = currentCrew.includes(s.employeeId);
                const nearby = s.nearbyJobs[0];
                return (
                  <div key={s.employeeId} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {/* Distance */}
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <MapPin size={12} className="text-faint" />
                            {s.distanceMi != null
                              ? `${t.distanceMi.replace('{{n}}', String(s.distanceMi))} · ${basisLabel(s.basis)}`
                              : t.noLocation}
                          </span>
                          {/* Availability */}
                          <span className={`inline-flex items-center gap-1 text-xs ${s.isFreeOnDate ? 'text-emerald-600' : 'text-amber-600'}`}>
                            <Clock size={12} />
                            {s.isFreeOnDate
                              ? t.freeOnDate
                              : s.nextFreeDate
                                ? t.busyNextFree.replace('{{date}}', shortDate(s.nextFreeDate))
                                : t.busyNoFree}
                          </span>
                        </div>
                        {/* Route-aware nearby hint */}
                        {nearby ? (
                          <button
                            type="button"
                            onClick={() => onSetDate(nearby.date)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Navigation size={11} />
                            {t.nearbyNote.replace('{{miles}}', String(nearby.distanceMi)).replace('{{day}}', shortDate(nearby.date))}
                            <span className="text-faint">·</span>
                            {t.scheduleThatDay.replace('{{day}}', shortDate(nearby.date))}
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={isOn}
                        onClick={() => onAddCrew(s.employeeId)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                          isOn ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary text-white hover:opacity-90'
                        }`}
                      >
                        {isOn ? <Check size={13} /> : <UserPlus size={13} />}
                        {isOn ? t.added : t.add}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

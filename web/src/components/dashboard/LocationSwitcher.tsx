'use client';

// Branch switcher — scopes day-to-day lists (jobs, employees) to one location
// or "All". Only renders when the business runs ≥2 branches; single-location
// businesses never see it. Reports stay business-wide regardless of this.
//
// Hidden for roles without the switchLocations capability: they're locked to
// their home branch and shouldn't roam other locations' data (also enforced by
// RLS). Gated on can.switchLocations.

import { useEffect, useRef, useState } from 'react';
import { MapPin, ChevronDown, Check } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { can } from '@amixos/shared/lib/permissions';

export function LocationSwitcher() {
  const { locations, activeLocationId, setActiveLocation, currentRole } = useApp();
  const { locale } = useLang();
  const es = locale !== 'en';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Single-location businesses + roles locked to their home branch never see it.
  if (locations.length < 2 || !can.switchLocations(currentRole)) return null;

  const allLabel = es ? 'Todas las ubicaciones' : 'All locations';
  const active = locations.find((l) => l.id === activeLocationId);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-xl border border-border bg-elevated px-3 py-2 text-sm text-left hover:bg-surface transition-colors">
        <MapPin size={15} className="text-faint shrink-0" />
        <span className="flex-1 truncate text-ink">{active?.name ?? allLabel}</span>
        <ChevronDown size={14} className="text-faint shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-elevated border border-border rounded-xl shadow-lg overflow-hidden">
          <button type="button" onClick={() => { setActiveLocation(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-surface ${!activeLocationId ? 'text-primary font-medium' : 'text-ink'}`}>
            <span className="flex-1 truncate">{allLabel}</span>
            {!activeLocationId && <Check size={14} />}
          </button>
          {locations.map((l) => (
            <button key={l.id} type="button" onClick={() => { setActiveLocation(l.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-surface ${activeLocationId === l.id ? 'text-primary font-medium bg-primary/5' : 'text-ink'}`}>
              <span className="flex-1 truncate">{l.name}</span>
              {activeLocationId === l.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

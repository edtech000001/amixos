'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';

/**
 * Click the active business name to drop down a list of every business the
 * user is a member of. Picking one flips the entire app's data context via
 * setActiveBusiness. Hidden when the user only belongs to one business.
 */
export function BusinessSwitcher() {
  const { businesses, business, activeBusinessId, setActiveBusiness } = useApp();
  const { t: full } = useLang();
  const tw = full.dashboard.workspaces;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!business) return null;

  if (businesses.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 size={16} className="text-primary" />
        </div>
        <span className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
          {business.name}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        aria-label={tw.switcherLabel}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 size={16} className="text-primary" />
        </div>
        <span className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
          {business.name}
        </span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>

      {open ? (
        <div className="absolute z-50 left-0 mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {tw.switcherLabel}
          </div>
          {businesses.map((b, i) => {
            const isActive = b.id === activeBusinessId;
            return (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBusiness(b.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                  i < businesses.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                  {b.city ? (
                    <p className="text-xs text-gray-500 truncate">
                      {b.city}
                      {b.state ? `, ${b.state}` : ''}
                    </p>
                  ) : null}
                </div>
                {isActive ? <Check size={16} className="text-primary shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

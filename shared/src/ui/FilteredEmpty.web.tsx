'use client';

// Web twin of FilteredEmpty.tsx — see there for the why. `onClear` must reset
// only filters that HIDE rows, never sort/grouping.

import type { ReactNode } from 'react';
import { XCircle } from 'lucide-react';
import { useLang } from '../i18n';

export interface FilteredEmptyProps {
  onClear: () => void;
  icon?: ReactNode;
  title?: string;
  compact?: boolean;
}

export function FilteredEmpty({ onClear, icon, title, compact }: FilteredEmptyProps) {
  const { t } = useLang();
  const f = t.common.filteredEmpty;
  return (
    <div className={`flex flex-col items-center text-center px-6 ${compact ? 'py-8' : 'py-20'}`}>
      {icon}
      <p className={`text-sm text-faint ${icon ? 'mt-3' : ''}`}>{title ?? f.title}</p>
      <p className="text-xs text-muted mt-1">{f.hint}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
      >
        <XCircle size={16} /> {f.clear}
      </button>
    </div>
  );
}

'use client';

// Persistent bar shown while "Ver como" (login-as-member) is active. Makes it
// unmistakable that the admin is viewing the app as someone else — and gives a
// one-click exit back to their own session. Rendered globally in the dashboard
// layout so it survives navigation.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { ROLE_LABELS } from '@amixos/shared/lib/permissions';

export function ImpersonationBanner() {
  const { impersonating, stopImpersonation } = useApp();
  const { locale } = useLang();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (!impersonating) return null;

  const who = impersonating.name || impersonating.email || '—';
  const roleLabel = ROLE_LABELS[impersonating.role]?.[locale] ?? impersonating.role;
  const label = locale === 'en' ? 'Viewing as' : 'Viendo como';
  const exit = locale === 'en' ? 'Exit' : 'Salir';

  const onExit = async () => {
    setExiting(true);
    try {
      await stopImpersonation();
      // Land back on the team list, not wherever the member was viewing.
      router.push('/dashboard/empleados');
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-amber-500 px-4 py-2 text-white shadow-sm">
      <Eye size={16} className="shrink-0" />
      <p className="min-w-0 truncate text-sm font-semibold">
        {label} <span className="font-bold">{who}</span>
        <span className="font-normal opacity-90"> · {roleLabel}</span>
      </p>
      <button
        type="button"
        onClick={onExit}
        disabled={exiting}
        className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30 disabled:opacity-50"
      >
        <X size={14} /> {exit}
      </button>
    </div>
  );
}

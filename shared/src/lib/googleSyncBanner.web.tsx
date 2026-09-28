// Web view for the Google-Contacts sync banner.
//
// State and queue live in ./googleSyncBannerCore, shared with the native view
// in ./googleSyncBanner.tsx. This file exists because the banner was
// originally one React Native component: on web that renders through
// react-native-web, which DROPS NativeWind's className, so the banner arrived
// as unstyled black text over the page with no background, no padding and a
// bare "Cancelar" on its own line. It compiled and type-checked perfectly —
// only the pixels were wrong.

import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useGoogleSyncBanner } from './googleSyncBannerCore';

export * from './googleSyncBannerCore';

export function GoogleSyncBanner() {
  const { status, dismiss, cancelImport } = useGoogleSyncBanner();
  if (status.kind === 'idle') return null;

  // Theme tokens rather than literal emerald-50/red-50: this strip sits at the
  // top of the dashboard, which has a dark mode, and the hardcoded light
  // palette the native view uses would glare against it.
  const palette =
    status.kind === 'success'
      ? { wrap: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400', icon: '#059669' }
      : status.kind === 'error'
        ? { wrap: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400', icon: '#DC2626' }
        : { wrap: 'bg-primary/10 border-primary/30 text-primary', icon: '#2563EB' };

  const remaining = status.kind === 'syncing' ? status.total - status.done : 0;
  const verb =
    status.kind !== 'syncing'
      ? ''
      : status.mode === 'delete'
        ? 'Limpiando de Google Contacts'
        : status.mode === 'update'
          ? 'Actualizando en Google Contacts'
          : 'Agregando a Google Contacts';
  const message =
    status.kind === 'syncing'
      ? `${verb} · ${status.done} de ${status.total} (${remaining} restante${remaining !== 1 ? 's' : ''})`
      : status.message;

  const Icon = status.kind === 'success' ? CheckCircle2 : status.kind === 'error' ? AlertCircle : null;

  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${palette.wrap}`}>
      {status.kind === 'syncing' ? (
        <span
          aria-hidden
          className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : Icon ? (
        <Icon size={16} className="shrink-0" />
      ) : null}

      <p className="flex-1 truncate text-xs font-medium">{message}</p>

      {status.kind === 'syncing' ? (
        <button
          type="button"
          onClick={cancelImport}
          aria-label="Cancel sync"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </button>
      ) : (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

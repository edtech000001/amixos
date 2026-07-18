'use client';

import { Fragment, useCallback, useMemo } from 'react';
import { AppProvider, useApp } from '@/lib/AppContext';
import { Sidebar } from '@/components/dashboard/Sidebar';
import AssistantWidget from '@/components/assistant/AssistantWidget';
import { ImpersonationBanner } from '@/components/dashboard/ImpersonationBanner';
import { TrialBanner } from '@/components/TrialBanner';
import { BillingGate } from '@/components/BillingGate';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import ConfirmHost from '@/components/ConfirmHost';
import { confirm as confirmDialog } from '@amixos/shared/ui/confirmBus';
import {
  GoogleSyncBannerProvider,
  GoogleSyncBanner,
  type SyncQueueStorage,
} from '@amixos/shared/lib/googleSyncBanner';

const SYNC_QUEUE_KEY = 'gsync_queue_v1';

const localStorageAdapter: SyncQueueStorage = {
  load: async () => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save: async q => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
  },
  clear: async () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SYNC_QUEUE_KEY);
  },
};

// Inner component so we can call useApp() inside the AppProvider.
function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, business, impersonating } = useApp();
  const helpers = useMemo(() => ({
    getApiBaseUrl: () => getApiBaseUrl() || null,
    getJwt: () => getJwt().then(j => j || null).catch(() => null),
  }), []);

  // Stop-only confirm. Cancelling never deletes local data — the user
  // can use bulk-delete from the list if they want to undo an import.
  const onCancelImport = useCallback(
    async (
      info:
        | { mode: 'create'; allIds: string[] }
        | { mode: 'update'; remainingCount: number }
        | { mode: 'delete'; remainingCount: number },
    ): Promise<boolean> => {
      if (typeof window === 'undefined') return false;
      const remaining =
        info.mode === 'create' ? info.allIds.length : info.remainingCount;
      const body =
        info.mode === 'create'
          ? `¿Detener sincronización? Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} no se sincronizarán con Google Contacts. Los contactos en Amixos no se eliminarán.`
          : info.mode === 'update'
            ? `¿Detener actualización? Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} no se actualizarán. Los ya actualizados conservan la nueva información.`
            : `¿Detener limpieza? Los ${remaining} contacto${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} permanecerá${remaining !== 1 ? 'n' : ''} en Google Contacts. Podrás eliminarlos manualmente desde Google.`;
      return confirmDialog({ message: body });
    },
    [],
  );

  return (
    <GoogleSyncBannerProvider
      storage={localStorageAdapter}
      getApiBaseUrl={helpers.getApiBaseUrl}
      getJwt={helpers.getJwt}
      userKey={user?.id ?? null}
      businessKey={business?.id ?? null}
      onCancelImport={onCancelImport}
    >
      <div className="flex min-h-screen bg-surface print:min-h-0 print:bg-white">
        {/* App chrome hidden when printing (e.g. the price-sheet PDF).
            `contents` keeps the flex layout unchanged on screen. */}
        <div className="contents print:hidden">
          <Sidebar />
        </div>
        {/* Mobile top padding */}
        <main className="flex-1 min-w-0 pt-14 md:pt-0 print:pt-0">
          {/* Sticky banner — survives navigation; provider above keeps
              the loop alive while the user moves between pages. */}
          <div className="sticky top-0 z-30 print:hidden">
            <ImpersonationBanner />
            <GoogleSyncBanner />
          </div>
          <div className="contents print:hidden"><TrialBanner /></div>
          {/* Keyed by identity: entering/leaving "Ver como" (or its auto-expiry)
              remounts every page so no in-progress form state leaks across the
              role switch — e.g. a half-filled "nuevo trabajo" started as the
              member must not resurface pre-filled once back as the owner. */}
          <Fragment key={impersonating ? `imp:${impersonating.userId}` : 'self'}>
            {children}
          </Fragment>
          <BillingGate />
        </main>
        {/* "Ami" assistant — fixed-position FAB + slide-over panel */}
        <div className="contents print:hidden"><AssistantWidget /></div>
        {/* In-app confirm/alert modal host (replaces native window.confirm) */}
        <ConfirmHost />
      </div>
    </GoogleSyncBannerProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <DashboardShell>{children}</DashboardShell>
    </AppProvider>
  );
}

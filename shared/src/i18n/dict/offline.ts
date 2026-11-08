import { Locale } from '../locales';

// Mobile offline banner + sync sheet. {{n}} = number of changes.
export type OfflineDict = {
  errorsOne: string; errorsMany: string;
  pendingOne: string; pendingMany: string;
  syncingOne: string; syncingMany: string;
  showingSaved: string;
  switchBusiness: string;
  retry: string; retryAll: string;
  sheetTitle: string; allSynced: string;
  statusError: string; statusSyncing: string; statusPending: string;
};

export const offline: Record<Locale, OfflineDict> = {
  es: {
    errorsOne: '{{n}} cambio no se pudo sincronizar',
    errorsMany: '{{n}} cambios no se pudieron sincronizar',
    pendingOne: 'Sin conexión · {{n}} cambio sin sincronizar',
    pendingMany: 'Sin conexión · {{n}} cambios sin sincronizar',
    syncingOne: 'Sincronizando {{n}} cambio…',
    syncingMany: 'Sincronizando {{n}} cambios…',
    showingSaved: 'Sin conexión · mostrando datos guardados',
    switchBusiness: 'Sin conexión · conéctate para cambiar de negocio',
    retry: 'Reintentar',
    retryAll: 'Reintentar todo',
    sheetTitle: 'Cambios sin sincronizar',
    allSynced: 'Todo está sincronizado.',
    statusError: 'Error',
    statusSyncing: 'Sincronizando…',
    statusPending: 'Pendiente',
  },
  en: {
    errorsOne: "{{n}} change couldn't sync",
    errorsMany: "{{n}} changes couldn't sync",
    pendingOne: 'Offline · {{n}} change not synced',
    pendingMany: 'Offline · {{n}} changes not synced',
    syncingOne: 'Syncing {{n}} change…',
    syncingMany: 'Syncing {{n}} changes…',
    showingSaved: 'Offline · showing saved data',
    switchBusiness: 'Offline · connect to switch business',
    retry: 'Retry',
    retryAll: 'Retry all',
    sheetTitle: 'Unsynced changes',
    allSynced: 'Everything is synced.',
    statusError: 'Error',
    statusSyncing: 'Syncing…',
    statusPending: 'Pending',
  },
};

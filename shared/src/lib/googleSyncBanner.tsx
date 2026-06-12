import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { CheckCircle2, AlertCircle, X } from 'lucide-react-native';
import {
  triggerGoogleSyncOrThrow,
  triggerGoogleSyncDeleteOrphan,
  triggerClientContactGoogleSyncOrThrow,
} from './googleSync';

/**
 * Shared queue + banner for Google-Contacts mirror operations.
 *
 *  • Two modes per queue:
 *      'create' — sync newly-imported clients TO Google. Items are
 *                 clientIds; the API reads the local row.
 *      'delete' — orphan-cleanup for clients whose local row was just
 *                 dropped. Items are { businessId, resourceName }; API
 *                 deletes by resource_name without touching the DB.
 *  • Throttled to ~1.1s/call (under Google's 60/min/user write quota).
 *  • Persisted to a caller-supplied storage adapter so the work survives
 *    app/tab restart and auto-resumes on next mount.
 *  • Cancel is mode-aware: 'create' mode prompts to delete the imported
 *    rows; 'delete' mode just stops further cleanup (locals already gone).
 */
type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; done: number; total: number; mode: SyncMode }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export type SyncMode = 'create' | 'update' | 'delete';

type QueueItem =
  | { kind: 'create'; clientId: string }
  | { kind: 'update'; clientId: string }
  // Same actions but targeting a client_contacts row instead of a client.
  // Dispatched to /google-sync/client-contact rather than /google-sync/contact.
  | { kind: 'create-contact'; contactId: string }
  | { kind: 'update-contact'; contactId: string }
  | { kind: 'delete'; businessId: string; resourceName: string };

// Map a per-item kind down to the broader SyncMode used by the banner copy.
// Contact-specific kinds collapse to their non-contact equivalents so the
// banner still reads "Updating contacts..." instead of "update-contact".
function kindToMode(kind: QueueItem['kind'] | undefined, fallback: SyncMode): SyncMode {
  if (kind === 'create' || kind === 'create-contact') return 'create';
  if (kind === 'update' || kind === 'update-contact') return 'update';
  if (kind === 'delete') return 'delete';
  return fallback;
}

interface PendingQueue {
  mode: SyncMode;
  remaining: QueueItem[];
  allItems: QueueItem[];
  total: number;
  failed: number;
  startedAt: number;
}

export interface SyncQueueStorage {
  load: () => Promise<PendingQueue | null>;
  save: (queue: PendingQueue) => Promise<void>;
  clear: () => Promise<void>;
}

interface GoogleSyncBannerContextValue {
  status: SyncStatus;
  /** Queue newly-created clients for Google mirror. */
  runCreateBatch: (clientIds: string[]) => void;
  /** Queue existing synced rows for re-push (e.g. after notes-template
   *  edits). Accepts both clients AND client_contacts — the template
   *  reapply flow covers both surfaces in one batch. */
  runUpdateBatch: (clientIds: string[], contactIds?: string[]) => void;
  /** Queue orphan resource_names for Google cleanup after local delete. */
  runDeleteBatch: (items: { businessId: string; resourceName: string }[]) => void;
  /** User-initiated abort — routes through the mode-aware confirm handler. */
  cancelImport: () => void;
  reportError: (message: string) => void;
  dismiss: () => void;
}

const GoogleSyncBannerContext = createContext<GoogleSyncBannerContextValue | null>(null);

export function useGoogleSyncBanner(): GoogleSyncBannerContextValue {
  const ctx = useContext(GoogleSyncBannerContext);
  if (!ctx) {
    return {
      status: { kind: 'idle' },
      runCreateBatch: () => {},
      runUpdateBatch: () => {},
      runDeleteBatch: () => {},
      cancelImport: () => {},
      reportError: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  storage?: SyncQueueStorage;
  getApiBaseUrl?: () => string | null;
  getJwt?: () => Promise<string | null>;
  userKey?: string | null;
  /**
   * Confirm-and-cleanup handler called when the user hits Cancel.
   *
   *  • mode 'create': allIds are clientIds that were just imported. The
   *    handler should prompt + delete those local rows. Return true if
   *    confirmed (queue clears), false if user backed out (loop resumes).
   *  • mode 'delete': allItems is the original orphan list. The handler
   *    just confirms "stop further cleanup" — there's nothing to undo
   *    since locals are already gone. Returning true clears the queue.
   */
  onCancelImport?: (info:
    | { mode: 'create'; allIds: string[] }
    | { mode: 'update'; remainingCount: number }
    | { mode: 'delete'; remainingCount: number },
  ) => Promise<boolean>;
}

// Throttle between sync ops. Stays under Google's 60/min write quota
// with headroom. Updates used to cost 2 API calls (GET etag + PATCH);
// migration 037 + the etag cache in api/src/lib/googleSync.ts made it
// 1 call when the cached etag is valid, so we can use the same delay
// for create/update/delete. Stale-etag fallback adds a one-off GET
// but is uncommon enough to ignore for throttling.
const THROTTLE_MS = 1100;

export function GoogleSyncBannerProvider({
  children,
  storage,
  getApiBaseUrl,
  getJwt,
  userKey,
  onCancelImport,
}: ProviderProps) {
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle' });
  const queueRef = useRef<PendingQueue | null>(null);
  const runningRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismiss = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  // Dispatch a single queue item through the appropriate sync helper.
  const processItem = useCallback(
    async (item: QueueItem, apiBaseUrl: string, jwt: string): Promise<void> => {
      if (item.kind === 'create') {
        await triggerGoogleSyncOrThrow('create', item.clientId, { apiBaseUrl, jwt });
      } else if (item.kind === 'update') {
        // Batch updates (template reapply) enqueue client_contacts as their
        // own items — skip the server-side contact cascade so each contact
        // is pushed once, at this queue's throttled rate.
        await triggerGoogleSyncOrThrow('update', item.clientId, { apiBaseUrl, jwt }, true);
      } else if (item.kind === 'create-contact') {
        await triggerClientContactGoogleSyncOrThrow('create', item.contactId, { apiBaseUrl, jwt });
      } else if (item.kind === 'update-contact') {
        await triggerClientContactGoogleSyncOrThrow('update', item.contactId, { apiBaseUrl, jwt });
      } else {
        await triggerGoogleSyncDeleteOrphan(item.businessId, item.resourceName, { apiBaseUrl, jwt });
      }
    },
    [],
  );

  // The throttled loop. Stops when the queue empties, when cancel is
  // requested, or when auth is unavailable (paused; next mount resumes).
  const runLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (
        queueRef.current &&
        queueRef.current.remaining.length > 0 &&
        !cancelRequestedRef.current
      ) {
        const q = queueRef.current;
        const apiBaseUrl = getApiBaseUrl?.() ?? null;
        const jwt = (await getJwt?.()) ?? null;
        if (!apiBaseUrl || !jwt) break;
        const item = q.remaining[0];
        try {
          await processItem(item, apiBaseUrl, jwt);
        } catch {
          q.failed++;
        }
        q.remaining.shift();
        const done = q.total - q.remaining.length;
        // Derive the displayed mode from the NEXT item so the banner verb
        // flips correctly when a queue transitions from create-items to
        // delete-items (mixed queues are allowed now). Map the contact-
        // specific kinds down to their base SyncMode so the banner copy
        // stays "Updating..." rather than leaking "update-contact" text.
        const displayMode: SyncMode = kindToMode(q.remaining[0]?.kind, q.mode);
        setStatus({ kind: 'syncing', done, total: q.total, mode: displayMode });
        // Skip the storage write if cancel was requested mid-iteration —
        // otherwise this would overwrite the storage.clear() that
        // cancelImport already ran, and a re-mount would resume the
        // sync the user just tried to abort.
        if (storage && !cancelRequestedRef.current) {
          try {
            await storage.save(q);
          } catch {
            // Non-fatal — we just lose resume on restart.
          }
        }
        if (q.remaining.length > 0 && !cancelRequestedRef.current) {
          await new Promise(r => setTimeout(r, THROTTLE_MS));
        }
      }
      const q = queueRef.current;
      if (q && q.remaining.length === 0 && !cancelRequestedRef.current) {
        const succeeded = q.total - q.failed;
        clearDismiss();
        const noun =
          q.mode === 'create' ? 'sincronizado'
          : q.mode === 'update' ? 'actualizado'
          : 'eliminado';
        if (q.failed === 0) {
          setStatus({
            kind: 'success',
            message: `${succeeded} contacto${succeeded !== 1 ? 's' : ''} ${noun}${succeeded !== 1 ? 's' : ''} con Google`,
          });
          dismissTimer.current = setTimeout(() => setStatus({ kind: 'idle' }), 4000);
        } else if (succeeded === 0) {
          const verb =
            q.mode === 'create' ? 'sincronizar con'
            : q.mode === 'update' ? 'actualizar en'
            : 'eliminar de';
          setStatus({
            kind: 'error',
            message: `No se pudo ${verb} Google Contacts (${q.failed} fallido${q.failed !== 1 ? 's' : ''})`,
          });
        } else {
          setStatus({
            kind: 'error',
            message: `${succeeded} de ${q.total} ${noun}s · ${q.failed} fallido${q.failed !== 1 ? 's' : ''}`,
          });
        }
        queueRef.current = null;
        if (storage) {
          try {
            await storage.clear();
          } catch {
            // ignore
          }
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [getApiBaseUrl, getJwt, processItem, storage, clearDismiss]);

  // Start (or append to) a queue. Mixed kinds are allowed in the same
  // queue — a user who bulk-deletes while an import is still syncing
  // shouldn't have the orphan-cleanup silently dropped. The loop's
  // processItem dispatches per item.kind, so ordering is preserved and
  // both batches drain in sequence. `mode` is the queue's predominant
  // verb at creation; the live banner re-derives the verb from the
  // current item being processed.
  const startBatch = useCallback((mode: SyncMode, items: QueueItem[]) => {
    if (items.length === 0) return;
    if (queueRef.current) {
      queueRef.current.remaining.push(...items);
      queueRef.current.allItems.push(...items);
      queueRef.current.total += items.length;
      const done = queueRef.current.total - queueRef.current.remaining.length;
      const displayMode: SyncMode = kindToMode(queueRef.current.remaining[0]?.kind, mode);
      setStatus({ kind: 'syncing', done, total: queueRef.current.total, mode: displayMode });
      if (storage) void storage.save(queueRef.current).catch(() => {});
      return;
    }
    clearDismiss();
    cancelRequestedRef.current = false;
    queueRef.current = {
      mode,
      remaining: [...items],
      allItems: [...items],
      total: items.length,
      failed: 0,
      startedAt: Date.now(),
    };
    setStatus({ kind: 'syncing', done: 0, total: items.length, mode });
    if (storage) void storage.save(queueRef.current).catch(() => {});
    void runLoop();
  }, [clearDismiss, runLoop, storage]);

  const runCreateBatch = useCallback((clientIds: string[]) => {
    startBatch('create', clientIds.map(id => ({ kind: 'create' as const, clientId: id })));
  }, [startBatch]);

  const runUpdateBatch = useCallback((clientIds: string[], contactIds?: string[]) => {
    // Mixed queue: both clients and client_contacts get re-pushed in one
    // pass so the user only sees one banner cycle when reapplying templates.
    const items: QueueItem[] = [
      ...clientIds.map(id => ({ kind: 'update' as const, clientId: id })),
      ...(contactIds ?? []).map(id => ({ kind: 'update-contact' as const, contactId: id })),
    ];
    if (items.length === 0) return;
    startBatch('update', items);
  }, [startBatch]);

  const runDeleteBatch = useCallback((items: { businessId: string; resourceName: string }[]) => {
    startBatch('delete', items.map(it => ({ kind: 'delete' as const, ...it })));
  }, [startBatch]);

  const cancelImport = useCallback(async () => {
    if (!queueRef.current || cancelRequestedRef.current) return;
    const q = queueRef.current;
    const mode = q.mode;
    const allIds =
      mode === 'create'
        ? q.allItems.flatMap(it => (it.kind === 'create' ? [it.clientId] : []))
        : [];
    const remainingCount = q.remaining.length;

    // Flip the flag FIRST so the loop stops writing to storage. Then
    // immediately clear storage — this is critical: if the user kills
    // the app while the confirm dialog is open, we don't want auto-resume
    // to pick it back up on relaunch. The dialog being closed = the user
    // intended to cancel.
    cancelRequestedRef.current = true;
    if (storage) {
      try {
        await storage.clear();
      } catch {
        // ignore
      }
    }
    // Give any in-flight iteration a moment to land before we prompt.
    await new Promise(r => setTimeout(r, 50));

    const confirmed = onCancelImport
      ? await onCancelImport(
          mode === 'create'
            ? { mode: 'create', allIds }
            : mode === 'update'
              ? { mode: 'update', remainingCount }
              : { mode: 'delete', remainingCount },
        ).catch(() => false)
      : true;
    if (confirmed) {
      queueRef.current = null;
      cancelRequestedRef.current = false;
      clearDismiss();
      // Stop-only behavior — local contacts stay put. Message clarifies
      // where the data lives so the user isn't surprised.
      const msg =
        mode === 'create'
          ? `Sincronización detenida · ${remainingCount} sin procesar (los contactos permanecen en Amixos)`
          : mode === 'update'
            ? `Actualización detenida · ${remainingCount} sin procesar (los contactos ya actualizados conservan la nueva información)`
            : `Limpieza detenida · ${remainingCount} sin procesar (los contactos permanecen en Google)`;
      setStatus({ kind: 'success', message: msg });
      dismissTimer.current = setTimeout(() => setStatus({ kind: 'idle' }), 4000);
    } else {
      // User backed out — restore storage to the current queue state
      // (which may have advanced one iteration since they hit Cancel)
      // and resume the loop.
      cancelRequestedRef.current = false;
      if (storage && queueRef.current) {
        try {
          await storage.save(queueRef.current);
        } catch {
          // ignore — loop will re-save on its next tick anyway
        }
      }
      void runLoop();
    }
  }, [onCancelImport, storage, clearDismiss, runLoop]);

  const reportError = useCallback((message: string) => {
    clearDismiss();
    setStatus({ kind: 'error', message });
  }, [clearDismiss]);

  const dismiss = useCallback(() => {
    clearDismiss();
    setStatus({ kind: 'idle' });
  }, [clearDismiss]);

  // Auto-resume on mount once auth is available. Tolerates legacy
  // queue shapes written by earlier versions (no `mode`, items were
  // bare string IDs) by upgrading them to the new format in place.
  useEffect(() => {
    if (!storage || !userKey) return;
    let cancelled = false;
    (async () => {
      const pending = await storage.load().catch(() => null);
      if (cancelled || !pending) return;
      // Legacy migration: queues written before mode/items existed.
      const remaining = pending.remaining as unknown as Array<QueueItem | string>;
      const allItems = pending.allItems as unknown as Array<QueueItem | string> | undefined;
      const normalize = (arr: Array<QueueItem | string>): QueueItem[] =>
        arr.map(x =>
          typeof x === 'string' ? { kind: 'create' as const, clientId: x } : x,
        );
      const upgraded: PendingQueue = {
        mode: pending.mode ?? 'create',
        remaining: normalize(remaining ?? []),
        allItems: normalize(allItems ?? remaining ?? []),
        total: pending.total,
        failed: pending.failed ?? 0,
        startedAt: pending.startedAt ?? Date.now(),
      };
      if (upgraded.remaining.length === 0) return;
      queueRef.current = upgraded;
      cancelRequestedRef.current = false;
      const done = upgraded.total - upgraded.remaining.length;
      setStatus({ kind: 'syncing', done, total: upgraded.total, mode: upgraded.mode });
      void runLoop();
    })();
    return () => {
      cancelled = true;
    };
  }, [storage, userKey, runLoop]);

  useEffect(() => () => clearDismiss(), [clearDismiss]);

  const value = useMemo<GoogleSyncBannerContextValue>(
    () => ({ status, runCreateBatch, runUpdateBatch, runDeleteBatch, cancelImport, reportError, dismiss }),
    [status, runCreateBatch, runUpdateBatch, runDeleteBatch, cancelImport, reportError, dismiss],
  );

  return (
    <GoogleSyncBannerContext.Provider value={value}>
      {children}
    </GoogleSyncBannerContext.Provider>
  );
}

/**
 * Visual banner — auto-hides on idle. Banner verb adapts to the queue
 * mode so the user sees "Agregando…" for imports and "Limpiando…" for
 * orphan cleanups.
 */
export function GoogleSyncBanner() {
  const { status, dismiss, cancelImport } = useGoogleSyncBanner();
  if (status.kind === 'idle') return null;

  const palette =
    status.kind === 'success'
      ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: '#059669' }
      : status.kind === 'error'
        ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '#DC2626' }
        : { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: '#2563EB' };

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
    <View className={`${palette.bg} border ${palette.border} flex-row items-center px-4 py-2.5 gap-2`}>
      {status.kind === 'syncing' ? (
        <ActivityIndicator size="small" color={palette.icon} />
      ) : Icon ? (
        <Icon size={16} color={palette.icon} />
      ) : null}
      <Text className={`flex-1 text-xs font-medium ${palette.text}`} numberOfLines={2}>
        {message}
      </Text>
      {status.kind === 'syncing' ? (
        <Pressable
          onPress={cancelImport}
          className="px-2 py-1 rounded-md active:bg-black/5"
          accessibilityLabel="Cancel sync"
        >
          <Text className={`text-xs font-semibold ${palette.text}`}>Cancelar</Text>
        </Pressable>
      ) : (
        <Pressable onPress={dismiss} className="p-1 rounded-md active:bg-black/5" accessibilityLabel="Dismiss">
          <X size={14} color={palette.icon} />
        </Pressable>
      )}
    </View>
  );
}

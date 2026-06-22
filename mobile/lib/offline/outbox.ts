// Durable write queue ("outbox") for offline mutations.
//
// Generalizes the gsync_queue_v1 pattern (shared/lib/googleSyncBanner) to all
// Supabase DB writes a field crew makes offline. Each queued op is a self-
// contained insert/update that the sync runner replays verbatim once back
// online. Persisted to AsyncStorage via zustand/persist so it survives app
// restarts — a crew can log a whole day, close the app, and still sync later.
//
// IDs here are LOCAL op ids (for tracking/dedup in the queue), NOT database
// row ids. Creates that need a stable row id across the offline→online boundary
// generate a client UUID in the payload (added in a later phase for clients).

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OutboxStatus = 'pending' | 'syncing' | 'error';
// 'upload' = a binary (photo) at `localUri` → Storage `bucket/storagePath`,
// then `payload` inserted into `table` as the metadata row.
// 'delete' = delete rows matching `match`.
export type OutboxOpType = 'insert' | 'update' | 'upload' | 'delete';

export interface OutboxOp {
  /** Local op id — unique within the queue, not a DB id. */
  id: string;
  /** Owning business, for display/scoping. */
  businessId: string | null;
  table: string;
  op: OutboxOpType;
  payload: Record<string, unknown>;
  /** eq() filters for updates, e.g. { id: jobId }. Ignored for inserts. */
  match?: Record<string, unknown>;
  // ── 'upload' ops only ──────────────────────────────────────────────────
  /** Durable local file uri (documentDirectory copy) to upload. */
  localUri?: string;
  /** Storage bucket name. */
  bucket?: string;
  /** Destination object path within the bucket. */
  storagePath?: string;
  /** MIME type for the upload (default image/jpeg). */
  contentType?: string;
  /** Spanish, human-readable summary shown in the sync banner detail list. */
  label: string;
  /** Client timestamp at enqueue — drives last-write-wins ordering. */
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  /** Last failure message, when status === 'error'. */
  error?: string;
}

export type NewOutboxOp = Pick<OutboxOp, 'businessId' | 'table' | 'op' | 'payload' | 'label'> &
  Partial<Pick<OutboxOp, 'match' | 'createdAt' | 'localUri' | 'bucket' | 'storagePath' | 'contentType'>>;

interface OutboxState {
  ops: OutboxOp[];
  enqueue: (op: NewOutboxOp) => OutboxOp;
  patch: (id: string, changes: Partial<OutboxOp>) => void;
  remove: (id: string) => void;
  /** Reset every errored op back to pending (used on reconnect / manual retry). */
  retryErrors: () => void;
  clearAll: () => void;
}

let seq = 0;
function makeOpId(): string {
  // Local-only id; collision just needs to be avoided within one device's
  // queue, so timestamp + counter + random is plenty.
  seq += 1;
  return `op_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      ops: [],
      enqueue: (op) => {
        const full: OutboxOp = {
          id: makeOpId(),
          createdAt: op.createdAt ?? Date.now(),
          attempts: 0,
          status: 'pending',
          businessId: op.businessId,
          table: op.table,
          op: op.op,
          payload: op.payload,
          match: op.match,
          label: op.label,
          localUri: op.localUri,
          bucket: op.bucket,
          storagePath: op.storagePath,
          contentType: op.contentType,
        };
        set((s) => ({ ops: [...s.ops, full] }));
        return full;
      },
      patch: (id, changes) =>
        set((s) => ({ ops: s.ops.map((o) => (o.id === id ? { ...o, ...changes } : o)) })),
      remove: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      retryErrors: () =>
        set((s) => ({
          ops: s.ops.map((o) =>
            o.status === 'error' ? { ...o, status: 'pending', error: undefined } : o,
          ),
        })),
      clearAll: () => set({ ops: [] }),
    }),
    {
      name: 'amixos_outbox_v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // On rehydrate, any op left mid-flight ('syncing') was interrupted by a
      // kill/crash — reset to pending so the runner picks it up again.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.ops = state.ops.map((o) =>
          o.status === 'syncing' ? { ...o, status: 'pending' } : o,
        );
      },
    },
  ),
);

// Plain selectors for components/runner (cheap derived counts).
export function pendingCount(ops: OutboxOp[]): number {
  return ops.filter((o) => o.status === 'pending' || o.status === 'syncing').length;
}
export function errorCount(ops: OutboxOp[]): number {
  return ops.filter((o) => o.status === 'error').length;
}

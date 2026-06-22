// Drains the outbox: replays queued writes to Supabase, oldest first.
//
// Triggered on: app launch, reconnect (via network.onReconnect), foreground,
// each new enqueue, and the banner's "Reintentar" button. A module-level lock
// guarantees only one drain runs at a time.
//
// Pass policy: a drain processes only 'pending' ops. A transport failure
// reverts the op to 'pending' and stops the pass (we've lost connectivity —
// no point hammering). A real (non-network) failure marks the op 'error' and
// moves on, so one bad op can't block the rest. Errored ops are re-armed to
// 'pending' by retryErrors() on reconnect / manual retry.

import { createSupabaseClient } from '@/lib/supabase';
import { useOutboxStore, type OutboxOp } from './outbox';
import { useNetworkStore, onReconnect } from './network';
import { isNetworkError, isDuplicateError, isAuthError } from './util';

async function applyOp(op: OutboxOp): Promise<void> {
  const supabase = createSupabaseClient();
  if (op.op === 'insert') {
    const { error } = await supabase.from(op.table).insert(op.payload);
    // A duplicate means this insert already landed on a prior attempt (lost
    // ack) — treat it as success so we don't get stuck or double-write.
    if (error && !isDuplicateError(error)) throw error;
    return;
  }
  if (op.op === 'upload') {
    // Upload the local file to Storage, then insert the metadata row. fetch()
    // reads the durable file:// uri into a blob (same path as the online code).
    // upsert:true so a retry after a partial success re-writes cleanly instead
    // of failing with "already exists".
    const res = await fetch(op.localUri!);
    const blob = await res.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(op.bucket!)
      .upload(op.storagePath!, arrayBuffer, { upsert: true, contentType: op.contentType ?? 'image/jpeg' });
    if (upErr) throw upErr;
    const { error: insErr } = await supabase.from(op.table).insert(op.payload);
    if (insErr && !isDuplicateError(insErr)) throw insErr;
    // Best-effort cleanup of the durable copy now that it's uploaded.
    try {
      const FileSystem = require('expo-file-system');
      await FileSystem.deleteAsync(op.localUri, { idempotent: true });
    } catch {
      /* expo-file-system missing or already gone — harmless */
    }
    return;
  }
  if (op.op === 'delete') {
    let dq = supabase.from(op.table).delete();
    for (const [k, v] of Object.entries(op.match ?? {})) {
      dq = dq.eq(k, v as never);
    }
    const { error } = await dq;
    if (error) throw error; // a delete matching nothing is still success
    return;
  }
  // update
  let q = supabase.from(op.table).update(op.payload);
  for (const [k, v] of Object.entries(op.match ?? {})) {
    q = q.eq(k, v as never);
  }
  const { error } = await q;
  if (error) throw error;
}

let draining = false;

export async function drainOutbox(): Promise<void> {
  if (draining) return;
  if (!useNetworkStore.getState().isOnline) return;
  draining = true;
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!useNetworkStore.getState().isOnline) break;
      const store = useOutboxStore.getState();
      const next = store.ops.find((o) => o.status === 'pending');
      if (!next) break;

      store.patch(next.id, { status: 'syncing' });
      try {
        await applyOp(next);
        useOutboxStore.getState().remove(next.id);
      } catch (err) {
        if (isAuthError(err)) {
          // Token lapsed while offline. Re-queue (don't show an error), refresh
          // the session, then re-drain — self-heals without alarming the user.
          useOutboxStore.getState().patch(next.id, { status: 'pending' });
          void createSupabaseClient().auth.refreshSession().then(() => drainOutbox());
          break;
        }
        if (isNetworkError(err)) {
          // Lost the connection mid-drain — put it back and stop the pass.
          useOutboxStore.getState().patch(next.id, { status: 'pending' });
          useNetworkStore.getState().setOnline(false);
          break;
        }
        // Server rejected it — won't fix itself on retry. Park as error.
        useOutboxStore.getState().patch(next.id, {
          status: 'error',
          attempts: next.attempts + 1,
          error: (err as { message?: string })?.message ?? 'Error desconocido',
        });
      }
    }
  } finally {
    draining = false;
  }
}

// Re-arm errored ops and drain. Used by reconnect + the banner retry button:
// a failure might have been a transient blip rather than a true rejection.
export function retryAndDrain(): void {
  useOutboxStore.getState().retryErrors();
  void drainOutbox();
}

let wired = false;
// Call once at app start. Drains immediately and on every reconnect.
export function startSyncRunner(): void {
  if (wired) return;
  wired = true;
  onReconnect(() => retryAndDrain());
  void drainOutbox();
}

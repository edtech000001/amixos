// The write entry point for crew-facing screens.
//
// Instead of calling `supabase.from(t).insert(...)` directly, offline-capable
// screens call queuedInsert/queuedUpdate. The decision tree:
//
//   online  → write straight through. Success: { queued:false, data }.
//             Network error: fall through and queue (we were wrong about being
//             online). Real error (RLS/constraint): throw — caller shows it.
//   offline → enqueue and return { queued:true }. A best-effort drain fires in
//             case connectivity actually exists (NetInfo can lag).
//
// Callers branch on `queued`: if false, refresh from the server as usual; if
// true, the row isn't on the server yet — show optimistic UI and let the sync
// banner report progress.

import { createSupabaseClient } from '@/lib/supabase';
import { useNetworkStore } from './network';
import { useOutboxStore, type NewOutboxOp } from './outbox';
import { drainOutbox } from './syncRunner';
import { isNetworkError, isDuplicateError, isAuthError } from './util';

export interface MutateResult<T = unknown> {
  /** True = parked in the outbox (not yet on the server). */
  queued: boolean;
  /** Server response when written through (queued === false). */
  data?: T;
}

interface InsertArgs {
  table: string;
  payload: Record<string, unknown>;
  businessId: string | null;
  /** Spanish summary for the sync banner detail list. */
  label: string;
  /** Columns to return when written through (e.g. 'id'). */
  returning?: string;
}

export async function queuedInsert<T = unknown>(args: InsertArgs): Promise<MutateResult<T>> {
  const { table, payload, businessId, label, returning } = args;
  if (useNetworkStore.getState().isOnline) {
    try {
      const supabase = createSupabaseClient();
      const builder = supabase.from(table).insert(payload);
      const { data, error } = returning
        ? await builder.select(returning).single()
        : await builder;
      // Duplicate = a prior queued attempt already inserted this row → success.
      if (error && !isDuplicateError(error)) throw error;
      return { queued: false, data: (data as T) ?? undefined };
    } catch (err) {
      // Real rejection (RLS/constraint) → surface it. Network OR expired-token
      // → queue (the runner refreshes the session + retries).
      if (!isNetworkError(err) && !isAuthError(err)) throw err;
      if (isNetworkError(err)) useNetworkStore.getState().setOnline(false);
      // fall through to queue
    }
  }
  enqueue({ table, op: 'insert', payload, businessId, label });
  void drainOutbox();
  return { queued: true };
}

interface UpdateArgs {
  table: string;
  payload: Record<string, unknown>;
  match: Record<string, unknown>;
  businessId: string | null;
  label: string;
}

export async function queuedUpdate(args: UpdateArgs): Promise<MutateResult> {
  const { table, payload, match, businessId, label } = args;
  if (useNetworkStore.getState().isOnline) {
    try {
      const supabase = createSupabaseClient();
      let q = supabase.from(table).update(payload);
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      const { error } = await q;
      if (error) throw error;
      return { queued: false };
    } catch (err) {
      if (!isNetworkError(err) && !isAuthError(err)) throw err;
      if (isNetworkError(err)) useNetworkStore.getState().setOnline(false);
    }
  }
  enqueue({ table, op: 'update', payload, match, businessId, label });
  void drainOutbox();
  return { queued: true };
}

interface DeleteArgs {
  table: string;
  match: Record<string, unknown>;
  businessId: string | null;
  label: string;
}

/** Delete rows matching `match`. Online: delete now; offline/expired-token →
 *  queue (replayed on reconnect). Deletes are idempotent. */
export async function queuedDelete(args: DeleteArgs): Promise<MutateResult> {
  const { table, match, businessId, label } = args;
  if (useNetworkStore.getState().isOnline) {
    try {
      const supabase = createSupabaseClient();
      let q = supabase.from(table).delete();
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      const { error } = await q;
      if (error) throw error;
      return { queued: false };
    } catch (err) {
      if (!isNetworkError(err) && !isAuthError(err)) throw err;
      if (isNetworkError(err)) useNetworkStore.getState().setOnline(false);
    }
  }
  enqueue({ table, op: 'delete', match, payload: {}, businessId, label });
  void drainOutbox();
  return { queued: true };
}

interface UploadArgs {
  /** Metadata table to insert the row into after the file uploads. */
  table: string;
  payload: Record<string, unknown>;
  businessId: string | null;
  label: string;
  /** Durable local file uri (a documentDirectory copy that survives restarts). */
  localUri: string;
  bucket: string;
  storagePath: string;
  contentType?: string;
}

/** Upload a binary (photo) + insert its metadata row. Online: upload to Storage
 *  then insert; on a network failure, queue the whole thing (the sync runner
 *  replays it). A real rejection (RLS, etc.) throws so the caller can surface it. */
export async function queuedUpload(args: UploadArgs): Promise<MutateResult> {
  const { table, payload, businessId, label, localUri, bucket, storagePath, contentType } = args;
  if (useNetworkStore.getState().isOnline) {
    try {
      const supabase = createSupabaseClient();
      const res = await fetch(localUri);
      const blob = await res.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, arrayBuffer, { upsert: true, contentType: contentType ?? 'image/jpeg' });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from(table).insert(payload);
      if (insErr && !isDuplicateError(insErr)) throw insErr;
      return { queued: false };
    } catch (err) {
      if (!isNetworkError(err) && !isAuthError(err)) throw err;
      if (isNetworkError(err)) useNetworkStore.getState().setOnline(false);
    }
  }
  enqueue({ table, op: 'upload', payload, businessId, label, localUri, bucket, storagePath, contentType });
  void drainOutbox();
  return { queued: true };
}

function enqueue(op: NewOutboxOp) {
  useOutboxStore.getState().enqueue(op);
}

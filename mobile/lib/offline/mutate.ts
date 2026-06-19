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
import { isNetworkError } from './util';

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
      if (error) throw error;
      return { queued: false, data: (data as T) ?? undefined };
    } catch (err) {
      if (!isNetworkError(err)) throw err; // real rejection — surface it
      useNetworkStore.getState().setOnline(false);
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
      if (!isNetworkError(err)) throw err;
      useNetworkStore.getState().setOnline(false);
    }
  }
  enqueue({ table, op: 'update', payload, match, businessId, label });
  void drainOutbox();
  return { queued: true };
}

function enqueue(op: NewOutboxOp) {
  useOutboxStore.getState().enqueue(op);
}

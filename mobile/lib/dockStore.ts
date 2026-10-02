// Reactive store for the user's dock (bottom nav) app selection. Loaded from
// user_dock_apps when the dashboard mounts and on every business switch; the
// Navegación settings screen saves through it so the dock updates live.
// `keys === null` ⇒ not yet loaded / not customized ⇒ callers fall back to the
// default dock.
//
// Scoped PER USER PER BUSINESS (migration 245): which apps are eligible depends
// on the business's enabled modules and the user's role THERE, so a single
// global list was wrong — pinning Inventario in one business changed the dock
// in all of them.

import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDockKeys } from './dockApps';

const scopeOf = (userId: string, businessId: string) => `${userId}:${businessId}`;

interface DockState {
  keys: string[] | null;
  hydrated: boolean;
  /** `${userId}:${businessId}` the current keys belong to. Guards against
   *  rendering business A's dock while business B is on screen. */
  scope: string | null;
  load: (supabase: SupabaseClient, userId: string, businessId: string) => Promise<void>;
  save: (
    supabase: SupabaseClient,
    userId: string,
    businessId: string,
    keys: string[],
  ) => Promise<{ error: unknown }>;
}

export const useDockStore = create<DockState>((set, get) => ({
  keys: null,
  hydrated: false,
  scope: null,
  load: async (supabase, userId, businessId) => {
    const scope = scopeOf(userId, businessId);
    // Switching business: drop the old dock FIRST so the previous business's
    // pins never show against the new one, even for a frame.
    if (get().scope !== scope) set({ keys: null, hydrated: false, scope });
    const { data } = await supabase
      .from('user_dock_apps')
      .select('keys')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle();
    // A newer load (another business switch) may have landed while this one was
    // in flight — only the newest scope may write.
    if (get().scope !== scope) return;
    set({ keys: parseDockKeys((data as { keys?: unknown } | null)?.keys), hydrated: true });
  },
  save: async (supabase, userId, businessId, keys) => {
    // Optimistic — the dock reflects the change immediately.
    set({ keys, hydrated: true, scope: scopeOf(userId, businessId) });
    const { error } = await supabase
      .from('user_dock_apps')
      .upsert(
        { user_id: userId, business_id: businessId, keys, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,business_id' },
      );
    return { error };
  },
}));

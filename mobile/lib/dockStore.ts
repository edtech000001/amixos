// Reactive store for the user's dock (bottom nav) app selection. Loaded once
// from profiles.dock_apps when the dashboard mounts; the Navegación settings
// screen saves through it so the dock updates live. `keys === null` ⇒ not yet
// loaded / not customized ⇒ callers fall back to the default dock.

import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDockKeys } from './dockApps';

interface DockState {
  keys: string[] | null;
  hydrated: boolean;
  load: (supabase: SupabaseClient, userId: string) => Promise<void>;
  save: (supabase: SupabaseClient, userId: string, keys: string[]) => Promise<{ error: unknown }>;
}

export const useDockStore = create<DockState>(set => ({
  keys: null,
  hydrated: false,
  load: async (supabase, userId) => {
    const { data } = await supabase.from('profiles').select('dock_apps').eq('id', userId).maybeSingle();
    set({ keys: parseDockKeys((data as { dock_apps?: unknown } | null)?.dock_apps), hydrated: true });
  },
  save: async (supabase, userId, keys) => {
    set({ keys, hydrated: true }); // optimistic — dock reflects the change immediately
    const { error } = await supabase.from('profiles').update({ dock_apps: keys }).eq('id', userId);
    return { error };
  },
}));

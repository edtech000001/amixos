import { useMemo } from 'react';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { useDockStore } from '@/lib/dockStore';
import { effectiveDockKeys, eligibleDockApps, type DockApp } from '@/lib/dockApps';
import { useEnabledModules } from '@amixos/shared/modules/useEnabledModules';

/**
 * The ONE answer to "which apps can this user put in the dock, and which are
 * in it" — used by the dock itself, the Más menu, Ajustes → Navegación and the
 * back/link helpers, so they can never disagree. Module apps (Map, Files,
 * Equipment, Inventory, Rentals) count only while the business has that
 * module enabled AND available (same rule as the Más list).
 */
export function useDockApps(): {
  /** Apps this user may pin, catalog order. */
  eligible: DockApp[];
  /** Pinned middle apps, in the user's order. */
  pinned: string[];
  /** Ids of the business's enabled + available modules. */
  liveModules: ReadonlySet<string>;
} {
  const { business, currentRole } = useApp();
  const stored = useDockStore(s => s.keys);
  const { modules } = useEnabledModules(createSupabaseClient(), business?.id ?? null);
  const liveKey = modules.filter(m => m.status === 'available').map(m => m.id).sort().join(',');
  const liveModules = useMemo(() => new Set(liveKey ? liveKey.split(',') : []), [liveKey]);
  const eligible = useMemo(() => eligibleDockApps(currentRole, liveModules), [currentRole, liveModules]);
  const pinned = useMemo(() => effectiveDockKeys(stored, currentRole, liveModules), [stored, currentRole, liveModules]);
  return { eligible, pinned, liveModules };
}

import { useRouter } from 'expo-router';
import { useApp } from '@/lib/AppContext';
import { effectiveDockKeys } from '@/lib/dockApps';
import { useDockStore } from '@/lib/dockStore';

/**
 * Back handler for screens the Más menu opens. Returns undefined when the
 * screen is pinned to the dock (you got there from the dock, so no arrow);
 * otherwise a handler that returns to the Más list.
 *
 * Explicit target, not router.back(): these are hidden TAB screens, and Más's
 * Settings + module store share one stack, so "back" could land on Inicio or
 * on a leftover store page instead of the menu.
 */
export function useMoreBack(dockKey?: string): (() => void) | undefined {
  const router = useRouter();
  const { currentRole } = useApp();
  const dockKeys = useDockStore(s => s.keys);
  if (dockKey && effectiveDockKeys(dockKeys, currentRole).includes(dockKey)) return undefined;
  return () => router.navigate('/dashboard/mas' as never);
}

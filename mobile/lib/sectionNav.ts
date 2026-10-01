import { useCallback } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { DOCK_APPS } from '@/lib/dockApps';
import { useDockApps } from '@/lib/useDockApps';

// The dock apps (clientes, trabajos, facturas, calendario, empleados,
// reportes) exist twice: as a dashboard TAB (when pinned to the dock) and as a
// copy inside the Más native stack (mas/<app>/…, opened from the Más menu when
// NOT pinned — the iOS "More" pattern, see app/dashboard/mas/_layout.tsx).
// The screen files are shared, so a screen asks these helpers where it is.

/** True when this screen is rendered directly in the Más stack. Recognized
 *  by its contents — the only stack that holds the Ajustes screens — because
 *  expo-router doesn't forward a navigator `id` (getId() came back undefined,
 *  so every Más copy thought it was on its tab: its ← PUSHED a new Más menu
 *  instead of popping, and its list → detail links jumped to the tab). */
export function useInMoreStack(): boolean {
  const navigation = useNavigation();
  const state = navigation.getState() as { type?: string; routeNames?: string[] } | undefined;
  return state?.type === 'stack' && !!state.routeNames?.includes('ajustes/index');
}

/** Base path for a section's OWN links (list → detail → form), so a section
 *  opened from Más keeps pushing inside Más instead of jumping to its tab. */
export function useSectionBase(section: string): string {
  return useInMoreStack() ? `/dashboard/mas/${section}` : `/dashboard/${section}`;
}

/** Where to open a dock app from elsewhere: its tab when pinned, else its
 *  Más-stack copy (so it never lands on a tab the dock doesn't show). */
export function useAppHref(): (key: string) => string {
  const { pinned } = useDockApps();
  return useCallback(
    (key: string) => {
      if (pinned.includes(key)) return `/dashboard/${key}`;
      const app = DOCK_APPS.find(a => a.key === key);
      return app?.moduleId ? `/dashboard/mas/modulos/${app.moduleId}` : `/dashboard/mas/${key}`;
    },
    [pinned],
  );
}

/** "Back to the Más menu" from a screen inside the Más stack — the same
 *  native pop as Ajustes → Negocio → back (router.back()), so the page slides
 *  off to the right. router.navigate('/dashboard/mas') instead PUSHED a second
 *  menu (a forward slide), and dismissTo didn't animate like a pop. Only when
 *  nothing is beneath (opened by a link) does it fall back to dismissTo,
 *  which then just swaps the screen for the menu. */
export function useBackToMore(): () => void {
  const router = useRouter();
  const navigation = useNavigation();
  return useCallback(() => {
    const below = (navigation.getState()?.index ?? 0) > 0;
    if (below) router.back();
    else router.dismissTo('/dashboard/mas' as never);
  }, [router, navigation]);
}

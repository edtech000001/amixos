import { useEffect, useRef } from 'react';
import { useNavigation } from 'expo-router';

/**
 * Screens opened from the dashboard's quick actions (?from=home) live in
 * ANOTHER section's stack — New invoice in Facturas, New client in Clientes,
 * the calendar in Más… A native pop (iOS swipe-back, Android back) would land
 * on that section's list / menu instead of the dashboard the user came from.
 * This routes those pops through `leave` (the screen's own back handler, which
 * sends ?from=home back to /dashboard and still runs any unsaved-changes
 * prompt). Explicit navigations (replace/navigate) pass through untouched.
 */
export function useHomeOriginBack(from: string | undefined, leave: () => void): void {
  const navigation = useNavigation();
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (from !== 'home') return undefined;
    return navigation.addListener('beforeRemove', (e) => {
      const type = e.data.action.type;
      if (type !== 'GO_BACK' && type !== 'POP') return;
      // beforeRemove IS preventable; the untyped useNavigation() just doesn't say so.
      (e as unknown as { preventDefault: () => void }).preventDefault();
      leaveRef.current();
    });
  }, [from, navigation]);
}

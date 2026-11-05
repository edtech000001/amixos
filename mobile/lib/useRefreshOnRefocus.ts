import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Re-run a screen's load when the user comes BACK to it (tab switch, back from
 * a detail). Tab screens stay mounted, so without this they keep showing
 * whatever they loaded first. Skips the first focus — that's the mount, which
 * the screen already loads. Keep `fn` silent (no skeleton): it fires on every
 * return. Pass a throttled refresh (useSwr's refresh() without force) where
 * one exists.
 */
export function useRefreshOnRefocus(fn: () => unknown): void {
  const first = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void fnRef.current();
  }, []));
}

import { useEffect, useRef, useState } from 'react';
import { kvGet, kvSet } from './kvStore';

/**
 * A search-string state that PERSISTS to platform storage (localStorage on web,
 * AsyncStorage on native) so navigating away from a list and back — or
 * refreshing — keeps the query. Mirrors the Jobs list behavior for every
 * search bar.
 *
 * Restore happens AFTER mount (never during the initial render) so the web SSR
 * HTML and the first client render agree — reading storage inline would throw a
 * hydration error. Until the restore resolves the value is '' and writes are
 * gated, so defaults never clobber a saved query.
 *
 * `key` should be stable per list and ideally per business, e.g.
 * `search.clients.<businessId>`. Pass null/undefined to disable persistence
 * (e.g. before the business id is known) — it then behaves as plain state, and
 * a real key arriving later triggers the restore.
 */
export function usePersistedSearch(
  key: string | null | undefined,
): [string, (v: string) => void] {
  const [value, setValue] = useState('');
  // Tracks which key the current value was hydrated for, so we only persist
  // once the saved value has been restored (avoids writing '' over a real one).
  const hydratedForKey = useRef<string | null>(null);

  useEffect(() => {
    if (!key) {
      hydratedForKey.current = null;
      return;
    }
    let active = true;
    hydratedForKey.current = null;
    void kvGet(key).then((saved) => {
      if (!active) return;
      setValue(saved ?? '');
      hydratedForKey.current = key;
    });
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (!key || hydratedForKey.current !== key) return;
    void kvSet(key, value);
  }, [key, value]);

  return [value, setValue];
}

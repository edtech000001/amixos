// Pull-to-refresh for the mobile screens. The silent focus refresh (useSwr) is
// the main mechanism; this is the explicit "I know something changed" escape
// hatch — it bypasses the focus throttle and holds the spinner until the
// reload actually settles.
//
// Usage:
//   const pull = usePullRefresh(() => Promise.all([jobs.refresh({ force: true }), stats.refresh({ force: true })]));
//   <ScrollView refreshControl={pull.control}>…
import { useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useThemeColors } from '../theme';

export function usePullRefresh(run: () => Promise<unknown> | unknown) {
  const c = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runRef.current();
    } catch {
      /* the screen's own error UI covers failures; just stop spinning */
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    refreshing,
    onRefresh,
    control: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />,
  };
}

/** Prop type for screens that accept a pull-to-refresh control. */
export type PullRefreshControl = import('react').ReactElement<import('react-native').RefreshControlProps>;

import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * Side margins for a bottom-sheet card. An RNModal spans the whole window, so
 * without these a sheet runs under side safe areas — the iPhone Duo's side
 * status strip hid sheet edges and their X buttons. Reads the context (not
 * useSafeAreaInsets) so it is a no-op where there is no provider (web).
 */
export function useSheetSides(): { marginLeft: number; marginRight: number } {
  const insets = useContext(SafeAreaInsetsContext);
  return { marginLeft: insets?.left ?? 0, marginRight: insets?.right ?? 0 };
}

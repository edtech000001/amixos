import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/** Height kept clear for iPadOS 26's window controls (the red/yellow/green
 *  dots) — they sit over the top-left corner of the app's window. */
const WINDOW_CONTROLS_HEIGHT = 30;

/**
 * Extra top space for iPadOS window controls. They only appear when the app
 * runs in a resizable window (smaller than the screen) — never full screen —
 * and the safe area does NOT include them, so our own screen titles drew
 * underneath. UIKit navigation bars move aside on their own; ours are custom.
 * Re-evaluated on every window resize (useWindowDimensions).
 */
export function useWindowControlsInset(): number {
  const win = useWindowDimensions();
  if (Platform.OS !== 'ios' || !Platform.isPad) return 0;
  const screen = Dimensions.get('screen');
  const windowed = win.width < screen.width - 1 || win.height < screen.height - 1;
  return windowed ? WINDOW_CONTROLS_HEIGHT : 0;
}

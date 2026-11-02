// Haptic feedback (expo-haptics). Light, purposeful taps: tab switches,
// toggles, primary buttons, and a success buzz when money-moving actions land.
//
// expo-haptics is a NATIVE module: builds made before it was added (the
// installed dev client, older TestFlight builds) don't have it, and importing
// it there throws "Cannot find native module 'ExpoHaptics'". So it's loaded
// lazily inside a try/catch and every call is a silent no-op without it.
// Web gets haptics.web.ts (no-ops).

type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null | undefined;
function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

const run = (fn: (h: HapticsModule) => Promise<void>) => {
  const h = load();
  if (h) void fn(h).catch(() => {});
};

export type HapticKind = 'light' | 'medium' | 'select' | 'success' | 'warning' | 'error';

export const haptics = {
  /** A button press. */
  light: () => run(h => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  /** Something heavier: picking up an item to drag. */
  medium: () => run(h => h.impactAsync(h.ImpactFeedbackStyle.Medium)),
  /** A selection changing: tab switch, toggle, segmented control. */
  select: () => run(h => h.selectionAsync()),
  /** An action completed: payment recorded, saved. */
  success: () => run(h => h.notificationAsync(h.NotificationFeedbackType.Success)),
  warning: () => run(h => h.notificationAsync(h.NotificationFeedbackType.Warning)),
  error: () => run(h => h.notificationAsync(h.NotificationFeedbackType.Error)),
};

export function playHaptic(kind: HapticKind | undefined | null): void {
  if (kind) haptics[kind]();
}

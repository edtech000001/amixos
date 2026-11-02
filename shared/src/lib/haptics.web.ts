// Web: no haptics (see haptics.ts). Same API, all no-ops.

export type HapticKind = 'light' | 'medium' | 'select' | 'success' | 'warning' | 'error';

const noop = () => {};

export const haptics = {
  light: noop,
  medium: noop,
  select: noop,
  success: noop,
  warning: noop,
  error: noop,
};

export function playHaptic(_kind: HapticKind | undefined | null): void {}

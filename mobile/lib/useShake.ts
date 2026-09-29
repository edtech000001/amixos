// Shake detection via the accelerometer.
//
// react-native has no cross-platform shake event, and a native shake library
// would be a second binary dependency for one gesture. expo-sensors is already
// an Expo module and gives the raw signal, which is all this needs.
//
// The threshold and cooldown matter more than the maths. Too sensitive and the
// sheet ambushes someone walking to a job site with the phone in one hand; too
// dull and the gesture feels broken. 1.8g of total acceleration over a short
// window is a deliberate shake and not a stride, and the cooldown stops one
// shake registering as four.

import { useEffect, useRef } from 'react';

// Lazily required, like MailComposer in facturas/[id].tsx. A dev client built
// before expo-sensors was added has no ExpoSensors native module, and a
// top-level import would take the whole dashboard down with
// "Cannot find native module" rather than just losing the gesture — the same
// failure that produced commit 7c01875 for expo-asset. Shake detection is a
// convenience; it must never be the reason the app will not open.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadAccelerometer(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('expo-sensors');
    return mod?.Accelerometer ?? null;
  } catch {
    return null;
  }
}

/** Total acceleration (in g) past which a sample counts as a jolt. 1g is
 *  gravity at rest, so this is 0.8g of actual movement. */
const THRESHOLD = 1.8;
/** Jolts needed within WINDOW_MS to count as a shake — a single knock against
 *  a table should not open a bug report. */
const JOLTS_REQUIRED = 3;
const WINDOW_MS = 1000;
/** Silence after firing, so one continuous shake is one event. */
const COOLDOWN_MS = 3000;

export function useShake(onShake: () => void, enabled = true) {
  // Kept in a ref so changing the handler doesn't tear down the subscription
  // and lose the jolt history mid-shake.
  const handler = useRef(onShake);
  handler.current = onShake;

  useEffect(() => {
    if (!enabled) return;

    const Accelerometer = loadAccelerometer();
    if (!Accelerometer) return;

    let jolts: number[] = [];
    let lastFired = 0;

    // Guarded as a unit: on a client where the module resolves but the native
    // side is absent, it is addListener that throws, not the require.
    let sub: { remove: () => void } | null = null;
    try {
      Accelerometer.setUpdateInterval(100);
      sub = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        if (magnitude < THRESHOLD) return;

        const now = Date.now();
        if (now - lastFired < COOLDOWN_MS) return;

        jolts = [...jolts.filter(ts => now - ts < WINDOW_MS), now];
        if (jolts.length >= JOLTS_REQUIRED) {
          jolts = [];
          lastFired = now;
          handler.current();
        }
      });
    } catch {
      sub = null;
    }

    return () => sub?.remove();
  }, [enabled]);
}

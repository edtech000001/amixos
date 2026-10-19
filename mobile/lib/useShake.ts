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
import { AppState } from 'react-native';

/** Total acceleration (in g) past which a sample counts as a jolt. 1g is
 *  gravity at rest, so this is 0.8g of actual movement. */
const THRESHOLD = 1.8;
/** Jolts needed within WINDOW_MS to count as a shake — a single knock against
 *  a table should not open a bug report. */
const JOLTS_REQUIRED = 3;
const WINDOW_MS = 1000;
/** Silence after firing, so one continuous shake is one event. */
const COOLDOWN_MS = 3000;
/** Ignore motion this long after the app comes back to the foreground. */
const RESUME_GRACE_MS = 1500;

// Whether this binary actually has the accelerometer, asked in the only way
// that does not throw.
//
// expo-sensors calls requireNativeModule() at import time, which THROWS when
// the native side is absent — and a try/catch around it is not enough: React
// Native's LogBox reports the throw regardless, so a dev client built before
// this dependency existed greets the user with a red screen for a feature they
// never asked for. requireOptionalNativeModule returns null instead, so
// nothing is ever thrown and there is nothing to report.
//
// This is a guard for old clients, not a substitute for building one. On a
// binary without expo-sensors the gesture is simply gone; the manual "Reportar
// un problema" button in Settings → Soporte still works, because submitting a
// report is pure JS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadAccelerometer(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo-modules-core');
    if (!requireOptionalNativeModule?.('ExponentAccelerometer')) return null;
    // Present — safe to pull in the JS wrapper. The submodule, not the package
    // entry: expo-sensors/build/index.js eagerly imports Pedometer, Barometer,
    // Gyroscope and the rest, so requiring the package needs eight native
    // modules for a feature that reads one.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('expo-sensors/build/Accelerometer');
    return mod?.default ?? mod?.Accelerometer ?? null;
  } catch {
    return null;
  }
}

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
    let resumedAt = Date.now();

    // Listen ONLY while the app is in the foreground. Subscribed regardless,
    // motion queued up while the app was in the background (a run, a drive)
    // was delivered all at once on reopening — three "jolts" inside a second —
    // and the bug-report sheet opened by itself. Resubscribe on return, then
    // ignore the first moments (late queued samples, picking the phone up).
    let sub: { remove: () => void } | null = null;
    const start = () => {
      if (sub) return;
      jolts = [];
      resumedAt = Date.now();
      // Guarded as a unit: on a client where the module resolves but the
      // native side is absent, it is addListener that throws, not the require.
      try {
        Accelerometer.setUpdateInterval(100);
        sub = Accelerometer.addListener(onSample);
      } catch {
        sub = null;
      }
    };
    const stop = () => { sub?.remove(); sub = null; jolts = []; };

    function onSample({ x, y, z }: { x: number; y: number; z: number }) {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        if (magnitude < THRESHOLD) return;

        const now = Date.now();
        if (now - resumedAt < RESUME_GRACE_MS) return;
        if (now - lastFired < COOLDOWN_MS) return;

        jolts = [...jolts.filter(ts => now - ts < WINDOW_MS), now];
        if (jolts.length >= JOLTS_REQUIRED) {
          jolts = [];
          lastFired = now;
          handler.current();
        }
    }

    if (AppState.currentState === 'active') start();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => { appSub.remove(); stop(); };
  }, [enabled]);
}

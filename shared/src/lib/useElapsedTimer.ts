import { useEffect, useRef, useState } from 'react';

/**
 * Format a millisecond duration as a compact clock string: `m:ss` under an
 * hour, `h:mm:ss` beyond. 0 → "0:00". Pure — safe to unit-test on its own.
 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Live elapsed-time counter for a running task (e.g. a data import). Pass the
 * SAME boolean that drives the progress bar: the timer starts when it flips to
 * true, ticks ~1/sec, and FREEZES its last value when it flips to false — so the
 * final duration is still available to render on a "done" screen (until the next
 * run flips `running` true again, which resets it to 0).
 *
 * Platform-neutral: uses only `react` + `Date.now`/`setInterval`, so web and
 * mobile share this file. `Date.now()` is read only inside the effect (never
 * during render), keeping web SSR hydration stable.
 */
export function useElapsedTimer(running: boolean): { elapsedMs: number; label: string } {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!running) {
      startedAtRef.current = null;
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    const id = setInterval(() => {
      if (startedAtRef.current != null) setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return { elapsedMs, label: formatElapsed(elapsedMs) };
}

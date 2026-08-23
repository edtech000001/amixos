// Hold-and-drag readout for the mobile bar charts.
//
// Phones have no hover, so the web charts' tooltip needs a touch equivalent.
// The gesture people expect (and what iOS/Android health + finance charts do):
// press and hold to open a value bubble, slide the finger sideways WITHOUT
// lifting to walk across the bars, lift to dismiss.
//
// Why a raw responder instead of per-bar Pressables: a Pressable captures the
// touch for itself, so dragging onto a neighbouring bar never reaches that
// bar's handlers — the readout would freeze on whichever bar was pressed
// first. One responder spanning the whole plot converts the finger's x into a
// bar index on every move, which is what makes the scrub continuous.
//
// Usage: spread `handlers` onto a transparent overlay covering the plot (an
// overlay, not the plot itself, so `locationX` is measured against a view with
// no children — touches landing on a child report coordinates relative to that
// child, which would scramble the mapping).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

/** How long the finger must stay down before the bubble opens. Short enough to
 *  feel responsive, long enough that a scroll flick doesn't trigger it. */
const HOLD_MS = 180;

export interface BarScrubHandlers {
  onLayout: (e: LayoutChangeEvent) => void;
  onStartShouldSetResponder: () => boolean;
  onMoveShouldSetResponder: () => boolean;
  onResponderGrant: (e: GestureResponderEvent) => void;
  onResponderMove: (e: GestureResponderEvent) => void;
  onResponderRelease: () => void;
  onResponderTerminate: () => void;
  onResponderTerminationRequest: () => boolean;
}

export interface BarScrub {
  /** Bar under the finger, or null when nothing is held. */
  active: number | null;
  /** Measured plot width — callers position their bubble with it. */
  width: number;
  handlers: BarScrubHandlers;
}

export interface BarScrubOptions {
  /** Number of bars in the plot. */
  count: number;
  /** Flex gap between bars, in px — needed to map x → bar exactly. */
  gap?: number;
  /** Set false to disable (e.g. while the dashboard is in drag-to-reorder mode). */
  enabled?: boolean;
  holdMs?: number;
}

export function useBarScrub({ count, gap = 0, enabled = true, holdMs = HOLD_MS }: BarScrubOptions): BarScrub {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  // Refs shadow the state the gesture callbacks read: they are created once
  // and captured by the responder, so they must not close over stale values.
  const widthRef = useRef(0);
  const countRef = useRef(count);
  const gapRef = useRef(gap);
  countRef.current = count;
  gapRef.current = gap;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest x while the hold timer runs, so the bubble opens under the finger. */
  const xRef = useRef(0);
  /** True once the hold has registered and the user is scrubbing. */
  const holding = useRef(false);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  // Bars are laid out as n equal columns separated by `gap`, so one column
  // plus its gap is exactly (width + gap) / n — no per-bar measurement needed.
  const indexAt = (x: number): number => {
    const n = countRef.current;
    const w = widthRef.current;
    if (n <= 0 || w <= 0) return 0;
    const step = (w + gapRef.current) / n;
    return Math.min(n - 1, Math.max(0, Math.floor(x / step)));
  };

  const end = useCallback(() => {
    clearTimer();
    holding.current = false;
    setActive(null);
  }, []);

  return {
    active: enabled ? active : null,
    width,
    handlers: {
      onLayout: (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      },
      onStartShouldSetResponder: () => enabled,
      // Claim on touch-down only. Returning true here as well would let the
      // chart snatch a scroll gesture that started elsewhere and merely passed
      // over it, which fights the enclosing ScrollView.
      onMoveShouldSetResponder: () => false,
      onResponderGrant: (e: GestureResponderEvent) => {
        xRef.current = e.nativeEvent.locationX;
        clearTimer();
        timer.current = setTimeout(() => {
          holding.current = true;
          setActive(indexAt(xRef.current));
        }, holdMs);
      },
      onResponderMove: (e: GestureResponderEvent) => {
        xRef.current = e.nativeEvent.locationX;
        if (holding.current) setActive(indexAt(xRef.current));
      },
      onResponderRelease: end,
      onResponderTerminate: end,
      // Before the hold registers the enclosing ScrollView may steal the touch,
      // so a scroll that happens to start on the chart still scrolls. Once the
      // user is scrubbing we keep it, so a little vertical wobble mid-drag
      // doesn't hand the gesture away and kill the readout.
      onResponderTerminationRequest: () => !holding.current,
    },
  };
}

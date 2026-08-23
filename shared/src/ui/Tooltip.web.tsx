// Hover tooltip — WEB ONLY (there is no Tooltip.tsx; phones have no hover, so
// the native side conveys the same thing through `accessibilityLabel`).
//
// Why this exists: the dashboard leans on icon-only buttons to stay uncluttered,
// which leaves the user guessing what a given glyph does. The browser's own
// `title=""` is the obvious fix and a bad one — ~1s before it appears, OS-styled
// so it ignores dark mode, and unreachable by keyboard.
//
// Usage — wrap a single element, that's it:
//
//   <Tooltip tip="edit">
//     <button onClick={edit}><Pencil size={16} /></button>
//   </Tooltip>
//
// `tip` is a key into the shared tooltip vocabulary (common.tips), so the same
// action is worded identically everywhere and the call site needs no i18n
// plumbing of its own. Pass `label` instead for a one-off string that already
// lives in a screen's own dict.
//
// The child is cloned, not wrapped in an extra <span>, so it keeps whatever
// layout its parent gave it (flex child, grid cell, absolutely positioned…).

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { useTips } from '../i18n/context';
import type { CommonDict } from '../i18n/dict/common';

/** Hover dwell before the bubble appears. Long enough that sweeping the mouse
 *  across a toolbar doesn't strobe six tooltips, short enough to feel like an
 *  answer. Keyboard focus skips the delay — that user asked deliberately. */
const OPEN_DELAY_MS = 350;

/** Gap between the trigger and the bubble. */
const OFFSET = 8;

/** Keep the bubble this far from the viewport edge when clamping. */
const EDGE_PAD = 8;

type Side = 'top' | 'bottom' | 'left' | 'right';

type Props = {
  /** Key into the shared tooltip vocabulary (shared/src/i18n/dict/common.ts). */
  tip?: keyof CommonDict['tips'];
  /** Literal text, for wording that already lives in a screen's own dict.
   *  Wins over `tip` when both are given. */
  label?: string;
  /** Preferred side. Flips automatically when there isn't room. Default 'top'. */
  side?: Side;
  /** Set when the trigger already shows its own text. The tip then stays purely
   *  visual: injecting an aria-label would *replace* that visible name for
   *  screen-reader users, which WCAG 2.5.3 (Label in Name) forbids — the spoken
   *  name has to contain the text people can see. */
  labelled?: boolean;
  /** Skip the tooltip entirely. */
  disabled?: boolean;
  children: ReactElement;
};

type Pos = { left: number; top: number; side: Side };

export function Tooltip({ tip, label, side = 'top', labelled, disabled, children }: Props) {
  const tips = useTips();
  const text = label ?? (tip ? tips[tip] : '');
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const hide = useCallback(() => { cancel(); setPos(null); }, [cancel]);

  // Position from the trigger's rect. `fixed` coordinates, so an ancestor with
  // overflow-hidden (every card in this app) can't clip the bubble.
  const place = useCallback((preferred: Side) => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip when the preferred side has no room. Rough bubble extents are fine
    // here — the exact clamp happens in the layout effect once it has rendered.
    let s = preferred;
    if (s === 'top' && r.top < 44) s = 'bottom';
    else if (s === 'bottom' && window.innerHeight - r.bottom < 44) s = 'top';
    else if (s === 'left' && r.left < 140) s = 'right';
    else if (s === 'right' && window.innerWidth - r.right < 140) s = 'left';

    const anchor =
      s === 'top' ? { left: r.left + r.width / 2, top: r.top - OFFSET } :
      s === 'bottom' ? { left: r.left + r.width / 2, top: r.bottom + OFFSET } :
      s === 'left' ? { left: r.left - OFFSET, top: r.top + r.height / 2 } :
      { left: r.right + OFFSET, top: r.top + r.height / 2 };

    setPos({ ...anchor, side: s });
  }, []);

  const show = useCallback((immediate: boolean) => {
    if (disabled || !text) return;
    // Touch/pen devices never get a hover tooltip: on a phone the "hover" is
    // synthesised by a tap, which would flash a bubble over the thing the user
    // just pressed. Those users get the aria-label instead.
    if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    cancel();
    if (immediate) place(side);
    else timer.current = setTimeout(() => place(side), OPEN_DELAY_MS);
  }, [disabled, text, cancel, place, side]);

  // Clamp horizontally once the bubble has a measured width. The transform
  // centres it on the anchor, so overflow is half the width past either edge.
  useLayoutEffect(() => {
    const b = bubbleRef.current;
    if (!pos || !b) return;
    if (pos.side !== 'top' && pos.side !== 'bottom') return;
    const half = b.offsetWidth / 2;
    const min = EDGE_PAD + half;
    const max = window.innerWidth - EDGE_PAD - half;
    const clamped = Math.min(Math.max(pos.left, min), max);
    if (clamped !== pos.left) setPos(p => (p ? { ...p, left: clamped } : p));
  }, [pos]);

  // Anything that moves the trigger out from under the bubble dismisses it.
  // Scroll is captured so it fires for inner scrollers too, not just the page.
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos, hide]);

  useEffect(() => cancel, [cancel]);

  if (!isValidElement(children)) return children;
  if (disabled || !text) return children;

  const childProps = children.props as Record<string, any>;

  const trigger = cloneElement(children as ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Preserve whatever ref the caller already put on the element.
      const own = (children as any).ref;
      if (typeof own === 'function') own(node);
      else if (own && typeof own === 'object') own.current = node;
    },
    // A screen reader gets the same sentence the mouse user gets — unless the
    // trigger is already captioned, or the caller wrote a more specific name.
    'aria-label': childProps['aria-label'] ?? (labelled ? undefined : text),
    onMouseEnter: (e: any) => { show(false); childProps.onMouseEnter?.(e); },
    onMouseLeave: (e: any) => { hide(); childProps.onMouseLeave?.(e); },
    onFocus: (e: any) => { show(true); childProps.onFocus?.(e); },
    onBlur: (e: any) => { hide(); childProps.onBlur?.(e); },
    // Clicking commits the action; the explanation has served its purpose.
    onClick: (e: any) => { hide(); childProps.onClick?.(e); },
  });

  const bubble = pos && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={bubbleRef}
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            transform:
              pos.side === 'top' ? 'translate(-50%, -100%)' :
              pos.side === 'bottom' ? 'translate(-50%, 0)' :
              pos.side === 'left' ? 'translate(-100%, -50%)' :
              'translate(0, -50%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="px-2 py-1 rounded-md bg-ink text-card text-[11px] font-medium leading-tight
                     whitespace-nowrap shadow-lg animate-tooltipIn"
        >
          {text}
        </div>,
        document.body,
      )
    : null;

  return <>{trigger}{bubble}</>;
}

export default Tooltip;

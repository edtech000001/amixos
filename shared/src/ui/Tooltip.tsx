// Tooltip — NATIVE implementation. The real one is Tooltip.web.tsx; webpack
// resolves that first (see web/next.config.js), Metro and TypeScript take this.
//
// A touch screen has no hover, so there is nothing to pop up: a bubble that
// appeared on tap would cover the very control the finger just pressed, and
// press-and-hold is already spoken for on several screens (Archivos uses it to
// start a multi-select). What the phone keeps is the part that carries the
// meaning — the same sentence, handed to VoiceOver / TalkBack as the control's
// accessibility label.
//
// The child is cloned rather than wrapped so it keeps whatever layout its
// parent gave it, exactly as on web.

import { cloneElement, isValidElement, type ReactElement } from 'react';
import { useTips } from '../i18n/context';
import type { CommonDict } from '../i18n/dict/common';

type Props = {
  /** Key into the shared tooltip vocabulary (shared/src/i18n/dict/common.ts). */
  tip?: keyof CommonDict['tips'];
  /** Literal text, for wording that already lives in a screen's own dict. */
  label?: string;
  /** Accepted for parity with the web signature; nothing to position here. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** The trigger already shows its own text, so it needs no spoken label. */
  labelled?: boolean;
  disabled?: boolean;
  children: ReactElement;
};

export function Tooltip({ tip, label, labelled, disabled, children }: Props) {
  const tips = useTips();
  const text = label ?? (tip ? tips[tip] : '');

  if (!isValidElement(children) || disabled || !text || labelled) return children;

  const childProps = children.props as Record<string, any>;
  return cloneElement(children as ReactElement<any>, {
    accessible: childProps.accessible ?? true,
    accessibilityLabel: childProps.accessibilityLabel ?? text,
  });
}

export default Tooltip;

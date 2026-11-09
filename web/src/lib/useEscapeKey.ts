'use client';

import { useEffect, useRef } from 'react';

/** Run `onEscape` when Escape is pressed while `active` (e.g. close a
 *  full-screen photo viewer without reaching for its ✕). */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const fn = useRef(onEscape);
  fn.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fn.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}

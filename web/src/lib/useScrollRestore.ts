'use client';

import { useEffect, useRef } from 'react';

// Restores the window scroll position when returning to a list page — the
// app router remounts pages on navigation and resets scroll to the top, so
// drilling into a row and going back would otherwise lose your place.
//
// The offset is saved per-key in sessionStorage and restored once per mount,
// but only after `ready` is true (the list's FULL data has rendered —
// restoring against a loading/short page would clamp to the top).
//
// IMPORTANT: we save from user-INPUT events (wheel/touch/pointer/keys), NOT
// from 'scroll'. Right after a row click commits the navigation, the router
// programmatically scrolls the window to the top while this page is still
// mounted — a 'scroll' listener would let that reset stomp the saved offset
// with 0. Input events only fire for the user's own actions, and the
// pointerdown on the row itself captures the exact position at the moment
// of leaving.
// Remember which row the user is drilling into. On return, the hook scrolls
// that exact row back into view (elements tagged data-scroll-anchor=<id>)
// instead of trusting a pixel offset — row heights are estimated under
// content-visibility and the refreshed data can reorder rows, so a raw
// offset can land on the wrong item.
export function saveScrollAnchor(key: string, id: string) {
  try {
    sessionStorage.setItem(`scrollanchor:${key}`, id);
  } catch { /* storage unavailable */ }
}

export function useScrollRestore(key: string, ready: boolean) {
  const storageKey = `scroll:${key}`;
  const restored = useRef(false);

  useEffect(() => {
    let raf = 0;
    const save = () => {
      // Capture the offset synchronously — by the time a deferred callback
      // ran, the router might already have reset the window to the top.
      const y = window.scrollY;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => sessionStorage.setItem(storageKey, String(y)));
    };
    window.addEventListener('wheel', save, { passive: true });
    window.addEventListener('touchmove', save, { passive: true });
    document.addEventListener('pointerdown', save, true);
    document.addEventListener('keydown', save, true);
    return () => {
      window.removeEventListener('wheel', save);
      window.removeEventListener('touchmove', save);
      document.removeEventListener('pointerdown', save, true);
      document.removeEventListener('keydown', save, true);
      cancelAnimationFrame(raf);
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const anchorKey = `scrollanchor:${key}`;
    const anchorId = sessionStorage.getItem(anchorKey);
    if (anchorId) sessionStorage.removeItem(anchorKey);
    const saved = Number(sessionStorage.getItem(storageKey) ?? 0);
    // Next frame so the freshly-rendered rows are in the layout before we
    // jump — otherwise the document may still be too short.
    requestAnimationFrame(() => {
      // Prefer the exact row that was opened; pixel offset is the fallback
      // (e.g. the row moved to another tab/filter after a status change).
      if (anchorId) {
        const el = document.querySelector(`[data-scroll-anchor="${CSS.escape(anchorId)}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          return;
        }
      }
      if (saved > 0) window.scrollTo({ top: saved });
    });
  }, [ready, key, storageKey]);
}

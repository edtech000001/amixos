'use client';

// Forces a light page background for the public, light-only pages.
//
// `body` is painted with --color-surface, which follows the user's dark-mode
// preference and is #0B1220 (deep navy) there. The landing and legal pages are
// deliberately light-only — they render for people with no account and no
// theme preference stored — so their own `bg-white` sits on a dark body. You
// cannot see that until you rubber-band past the top of the page, at which
// point the navy shows through above the header and the translucent bar looks
// broken against it.
//
// This lives in a component rather than globals.css because `body` is outside
// the route: only the pages that opt in should be pinned to light.

import { useEffect } from 'react';

export function LightPageBackground() {
  useEffect(() => {
    document.body.classList.add('light-page');
    return () => document.body.classList.remove('light-page');
  }, []);
  return null;
}

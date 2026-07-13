'use client';

// Unsaved-changes guard for web forms (mirrors mobile/lib/useUnsavedGuard).
//
//   useDirty(values, ready) — true once the serialized form values diverge
//     from their first "ready" snapshot. `ready` is `!loadingEdit` so edit
//     forms snapshot the LOADED record and new forms snapshot their defaults.
//     Build `values` from the meaningful fields only.
//   useUnsavedChanges(dirty) — registers a `beforeunload` handler (native
//     browser prompt on refresh / tab-close / external nav) and returns
//     `confirmDiscard(proceed)`: runs `proceed` immediately when clean, or
//     after a confirm dialog when dirty. Wire it into back links / modal
//     close so in-app navigation prompts too.
//
// The save path should navigate directly (NOT via confirmDiscard) so a
// successful save never prompts.

import { useCallback, useEffect, useRef } from 'react';
import { useLang } from '@/i18n/LangProvider';
import { confirm } from '@amixos/shared/ui/confirmBus';

export function useDirty(values: unknown, ready: boolean): boolean {
  const initial = useRef<string | null>(null);
  const current = JSON.stringify(values);
  if (ready && initial.current === null) {
    initial.current = current;
  }
  return initial.current !== null && current !== initial.current;
}

export function useUnsavedChanges(dirty: boolean): (proceed: () => void) => void {
  const { t } = useLang();
  const s = t.common.unsavedChanges;
  // Set true right before an intentional navigation so `beforeunload` doesn't
  // double-prompt when `proceed` does a full-page nav (window.location.href).
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (bypass.current) return;
      e.preventDefault();
      // Legacy property still required by some browsers to trigger the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return useCallback(
    (proceed: () => void) => {
      if (!dirty) {
        bypass.current = true;
        proceed();
        return;
      }
      void confirm({ title: s.title, message: s.body, destructive: true, confirmText: s.discard, cancelText: s.stay }).then(ok => {
        if (ok) {
          bypass.current = true;
          proceed();
        }
      });
    },
    [dirty, s.title, s.body],
  );
}

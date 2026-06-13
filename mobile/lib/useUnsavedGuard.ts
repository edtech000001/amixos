// Unsaved-changes guard for form screens.
//
// Two pieces:
//   useDirty(values, ready) — true once the serialized form values diverge
//     from their first "ready" snapshot. `ready` is `!loadingEdit` so edit
//     forms snapshot the LOADED record (not the empty mount state) and new
//     forms snapshot their defaults. Build `values` from the meaningful
//     fields only; exclude auto-managed noise (e.g. a trailing empty line
//     item) so it doesn't read as dirty.
//   useUnsavedGuard({ dirty, onLeave }) — returns `confirmLeave`, which the
//     back arrow calls. If dirty it shows the discard/stay alert; otherwise
//     it leaves immediately. Also intercepts the Android hardware back.
//
// The save path should call its navigation directly (NOT confirmLeave) so a
// successful save never prompts.

import { useCallback, useRef } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useLang } from '@/lib/i18n/LangProvider';

export function useDirty(values: unknown, ready: boolean): boolean {
  const initial = useRef<string | null>(null);
  const current = JSON.stringify(values);
  // Lazy-capture the first snapshot once the form is ready. Idempotent
  // ref-init during render is allowed by React.
  if (ready && initial.current === null) {
    initial.current = current;
  }
  return initial.current !== null && current !== initial.current;
}

export function useUnsavedGuard(opts: {
  dirty: boolean;
  onLeave: () => void;
}): () => void {
  const { dirty, onLeave } = opts;
  const { t } = useLang();
  const s = t.common.unsavedChanges;

  const confirmLeave = useCallback(() => {
    if (!dirty) {
      onLeave();
      return;
    }
    Alert.alert(s.title, s.body, [
      { text: s.stay, style: 'cancel' },
      { text: s.discard, style: 'destructive', onPress: onLeave },
    ]);
  }, [dirty, onLeave, s.title, s.body, s.stay, s.discard]);

  // Android hardware back: prompt instead of leaving when dirty.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!dirty) return false; // let the default back happen
        confirmLeave();
        return true; // we handled it
      });
      return () => sub.remove();
    }, [dirty, confirmLeave]),
  );

  return confirmLeave;
}

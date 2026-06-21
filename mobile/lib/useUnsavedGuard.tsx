// Unsaved-changes guard for form screens.
//
// Two pieces:
//   useDirty(values, ready) — true once the serialized form values diverge
//     from their first "ready" snapshot. `ready` is `!loadingEdit` so edit
//     forms snapshot the LOADED record (not the empty mount state) and new
//     forms snapshot their defaults. Build `values` from the meaningful
//     fields only; exclude auto-managed noise (e.g. a trailing empty line
//     item) so it doesn't read as dirty.
//   useUnsavedGuard({ dirty, onLeave }) — returns `confirmLeave` (the back
//     arrow calls it) plus `unsavedSheet`, a bottom-sheet element the screen
//     must render. If dirty, confirmLeave opens the discard/stay sheet;
//     otherwise it leaves immediately. Also intercepts the Android hardware
//     back. The sheet sits at the BOTTOM of the screen (one-hand reach) rather
//     than a centered Alert.
//
// The save path should call its navigation directly (NOT confirmLeave) so a
// successful save never prompts.

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { BackHandler, Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useLang } from '@/lib/i18n/LangProvider';
import { useLeaveGuardStore } from '@/lib/leaveGuardStore';

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
}): { confirmLeave: () => void; unsavedSheet: ReactElement } {
  const { dirty, onLeave } = opts;
  const { t } = useLang();
  const s = t.common.unsavedChanges;
  const [visible, setVisible] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  // What "Salir sin guardar" should run — the back-arrow's onLeave, or a custom
  // action handed in by an external caller (e.g. the dock's navigation). Set
  // whenever the sheet is opened.
  const leaveAction = useRef<() => void>(onLeave);

  const confirmLeave = useCallback(() => {
    if (!dirty) {
      onLeave();
      return;
    }
    leaveAction.current = onLeave;
    setVisible(true);
  }, [dirty, onLeave]);

  // External leave request (dock re-tap, etc.): same prompt, but on discard it
  // runs `proceed` (the caller's navigation) instead of the back-arrow onLeave.
  // Clean form → proceed immediately, no prompt.
  const requestLeave = useCallback((proceed: () => void) => {
    if (!dirty) {
      proceed();
      return;
    }
    leaveAction.current = proceed;
    setVisible(true);
  }, [dirty]);

  // Close the sheet first, then run the action. Navigating (which unmounts this
  // screen AND the Modal) while the Modal is still committed as visible crashes
  // on iOS — so we stash the action and run it only after `visible` flips false.
  const discard = useCallback(() => {
    pending.current = leaveAction.current;
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible && pending.current) {
      const fn = pending.current;
      pending.current = null;
      const h = requestAnimationFrame(() => fn());
      return () => cancelAnimationFrame(h);
    }
  }, [visible]);

  // Publish this form's guard so the dock can route its navigation through the
  // prompt while this screen is focused; clear it on blur.
  const setRequest = useLeaveGuardStore(s => s.setRequest);
  useFocusEffect(
    useCallback(() => {
      setRequest(requestLeave);
      return () => setRequest(null);
    }, [requestLeave, setRequest]),
  );

  // Android hardware back: prompt instead of leaving when dirty.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!dirty) return false; // let the default back happen
        leaveAction.current = onLeave;
        setVisible(true);
        return true; // we handled it
      });
      return () => sub.remove();
    }, [dirty, onLeave]),
  );

  const unsavedSheet = (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable onPress={() => setVisible(false)} className="flex-1 bg-black/40 justify-end">
        <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-5 pt-6 pb-10">
          <Text className="text-xl font-bold text-gray-900">{s.title}</Text>
          <Text className="text-sm text-gray-500 mt-1.5 mb-5">{s.body}</Text>
          <Pressable onPress={discard} className="py-3.5 rounded-2xl bg-red-50 items-center active:opacity-80">
            <Text className="text-base font-semibold text-red-600">{s.discard}</Text>
          </Pressable>
          <Pressable onPress={() => setVisible(false)} className="py-3.5 rounded-2xl items-center mt-2 active:opacity-80">
            <Text className="text-base font-semibold text-gray-700">{s.stay}</Text>
          </Pressable>
          <View className="h-1" />
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { confirmLeave, unsavedSheet };
}

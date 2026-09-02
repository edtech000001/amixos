// Reusable confirmation bottom sheet for mobile.
//
// Replaces centered `Alert.alert(...)` confirm dialogs with a one-hand-friendly
// bottom sheet (matches the unsaved-changes guard + the app's other sheets:
// `justify-end`, `rounded-t-3xl`, `animationType="fade"`, stacked full-width
// buttons — destructive action on top, cancel below).
//
// Usage:
//   const { confirm, confirmSheet } = useConfirmSheet();
//   confirm({ title, body?, confirmText, destructive?, onConfirm, onCancel? });
//   ...
//   return (<SafeAreaView>... {confirmSheet}</SafeAreaView>);
//
// Calling confirm() again inside an onConfirm chains a second prompt (e.g. the
// "invoice is now empty — delete it?" follow-up). Backdrop tap / cancel button
// run onCancel; the confirm button runs onConfirm (never onCancel).

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useLang } from '@/lib/i18n/LangProvider';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function useConfirmSheet(): { confirm: (opts: ConfirmOptions) => void; confirmSheet: ReactElement } {
  const { t } = useLang();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const pending = useRef<(() => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => setOpts(o), []);

  // Stash the chosen callback and close the sheet; run it only AFTER the Modal
  // has been hidden. Running it inline (while the Modal is still committed as
  // visible) and navigating crashes on iOS — the screen + Modal unmount mid-show.
  const cancel = useCallback(() => {
    pending.current = opts?.onCancel ?? null;
    setOpts(null);
  }, [opts]);

  const accept = useCallback(() => {
    pending.current = opts?.onConfirm ?? null;
    setOpts(null);
  }, [opts]);

  useEffect(() => {
    if (!opts && pending.current) {
      const fn = pending.current;
      pending.current = null;
      const h = requestAnimationFrame(() => fn());
      return () => cancelAnimationFrame(h);
    }
  }, [opts]);

  const confirmSheet = (
    <Modal visible={!!opts} transparent animationType="fade" onRequestClose={cancel}>
      {/* Backdrop is an absolute FIRST child and the card a plain sibling,
          per the sheet contract in CLAUDE.md: nesting the card inside the
          backdrop Pressable stops its ScrollView receiving drags. */}
      <View className="flex-1 justify-end">
        <Pressable
          onPress={cancel}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
        />
        <View className="bg-white rounded-t-3xl px-5 pt-6 pb-10">
          <Text className="text-xl font-bold text-gray-900">{opts?.title}</Text>
          {opts?.body ? (
            <Text className="text-sm text-gray-500 mt-1.5">{opts.body}</Text>
          ) : null}
          <View className="mt-5">
            <Pressable
              onPress={accept}
              className={`py-3.5 rounded-2xl items-center active:opacity-80 ${opts?.destructive ? 'bg-red-50' : 'bg-primary'}`}
            >
              <Text className={`text-base font-semibold ${opts?.destructive ? 'text-red-600' : 'text-white'}`}>
                {opts?.confirmText}
              </Text>
            </Pressable>
            <Pressable onPress={cancel} className="py-3.5 rounded-2xl items-center mt-2 active:opacity-80">
              <Text className="text-base font-semibold text-gray-700">{opts?.cancelText ?? t.common.buttons.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  return { confirm, confirmSheet };
}

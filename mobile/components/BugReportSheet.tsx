// "Report a bug" sheet, opened by shaking the phone (or from Settings →
// Support). Writes to bug_reports (migration 241).
//
// Sheet structure follows the CLAUDE.md contract exactly: plain root View,
// absolutely-positioned backdrop Pressable FIRST, card as a plain sibling
// after it. The card must not live inside the backdrop or its ScrollView stops
// receiving drags — a bug that has shipped here several times.

import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  Modal as RNModal, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { X } from 'lucide-react-native';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';
import { submitBugReport, BUG_REPORT_MAX } from '@amixos/shared/lib/bugReport';

export function BugReportSheet({
  visible,
  onClose,
  route,
}: {
  visible: boolean;
  onClose: () => void;
  /** Screen the user was on when they shook. The single most useful field. */
  route?: string | null;
}) {
  const { t: full, locale } = useLang();
  const t = full.common.bugReport;
  const c = useThemeColors();
  const { user, business } = useApp();

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const close = () => {
    // Reset so the next shake starts clean rather than showing the last
    // report's text or its success state.
    setMessage('');
    setError('');
    setDone(false);
    setBusy(false);
    onClose();
  };

  const send = async () => {
    if (busy || !user) return;
    setBusy(true);
    setError('');
    const res = await submitBugReport(createSupabaseClient(), {
      userId: user.id,
      businessId: business?.id ?? null,
      message,
      route: route ?? null,
      platform: Platform.OS,
      appVersion: Application.nativeApplicationVersion,
      buildNumber: Application.nativeBuildVersion,
      // Platform.Version and expo-constants rather than expo-device: one
      // fewer native dependency to compile into the build, for two fields
      // that are only ever read by a human triaging a report.
      osVersion: `${Platform.OS} ${Platform.Version}`,
      deviceModel: Constants.deviceName ?? null,
      locale,
    });
    if (res.ok === true) { setDone(true); setBusy(false); return; }
    setError(res.reason === 'empty' ? t.errorEmpty : t.errorFailed);
    setBusy(false);
  };

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={close}>
      {/* KeyboardAvoidingView, not the ScrollView's automaticallyAdjustKeyboardInsets:
          insets only pad INSIDE the scroll view, which does nothing for a card
          anchored to the bottom of the screen — the keyboard still covered the
          whole sheet, title included. Padding the container lifts the card
          itself. The two must not both be on (see CLAUDE.md), so the inset prop
          is gone.

          Still the documented sheet structure: plain container with
          justify-end, absolutely-positioned backdrop FIRST, card as a plain
          sibling after it. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          style={[SHEET_BACKDROP, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
          onPress={close}
        />
        <View className="bg-card rounded-t-3xl px-5 pt-5 pb-10" style={{ maxHeight: '85%' }}>
          <View className="flex-row items-start justify-between mb-1">
            <Text className="text-lg font-bold text-ink flex-1 pr-3">{t.title}</Text>
            <Pressable onPress={close} hitSlop={8} className="p-1 -mr-1 active:opacity-60">
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          {done ? (
            <View className="py-8 items-center">
              <Text className="text-base font-semibold text-ink text-center">{t.sent}</Text>
              <Pressable onPress={close} className="mt-5 px-6 py-3 rounded-2xl bg-primary active:opacity-90">
                <Text className="text-sm font-semibold text-white">OK</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Text className="text-sm text-muted mb-3">{t.subtitle}</Text>

              <TextInput
                autoFocus
                multiline
                value={message}
                onChangeText={setMessage}
                maxLength={BUG_REPORT_MAX}
                placeholder={t.placeholder}
                placeholderTextColor={c.faint}
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-ink"
                style={{ minHeight: 120, textAlignVertical: 'top' }}
              />

              <Text className="text-xs text-faint mt-2">{t.contextNote}</Text>

              {error ? <Text className="text-xs text-red-600 mt-2">{error}</Text> : null}

              <Pressable
                onPress={send}
                disabled={busy || !message.trim()}
                className={`mt-4 py-3.5 rounded-2xl items-center ${message.trim() && !busy ? 'bg-primary active:opacity-90' : 'bg-border-soft'}`}
              >
                {busy ? <ActivityIndicator color={c.white} /> : (
                  <Text className={`text-sm font-semibold ${message.trim() ? 'text-white' : 'text-faint'}`}>
                    {t.send}
                  </Text>
                )}
              </Pressable>

              <Pressable onPress={close} className="mt-2 py-2" hitSlop={8}>
                <Text className="text-sm text-muted text-center">{t.cancel}</Text>
              </Pressable>

              <Text className="text-[11px] text-faint text-center mt-3">{t.disableHint}</Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

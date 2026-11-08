import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AudioLines,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  RotateCcw,
  Send,
  BotMessageSquare,
  Volume2,
  X,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import type { useAssistant } from './useAssistant';
import { useVoiceCall } from './useVoiceCall';
import { MessageBubble } from './MessageBubble';
import { SHEET_BACKDROP } from '@amixos/shared/ui/sheetBackdrop';

// Show the END of a long in-progress utterance, not the start.
const liveTail = (s: string, max = 90) => (s.length > max ? `…${s.slice(-max)}` : s);

// Static object (not a className, not a style function) — immune to the
// NativeWind interop quirks that swallowed this button's styles twice.
const endPillStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 9999,
  backgroundColor: '#DC2626',
  paddingHorizontal: 16,
  paddingVertical: 10,
} as const;

// Expanding ring behind the mic while Ami listens — the "you can talk now"
// signal. RN has no CSS animations, so a tiny native-driver loop.
function PulseRing({ color = 'rgba(79, 70, 229, 0.25)' }: { color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.5, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

interface Props {
  assistant: ReturnType<typeof useAssistant>;
  businessId: string;
  onClose: () => void;
  /** Call shrunk to the floating pill (see AssistantWidget). */
  mini: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  /** Lets the widget know whether a call is live when Ami navigates. */
  callActiveRef: { current: boolean };
}

// Near-full-height chat sheet for Ami. An ABSOLUTE OVERLAY, not an RN Modal
// (app convention — see shared/src/ui/DateRangeSheet.tsx), at zIndex 1001 so
// it also covers the top-banner overlay (zIndex 1000 in dashboard/_layout).
export function AssistantSheet({ assistant, businessId, onClose, mini, onMinimize, onExpand, callActiveRef }: Props) {
  const { t: full, locale } = useLang();
  const a = full.dashboard.assistant;
  const insets = useSafeAreaInsets();
  const c = useThemeColors();
  const { bubbles, pendingDraft, sending, confirming, error, send, editAndResend, confirm, reset } = assistant;

  const [text, setText] = useState('');
  // When set, the composer is editing an earlier user turn (long-press) — send
  // re-runs from there instead of appending.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Hands-free call mode: continuous listen → think → speak-aloud loop.
  // (Dictation-into-the-box is the keyboard mic's job on mobile; spoken
  // replies happen in call mode, so there's no separate read-aloud toggle.)
  const call = useVoiceCall({ businessId, locale, send });
  callActiveRef.current = call.active;
  // Hanging up from the pill closes Ami entirely (back to the edge tab).
  useEffect(() => {
    if (mini && !call.active) onClose();
  }, [mini, call.active, onClose]);

  const callStatusLabel =
    call.status === 'connecting'
      ? a.callConnecting
      : call.status === 'thinking'
        ? a.callThinking
        : call.status === 'speaking'
          ? a.callSpeaking
          : a.callListening;

  // Inverted FlatList (index 0 = visual bottom) keeps the transcript pinned
  // to the newest message without scroll-to-end bookkeeping.
  const reversed = useMemo(() => [...bubbles].reverse(), [bubbles]);
  const canSend = !!text.trim() && !sending;

  const handleSend = () => {
    if (!canSend) return;
    const value = text;
    setText('');
    if (editingId) {
      const id = editingId;
      setEditingId(null);
      void editAndResend(id, value);
    } else {
      void send(value);
    }
  };

  const callIcon =
    call.status === 'thinking' ? (
      <ActivityIndicator size="small" color={c.primary} />
    ) : call.status === 'speaking' ? (
      <Volume2 size={18} color={c.primary} />
    ) : (
      <Mic size={18} color={c.primary} />
    );
  const callSubline =
    call.muted && call.status === 'listening'
      ? a.callMuted
      : call.status === 'speaking'
      ? a.callInterrupt
      : call.status === 'thinking'
        ? a.callThinkingHint
        : liveTail(call.partial) || (pendingDraft ? a.callDraftHint : a.callHint);

  // Minimized: the Ami edge tab itself shows the live call — green and
  // pulsing while it listens — with a mute button under it. Tap the tab to
  // go back to the full chat (hang up lives there). Same spot as
  // AssistantFab; everything else on screen stays touchable.
  if (mini && call.active) {
    const live = call.muted ? '#6B7280' : '#16A34A';
    return (
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1001 }]}>
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', right: -6, bottom: insets.bottom + 184, alignItems: 'center' }}
        >
          <Pressable
            onPress={onExpand}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
            accessibilityLabel={a.callExpand}
          >
            <View
              style={{
                width: 44, height: 48, borderTopLeftRadius: 16, borderBottomLeftRadius: 16,
                backgroundColor: live, alignItems: 'center', justifyContent: 'center',
                elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
              }}
            >
              {(call.status === 'listening' && !call.muted) || call.status === 'speaking' ? <PulseRing color="rgba(255,255,255,0.45)" /> : null}
              {call.status === 'thinking' || call.status === 'connecting' ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
              ) : (
                <BotMessageSquare size={19} color="#fff" style={{ marginRight: 6 }} />
              )}
            </View>
          </Pressable>
          <Pressable onPress={call.toggleMute} hitSlop={6} accessibilityLabel={call.muted ? a.callUnmute : a.callMute}>
            <View
              style={{
                width: 36, height: 36, borderRadius: 18, marginTop: 10, marginRight: 6,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: call.muted ? '#DC2626' : c.card,
                borderWidth: call.muted ? 0 : 1, borderColor: c.border,
                elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
              }}
            >
              {call.muted ? <MicOff size={16} color="#fff" /> : <Mic size={16} color={c.muted} />}
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1001 }]}>
      <Pressable onPress={call.active ? onMinimize : onClose} style={SHEET_BACKDROP} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View className="bg-card rounded-t-3xl" style={{ height: '88%', maxHeight: '88%' }}>
          <View className="items-center pt-3">
            <View className="w-10 h-1 rounded-full bg-border" />
          </View>

          {/* Header — identity left, reset + close right. */}
          <View className="flex-row items-center px-5 pt-3 pb-3 border-b border-border-soft">
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
              <BotMessageSquare size={20} color={c.primary} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-lg font-bold text-ink">{a.title}</Text>
              <Text className="text-xs text-muted">{a.subtitle}</Text>
            </View>
            {/* Floating mode: start talking (if not already) and shrink to the
               pill so the app stays usable. */}
            {call.supported ? (
              <Pressable
                onPress={() => { if (!call.active) call.start(); onMinimize(); }}
                hitSlop={8}
                accessibilityLabel={a.callMinimize}
                className="w-9 h-9 rounded-full items-center justify-center active:bg-border-soft ml-1"
              >
                <Minimize2 size={18} color={c.muted} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={reset}
              hitSlop={8}
              accessibilityLabel={a.newChat}
              className="w-9 h-9 rounded-full items-center justify-center active:bg-border-soft ml-1"
            >
              <RotateCcw size={18} color={c.muted} />
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center active:bg-border-soft ml-1"
            >
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          {/* Transcript. The empty state renders outside the FlatList — RN's
             ListEmptyComponent is unreliable inside inverted lists. */}
          {bubbles.length === 0 && !sending ? (
            <View className="flex-1 items-center justify-center px-8">
              <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
                <BotMessageSquare size={30} color={c.primary} />
              </View>
              <Text className="text-lg font-bold text-ink text-center">{a.emptyTitle}</Text>
              <Text className="text-sm text-muted text-center mt-1 mb-6">{a.emptyState}</Text>
              {/* Tappable examples — one tap sends the question. */}
              <View className="gap-2.5 self-stretch">
                {[a.suggestion1, a.suggestion2, a.suggestion3].map(s => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 active:bg-primary/10"
                  >
                    <Text className="text-sm font-medium text-primary text-center">{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <FlatList
              inverted
              data={reversed}
              keyExtractor={b => b.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <MessageBubble
                  bubble={item}
                  activeDraftId={pendingDraft?.job_id ?? null}
                  confirming={confirming}
                  onConfirm={() => void confirm()}
                  onNavigate={call.active ? onMinimize : onClose}
                  onEdit={item.role === 'user' ? () => { setEditingId(item.id); setText(item.content); } : undefined}
                />
              )}
              // In an inverted list the header renders at the visual BOTTOM —
              // exactly where the typing indicator / error row belongs.
              ListHeaderComponent={
                sending ? (
                  <View className="self-start bg-border-soft rounded-2xl rounded-bl-md px-4 py-2.5 mb-2 flex-row items-center">
                    <ActivityIndicator size="small" color={c.primary} />
                    <Text className="text-sm text-muted ml-2">{a.thinking}</Text>
                  </View>
                ) : error ? (
                  <Text className="text-xs text-red-600 mb-2">{a.errorMsg}</Text>
                ) : null
              }
            />
          )}

          {/* Composer — swapped for the call bar during a call so the
             transcript above stays readable while you talk (your words
             stream into the bar, then land as bubbles like a normal chat). */}
          {call.active ? (
            <Pressable
              onPress={call.status === 'speaking' ? call.interrupt : undefined}
              className="flex-row items-center mx-4 mt-2 rounded-2xl bg-primary/5 px-3 py-2.5"
              style={{ marginBottom: insets.bottom + 12 }}
            >
              {/* The mic circle doubles as the mute toggle. */}
              <Pressable onPress={call.toggleMute} hitSlop={6} accessibilityLabel={call.muted ? a.callUnmute : a.callMute}>
                <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                  {call.status === 'listening' && !call.muted ? <PulseRing /> : null}
                  {call.muted ? (
                    <View key="muted" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}>
                      <MicOff size={18} color="#fff" />
                    </View>
                  ) : (
                    <View key="live" className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                      {callIcon}
                    </View>
                  )}
                </View>
              </Pressable>
              <View className="flex-1" style={{ marginLeft: 28, marginRight: 12 }}>
                <Text className="text-sm font-semibold text-ink">{callStatusLabel}</Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {callSubline}
                </Text>
              </View>
              {/* Shrink to the edge tab and keep talking while using the app. */}
              <Pressable onPress={onMinimize} hitSlop={6} accessibilityLabel={a.callMinimize}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <Minimize2 size={18} color={c.muted} />
                </View>
              </Pressable>
              {/* NativeWind 4's interop drops function-style props on
                 Pressable — keep the Pressable bare and style a plain View. */}
              <Pressable onPress={call.end} hitSlop={4} accessibilityLabel={a.callEnd}>
                <View style={endPillStyle}>
                  <PhoneOff size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 6 }}>
                    {a.callEnd}
                  </Text>
                </View>
              </Pressable>
            </Pressable>
          ) : (
            <View className="border-t border-border-soft" style={{ paddingBottom: insets.bottom + 12 }}>
            {editingId ? (
              <View className="flex-row items-center justify-between px-4 pt-2">
                <Text className="text-xs text-primary flex-1" numberOfLines={1}>{a.editingHint}</Text>
                <Pressable onPress={() => { setEditingId(null); setText(''); }} hitSlop={8} className="p-1">
                  <X size={16} color={c.muted} />
                </Pressable>
              </View>
            ) : null}
            <View className="flex-row items-end px-4 pt-2">
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={a.placeholder}
                placeholderTextColor={c.faint}
                className="flex-1 rounded-2xl border border-border px-4 py-2.5 text-[15px] text-ink"
                style={{ maxHeight: 100 }}
              />
              {call.supported ? (
                <Pressable
                  onPress={call.start}
                  hitSlop={4}
                  accessibilityLabel={a.callButton}
                  className="w-10 h-10 rounded-full items-center justify-center ml-2 bg-border-soft active:bg-border"
                >
                  <AudioLines size={18} color={c.muted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSend}
                disabled={!canSend}
                accessibilityLabel={a.send}
                className={`w-10 h-10 rounded-full bg-primary items-center justify-center ml-2 ${canSend ? 'active:opacity-80' : 'opacity-40'}`}
              >
                <Send size={18} color="#fff" />
              </Pressable>
            </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

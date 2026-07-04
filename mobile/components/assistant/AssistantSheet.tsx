import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Mic, RotateCcw, Send, Sparkles, X } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import type { useAssistant } from './useAssistant';
import { useSpeechRecognition } from './useSpeechRecognition';
import { MessageBubble } from './MessageBubble';

const PRIMARY = '#4F46E5';

interface Props {
  assistant: ReturnType<typeof useAssistant>;
  onClose: () => void;
}

// Near-full-height chat sheet for Ami. An ABSOLUTE OVERLAY, not an RN Modal
// (app convention — see shared/src/ui/DateRangeSheet.tsx), at zIndex 1001 so
// it also covers the top-banner overlay (zIndex 1000 in dashboard/_layout).
export function AssistantSheet({ assistant, onClose }: Props) {
  const { t: full, locale } = useLang();
  const a = full.dashboard.assistant;
  const insets = useSafeAreaInsets();
  const { bubbles, pendingDraft, sending, confirming, error, send, confirm, reset } = assistant;

  const [text, setText] = useState('');
  const { supported, listening, start, stop } = useSpeechRecognition({
    locale,
    onResult: setText,
  });

  // Inverted FlatList (index 0 = visual bottom) keeps the transcript pinned
  // to the newest message without scroll-to-end bookkeeping.
  const reversed = useMemo(() => [...bubbles].reverse(), [bubbles]);
  const canSend = !!text.trim() && !sending;

  const handleSend = () => {
    if (!canSend) return;
    if (listening) stop();
    const value = text;
    setText('');
    void send(value);
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1001 }]}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} className="bg-black/40" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View className="bg-white rounded-t-3xl" style={{ height: '88%', maxHeight: '88%' }}>
          <View className="items-center pt-3">
            <View className="w-10 h-1 rounded-full bg-gray-200" />
          </View>

          {/* Header — identity left, reset + close right. */}
          <View className="flex-row items-center px-5 pt-3 pb-3 border-b border-gray-100">
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
              <Sparkles size={20} color={PRIMARY} />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-lg font-bold text-gray-900">{a.title}</Text>
              <Text className="text-xs text-gray-500">{a.subtitle}</Text>
            </View>
            <Pressable
              onPress={reset}
              hitSlop={8}
              accessibilityLabel={a.newChat}
              className="w-9 h-9 rounded-full items-center justify-center active:bg-gray-100"
            >
              <RotateCcw size={18} color="#6B7280" />
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center active:bg-gray-100 ml-1"
            >
              <X size={20} color="#6B7280" />
            </Pressable>
          </View>

          {/* Transcript. The empty state renders outside the FlatList — RN's
             ListEmptyComponent is unreliable inside inverted lists. */}
          {bubbles.length === 0 && !sending ? (
            <View className="flex-1 items-center justify-center px-10">
              <Text className="text-sm text-gray-400 text-center">{a.emptyState}</Text>
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
                  onNavigate={onClose}
                />
              )}
              // In an inverted list the header renders at the visual BOTTOM —
              // exactly where the typing indicator / error row belongs.
              ListHeaderComponent={
                sending ? (
                  <View className="self-start bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 mb-2 flex-row items-center">
                    <ActivityIndicator size="small" color={PRIMARY} />
                    <Text className="text-sm text-gray-500 ml-2">{a.thinking}</Text>
                  </View>
                ) : error ? (
                  <Text className="text-xs text-red-600 mb-2">{a.errorMsg}</Text>
                ) : null
              }
            />
          )}

          {/* Composer. */}
          <View
            className="flex-row items-end px-4 pt-2 border-t border-gray-100"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder={listening ? a.listening : a.placeholder}
              placeholderTextColor="#9CA3AF"
              className="flex-1 rounded-2xl border border-gray-200 px-4 py-2.5 text-[15px] text-gray-900"
              style={{ maxHeight: 100 }}
            />
            {supported ? (
              <Pressable
                onPress={() => (listening ? stop() : void start())}
                hitSlop={4}
                accessibilityLabel={a.listening}
                className={`w-10 h-10 rounded-full items-center justify-center ml-2 ${listening ? 'bg-red-50' : 'bg-gray-100'}`}
              >
                <Mic size={18} color={listening ? '#DC2626' : '#4B5563'} />
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
      </KeyboardAvoidingView>
    </View>
  );
}

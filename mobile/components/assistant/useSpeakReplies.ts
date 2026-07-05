import { useEffect, useRef } from 'react';
import type { AssistantBubble } from '@amixos/shared/assistant/useAssistantCore';

// Tier-1 voice: read Ami's replies aloud with the on-device TTS voice
// (expo-speech → AVSpeechSynthesizer / android.speech.tts). Free — no cloud
// audio. Lazy require + try/catch so a dev client built before the module
// was added never crashes (the toggle simply no-ops until a rebuild).
let Speech: typeof import('expo-speech') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Speech = require('expo-speech');
} catch {
  Speech = null;
}

export function useSpeakReplies(
  bubbles: AssistantBubble[],
  enabled: boolean,
  locale: string,
) {
  // Track the newest bubble even while disabled so toggling on later doesn't
  // replay an old message.
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    const last = bubbles[bubbles.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    if (!enabled || !Speech || !last.content) return;
    Speech.stop();
    Speech.speak(last.content, { language: locale === 'en' ? 'en-US' : 'es-US' });
  }, [bubbles, enabled, locale]);

  // Silence on unmount (sheet closed) or when the user toggles voice off.
  useEffect(() => {
    if (!enabled) Speech?.stop();
    return () => {
      Speech?.stop();
    };
  }, [enabled]);

  return { available: !!Speech };
}

'use client';

import { useEffect, useRef } from 'react';
import type { AssistantBubble } from '@amixos/shared/assistant/useAssistantCore';

// Tier-1 voice: read Ami's replies aloud with the browser's built-in
// speechSynthesis. Free — no cloud audio.
export function useSpeakReplies(
  bubbles: AssistantBubble[],
  enabled: boolean,
  locale: string,
) {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  // Track the newest bubble even while disabled so toggling on later doesn't
  // replay an old message.
  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    const last = bubbles[bubbles.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    if (!enabled || !available || !last.content) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(last.content);
    utterance.lang = locale === 'en' ? 'en-US' : 'es-US';
    window.speechSynthesis.speak(utterance);
  }, [bubbles, enabled, locale, available]);

  // Silence on unmount (panel closed) or when the user toggles voice off.
  useEffect(() => {
    if (!available) return;
    if (!enabled) window.speechSynthesis.cancel();
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [enabled, available]);

  return { available };
}

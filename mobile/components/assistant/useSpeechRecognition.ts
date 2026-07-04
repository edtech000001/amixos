import { useCallback, useEffect, useRef, useState } from 'react';

// Voice dictation for the Ami sheet via expo-speech-recognition (pinned to
// 0.2.25 — the last release before 1.0.0 moved to the Expo SDK 52 events API).
//
// The package calls requireNativeModule() at import time, which THROWS when
// the native module isn't in the binary (Expo Go, or a dev client built
// before this dependency was added). Requiring it lazily inside try/catch
// turns that into `supported: false` instead of a crash — the mic button
// simply doesn't render until the user rebuilds the dev client.
type SpeechPackage = typeof import('expo-speech-recognition');

let speech: SpeechPackage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  speech = require('expo-speech-recognition') as SpeechPackage;
} catch {
  speech = null;
}

export function useSpeechRecognition({
  locale,
  onResult,
}: {
  locale: string;
  onResult: (transcript: string) => void;
}) {
  const supported = !!speech;
  const [listening, setListening] = useState(false);
  // Keep the latest callback without resubscribing the native listeners.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // 0.2.25 exposes events through ExpoSpeechRecognitionModuleEmitter (its
  // useSpeechRecognitionEvent hook is a thin wrapper over the same emitter —
  // we subscribe directly so everything stays inside this guarded module).
  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.ExpoSpeechRecognitionModuleEmitter.addListener('start', () => setListening(true)),
      speech.ExpoSpeechRecognitionModuleEmitter.addListener('result', (ev: { results?: { transcript: string }[] }) => {
        const transcript = ev?.results?.[0]?.transcript;
        if (transcript) onResultRef.current(transcript);
      }),
      speech.ExpoSpeechRecognitionModuleEmitter.addListener('end', () => setListening(false)),
      speech.ExpoSpeechRecognitionModuleEmitter.addListener('error', () => setListening(false)),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);

  const start = useCallback(async () => {
    if (!speech) return;
    try {
      const perm = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;
      speech.ExpoSpeechRecognitionModule.start({
        lang: locale === 'en' ? 'en-US' : 'es-US',
        interimResults: true,
      });
      // Optimistic — the 'start' event confirms, 'end'/'error' clear it.
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [locale]);

  const stop = useCallback(() => {
    if (!speech) return;
    try {
      speech.ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { supported, listening, start, stop };
}

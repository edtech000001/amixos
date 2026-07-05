import { useCallback, useEffect, useRef, useState } from 'react';
import { AV, Speech, SpeechRecognition, fetchTtsFileUri, setPlaybackAudioMode } from './voice';

// Hands-free "call" with Ami: a continuous turn loop —
//   listening (on-device speech recognition; a silence timer closes the turn)
//   → thinking (existing /chat tool loop)
//   → speaking (natural cloud voice, tap to interrupt)
//   → listening again, until the user hangs up.
// Turn-based rather than full-duplex streaming: the mic is never open while
// Ami talks, which also avoids her voice re-entering the recognizer.

export type VoiceCallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

// Close the user's turn this long after their last recognized words.
const SILENCE_MS = 1_600;
// Hard cap per listening turn — some recognizers never end on their own.
const MAX_TURN_MS = 45_000;

export function useVoiceCall({
  businessId,
  locale,
  send,
}: {
  businessId: string | null;
  locale: string;
  /** useAssistantCore.send — resolves the reply text. */
  send: (text: string) => Promise<string | null>;
}) {
  const [status, setStatus] = useState<VoiceCallStatus>('idle');
  /** Live partial transcript while the user is speaking. */
  const [partial, setPartial] = useState('');

  // Session generation — bumping it cancels whatever the loop is doing.
  const genRef = useRef(0);
  const soundRef = useRef<{ stopAsync: () => Promise<any>; unloadAsync: () => Promise<any> } | null>(null);
  // Resolves the current speak() early when the user taps to interrupt.
  const interruptRef = useRef<(() => void) | null>(null);
  // The loop reads send/locale through refs so a long call never uses a stale
  // closure (send is re-created on every new bubble).
  const sendRef = useRef(send);
  sendRef.current = send;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const stopEverything = useCallback(() => {
    genRef.current++;
    try {
      SpeechRecognition?.ExpoSpeechRecognitionModule.stop();
    } catch {
      /* noop */
    }
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) void sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
    interruptRef.current?.();
    interruptRef.current = null;
    Speech?.stop();
    setPartial('');
  }, []);

  /** One user turn: resolves the final transcript ('' on silence/error). */
  const listenOnce = useCallback((gen: number) => {
    return new Promise<string>(resolve => {
      const speech = SpeechRecognition;
      if (!speech || gen !== genRef.current) return resolve('');
      let transcript = '';
      let finished = false;
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      let subs: { remove: () => void }[] = [];
      const finish = () => {
        if (finished) return;
        finished = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        clearTimeout(maxTimer);
        subs.forEach(s => s.remove());
        subs = [];
        resolve(transcript.trim());
      };
      const requestStop = () => {
        try {
          speech.ExpoSpeechRecognitionModule.stop(); // 'end' event → finish()
        } catch {
          finish();
        }
      };
      const maxTimer = setTimeout(requestStop, MAX_TURN_MS);
      subs = [
        speech.ExpoSpeechRecognitionModuleEmitter.addListener(
          'result',
          (ev: { results?: { transcript: string }[] }) => {
            const text = ev?.results?.[0]?.transcript;
            if (!text) return;
            transcript = text;
            if (gen === genRef.current) setPartial(text);
            // The user's turn ends when they stop talking for a beat.
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(requestStop, SILENCE_MS);
          },
        ),
        speech.ExpoSpeechRecognitionModuleEmitter.addListener('end', finish),
        speech.ExpoSpeechRecognitionModuleEmitter.addListener('error', finish),
      ];
      try {
        speech.ExpoSpeechRecognitionModule.start({
          lang: localeRef.current === 'en' ? 'en-US' : 'es-US',
          interimResults: true,
        });
      } catch {
        finish();
      }
    });
  }, []);

  /** Speak a reply; resolves when playback ends or the user interrupts. */
  const speak = useCallback((gen: number, text: string) => {
    return new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        interruptRef.current = null;
        const sound = soundRef.current;
        soundRef.current = null;
        if (sound) void sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
        Speech?.stop();
        resolve();
      };
      interruptRef.current = finish;
      (async () => {
        try {
          if (!AV || !businessId) throw new Error('cloud voice unavailable');
          const uri = await fetchTtsFileUri(businessId, text, localeRef.current, 'ami-call.mp3');
          if (gen !== genRef.current || done) return finish();
          await setPlaybackAudioMode();
          const { sound } = await AV.Audio.Sound.createAsync({ uri }, { shouldPlay: true });
          if (gen !== genRef.current || done) {
            void sound.unloadAsync().catch(() => {});
            return finish();
          }
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate(st => {
            if (st.isLoaded) {
              if (st.didJustFinish) finish();
            } else if ((st as { error?: string }).error) {
              finish();
            }
          });
        } catch {
          // On-device voice fallback so the call keeps flowing.
          if (gen !== genRef.current || done || !Speech) return finish();
          Speech.speak(text, {
            language: localeRef.current === 'en' ? 'en-US' : 'es-US',
            onDone: finish,
            onError: finish,
            onStopped: finish,
          });
        }
      })();
    });
  }, [businessId]);

  const end = useCallback(() => {
    stopEverything();
    setStatus('idle');
  }, [stopEverything]);

  const start = useCallback(() => {
    const speech = SpeechRecognition;
    if (!speech || !businessId || status !== 'idle') return;
    stopEverything();
    const gen = genRef.current;
    setStatus('connecting');
    (async () => {
      try {
        const perm = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted || gen !== genRef.current) {
          if (gen === genRef.current) setStatus('idle');
          return;
        }
      } catch {
        setStatus('idle');
        return;
      }
      // Instant empty results mean the recognizer is broken (no speech
      // service, revoked permission) — hang up instead of spinning.
      let fastFails = 0;
      while (gen === genRef.current) {
        setStatus('listening');
        setPartial('');
        const startedAt = Date.now();
        const transcript = await listenOnce(gen);
        if (gen !== genRef.current) break;
        if (!transcript) {
          if (Date.now() - startedAt < 700) {
            fastFails++;
            if (fastFails >= 3) {
              setStatus('idle');
              break;
            }
            await new Promise(r => setTimeout(r, 400));
          } else {
            fastFails = 0;
          }
          continue; // silence — keep the line open
        }
        fastFails = 0;
        setStatus('thinking');
        setPartial('');
        const reply = await sendRef.current(transcript);
        if (gen !== genRef.current) break;
        if (reply) {
          setStatus('speaking');
          await speak(gen, reply);
          // Let iOS release the playback session before re-opening the mic.
          await new Promise(r => setTimeout(r, 250));
        }
      }
    })();
  }, [businessId, listenOnce, speak, status, stopEverything]);

  /** Tap-to-interrupt while Ami is speaking — jumps straight back to listening. */
  const interrupt = useCallback(() => {
    interruptRef.current?.();
  }, []);

  // Hang up on unmount (sheet closed).
  useEffect(() => stopEverything, [stopEverything]);

  const active = status !== 'idle';
  return { supported: !!SpeechRecognition, active, status, partial, start, end, interrupt };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTtsUri } from './ttsClient';

// Hands-free "call" with Ami: a continuous turn loop —
//   listening (on-device speech recognition, ends itself on silence)
//   → thinking (existing /chat tool loop)
//   → speaking (natural cloud voice, tap to interrupt)
//   → listening again, until the user hangs up.
// Turn-based rather than full-duplex streaming: the mic is never open while
// Ami talks, which also avoids her voice re-entering the recognizer.

export type VoiceCallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

function getRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

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
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<VoiceCallStatus>('idle');
  /** Live partial transcript while the user is speaking. */
  const [partial, setPartial] = useState('');

  // Session generation — bumping it cancels whatever the loop is doing.
  const genRef = useRef(0);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Resolves the current speak() early when the user taps to interrupt.
  const interruptRef = useRef<(() => void) | null>(null);
  // The loop reads send/locale through refs so a long call never uses a stale
  // closure (send is re-created on every new bubble).
  const sendRef = useRef(send);
  sendRef.current = send;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
  }, []);

  const stopEverything = useCallback(() => {
    genRef.current++;
    try {
      recRef.current?.abort?.();
    } catch {
      /* noop */
    }
    recRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    interruptRef.current?.();
    interruptRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPartial('');
  }, []);

  /** One user turn: resolves the final transcript ('' on silence/error). */
  const listenOnce = useCallback((gen: number) => {
    return new Promise<string>(resolve => {
      const Ctor = getRecognitionCtor();
      if (!Ctor || gen !== genRef.current) return resolve('');
      const rec = new Ctor();
      rec.lang = localeRef.current === 'en' ? 'en-US' : 'es-US';
      rec.continuous = false; // recognizer ends itself after the utterance
      rec.interimResults = true;
      let finalText = '';
      rec.onresult = (event: any) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText = text;
        }
        if (gen === genRef.current) setPartial(text);
      };
      rec.onend = () => {
        if (recRef.current === rec) recRef.current = null;
        resolve(finalText.trim());
      };
      rec.onerror = () => {
        if (recRef.current === rec) recRef.current = null;
        resolve(finalText.trim());
      };
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        recRef.current = null;
        resolve('');
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
        audioRef.current?.pause();
        audioRef.current = null;
        resolve();
      };
      interruptRef.current = finish;
      (async () => {
        try {
          if (!businessId) throw new Error('no business');
          const uri = await fetchTtsUri(businessId, text, localeRef.current);
          if (gen !== genRef.current || done) return finish();
          const audio = new Audio(uri);
          audioRef.current = audio;
          audio.onended = finish;
          audio.onerror = finish;
          await audio.play();
        } catch {
          // Browser-voice fallback so the call keeps flowing.
          if (gen !== genRef.current || done) return finish();
          if (!('speechSynthesis' in window)) return finish();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = localeRef.current === 'en' ? 'en-US' : 'es-US';
          utterance.onend = finish;
          utterance.onerror = () => finish();
          window.speechSynthesis.speak(utterance);
        }
      })();
    });
  }, [businessId]);

  const end = useCallback(() => {
    stopEverything();
    setStatus('idle');
  }, [stopEverything]);

  const start = useCallback(() => {
    if (!businessId || !getRecognitionCtor() || status !== 'idle') return;
    stopEverything();
    const gen = genRef.current;
    setStatus('connecting');
    (async () => {
      // Instant empty results mean the mic is blocked (permission denied,
      // no device) — hang up instead of spinning on a dead recognizer.
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
        }
      }
    })();
  }, [businessId, listenOnce, speak, status, stopEverything]);

  /** Tap-to-interrupt while Ami is speaking — jumps straight back to listening. */
  const interrupt = useCallback(() => {
    interruptRef.current?.();
  }, []);

  // Hang up on unmount (panel closed).
  useEffect(() => stopEverything, [stopEverything]);

  const active = status !== 'idle';
  return { supported, active, status, partial, start, end, interrupt };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechToTextOptions {
  /** BCP-47 tag, e.g. 'es-US' | 'en-US'. */
  lang: string;
  /** Called with the full (interim + final) transcript on every result. */
  onResult: (text: string) => void;
}

function getRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Thin Web Speech API wrapper. `supported` is false where the API is absent
 * (Firefox, some WebViews) — callers hide the mic button in that case.
 */
export function useSpeechToText({ lang, onResult }: UseSpeechToTextOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  // Keep the latest callback without re-creating the recognizer.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* noop */
      }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (recRef.current) return; // already listening
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      onResultRef.current(text);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop?.();
    } catch {
      /* noop */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}

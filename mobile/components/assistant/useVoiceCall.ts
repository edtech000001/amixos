import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioPlayer } from 'expo-audio';
import { isBargeIn } from '@amixos/shared/assistant/bargeIn';
import { AudioLib, Speech, SpeechRecognition, fetchTtsFileUri, setPlaybackAudioMode } from './voice';

/** Stop + free an expo-audio player (remove() also drops its listeners). */
function releasePlayer(player: AudioPlayer | null) {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    /* already released */
  }
}

// Hands-free "call" with Ami: a continuous turn loop —
//   listening (on-device speech recognition; a silence timer closes the turn)
//   → thinking (existing /chat tool loop)
//   → speaking (natural cloud voice; talk over her or tap to interrupt)
//   → listening again, until the user hangs up.
// While Ami speaks the mic stays open with iOS echo cancellation, and anything
// that sounds like her own words is ignored (echoesReply), so only the user
// talking over her cuts her off.
// The call keeps going with the app in the background on iOS (UIBackgroundModes
// "audio" + the session never deactivating mid-call). Android would need a
// foreground service; there the call ends when the mic goes silent.

export type VoiceCallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

// Close the user's turn this long after their last recognized words — roomy
// enough to pause and think mid-sentence without Ami jumping in.
const SILENCE_MS = 2_800;
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
  /** Mic muted: the call stays open (Ami can finish talking) but nothing you
   *  say is heard until unmuted. */
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  // Session generation — bumping it cancels whatever the loop is doing.
  const genRef = useRef(0);
  const soundRef = useRef<AudioPlayer | null>(null);
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
    releasePlayer(soundRef.current);
    soundRef.current = null;
    interruptRef.current?.();
    interruptRef.current = null;
    Speech?.stop();
    setPartial('');
  }, []);

  /** One user turn: resolves the final transcript ('' on silence/error).
   *  With `bargeIn`, results are ignored until one sounds like the user (not
   *  Ami's echo) — then onBargeIn() stops her and the turn continues normally. */
  const listenOnce = useCallback((gen: number, bargeIn?: { reply: string; onBargeIn: () => void }) => {
    return new Promise<string>(resolve => {
      const speech = SpeechRecognition;
      if (!speech || gen !== genRef.current) return resolve('');
      let transcript = '';
      let armed = !bargeIn;
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
        speech.ExpoSpeechRecognitionModule.addListener(
          'result',
          (ev: { results?: { transcript: string }[] }) => {
            const text = ev?.results?.[0]?.transcript;
            if (!text) return;
            if (!armed) {
              if (mutedRef.current || !isBargeIn(text, bargeIn!.reply)) return;
              armed = true;
              bargeIn!.onBargeIn();
            }
            transcript = text;
            if (gen === genRef.current) setPartial(text);
            // The user's turn ends when they stop talking for a beat.
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(requestStop, SILENCE_MS);
          },
        ),
        speech.ExpoSpeechRecognitionModule.addListener('end', finish),
        speech.ExpoSpeechRecognitionModule.addListener('error', finish),
      ];
      try {
        speech.ExpoSpeechRecognitionModule.start({
          lang: localeRef.current === 'en' ? 'en-US' : 'es-US',
          interimResults: true,
          // Keep the platform recognizer open — ITS end-of-speech detection
          // cuts off after ~1.5s of silence; our SILENCE_MS timer owns the turn.
          continuous: true,
          // Echo cancellation so Ami's voice from the speaker doesn't count as
          // the user talking (needed for barge-in).
          iosVoiceProcessingEnabled: true,
          // The library's default iOS session mode is 'measurement', which
          // lingers after listening and makes Ami's reply play very quietly.
          // Normal mode + loudspeaker keeps her at full media volume.
          iosCategory: {
            category: 'playAndRecord',
            categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
            mode: 'default',
          },
        });
      } catch {
        finish();
      }
    });
  }, []);

  /** Speak a reply; resolves when playback ends or the user interrupts.
   *  No setPlaybackAudioMode here: that switches the session to playback-only
   *  and would kill the open mic. start() configures the call session once. */
  const speak = useCallback((gen: number, text: string) => {
    return new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        interruptRef.current = null;
        releasePlayer(soundRef.current);
        soundRef.current = null;
        Speech?.stop();
        resolve();
      };
      interruptRef.current = finish;
      (async () => {
        try {
          if (!AudioLib || !businessId) throw new Error('cloud voice unavailable');
          const uri = await fetchTtsFileUri(businessId, text, localeRef.current, 'ami-call.mp3');
          if (gen !== genRef.current || done) return finish();
          // keepAudioSessionActive: never drop the session between turns, or
          // iOS won't let the mic restart while the app is in the background.
          const player = AudioLib.createAudioPlayer({ uri }, { keepAudioSessionActive: true });
          if (gen !== genRef.current || done) {
            releasePlayer(player);
            return finish();
          }
          soundRef.current = player;
          player.addListener('playbackStatusUpdate', st => {
            // iOS reports a load/playback error as playbackState 'failed'.
            if (st.didJustFinish || st.playbackState === 'failed' || st.playbackState === 'error') finish();
          });
          player.play();
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
    mutedRef.current = false;
    setMuted(false);
    setStatus('idle');
    // Back to normal playback (no background audio) for the reply reader.
    void setPlaybackAudioMode().catch(() => {});
  }, [stopEverything]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      // Close the open turn; the loop discards what it heard.
      try {
        SpeechRecognition?.ExpoSpeechRecognitionModule.stop();
      } catch {
        /* noop */
      }
      setPartial('');
    }
  }, []);

  const start = useCallback(() => {
    const speech = SpeechRecognition;
    if (!speech || !businessId || status !== 'idle') return;
    stopEverything();
    mutedRef.current = false;
    setMuted(false);
    const gen = genRef.current;
    setStatus('connecting');
    (async () => {
      try {
        const perm = await speech.ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted || gen !== genRef.current) {
          if (gen === genRef.current) setStatus('idle');
          return;
        }
        // Call session: mic + speaker, keeps playing when the app is backgrounded.
        // The recognizer then re-applies its own speaker/echo-cancel category.
        await AudioLib?.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
      } catch {
        setStatus('idle');
        return;
      }
      // Instant empty results mean the recognizer is broken (no speech
      // service, revoked permission) — hang up instead of spinning.
      let fastFails = 0;
      // What the user said while cutting Ami off — becomes the next turn.
      let pending = '';
      while (gen === genRef.current) {
        setStatus('listening');
        setPartial('');
        if (mutedRef.current) {
          await new Promise(r => setTimeout(r, 250));
          continue;
        }
        const startedAt = Date.now();
        const carried = pending;
        pending = '';
        const transcript = carried || (await listenOnce(gen));
        if (gen !== genRef.current) break;
        if (mutedRef.current) continue; // muted mid-turn — drop it
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
        if (!reply) continue;
        setStatus('speaking');
        // Listen while she talks; talking over her stops playback and that
        // speech becomes the next turn.
        let cutIn = false;
        const heard = listenOnce(gen, {
          reply,
          onBargeIn: () => {
            cutIn = true;
            interruptRef.current?.();
            if (gen === genRef.current) setStatus('listening');
          },
        });
        await speak(gen, reply);
        if (gen !== genRef.current) break;
        if (!cutIn) {
          // She finished uninterrupted: drop what the mic picked up (her echo)
          // and open a fresh turn.
          try {
            SpeechRecognition?.ExpoSpeechRecognitionModule.stop();
          } catch {
            /* noop */
          }
          await heard;
          continue;
        }
        const said = await heard;
        if (gen !== genRef.current) break;
        if (said && !mutedRef.current) pending = said;
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
  return { supported: !!SpeechRecognition, active, status, partial, start, end, interrupt, muted, toggleMute };
}

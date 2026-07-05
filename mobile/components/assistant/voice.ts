import * as FileSystem from 'expo-file-system';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

// Shared voice plumbing for Ami (reply reader + call mode). All native audio
// modules are lazy-required so a dev client built before they were added
// degrades gracefully instead of crashing at import time.

export let Speech: typeof import('expo-speech') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Speech = require('expo-speech');
} catch {
  Speech = null;
}

export let AV: typeof import('expo-av') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AV = require('expo-av');
} catch {
  AV = null;
}

// Pinned to 0.2.25 — the last release before 1.0.0 moved to the SDK 52 API.
export let SpeechRecognition: typeof import('expo-speech-recognition') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SpeechRecognition = require('expo-speech-recognition');
} catch {
  SpeechRecognition = null;
}

/**
 * Fetch natural-voice audio for an Ami reply (POST /api/v1/assistant/tts,
 * Google Chirp 3: HD), stage it in the cache dir, and return a playable
 * file:// uri. Throws when the endpoint is unavailable — callers fall back
 * to the on-device voice.
 */
export async function fetchTtsFileUri(
  businessId: string,
  text: string,
  locale: string,
  filename = 'ami-reply.mp3',
): Promise<string> {
  const jwt = await getJwt();
  const res = await fetch(`${getApiBaseUrl()}/api/v1/assistant/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ business_id: businessId, text, locale }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json.data?.audio) throw new Error('tts failed');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, json.data.audio, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/** Audio mode for playback: silent-switch override + main speaker (not the
 * quiet earpiece route iOS picks while a recording session lingers). */
export async function setPlaybackAudioMode() {
  if (!AV) return;
  await AV.Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
  });
}

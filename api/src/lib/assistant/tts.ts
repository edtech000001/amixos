// Natural voice for Ami replies — Google Cloud Text-to-Speech (Chirp 3: HD)
// via plain REST. On Cloud Run, auth rides the service's default service
// account (metadata server token) so no API key is needed; locally you can
// set GOOGLE_TTS_API_KEY to test. If neither is available the route returns
// 503 and clients fall back to the on-device voice.
//
// Requires the Text-to-Speech API enabled on the GCP project:
//   gcloud services enable texttospeech.googleapis.com --project amixos

const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

// One consistent persona ("Aoede" — warm, natural) in both languages.
const VOICES = {
  es: { languageCode: 'es-US', name: 'es-US-Chirp3-HD-Aoede' },
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' },
} as const;

// Cache the metadata-server token across requests (they live ~1h).
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  try {
    const res = await fetch(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cachedToken.token;
  } catch {
    return null; // not on GCP (local dev)
  }
}

const ES_MARKERS = /[áéíóúñ¿¡]|\b(el|la|los|las|de|que|para|con|una|trabajos?|cliente|hola|tienes?|más)\b/gi;
const EN_MARKERS = /\b(the|you|your|have|has|jobs?|there|are|is|want|found|so far|here)\b/gi;

/**
 * Ami answers in whatever language the user wrote, which may differ from the
 * app locale — reading English with the Spanish voice sounds off. Cheap
 * marker count picks the voice; ties fall back to the app locale.
 */
export function detectVoiceLocale(text: string, appLocale: 'es' | 'en'): 'es' | 'en' {
  const es = (text.match(ES_MARKERS) ?? []).length;
  const en = (text.match(EN_MARKERS) ?? []).length;
  if (es > en) return 'es';
  if (en > es) return 'en';
  return appLocale;
}

/** Synthesize `text` and return base64-encoded MP3 audio. Throws if TTS is unavailable. */
export async function synthesizeSpeech(text: string, locale: 'es' | 'en'): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const token = apiKey ? null : await getAccessToken();
  if (!apiKey && !token) throw new Error('tts_no_credentials');

  const res = await fetch(apiKey ? `${TTS_URL}?key=${apiKey}` : TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      input: { text },
      voice: VOICES[locale],
      audioConfig: { audioEncoding: 'MP3' },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`tts_failed ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error('tts_empty_audio');
  return json.audioContent;
}

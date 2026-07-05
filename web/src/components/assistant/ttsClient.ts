'use client';

import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

/**
 * Fetch natural-voice audio for an Ami reply (POST /api/v1/assistant/tts,
 * Google Chirp 3: HD) and return it as a playable data URI. Throws when the
 * endpoint is unavailable — callers fall back to the browser voice.
 */
export async function fetchTtsUri(
  businessId: string,
  text: string,
  locale: string,
): Promise<string> {
  const jwt = await getJwt();
  const res = await fetch(`${getApiBaseUrl()}/api/v1/assistant/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ business_id: businessId, text, locale }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json.data?.audio) throw new Error('tts failed');
  return `data:${json.data.mime ?? 'audio/mpeg'};base64,${json.data.audio}`;
}

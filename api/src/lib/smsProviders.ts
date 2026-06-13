// Outbound SMS provider adapters. One small surface — verify() and sendSms() —
// over each supported provider's REST API, called server-side only with the
// per-business credentials stored in public.business_integrations.
//
// We use plain fetch (available in the API's Node runtime, same as the Google
// sync / weather routes) rather than provider SDKs, so adding a provider is a
// self-contained block here.

export type SmsProvider = 'twilio' | 'clicksend';
export const SMS_PROVIDERS: SmsProvider[] = ['twilio', 'clicksend'];

export function isSmsProvider(v: unknown): v is SmsProvider {
  return typeof v === 'string' && (SMS_PROVIDERS as string[]).includes(v);
}

// Shape stored in business_integrations.credentials per provider.
export interface TwilioCreds {
  accountSid: string;
  authToken: string;
}
export interface ClickSendCreds {
  username: string;
  apiKey: string;
}
export type ProviderCreds = TwilioCreds | ClickSendCreds;

export interface SendResult {
  id: string; // provider message id / sid
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/** True if the credentials object has the required fields for the provider. */
export function hasRequiredCreds(provider: SmsProvider, creds: Record<string, unknown>): boolean {
  if (provider === 'twilio') return !!creds.accountSid && !!creds.authToken;
  return !!creds.username && !!creds.apiKey;
}

/** A non-secret masked hint for the stored credential (last 4 chars). */
export function maskedKey(provider: SmsProvider, creds: Record<string, unknown>): string {
  const secret = provider === 'twilio' ? String(creds.authToken ?? '') : String(creds.apiKey ?? '');
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)}`;
}

/**
 * Cheap credential check against the provider's account endpoint. Returns an
 * error string on failure, or null when the credentials authenticate.
 */
export async function verifyCreds(
  provider: SmsProvider,
  creds: Record<string, unknown>,
): Promise<string | null> {
  try {
    if (provider === 'twilio') {
      const { accountSid, authToken } = creds as unknown as TwilioCreds;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
        headers: { Authorization: basicAuth(accountSid, authToken) },
      });
      if (res.status === 401) return 'invalid_credentials';
      if (!res.ok) return `twilio_error_${res.status}`;
      return null;
    }
    const { username, apiKey } = creds as unknown as ClickSendCreds;
    const res = await fetch('https://rest.clicksend.com/v3/account', {
      headers: { Authorization: basicAuth(username, apiKey) },
    });
    if (res.status === 401 || res.status === 403) return 'invalid_credentials';
    if (!res.ok) return `clicksend_error_${res.status}`;
    return null;
  } catch {
    return 'network_error';
  }
}

/**
 * Send one SMS. Throws an Error (message is a short stable code or the
 * provider's error text) on failure so the route can surface it.
 */
export async function sendSms(
  provider: SmsProvider,
  creds: Record<string, unknown>,
  fromNumber: string,
  to: string,
  body: string,
): Promise<SendResult> {
  if (provider === 'twilio') {
    const { accountSid, authToken } = creds as unknown as TwilioCreds;
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuth(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromNumber, To: to, Body: body }).toString(),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(json.message || `twilio_error_${res.status}`);
    return { id: json.sid ?? '' };
  }

  // ClickSend
  const { username, apiKey } = creds as unknown as ClickSendCreds;
  const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(username, apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ source: 'amixos', from: fromNumber || undefined, to, body }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    response_code?: string;
    data?: { messages?: { status?: string; message_id?: string }[] };
  };
  if (!res.ok || json.response_code !== 'SUCCESS') {
    throw new Error(json.response_code || `clicksend_error_${res.status}`);
  }
  const msg = json.data?.messages?.[0];
  if (msg?.status && msg.status !== 'SUCCESS') throw new Error(msg.status);
  return { id: msg?.message_id ?? '' };
}

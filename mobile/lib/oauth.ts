import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Provider } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'provider-not-configured' | 'apple-not-available' | 'generic'; message?: string };

const REDIRECT_PATH = 'auth/callback';

function getRedirectUri(): string {
  // amixos://auth/callback in dev/prod, exp://… in Expo Go (we don't use Expo Go).
  return AuthSession.makeRedirectUri({ scheme: 'amixos', path: REDIRECT_PATH });
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  return signInWithBrowserOAuth('google');
}

export async function signInWithFacebook(): Promise<OAuthResult> {
  return signInWithBrowserOAuth('facebook');
}

// Browser-based OAuth via Supabase. Works on iOS + Android. Requires the
// provider to be enabled in Supabase → Authentication → Providers and the
// redirect URI added to its allowed list.
async function signInWithBrowserOAuth(provider: Provider): Promise<OAuthResult> {
  const supabase = createSupabaseClient();
  const redirectTo = getRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return mapOAuthError(error?.message);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, reason: 'cancelled' };
  }
  if (result.type !== 'success' || !result.url) {
    return { ok: false, reason: 'generic' };
  }

  // Supabase appends the session in the URL fragment (#access_token=…&refresh_token=…).
  const params = parseUrlFragment(result.url);
  const access_token = params.access_token;
  const refresh_token = params.refresh_token;

  if (!access_token || !refresh_token) {
    return { ok: false, reason: 'generic', message: 'Missing tokens in OAuth redirect' };
  }

  const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
  if (setErr) return { ok: false, reason: 'generic', message: setErr.message };

  return { ok: true };
}

// Native Apple Sign In on iOS — required by App Store guidelines if the app
// offers other third-party sign-in. Falls back to browser flow on Android.
export async function signInWithApple(): Promise<OAuthResult> {
  if (Platform.OS !== 'ios') {
    return signInWithBrowserOAuth('apple');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) return { ok: false, reason: 'apple-not-available' };

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'generic' };
  }

  if (!credential.identityToken) {
    return { ok: false, reason: 'generic', message: 'No identity token from Apple' };
  }

  const supabase = createSupabaseClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) return mapOAuthError(error.message);
  return { ok: true };
}

function parseUrlFragment(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.substring(hashIndex + 1)));
}

const GOOGLE_CONTACTS_SCOPE = 'openid email profile https://www.googleapis.com/auth/contacts';

export type LinkGoogleResult =
  | { ok: true; refresh_token: string; scopes: string[] }
  | { ok: false; reason: 'cancelled' | 'no_refresh_token' | 'generic'; message?: string };

/**
 * Connect Google Contacts to the current user's account, regardless of how
 * they originally signed in (email, Apple, or Google). Requests the contacts
 * scope and returns the Google refresh_token so the API can call People API
 * on the user's behalf.
 *
 * `access_type=offline` + `prompt=consent` are critical — without them
 * Google omits the refresh_token on subsequent grants.
 */
export async function linkGoogleContacts(): Promise<LinkGoogleResult> {
  console.log('[link-google] start');
  const supabase = createSupabaseClient();
  const redirectTo = getRedirectUri();
  console.log('[link-google] redirectTo:', redirectTo);

  // Look at the current session to decide between linkIdentity (no Google
  // attached yet) and signInWithOAuth (already linked, just need re-consent
  // for the new scope). Both flows produce the same redirect with tokens.
  const { data: sessionData } = await supabase.auth.getSession();
  const hasGoogle = sessionData.session?.user?.identities?.some(
    (i) => i.provider === 'google',
  );
  console.log('[link-google] hasGoogle identity:', hasGoogle);

  // Note: Supabase's TS types may not surface `linkIdentity` on all versions;
  // it's available at runtime. Use a typed cast to avoid TS errors without
  // affecting runtime behavior.
  const supabaseAny = supabase as unknown as {
    auth: {
      linkIdentity: (args: {
        provider: 'google';
        options: { redirectTo: string; skipBrowserRedirect: boolean; scopes: string; queryParams: Record<string, string> };
      }) => Promise<{ data: { url?: string }; error: { message: string } | null }>;
    };
  };

  const oauthOptions = {
    redirectTo,
    skipBrowserRedirect: true,
    scopes: GOOGLE_CONTACTS_SCOPE,
    queryParams: { access_type: 'offline', prompt: 'consent' },
  };

  const { data, error } = hasGoogle
    ? await supabase.auth.signInWithOAuth({ provider: 'google', options: oauthOptions })
    : await supabaseAny.auth.linkIdentity({ provider: 'google', options: oauthOptions });

  console.log('[link-google] OAuth call result. hasUrl:', !!data?.url, 'error:', error?.message);

  if (error || !data?.url) {
    return { ok: false, reason: 'generic', message: error?.message };
  }

  console.log('[link-google] opening browser to:', data.url.slice(0, 80) + '...');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  console.log('[link-google] browser result:', result.type, 'urlPresent:', 'url' in result ? !!result.url : false);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, reason: 'cancelled' };
  }
  if (result.type !== 'success' || !result.url) {
    return { ok: false, reason: 'generic' };
  }

  const params = parseUrlFragment(result.url);
  console.log('[link-google] redirect params keys:', Object.keys(params));
  const refresh_token = params.provider_refresh_token ?? params.provider_token;
  console.log('[link-google] refresh_token present:', !!refresh_token);
  if (!refresh_token) {
    return { ok: false, reason: 'no_refresh_token' };
  }

  return { ok: true, refresh_token, scopes: GOOGLE_CONTACTS_SCOPE.split(' ') };
}

function mapOAuthError(message?: string): OAuthResult {
  if (!message) return { ok: false, reason: 'generic' };
  if (message.toLowerCase().includes('provider is not enabled')) {
    return { ok: false, reason: 'provider-not-configured', message };
  }
  return { ok: false, reason: 'generic', message };
}

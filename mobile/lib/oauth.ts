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

function mapOAuthError(message?: string): OAuthResult {
  if (!message) return { ok: false, reason: 'generic' };
  if (message.toLowerCase().includes('provider is not enabled')) {
    return { ok: false, reason: 'provider-not-configured', message };
  }
  return { ok: false, reason: 'generic', message };
}

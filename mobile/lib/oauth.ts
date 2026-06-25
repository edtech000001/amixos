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

const GOOGLE_CONTACTS_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/contacts',
];

// Direct OAuth against Google — bypasses Supabase entirely for the contacts
// permission. Supabase's linkIdentity / signInWithOAuth wrappers strip or
// override OAuth params on the relink path, which prevented the refresh
// token from being returned on the second connect. Doing the flow ourselves
// gives us full control: PKCE handles security (no client_secret embedded in
// the app), `access_type=offline + prompt=consent` always come through, and
// disconnect/reconnect Just Works because we can revoke at Google's
// revocation endpoint without touching Supabase identities.
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export type LinkGoogleResult =
  | { ok: true; refresh_token: string; client_id: string; scopes: string[] }
  | { ok: false; reason: 'cancelled' | 'no_refresh_token' | 'generic'; message?: string };

/**
 * Build the iOS-style Google redirect URI from the iOS client ID. For
 * `<id>.apps.googleusercontent.com` the URI is
 * `com.googleusercontent.apps.<id>:/oauthredirect`. This is the format
 * Google accepts for iOS OAuth clients, and ASWebAuthenticationSession (used
 * internally by WebBrowser.openAuthSessionAsync on iOS) intercepts it
 * without needing the URL scheme to be registered in Info.plist.
 */
function getGoogleIosRedirectUri(clientId: string): string {
  const idPart = clientId.replace('.apps.googleusercontent.com', '');
  return `com.googleusercontent.apps.${idPart}:/oauthredirect`;
}

/**
 * Connect Google Contacts to the current Amixos user. Returns a Google
 * refresh_token that the backend stores in `user_oauth_credentials` and uses
 * to call People API on the user's behalf. The refresh_token is the only
 * piece of state we need to persist — everything else is derivable.
 */
export async function linkGoogleContacts(): Promise<LinkGoogleResult> {
  console.log('[google-oauth] start');

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!clientId) {
    console.log('[google-oauth] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID missing');
    return { ok: false, reason: 'generic', message: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID not set' };
  }

  const redirectUri = getGoogleIosRedirectUri(clientId);
  console.log('[google-oauth] redirectUri:', redirectUri);

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: GOOGLE_CONTACTS_SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  try {
    await request.makeAuthUrlAsync(GOOGLE_DISCOVERY);
  } catch (err) {
    console.log('[google-oauth] makeAuthUrlAsync threw:', err);
    return { ok: false, reason: 'generic', message: String(err) };
  }

  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  console.log('[google-oauth] prompt result:', result.type);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { ok: false, reason: 'cancelled' };
  }
  if (result.type === 'error') {
    return { ok: false, reason: 'generic', message: result.error?.message ?? 'auth_error' };
  }
  if (result.type !== 'success' || !result.params.code) {
    return { ok: false, reason: 'generic', message: `unexpected result type: ${result.type}` };
  }

  // Exchange the authorization code for tokens. Public client + PKCE so
  // there's no client_secret to ship in the app — Google verifies the
  // code_verifier we generated and proves the same client that started
  // the flow is finishing it.
  console.log('[google-oauth] exchanging code...');
  try {
    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      GOOGLE_DISCOVERY,
    );
    console.log(
      '[google-oauth] tokens received. refresh_token present:',
      !!tokenResult.refreshToken,
      'scope:',
      tokenResult.scope,
    );

    if (!tokenResult.refreshToken) {
      // This should not happen with prompt=consent + access_type=offline on
      // a fresh PKCE flow, but guard anyway.
      return { ok: false, reason: 'no_refresh_token' };
    }

    return {
      ok: true,
      refresh_token: tokenResult.refreshToken,
      client_id: clientId,
      scopes: tokenResult.scope?.split(' ') ?? GOOGLE_CONTACTS_SCOPES,
    };
  } catch (err) {
    console.log('[google-oauth] exchangeCodeAsync threw:', err);
    return { ok: false, reason: 'generic', message: String(err) };
  }
}

/**
 * Revoke a Google refresh_token. Best-effort — failures are silent. Call
 * from the disconnect flow so the user can cleanly reconnect later without
 * having to visit myaccount.google.com/permissions.
 */
export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  try {
    await fetch(
      `${GOOGLE_DISCOVERY.revocationEndpoint}?token=${encodeURIComponent(refreshToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  } catch {
    // Swallow — disconnect should always succeed locally even if the
    // network revoke call fails. The token will eventually expire.
  }
}

function mapOAuthError(message?: string): OAuthResult {
  if (!message) return { ok: false, reason: 'generic' };
  if (message.toLowerCase().includes('provider is not enabled')) {
    return { ok: false, reason: 'provider-not-configured', message };
  }
  return { ok: false, reason: 'generic', message };
}

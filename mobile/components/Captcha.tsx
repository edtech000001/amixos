// Cloudflare Turnstile, native.
//
// Turnstile has no native SDK, so it runs inside a WebView. Two details make
// it actually work rather than silently fail:
//
//  * `baseUrl` — a WebView fed raw HTML has an origin of about:blank, which
//    Turnstile rejects as an unlisted hostname. Setting baseUrl makes the page
//    report amixos.com, which IS in the widget's hostname allowlist.
//  * reset REMOUNTS the WebView instead of reload(): with baseUrl set, a
//    reload loads the real https://amixos.com (the landing page, smart-app
//    banner and all) in the captcha box — and no new token ever arrives, so
//    the next sign-in fails too. For the same reason the box may never
//    navigate its top frame anywhere; links (Cloudflare Privacy/Help) open
//    in the browser.
//  * the widget reports its own height back over postMessage. Managed mode is
//    usually invisible but escalates to an interactive challenge for traffic
//    it does not like, and a fixed-height container would clip that challenge
//    with no way for the user to complete it.
//
// Mirrors web/src/components/auth/Captcha.tsx.

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

// EXPO_PUBLIC_* is inlined by Babel at TRANSFORM time and Metro caches
// transforms, so a bundle built before the key existed keeps `undefined` and
// this component silently renders nothing. Say so out loud in dev.
if (__DEV__) {
  console.log('[captcha] site key:', SITE_KEY ? `${SITE_KEY.slice(0, 8)}… (len ${SITE_KEY.length})` : 'UNDEFINED — run: npx expo start --clear');
}
// Must be one of the hostnames registered on the Turnstile widget.
const ORIGIN = 'https://amixos.com';

export interface CaptchaHandle {
  reset: () => void;
}

interface CaptchaProps {
  onToken: (token: string | null) => void;
}

const page = (siteKey: string) => `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      #box { display: flex; justify-content: center; }
    </style>
  </head>
  <body>
    <div id="box"></div>
    <script>
      function post(msg) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
      // The container is 0px tall until the script paints, so report the real
      // height whenever it changes and let RN size the view to match.
      function reportHeight() {
        post({ type: 'height', value: document.getElementById('box').scrollHeight });
      }
      window.onloadTurnstileCallback = function () {
        turnstile.render('#box', {
          sitekey: '${siteKey}',
          theme: 'auto',
          callback: function (token) { post({ type: 'token', value: token }); reportHeight(); },
          'expired-callback': function () { post({ type: 'token', value: null }); },
          'error-callback': function () { post({ type: 'token', value: null }); },
        });
        reportHeight();
        new ResizeObserver(reportHeight).observe(document.getElementById('box'));
      };
      // api.js may already have loaded by the time this runs.
      if (window.turnstile) window.onloadTurnstileCallback();
      // ...and if it never arrives, report it rather than failing silently.
      setTimeout(function () {
        if (!window.turnstile) post({ type: 'error', value: 'turnstile script did not load' });
      }, 8000);
    </script>
  </body>
</html>`;

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onToken },
  ref,
) {
  const [height, setHeight] = useState(0);
  // Bumped by reset() → new WebView key → a fresh widget (see header note).
  const [instance, setInstance] = useState(0);
  // The first top-frame load is our inline HTML (reported as the baseUrl);
  // anything after that would navigate the box away from the widget.
  const loaded = useRef(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      loaded.current = false;
      setInstance(n => n + 1);
      onToken(null);
    },
  }));

  // See the note in the web component: no key means render nothing, which is
  // only safe while captcha is disabled in Supabase.
  if (!SITE_KEY) return null;

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <WebView
        key={instance}
        source={{ html: page(SITE_KEY), baseUrl: ORIGIN }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={req => {
          // Turnstile's own iframe (challenges.cloudflare.com) — always fine.
          if (req.isTopFrame === false) return true;
          if (req.url === 'about:blank') return true;
          if (!loaded.current && req.url.startsWith(ORIGIN)) {
            loaded.current = true;
            return true;
          }
          // Anything else would replace the widget: open real links outside.
          if (/^https?:/.test(req.url)) void Linking.openURL(req.url);
          return false;
        }}
        javaScriptEnabled
        // Android draws an opaque white box behind the WebView otherwise,
        // which shows as a bright rectangle on the dark auth screens.
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onError={e => __DEV__ && console.log('[captcha] webview error:', e.nativeEvent.description)}
        onHttpError={e => __DEV__ && console.log('[captcha] http error:', e.nativeEvent.statusCode, e.nativeEvent.url)}
        onMessage={e => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as
              | { type: 'token'; value: string | null }
              | { type: 'height'; value: number }
              | { type: 'error'; value: string };
            if (msg.type === 'error') {
              if (__DEV__) console.log('[captcha]', msg.value);
              onToken(null);
            } else if (msg.type === 'token') {
              if (__DEV__) console.log('[captcha] token:', msg.value ? `${msg.value.slice(0, 12)}…` : 'null (challenge failed)');
              onToken(msg.value);
            } else {
              if (__DEV__) console.log('[captcha] height:', msg.value);
              setHeight(msg.value);
            }
          } catch {
            // Malformed message — ignore rather than crash the auth screen.
          }
        }}
      />
    </View>
  );
});

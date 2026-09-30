// Cloudflare Turnstile, native.
//
// Turnstile has no native SDK, so it runs inside a WebView. Two details make
// it actually work rather than silently fail:
//
//  * `baseUrl` — a WebView fed raw HTML has an origin of about:blank, which
//    Turnstile rejects as an unlisted hostname. Setting baseUrl makes the page
//    report amixos.com, which IS in the widget's hostname allowlist.
//  * the widget reports its own height back over postMessage. Managed mode is
//    usually invisible but escalates to an interactive challenge for traffic
//    it does not like, and a fixed-height container would clip that challenge
//    with no way for the user to complete it.
//
// Mirrors web/src/components/auth/Captcha.tsx.

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
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
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
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
    </script>
  </body>
</html>`;

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onToken },
  ref,
) {
  const web = useRef<WebView>(null);
  const [height, setHeight] = useState(0);

  useImperativeHandle(ref, () => ({
    reset: () => {
      web.current?.reload();
      onToken(null);
    },
  }));

  // See the note in the web component: no key means render nothing, which is
  // only safe while captcha is disabled in Supabase.
  if (!SITE_KEY) return null;

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <WebView
        ref={web}
        source={{ html: page(SITE_KEY), baseUrl: ORIGIN }}
        originWhitelist={['*']}
        javaScriptEnabled
        // Android draws an opaque white box behind the WebView otherwise,
        // which shows as a bright rectangle on the dark auth screens.
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        onMessage={e => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as
              | { type: 'token'; value: string | null }
              | { type: 'height'; value: number };
            if (msg.type === 'token') onToken(msg.value);
            else setHeight(msg.value);
          } catch {
            // Malformed message — ignore rather than crash the auth screen.
          }
        }}
      />
    </View>
  );
});

'use client';

// Cloudflare Turnstile, web.
//
// Supabase's captcha setting is global: once it is on, /signup, /token and
// /recover ALL reject a request with no token. So every auth entry point has
// to render this, and the token has to reach the supabase call.
//
// The token is single-use and expires after ~5 minutes. `onExpire` clears it
// so a form left open does not submit a dead token, and the ref lets a caller
// reset the widget after a failed attempt — Turnstile will not hand out a
// second token for the same challenge.

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { forwardRef, useImperativeHandle, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export interface CaptchaHandle {
  reset: () => void;
}

interface CaptchaProps {
  onToken: (token: string | null) => void;
}

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onToken },
  ref,
) {
  const widget = useRef<TurnstileInstance>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      widget.current?.reset();
      onToken(null);
    },
  }));

  // No key configured (local dev, or before the env var is set) — render
  // nothing and let the request through untokenised. That only works while
  // captcha is OFF in Supabase; once enabled the server rejects it, which is
  // the loud failure we want rather than a silently unprotected form.
  if (!SITE_KEY) return null;

  return (
    <div className="flex justify-center">
      <Turnstile
        ref={widget}
        siteKey={SITE_KEY}
        options={{ theme: 'auto', size: 'flexible' }}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    </div>
  );
});

import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { ForgotPasswordScreen } from '@amixos/shared/screens/auth/ForgotPasswordScreen';
import { isEmailRateLimit } from '@amixos/shared/lib/passwordErrors';
import { Captcha, type CaptchaHandle } from '@/components/Captcha';

export default function ForgotPasswordRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  return (
    <ForgotPasswordScreen
      onResetEmail={async (email) => {
        // On mobile we don't have a current URL — the reset link redirects
        // to a deep link configured at the project level (amixos:// scheme).
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'amixos://auth/reset-password',
          captchaToken: captchaToken ?? undefined,
        });
        // Single-use token: any outcome burns it, so always re-arm the widget.
        captcha.current?.reset();
        if (!error) return { ok: true };
        // See the note in web/src/app/auth/forgot-password/page.tsx — a
        // throttled send is a "wait", not a "try again".
        return { ok: false, reason: isEmailRateLimit(error) ? 'rate-limited' : 'generic' };
      }}
      onBackToLogin={() => router.push('/auth/login')}
      captchaSlot={<Captcha ref={captcha} onToken={setCaptchaToken} />}
    />
  );
}

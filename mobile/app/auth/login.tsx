import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { LoginScreen } from '@amixos/shared/screens/auth/LoginScreen';
import { OAuthButtons } from '@/components/OAuthButtons';
import { useAuthStore } from '@/lib/auth/store';
import { Captcha, type CaptchaHandle } from '@/components/Captcha';

export default function LoginRoute() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  return (
    <LoginScreen
      onLogin={async (email, password) => {
        const result = await login(email, password, captchaToken);
        // Single-use token — re-arm so a retry is not rejected on the
        // captcha rather than on the credentials.
        if (!result.ok) captcha.current?.reset();
        return result;
      }}
      onForgotPasswordPress={() => router.push('/auth/forgot-password')}
      onRegisterPress={() => router.push('/auth/register')}
      // OAuth success: SIGNED_IN fires automatically via Supabase, the auth
      // store picks it up, and useProtectedRoute redirects. No manual nav.
      oauthSlot={<OAuthButtons onSuccess={() => {}} />}
      captchaSlot={<Captcha ref={captcha} onToken={setCaptchaToken} />}
    />
  );
}

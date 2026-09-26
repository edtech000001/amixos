import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { ForgotPasswordScreen } from '@amixos/shared/screens/auth/ForgotPasswordScreen';
import { isEmailRateLimit } from '@amixos/shared/lib/passwordErrors';

export default function ForgotPasswordRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();

  return (
    <ForgotPasswordScreen
      onResetEmail={async (email) => {
        // On mobile we don't have a current URL — the reset link redirects
        // to a deep link configured at the project level (amixos:// scheme).
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'amixos://auth/reset-password',
        });
        if (!error) return { ok: true };
        // See the note in web/src/app/auth/forgot-password/page.tsx — a
        // throttled send is a "wait", not a "try again".
        return { ok: false, reason: isEmailRateLimit(error) ? 'rate-limited' : 'generic' };
      }}
      onBackToLogin={() => router.push('/auth/login')}
    />
  );
}

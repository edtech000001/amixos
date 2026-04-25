import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { ForgotPasswordScreen } from '@amixos/shared/screens/auth/ForgotPasswordScreen';

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
        return error ? { ok: false } : { ok: true };
      }}
      onBackToLogin={() => router.push('/auth/login')}
    />
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { ForgotPasswordScreen } from '@amixos/shared/screens/auth/ForgotPasswordScreen';
import { isEmailRateLimit } from '@amixos/shared/lib/passwordErrors';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();

  return (
    <ForgotPasswordScreen
      onResetEmail={async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        if (!error) return { ok: true };
        // Supabase throttles these hard — the built-in email sender allows only
        // a couple per hour. Telling someone to "check the email and try again"
        // when the server is asking them to WAIT sends them in a loop, and it
        // reads as a broken app rather than a deliberate limit.
        return { ok: false, reason: isEmailRateLimit(error) ? 'rate-limited' : 'generic' };
      }}
      onBackToLogin={() => router.push('/auth/login')}
    />
  );
}

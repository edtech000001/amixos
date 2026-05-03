import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { LoginScreen, type LoginAttemptResult } from '@amixos/shared/screens/auth/LoginScreen';
import { OAuthButtons } from '@/components/OAuthButtons';

export default function LoginRoute() {
  const router = useRouter();
  const supabase = createSupabaseClient();

  const handleLogin = async (email: string, password: string): Promise<LoginAttemptResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const m = error.message;
        if (m.includes('Email not confirmed') || m.includes('email not confirmed')) return { ok: false, reason: 'email-not-confirmed' };
        if (m.includes('Invalid login credentials') || m.includes('invalid_credentials')) return { ok: false, reason: 'invalid-credentials' };
        if (m.includes('Too many requests')) return { ok: false, reason: 'too-many-requests' };
        if (m.includes('User not found')) return { ok: false, reason: 'user-not-found' };
        return { ok: false, reason: 'generic' };
      }

      const { data: { session } } = await supabase.auth.getSession();
      let needsOnboarding = false;
      if (session) {
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', session.user.id)
          .limit(1);
        needsOnboarding = !businesses || businesses.length === 0;
      }

      router.replace(needsOnboarding ? '/onboarding' : '/(tabs)');
      return { ok: true, needsOnboarding };
    } catch (err) {
      console.error('Login error:', err);
      return { ok: false, reason: 'connection-error' };
    }
  };

  const handleOAuthSuccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    let needsOnboarding = false;
    if (session) {
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .limit(1);
      needsOnboarding = !businesses || businesses.length === 0;
    }
    router.replace(needsOnboarding ? '/onboarding' : '/(tabs)');
  };

  return (
    <LoginScreen
      onLogin={handleLogin}
      onForgotPasswordPress={() => router.push('/auth/forgot-password')}
      onRegisterPress={() => router.push('/auth/register')}
      oauthSlot={<OAuthButtons onSuccess={handleOAuthSuccess} />}
    />
  );
}

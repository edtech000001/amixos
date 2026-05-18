import { useRouter } from 'expo-router';
import { LoginScreen } from '@amixos/shared/screens/auth/LoginScreen';
import { OAuthButtons } from '@/components/OAuthButtons';
import { useAuthStore } from '@/lib/auth/store';

export default function LoginRoute() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  return (
    <LoginScreen
      onLogin={login}
      onForgotPasswordPress={() => router.push('/auth/forgot-password')}
      onRegisterPress={() => router.push('/auth/register')}
      // OAuth success: SIGNED_IN fires automatically via Supabase, the auth
      // store picks it up, and useProtectedRoute redirects. No manual nav.
      oauthSlot={<OAuthButtons onSuccess={() => {}} />}
    />
  );
}

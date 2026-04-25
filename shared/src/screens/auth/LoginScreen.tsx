import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

export type LoginAttemptResult =
  | { ok: true; needsOnboarding: boolean }
  | { ok: false; reason: 'email-not-confirmed' | 'invalid-credentials' | 'too-many-requests' | 'user-not-found' | 'generic' | 'connection-error' };

export interface LoginScreenProps {
  /** Attempt to sign in. Caller resolves to a typed result; the screen renders the right error. */
  onLogin: (email: string, password: string) => Promise<LoginAttemptResult>;
  /** Initial error to surface (e.g. when redirected here from a failed verification). */
  initialError?: string;
  onForgotPasswordPress: () => void;
  onRegisterPress: () => void;
  /** Optional platform-specific UI rendered above the email/password form (e.g. web OAuth buttons). */
  oauthSlot?: ReactNode;
}

export function LoginScreen({
  onLogin,
  initialError,
  onForgotPasswordPress,
  onRegisterPress,
  oauthSlot,
}: LoginScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;

  const loginSchema = useMemo(() => z.object({
    email: z.string().email(t.login.errors.emailInvalid),
    password: z.string().min(6, t.login.errors.passwordShort),
  }), [t]);

  type LoginForm = z.infer<typeof loginSchema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const [error, setError] = useState(initialError ?? '');

  const reasonToMessage = (reason: Extract<LoginAttemptResult, { ok: false }>['reason']): string => {
    switch (reason) {
      case 'email-not-confirmed': return t.login.errors.emailNotConfirmed;
      case 'invalid-credentials': return t.login.errors.invalidCredentials;
      case 'too-many-requests': return t.login.errors.tooManyRequests;
      case 'user-not-found': return t.login.errors.userNotFound;
      case 'connection-error': return t.login.connectionError;
      case 'generic':
      default: return t.login.errors.generic;
    }
  };

  const onSubmit = async (data: LoginForm) => {
    setError('');
    const result = await onLogin(data.email, data.password);
    if ('reason' in result) {
      setError(reasonToMessage(result.reason));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-5 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md mx-auto">
          {/* Logo */}
          <View className="items-center mb-8">
            <Text className="text-3xl font-bold text-primary">{t.brand.name}</Text>
            <Text className="text-gray-500 mt-1 text-sm">{t.login.tagline}</Text>
          </View>

          <View className="bg-white rounded-2xl border border-gray-100 p-8">
            <Text className="text-xl font-semibold text-gray-900 mb-6">{t.login.heading}</Text>

            {oauthSlot ? (
              <>
                {oauthSlot}
                <View className="flex-row items-center gap-3 my-6">
                  <View className="flex-1 h-px bg-gray-100" />
                  <Text className="text-xs text-gray-400">{t.login.dividerEmail}</Text>
                  <View className="flex-1 h-px bg-gray-100" />
                </View>
              </>
            ) : null}

            <View className="flex-col gap-4">
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label={t.register.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder={t.register.emailPlaceholder}
                    leftIcon={<Mail size={16} color="#9CA3AF" />}
                    error={errors.email?.message}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label={t.register.password}
                    secureTextEntry
                    autoComplete="password"
                    placeholder="••••••••"
                    leftIcon={<Lock size={16} color="#9CA3AF" />}
                    error={errors.password?.message}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <View className="items-end">
                <Pressable onPress={onForgotPasswordPress}>
                  <Text className="text-xs text-primary">{t.login.forgotPassword}</Text>
                </Pressable>
              </View>

              {error ? (
                <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              ) : null}

              <Button onPress={handleSubmit(onSubmit)} loading={isSubmitting} fullWidth size="lg">
                {t.login.submit}
              </Button>
            </View>
          </View>

          <View className="flex-row justify-center mt-6">
            <Text className="text-sm text-gray-500">{t.login.noAccount} </Text>
            <Pressable onPress={onRegisterPress}>
              <Text className="text-sm text-primary font-medium">{t.login.registerHere}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

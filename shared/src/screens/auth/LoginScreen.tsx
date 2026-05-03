import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import { useLang } from '../../i18n';
import { Input } from '../../ui/Input';

export type LoginAttemptResult =
  | { ok: true; needsOnboarding: boolean }
  | { ok: false; reason: 'email-not-confirmed' | 'invalid-credentials' | 'too-many-requests' | 'user-not-found' | 'generic' | 'connection-error' };

export interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<LoginAttemptResult>;
  initialError?: string;
  onForgotPasswordPress: () => void;
  onRegisterPress: () => void;
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
      className="flex-1"
      style={{ backgroundColor: '#5B5BD6' }}
    >
      <ScrollView
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HeroHeader onRegisterPress={onRegisterPress} cta={t.login.noAccount} ctaAction={t.login.registerHere} />

        <View
          className="bg-white px-6 pt-8 pb-10"
          style={{
            borderTopLeftRadius: 36,
            borderTopRightRadius: 36,
            marginTop: -28,
            minHeight: 480,
          }}
        >
          <View className="w-full max-w-md mx-auto">
            <Text className="text-2xl font-extrabold text-gray-900 tracking-tight mb-1">
              {t.login.heading}
            </Text>
            <Text className="text-sm text-gray-500 mb-7">{t.login.tagline}</Text>

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
                    leftIcon={<Mail size={18} color="#9CA3AF" />}
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
                    leftIcon={<Lock size={18} color="#9CA3AF" />}
                    error={errors.password?.message}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              {error ? (
                <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              ) : null}

              <GradientButton onPress={handleSubmit(onSubmit)} loading={isSubmitting}>
                {t.login.submit}
              </GradientButton>

              <View className="items-center mt-1">
                <Pressable onPress={onForgotPasswordPress} hitSlop={8}>
                  <Text className="text-sm text-gray-500 font-medium">
                    {t.login.forgotPassword}
                  </Text>
                </Pressable>
              </View>
            </View>

            {oauthSlot ? (
              <View className="mt-8">
                <View className="flex-row items-center gap-3 mb-5">
                  <View className="flex-1 h-px bg-gray-200" />
                  <Text className="text-xs text-gray-400">{t.login.dividerEmail}</Text>
                  <View className="flex-1 h-px bg-gray-200" />
                </View>
                {oauthSlot}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface HeroHeaderProps {
  onRegisterPress: () => void;
  cta: string;
  ctaAction: string;
}

function HeroHeader({ onRegisterPress, cta, ctaAction }: HeroHeaderProps) {
  return (
    <View style={{ height: 280, position: 'relative' }}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="xMidYMid slice" pointerEvents="none">
        <Defs>
          <SvgLinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#6366F1" />
            <Stop offset="100%" stopColor="#8B5CF6" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroGrad)" />
      </Svg>

      <View className="flex-1 px-6 pt-14">
        <View className="flex-row items-center justify-end">
          <Text className="text-white/80 text-xs mr-2">{cta}</Text>
          <Pressable
            onPress={onRegisterPress}
            hitSlop={8}
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            className="px-3.5 py-1.5 rounded-full"
          >
            <Text className="text-white text-xs font-semibold">{ctaAction}</Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center pb-6">
          <View
            className="w-16 h-16 rounded-2xl bg-white items-center justify-center mb-3"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text className="text-3xl font-extrabold text-primary">a</Text>
          </View>
          <Text className="text-white text-2xl font-extrabold tracking-tight">Amixos</Text>
        </View>
      </View>
    </View>
  );
}

interface GradientButtonProps {
  onPress: () => void;
  loading?: boolean;
  children: ReactNode;
}

function GradientButton({ onPress, loading, children }: GradientButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({ opacity: loading ? 0.7 : pressed ? 0.85 : 1 })}
    >
      <View
        className="rounded-2xl overflow-hidden h-14 items-center justify-center"
        style={{
          shadowColor: '#6366F1',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#6366F1" />
              <Stop offset="100%" stopColor="#A855F7" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#btnGrad)" />
        </Svg>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-white font-bold text-base">{children}</Text>
        )}
      </View>
    </Pressable>
  );
}

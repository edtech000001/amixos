import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AuthBackground } from '../../ui/AuthBackground';

export type RegisterAttemptResult =
  | { ok: true }
  | { ok: false; reason: 'already-registered' | 'generic' };

export interface RegisterScreenProps {
  onRegister: (data: { firstName: string; lastName: string; email: string; password: string }) => Promise<RegisterAttemptResult>;
  onLoginPress: () => void;
  onTermsPress: () => void;
  onPrivacyPress: () => void;
  /** Optional OAuth UI rendered above the email/password form (web only). */
  oauthSlot?: ReactNode;
}

export function RegisterScreen({
  onRegister,
  onLoginPress,
  onTermsPress,
  onPrivacyPress,
  oauthSlot,
}: RegisterScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;

  const registerSchema = useMemo(() => z.object({
    firstName: z.string().min(1, t.register.errors.firstNameRequired),
    lastName: z.string().min(1, t.register.errors.lastNameRequired),
    email: z.string().email(t.register.errors.emailInvalid),
    password: z.string().min(8, t.register.errors.passwordShort),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t.register.errors.passwordMismatch,
    path: ['confirmPassword'],
  }), [t]);

  type RegisterForm = z.infer<typeof registerSchema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });
  const [error, setError] = useState('');

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    const result = await onRegister({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
    });
    if ('reason' in result) {
      setError(
        result.reason === 'already-registered'
          ? t.register.errors.alreadyRegistered
          : t.register.errors.generic,
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <AuthBackground />
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md mx-auto">
          <View className="items-center mb-8">
            <View
              className="w-16 h-16 rounded-2xl bg-white items-center justify-center mb-4"
              style={{
                shadowColor: '#4F46E5',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 16,
                elevation: 6,
              }}
            >
              <Text className="text-3xl font-extrabold text-primary">a</Text>
            </View>
            <Text className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {t.register.heading}
            </Text>
            <Text className="text-sm text-gray-500 mt-2 text-center">
              {t.register.sub}
            </Text>
          </View>

          <View className="flex-col gap-4">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="firstName"
                    render={({ field: { value, onChange, onBlur } }) => (
                      <Input
                        label={t.register.firstName}
                        placeholder={t.register.firstNamePlaceholder}
                        leftIcon={<User size={18} color="#9CA3AF" />}
                        error={errors.firstName?.message}
                        value={value ?? ''}
                        onChangeText={onChange}
                        onBlur={onBlur}
                      />
                    )}
                  />
                </View>
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="lastName"
                    render={({ field: { value, onChange, onBlur } }) => (
                      <Input
                        label={t.register.lastName}
                        placeholder={t.register.lastNamePlaceholder}
                        error={errors.lastName?.message}
                        value={value ?? ''}
                        onChangeText={onChange}
                        onBlur={onBlur}
                      />
                    )}
                  />
                </View>
              </View>

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
                    placeholder={t.register.passwordPlaceholder}
                    leftIcon={<Lock size={18} color="#9CA3AF" />}
                    error={errors.password?.message}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label={t.register.confirmPassword}
                    secureTextEntry
                    placeholder={t.register.confirmPasswordPlaceholder}
                    leftIcon={<Lock size={18} color="#9CA3AF" />}
                    error={errors.confirmPassword?.message}
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

              <View className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Text className="text-blue-600 text-xs">{t.register.verificationNote}</Text>
              </View>

              <Button onPress={handleSubmit(onSubmit)} loading={isSubmitting} fullWidth size="lg">
                {t.register.submit}
              </Button>

              <Text className="text-xs text-center text-gray-400">
                {t.register.termsBefore}{' '}
                <Text onPress={onTermsPress} className="text-primary">{t.register.terms}</Text>
                {' '}{t.register.termsAnd}{' '}
                <Text onPress={onPrivacyPress} className="text-primary">{t.register.privacy}</Text>
              </Text>

              {oauthSlot ? (
                <View className="mt-2">
                  <View className="flex-row items-center gap-3 mb-5">
                    <View className="flex-1 h-px bg-gray-100" />
                    <Text className="text-xs text-gray-400">{t.register.dividerEmail}</Text>
                    <View className="flex-1 h-px bg-gray-100" />
                  </View>
                  {oauthSlot}
                </View>
              ) : null}
            </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-sm text-gray-500">{t.register.alreadyAccount} </Text>
            <Pressable onPress={onLoginPress}>
              <Text className="text-sm text-primary font-medium">{t.register.loginHere}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

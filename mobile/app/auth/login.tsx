import { useMemo, useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/lib/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { t: full } = useLang();
  const t = full.auth;
  const supabase = createSupabaseClient();

  const loginSchema = useMemo(() => z.object({
    email: z.string().email(t.login.errors.emailInvalid),
    password: z.string().min(6, t.login.errors.passwordShort),
  }), [t]);

  type LoginForm = z.infer<typeof loginSchema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const [error, setError] = useState('');

  const mapError = (msg: string): string => {
    if (msg.includes('Email not confirmed') || msg.includes('email not confirmed')) return t.login.errors.emailNotConfirmed;
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return t.login.errors.invalidCredentials;
    if (msg.includes('Too many requests')) return t.login.errors.tooManyRequests;
    if (msg.includes('User not found')) return t.login.errors.userNotFound;
    return t.login.errors.generic;
  };

  const onSubmit = async (data: LoginForm) => {
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (signInError) {
        setError(mapError(signInError.message));
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', session.user.id)
          .limit(1);
        if (!businesses || businesses.length === 0) {
          router.replace('/onboarding');
          return;
        }
      }
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Login error:', err);
      setError(t.login.connectionError);
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

          {/* Card */}
          <View className="bg-white rounded-2xl border border-gray-100 p-6">
            <Text className="text-xl font-semibold text-gray-900 mb-6">
              {t.login.heading}
            </Text>

            <View className="flex flex-col gap-4">
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
                <Link href="/auth/forgot-password" className="text-xs text-primary">
                  {t.login.forgotPassword}
                </Link>
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
            <Link href="/auth/register" className="text-sm text-primary font-medium">
              {t.login.registerHere}
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

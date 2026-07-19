import { useMemo, useState } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

export interface ForgotPasswordScreenProps {
  /** Send the password reset email. Returns ok=true on success. */
  onResetEmail: (email: string) => Promise<{ ok: true } | { ok: false }>;
  /** Navigate back to the login screen. */
  onBackToLogin: () => void;
}

// Universal forgot-password screen. Pure UI + callbacks — both web (via
// react-native-web) and mobile (via Expo) render the same component.
// Platform-specific concerns (Supabase client setup, navigation) are
// supplied by the route-level wrapper on each platform.
export function ForgotPasswordScreen({ onResetEmail, onBackToLogin }: ForgotPasswordScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;
  const c = useThemeColors();

  const schema = useMemo(() => z.object({
    email: z.string().email(t.forgot.emailInvalid),
  }), [t]);
  type FormData = z.infer<typeof schema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (data: FormData) => {
    setError('');
    const result = await onResetEmail(data.email);
    if (!result.ok) {
      setError(t.forgot.error);
      return;
    }
    setSent(true);
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
            <Text className="text-muted mt-1 text-sm">{t.forgot.tagline}</Text>
          </View>

          <View className="bg-card rounded-2xl border border-border-soft p-8">
            {sent ? (
              <View className="items-center gap-4">
                <CheckCircle size={48} color={c.success} />
                <Text className="text-xl font-semibold text-ink">{t.forgot.successTitle}</Text>
                <Text className="text-sm text-muted text-center">{t.forgot.successSub}</Text>
                <Pressable onPress={onBackToLogin} className="mt-2 flex-row items-center gap-1">
                  <ArrowLeft size={14} color={c.primary} />
                  <Text className="text-sm text-primary font-medium">{t.forgot.backToLogin}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text className="text-xl font-semibold text-ink mb-2">{t.forgot.heading}</Text>
                <Text className="text-sm text-muted mb-6">{t.forgot.sub}</Text>

                <View className="flex-col gap-4">
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { value, onChange, onBlur } }) => (
                      <Input
                        label={t.forgot.email}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        placeholder={t.forgot.emailPlaceholder}
                        leftIcon={<Mail size={18} color={c.faint} />}
                        error={errors.email?.message}
                        value={value ?? ''}
                        onChangeText={onChange}
                        onBlur={onBlur}
                      />
                    )}
                  />

                  {error ? (
                    <View className="bg-red-500/10 border border-red-100 rounded-xl px-4 py-3">
                      <Text className="text-red-600 text-sm">{error}</Text>
                    </View>
                  ) : null}

                  <Button onPress={handleSubmit(onSubmit)} loading={isSubmitting} fullWidth size="lg">
                    {t.forgot.submit}
                  </Button>
                </View>

                <Pressable onPress={onBackToLogin} className="mt-6 flex-row items-center justify-center gap-1">
                  <ArrowLeft size={14} color={c.faint} />
                  <Text className="text-sm text-muted">{t.forgot.backToLogin}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

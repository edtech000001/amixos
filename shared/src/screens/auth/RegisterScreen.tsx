import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Logo } from '../../ui/Logo';
import { AuthBackground } from '../../ui/AuthBackground';
import { PASSWORD_MIN_LENGTH, passwordMeetsPolicy } from '../../lib/passwordErrors';

export type RegisterAttemptResult =
  | { ok: true }
  // 'weak-password' / 'leaked-password' come from the project's password
  // policy (see shared/lib/passwordErrors). The composition rule is also
  // checked client-side below, so 'weak-password' should be rare — it is the
  // safety net for when the dashboard policy and PASSWORD_CLASSES drift apart.
  | { ok: false; reason: 'already-registered' | 'weak-password' | 'leaked-password' | 'generic' };

export interface RegisterScreenProps {
  onRegister: (data: { firstName: string; lastName: string; email: string; password: string }) => Promise<RegisterAttemptResult>;
  onLoginPress: () => void;
  onTermsPress: () => void;
  onPrivacyPress: () => void;
  /** Optional OAuth UI rendered above the email/password form (web only). */
  oauthSlot?: ReactNode;
  /** Captcha widget, supplied by the route wrapper (which owns the token and
   *  passes it into the Supabase call). Rendered directly above the submit
   *  button so a challenge appears where the user is already looking. */
  captchaSlot?: ReactNode;
}

export function RegisterScreen({
  onRegister,
  onLoginPress,
  onTermsPress,
  onPrivacyPress,
  oauthSlot,
  captchaSlot,
}: RegisterScreenProps) {
  const { t: full } = useLang();
  const insets = useSafeAreaInsets();
  const t = full.auth;

  // One place deciding what each rejection says, so the native and web forms
  // can never drift into wording one of them explains better.
  const registerErrorText = (reason: 'already-registered' | 'weak-password' | 'leaked-password' | 'generic') => {
    switch (reason) {
      case 'already-registered': return t.register.errors.alreadyRegistered;
      case 'leaked-password':    return t.register.errors.passwordPwned;
      case 'weak-password':      return t.register.errors.passwordWeak;
      default:                   return t.register.errors.generic;
    }
  };
  const c = useThemeColors();

  const registerSchema = useMemo(() => z.object({
    firstName: z.string().min(1, t.register.errors.firstNameRequired),
    lastName: z.string().min(1, t.register.errors.lastNameRequired),
    email: z.string().email(t.register.errors.emailInvalid),
    password: z.string()
      .min(PASSWORD_MIN_LENGTH, t.register.errors.passwordShort)
      .refine(passwordMeetsPolicy, t.register.errors.passwordWeak),
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
  // Parity with the web screens, which have had this since they shipped.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    const result = await onRegister({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
    });
    if ('reason' in result) {
      setError(registerErrorText(result.reason));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <AuthBackground />
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6"
        // py-10 alone measured from the PHYSICAL top of the screen: this
        // ScrollView has no SafeAreaView above it, so on a notched phone the
        // ~59pt status bar swallowed the 40pt padding and the logo sat under
        // the clock. Insets + a fixed gap keeps the same look on both.
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md mx-auto">
          <View className="items-center mb-8">
            <View className="mb-4">
              <Logo variant="stacked" width={96} />
            </View>
            <Text className="text-3xl font-extrabold text-ink tracking-tight">
              {t.register.heading}
            </Text>
            <Text className="text-sm text-muted mt-2 text-center">
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
                        leftIcon={<User size={18} color={c.faint} />}
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
                    leftIcon={<Mail size={18} color={c.faint} />}
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
                    secureTextEntry={!showPassword}
                    placeholder={t.register.passwordPlaceholder}
                    rightIcon={
                      <Pressable
                        onPress={() => setShowPassword(v => !v)}
                        hitSlop={8}
                        accessibilityLabel={showPassword ? t.a11y.hidePassword : t.a11y.showPassword}
                      >
                        {showPassword ? <EyeOff size={18} color={c.muted} /> : <Eye size={18} color={c.muted} />}
                      </Pressable>
                    }
                    leftIcon={<Lock size={18} color={c.faint} />}
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
                    secureTextEntry={!showConfirm}
                    placeholder={t.register.confirmPasswordPlaceholder}
                    rightIcon={
                      <Pressable
                        onPress={() => setShowConfirm(v => !v)}
                        hitSlop={8}
                        accessibilityLabel={showConfirm ? t.a11y.hidePassword : t.a11y.showPassword}
                      >
                        {showConfirm ? <EyeOff size={18} color={c.muted} /> : <Eye size={18} color={c.muted} />}
                      </Pressable>
                    }
                    leftIcon={<Lock size={18} color={c.faint} />}
                    error={errors.confirmPassword?.message}
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

              <View className="bg-blue-500/10 border border-blue-100 rounded-xl px-4 py-3">
                <Text className="text-blue-600 text-xs">{t.register.verificationNote}</Text>
              </View>

              {captchaSlot}
              <Button onPress={handleSubmit(onSubmit)} loading={isSubmitting} fullWidth size="lg">
                {t.register.submit}
              </Button>

              <Text className="text-xs text-center text-faint">
                {t.register.termsBefore}{' '}
                <Text onPress={onTermsPress} className="text-primary">{t.register.terms}</Text>
                {' '}{t.register.termsAnd}{' '}
                <Text onPress={onPrivacyPress} className="text-primary">{t.register.privacy}</Text>
              </Text>

              {oauthSlot ? (
                <View className="mt-2">
                  <View className="flex-row items-center gap-3 mb-5">
                    <View className="flex-1 h-px bg-border-soft" />
                    <Text className="text-xs text-faint">{t.register.dividerEmail}</Text>
                    <View className="flex-1 h-px bg-border-soft" />
                  </View>
                  {oauthSlot}
                </View>
              ) : null}
            </View>

          <View className="flex-row justify-center mt-8">
            <Text className="text-sm text-muted">{t.register.alreadyAccount} </Text>
            <Pressable onPress={onLoginPress}>
              <Text className="text-sm text-primary font-medium">{t.register.loginHere}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

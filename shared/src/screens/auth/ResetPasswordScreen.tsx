// Universal "set a new password" screen, reached from the link in the reset
// email. Pure UI + callbacks: establishing the recovery session from the link
// is platform-specific (web gets a PKCE `?code=`, native gets an implicit
// `#access_token=`), so the route wrapper does that and reports the outcome
// through `linkState`.

import { useMemo, useState } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView, Platform, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react-native';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { PASSWORD_MIN_LENGTH, passwordMeetsPolicy } from '../../lib/passwordErrors';

export type ResetLinkState = 'verifying' | 'ready' | 'invalid';

export type ResetAttemptResult =
  | { ok: true }
  | { ok: false; reason: 'weak-password' | 'leaked-password' | 'same-password' | 'expired' | 'generic' };

export interface ResetPasswordScreenProps {
  /** Whether the recovery session from the email link is usable yet. */
  linkState: ResetLinkState;
  /** Persist the new password against the recovery session. */
  onSubmit: (password: string) => Promise<ResetAttemptResult>;
  /** Go to the login screen (after success, or from the footer link). */
  onGoToLogin: () => void;
  /** Start over — send a fresh reset email. */
  onRequestNewLink: () => void;
}

export function ResetPasswordScreen({
  linkState,
  onSubmit,
  onGoToLogin,
  onRequestNewLink,
}: ResetPasswordScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;
  const c = useThemeColors();

  const schema = useMemo(() => z.object({
    password: z.string()
      .min(PASSWORD_MIN_LENGTH, t.reset.errors.passwordShort)
      .refine(passwordMeetsPolicy, t.reset.errors.passwordWeak),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t.reset.errors.passwordMismatch,
    path: ['confirmPassword'],
  }), [t]);
  type FormData = z.infer<typeof schema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (data: FormData) => {
    setError('');
    const result = await onSubmit(data.password);
    if (result.ok === true) { setDone(true); return; }
    switch (result.reason) {
      case 'leaked-password': setError(t.reset.errors.passwordPwned); break;
      case 'weak-password':   setError(t.reset.errors.passwordWeak); break;
      case 'same-password':   setError(t.reset.errors.samePassword); break;
      // The recovery session died between opening the link and submitting —
      // send them back to the start rather than leaving them retrying a form
      // that can no longer succeed.
      case 'expired':         setError(t.reset.invalidSub); break;
      default:                setError(t.reset.errors.generic);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-5 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md mx-auto">
          <View className="items-center mb-8">
            <Text className="text-3xl font-bold text-primary">{t.brand.name}</Text>
            <Text className="text-muted mt-1 text-sm">{t.reset.tagline}</Text>
          </View>
          <View className="bg-card rounded-2xl border border-border-soft p-8">{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (linkState === 'verifying') {
    return (
      <Shell>
        <Text className="text-sm text-muted text-center">{t.reset.verifying}</Text>
      </Shell>
    );
  }

  if (linkState === 'invalid') {
    return (
      <Shell>
        <View className="items-center gap-4">
          <AlertTriangle size={48} color={c.danger} />
          <Text className="text-xl font-semibold text-ink text-center">{t.reset.invalidTitle}</Text>
          <Text className="text-sm text-muted text-center">{t.reset.invalidSub}</Text>
          <Button onPress={onRequestNewLink} fullWidth size="lg">{t.reset.requestNew}</Button>
          <Pressable onPress={onGoToLogin} className="mt-1 flex-row items-center gap-1">
            <ArrowLeft size={14} color={c.faint} />
            <Text className="text-sm text-muted">{t.reset.backToLogin}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <View className="items-center gap-4">
          <CheckCircle size={48} color={c.success} />
          <Text className="text-xl font-semibold text-ink text-center">{t.reset.successTitle}</Text>
          <Text className="text-sm text-muted text-center">{t.reset.successSub}</Text>
          <Button onPress={onGoToLogin} fullWidth size="lg">{t.reset.goToLogin}</Button>
        </View>
      </Shell>
    );
  }

  return (
    <Shell>
      <Text className="text-xl font-semibold text-ink mb-2">{t.reset.heading}</Text>
      <Text className="text-sm text-muted mb-6">{t.reset.sub}</Text>

      <View className="flex-col gap-4">
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input
              label={t.reset.newPassword}
              placeholder={t.reset.newPasswordPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
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
              label={t.reset.confirmPassword}
              placeholder={t.reset.confirmPasswordPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              leftIcon={<Lock size={18} color={c.faint} />}
              error={errors.confirmPassword?.message}
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
            />
          )}
        />

        <Text className="text-xs text-faint">{t.reset.requirementsHint}</Text>

        {error ? (
          <View className="bg-red-500/10 border border-red-100 rounded-xl px-4 py-3">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <Button onPress={handleSubmit(submit)} loading={isSubmitting} fullWidth size="lg">
          {t.reset.submit}
        </Button>
      </View>

      <Pressable onPress={onGoToLogin} className="mt-6 flex-row items-center justify-center gap-1">
        <ArrowLeft size={14} color={c.faint} />
        <Text className="text-sm text-muted">{t.reset.backToLogin}</Text>
      </Pressable>
    </Shell>
  );
}

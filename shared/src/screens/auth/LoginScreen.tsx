import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { Input } from '../../ui/Input';
import { Logo } from '../../ui/Logo';
import { FillSvg } from '../../ui/FillSvg';

export type LoginAttemptResult =
  | { ok: true; needsOnboarding: boolean }
  | { ok: false; reason: 'email-not-confirmed' | 'invalid-credentials' | 'too-many-requests' | 'user-not-found' | 'generic' | 'connection-error' };

export interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<LoginAttemptResult>;
  initialError?: string;
  onForgotPasswordPress: () => void;
  onRegisterPress: () => void;
  oauthSlot?: ReactNode;
  /** Captcha widget, supplied by the route wrapper (which owns the token and
   *  passes it into the Supabase call). Rendered directly above the submit
   *  button so a challenge appears where the user is already looking. */
  captchaSlot?: ReactNode;
}

export function LoginScreen({
  onLogin,
  initialError,
  onForgotPasswordPress,
  onRegisterPress,
  oauthSlot,
  captchaSlot,
}: LoginScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;
  const c = useThemeColors();

  const loginSchema = useMemo(() => z.object({
    email: z.string().email(t.login.errors.emailInvalid),
    password: z.string().min(6, t.login.errors.passwordShort),
  }), [t]);

  type LoginForm = z.infer<typeof loginSchema>;

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const [error, setError] = useState(initialError ?? '');
  // Parity with the web screen, which has had this since it shipped.
  // Recommended by NIST SP 800-63B: letting people check what they typed
  // means fewer failed attempts and fewer resets.
  const [showPassword, setShowPassword] = useState(false);

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

  // The hero was a hard 300px, which pushed the card past the bottom on
  // anything smaller than a Pro Max and made the whole screen scroll. It is
  // the one flexible piece here — the card's height is set by its contents —
  // so it absorbs the difference.
  //
  // Clamped, not a bare percentage: below ~190px the logo and wordmark start
  // colliding with the card, and above ~290px a tall phone gets a wall of
  // blue. The ScrollView stays as a safety net for small devices and large
  // accessibility text, where something has to give and scrolling beats
  // clipping.
  const { height: screenH } = useWindowDimensions();
  const heroHeight = Math.max(190, Math.min(290, screenH * 0.30));

  return (
    <View style={{ flex: 1 }}>
      {/* ONE gradient, behind everything.
          It used to live inside HeroHeader with a flat #3B82F6 on the root
          "matching the gradient's bottom stop". It cannot: the gradient runs
          DIAGONALLY (0,0 → 100,100), so its bottom edge is deep indigo on the
          left and #3B82F6 only at the bottom-right corner. One flat colour
          therefore mismatched the whole left side, and the card's rounded top
          corners cut a window straight onto the seam — worse on the left,
          which is exactly how it looked. */}
      <FillSvg preserveAspectRatio="xMidYMid slice">
        <Defs>
          <SvgLinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#1E40AF" />
            <Stop offset="55%" stopColor="#2563EB" />
            <Stop offset="100%" stopColor="#3B82F6" />
          </SvgLinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroGrad)" />
      </FillSvg>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <HeroHeader height={heroHeight} />

        <View
          className="bg-card"
          style={{
            marginHorizontal: 12,
            marginTop: -36,
            marginBottom: 16,
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 28,
            borderRadius: 28,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          <View className="w-full max-w-md mx-auto">
            <Text className="text-sm font-bold text-primary mb-3">Amixos</Text>
            <Text className="text-2xl font-extrabold text-ink tracking-tight mb-1">
              {t.login.heading}
            </Text>
            <Text className="text-sm text-muted mb-7">{t.login.tagline}</Text>

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
                    autoComplete="password"
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

              {error ? (
                <View className="bg-red-500/10 border border-red-100 rounded-xl px-4 py-3">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              ) : null}

              {captchaSlot}
              <GradientButton onPress={handleSubmit(onSubmit)} loading={isSubmitting}>
                {t.login.submit}
              </GradientButton>

              <View className="items-center mt-1">
                <Pressable onPress={onForgotPasswordPress} hitSlop={8}>
                  <Text className="text-sm text-muted font-medium">
                    {t.login.forgotPassword}
                  </Text>
                </Pressable>
              </View>
            </View>

            {oauthSlot ? (
              <View className="mt-8">
                <View className="flex-row items-center gap-3 mb-5">
                  <View className="flex-1 h-px bg-border" />
                  <Text className="text-xs text-faint">{t.login.dividerEmail}</Text>
                  <View className="flex-1 h-px bg-border" />
                </View>
                {oauthSlot}
              </View>
            ) : null}

            <View className="mt-8 pt-6 border-t border-border-soft flex-row justify-center items-center">
              <Text className="text-sm text-muted">{t.login.noAccount} </Text>
              <Pressable onPress={onRegisterPress} hitSlop={8}>
                <Text className="text-sm text-primary font-semibold">{t.login.registerHere}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function HeroHeader({ height }: { height: number }) {
  return (
    <View style={{ height, position: 'relative' }}>
      {/* The gradient lives on the root now, spanning the whole screen, so the
          hero and the area around the floating card are one continuous surface
          with no seam to line up. */}
      <View className="flex-1 items-center justify-center pb-10 pt-6">
        {/* ink="white" is NOT the theme's choice — this sits on the blue
           gradient in both light and dark mode, so the theme-derived ink
           would go black on a blue background in light mode. */}
        <Logo variant="stacked" width={132} ink="white" />
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
          shadowColor: '#2563EB',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#2563EB" />
              <Stop offset="100%" stopColor="#3B82F6" />
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

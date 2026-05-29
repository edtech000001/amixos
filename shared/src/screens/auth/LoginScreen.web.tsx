// Web-only LoginScreen — same exported API as LoginScreen.tsx but rendered
// with native HTML + Tailwind so the page actually has styles. The shared
// React Native version (LoginScreen.tsx) relies on NativeWind to translate
// className → CSS, which isn't configured in the Next.js web project; the
// View/Text/Pressable components render with raw react-native-web classes
// and Tailwind doesn't apply. This file is resolved BEFORE the .tsx variant
// on web via the `.web.tsx` extension priority in web/next.config.js.

import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useLang } from '../../i18n';

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

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t.login.errors.emailInvalid),
        password: z.string().min(6, t.login.errors.passwordShort),
      }),
    [t],
  );
  type FormValues = z.infer<typeof loginSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const [error, setError] = useState<string | undefined>(initialError);
  const [showPassword, setShowPassword] = useState(false);

  const reasonToMessage = (reason: Exclude<LoginAttemptResult, { ok: true }>['reason']): string => {
    switch (reason) {
      case 'email-not-confirmed': return t.login.errors.emailNotConfirmed;
      case 'invalid-credentials': return t.login.errors.invalidCredentials;
      case 'too-many-requests': return t.login.errors.tooManyRequests;
      case 'user-not-found': return t.login.errors.userNotFound;
      case 'connection-error': return t.login.connectionError;
      default: return t.login.errors.generic;
    }
  };

  const onSubmit = handleSubmit(async (data) => {
    setError(undefined);
    const result = await onLogin(data.email, data.password);
    if (!result.ok) setError(reasonToMessage(result.reason));
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <p className="text-sm font-bold text-primary mb-4">Amixos</p>
        <h1 className="text-3xl font-bold text-gray-900">{t.login.heading}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{t.login.tagline}</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.register.email}</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="email"
                autoComplete="email"
                placeholder={t.register.emailPlaceholder}
                {...register('email')}
                className={`w-full rounded-xl border bg-white pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.email ? 'border-red-300' : 'border-gray-200'
                }`}
              />
            </div>
            {errors.email ? (
              <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.register.password}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                className={`w-full rounded-xl border bg-white pl-10 pr-11 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.password ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password ? (
              <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
            ) : null}
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-primary text-white font-semibold py-3 mt-2 hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {isSubmitting ? '…' : t.login.submit}
          </button>

          <button
            type="button"
            onClick={onForgotPasswordPress}
            className="text-sm text-gray-500 hover:text-gray-700 text-center mt-1"
          >
            {t.login.forgotPassword}
          </button>
        </form>

        {oauthSlot ? (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">{t.login.dividerEmail}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            {oauthSlot}
          </div>
        ) : null}

        <div className="flex justify-center mt-8 gap-1">
          <span className="text-sm text-gray-500">{t.login.noAccount}</span>
          <button onClick={onRegisterPress} className="text-sm text-primary font-semibold hover:underline">
            {t.login.registerHere}
          </button>
        </div>
      </div>
    </div>
  );
}

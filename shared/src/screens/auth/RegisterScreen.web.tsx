// Web-only RegisterScreen — see LoginScreen.web.tsx for the why.

import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react';
import { useLang } from '../../i18n';

export type RegisterAttemptResult =
  | { ok: true }
  | { ok: false; reason: 'already-registered' | 'generic' };

export interface RegisterScreenProps {
  onRegister: (data: { firstName: string; lastName: string; email: string; password: string }) => Promise<RegisterAttemptResult>;
  onLoginPress: () => void;
  onTermsPress: () => void;
  onPrivacyPress: () => void;
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

  const schema = useMemo(
    () =>
      z
        .object({
          firstName: z.string().min(1, t.register.errors.firstNameRequired),
          lastName: z.string().min(1, t.register.errors.lastNameRequired),
          email: z.string().email(t.register.errors.emailInvalid),
          password: z.string().min(8, t.register.errors.passwordShort),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t.register.errors.passwordMismatch,
          path: ['confirmPassword'],
        }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
  });

  const [error, setError] = useState<string | undefined>();

  const onSubmit = handleSubmit(async (data) => {
    setError(undefined);
    const result = await onRegister({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
    });
    if (!result.ok) {
      setError(
        result.reason === 'already-registered'
          ? t.register.errors.alreadyRegistered
          : t.register.errors.generic,
      );
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-3xl font-bold text-gray-900">{t.register.heading}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{t.register.sub}</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.register.firstName}</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder={t.register.firstNamePlaceholder}
                  {...register('firstName')}
                  className={`w-full rounded-xl border bg-white pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                    errors.firstName ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.firstName ? (
                <p className="text-xs text-red-500 mt-1">{errors.firstName.message}</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.register.lastName}</label>
              <input
                type="text"
                autoComplete="family-name"
                placeholder={t.register.lastNamePlaceholder}
                {...register('lastName')}
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.lastName ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {errors.lastName ? (
                <p className="text-xs text-red-500 mt-1">{errors.lastName.message}</p>
              ) : null}
            </div>
          </div>

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
                type="password"
                autoComplete="new-password"
                placeholder={t.register.passwordPlaceholder}
                {...register('password')}
                className={`w-full rounded-xl border bg-white pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.password ? 'border-red-300' : 'border-gray-200'
                }`}
              />
            </div>
            {errors.password ? (
              <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.register.confirmPassword}</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder={t.register.confirmPasswordPlaceholder}
                {...register('confirmPassword')}
                className={`w-full rounded-xl border bg-white pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.confirmPassword ? 'border-red-300' : 'border-gray-200'
                }`}
              />
            </div>
            {errors.confirmPassword ? (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
            ) : null}
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          ) : null}

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-blue-600 text-xs">{t.register.verificationNote}</p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-primary text-white font-semibold py-3 mt-2 hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {isSubmitting ? '…' : t.register.submit}
          </button>

          <p className="text-xs text-center text-gray-400 mt-1">
            {t.register.termsBefore}{' '}
            <button type="button" onClick={onTermsPress} className="text-primary hover:underline">
              {t.register.terms}
            </button>
            {' '}{t.register.termsAnd}{' '}
            <button type="button" onClick={onPrivacyPress} className="text-primary hover:underline">
              {t.register.privacy}
            </button>
          </p>
        </form>

        {oauthSlot ? (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">{t.register.dividerEmail}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            {oauthSlot}
          </div>
        ) : null}

        <div className="flex justify-center mt-8 gap-1">
          <span className="text-sm text-gray-500">{t.register.alreadyAccount}</span>
          <button onClick={onLoginPress} className="text-sm text-primary font-medium hover:underline">
            {t.register.loginHere}
          </button>
        </div>
      </div>
    </div>
  );
}

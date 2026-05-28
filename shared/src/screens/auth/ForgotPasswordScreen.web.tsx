// Web-only ForgotPasswordScreen — see LoginScreen.web.tsx for the why.

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, CheckCircle2 } from 'lucide-react';
import { useLang } from '../../i18n';

export interface ForgotPasswordScreenProps {
  /** Send the password reset email. Returns ok=true on success. */
  onResetEmail: (email: string) => Promise<{ ok: true } | { ok: false }>;
  /** Navigate back to the login screen. */
  onBackToLogin: () => void;
}

export function ForgotPasswordScreen({ onResetEmail, onBackToLogin }: ForgotPasswordScreenProps) {
  const { t: full } = useLang();
  const t = full.auth;

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t.forgot.emailInvalid),
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
  const [success, setSuccess] = useState(false);

  const onSubmit = handleSubmit(async (data) => {
    setError(undefined);
    const result = await onResetEmail(data.email);
    if (result.ok) setSuccess(true);
    else setError(t.forgot.error);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-3xl font-bold text-gray-900">{t.forgot.heading}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{t.forgot.tagline}</p>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle2 size={56} className="text-emerald-500" />
            <h2 className="text-xl font-semibold text-gray-900 text-center">{t.forgot.successTitle}</h2>
            <p className="text-sm text-gray-500 text-center">{t.forgot.successSub}</p>
            <button
              onClick={onBackToLogin}
              className="text-sm text-primary font-medium hover:underline mt-2"
            >
              {t.forgot.backToLogin}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">{t.forgot.sub}</p>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.forgot.email}</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={t.forgot.emailPlaceholder}
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
                {isSubmitting ? '…' : t.forgot.submit}
              </button>

              <button
                type="button"
                onClick={onBackToLogin}
                className="text-sm text-gray-500 hover:text-gray-700 text-center mt-1"
              >
                {t.forgot.backToLogin}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

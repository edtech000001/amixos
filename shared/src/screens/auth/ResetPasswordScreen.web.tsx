// Web-only ResetPasswordScreen — see LoginScreen.web.tsx for the why.
//
// Same contract as the native variant: the route establishes the recovery
// session from the link and reports it through `linkState`; this file is only
// the form.

import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLang } from '../../i18n';
import { PASSWORD_MIN_LENGTH, passwordMeetsPolicy } from '../../lib/passwordErrors';

export type ResetLinkState = 'verifying' | 'ready' | 'invalid';

export type ResetAttemptResult =
  | { ok: true }
  | { ok: false; reason: 'weak-password' | 'leaked-password' | 'same-password' | 'expired' | 'generic' };

export interface ResetPasswordScreenProps {
  linkState: ResetLinkState;
  onSubmit: (password: string) => Promise<ResetAttemptResult>;
  onGoToLogin: () => void;
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

  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string()
            .min(PASSWORD_MIN_LENGTH, t.reset.errors.passwordShort)
            .refine(passwordMeetsPolicy, t.reset.errors.passwordWeak),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t.reset.errors.passwordMismatch,
          path: ['confirmPassword'],
        }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onBlur' });

  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const submit = handleSubmit(async (data) => {
    setError(undefined);
    const result = await onSubmit(data.password);
    if (result.ok) { setDone(true); return; }
    switch (result.reason) {
      case 'leaked-password': setError(t.reset.errors.passwordPwned); break;
      case 'weak-password':   setError(t.reset.errors.passwordWeak); break;
      case 'same-password':   setError(t.reset.errors.samePassword); break;
      case 'expired':         setError(t.reset.invalidSub); break;
      default:                setError(t.reset.errors.generic);
    }
  });

  const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        {children}
      </div>
    </div>
  );

  if (linkState === 'verifying') {
    return <Shell><p className="text-sm text-gray-500 text-center">{t.reset.verifying}</p></Shell>;
  }

  if (linkState === 'invalid') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle size={48} className="text-red-500" />
          <h1 className="text-xl font-semibold text-gray-900">{t.reset.invalidTitle}</h1>
          <p className="text-sm text-gray-500">{t.reset.invalidSub}</p>
          <button
            type="button"
            onClick={onRequestNewLink}
            className="w-full bg-primary text-white rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            {t.reset.requestNew}
          </button>
          <button type="button" onClick={onGoToLogin} className="text-sm text-gray-500 hover:text-gray-700">
            {t.reset.backToLogin}
          </button>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 size={48} className="text-emerald-500" />
          <h1 className="text-xl font-semibold text-gray-900">{t.reset.successTitle}</h1>
          <p className="text-sm text-gray-500">{t.reset.successSub}</p>
          <button
            type="button"
            onClick={onGoToLogin}
            className="w-full bg-primary text-white rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            {t.reset.goToLogin}
          </button>
        </div>
      </Shell>
    );
  }

  const field = (
    name: 'password' | 'confirmPassword',
    label: string,
    placeholder: string,
    show: boolean,
    toggle: () => void,
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          {...register(name)}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={label}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {errors[name] && <p className="text-xs text-red-500 mt-1">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-gray-900">{t.reset.heading}</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">{t.reset.sub}</p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {field('password', t.reset.newPassword, t.reset.newPasswordPlaceholder, showPassword, () => setShowPassword(v => !v))}
        {field('confirmPassword', t.reset.confirmPassword, t.reset.confirmPasswordPlaceholder, showConfirm, () => setShowConfirm(v => !v))}

        <p className="text-xs text-gray-400">{t.reset.requirementsHint}</p>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-white rounded-xl py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t.reset.submit}
        </button>
      </form>

      <button type="button" onClick={onGoToLogin} className="w-full mt-6 text-sm text-gray-500 hover:text-gray-700">
        {t.reset.backToLogin}
      </button>
    </Shell>
  );
}

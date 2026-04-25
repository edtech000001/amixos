'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/i18n/LangProvider';

export default function ForgotPasswordPage() {
  const { t: full } = useLang();
  const t = full.auth;
  const supabase = createSupabaseClient();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const schema = useMemo(() => z.object({
    email: z.string().email(t.forgot.emailInvalid),
  }), [t]);
  type FormData = z.infer<typeof schema>;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      setError(t.forgot.error);
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">{t.brand.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t.forgot.tagline}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            // ── Success state ──────────────────────────────────────
            <div className="text-center flex flex-col items-center gap-4">
              <CheckCircle size={48} className="text-accent" />
              <h2 className="text-xl font-semibold text-gray-900">{t.forgot.successTitle}</h2>
              <p className="text-sm text-gray-500">
                {t.forgot.successSub}
              </p>
              <Link
                href="/auth/login"
                className="mt-2 text-sm text-primary font-medium hover:underline flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                {t.forgot.backToLogin}
              </Link>
            </div>
          ) : (
            // ── Form state ─────────────────────────────────────────
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t.forgot.heading}</h2>
              <p className="text-sm text-gray-500 mb-6">
                {t.forgot.sub}
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <Input
                  label={t.forgot.email}
                  type="email"
                  placeholder={t.forgot.emailPlaceholder}
                  leftIcon={<Mail size={16} />}
                  error={errors.email?.message}
                  {...register('email')}
                />

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={isSubmitting} fullWidth size="lg">
                  {t.forgot.submit}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-gray-500 hover:text-primary flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={14} />
                  {t.forgot.backToLogin}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

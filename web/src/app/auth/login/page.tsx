'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useLang } from '@/i18n/LangProvider';

export default function LoginPage() {
  const { t: full } = useLang();
  const t = full.auth;
  const supabase = createSupabaseClient();

  const loginSchema = useMemo(() => z.object({
    email: z.string().email(t.login.errors.emailInvalid),
    password: z.string().min(6, t.login.errors.passwordShort),
  }), [t]);

  type LoginForm = z.infer<typeof loginSchema>;

  const mapError = (msg: string): string => {
    if (msg.includes('Email not confirmed') || msg.includes('email not confirmed')) return t.login.errors.emailNotConfirmed;
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) return t.login.errors.invalidCredentials;
    if (msg.includes('Too many requests')) return t.login.errors.tooManyRequests;
    if (msg.includes('User not found')) return t.login.errors.userNotFound;
    return t.login.errors.generic;
  };

  const searchParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;
  const urlError = searchParams?.get('error');

  const [error, setError] = useState(urlError ? t.login.urlError : '');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        setError(mapError(error.message));
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
          window.location.href = '/onboarding';
          return;
        }
      }

      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Login error:', err);
      setError(t.login.connectionError);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">{t.brand.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t.login.tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{t.login.heading}</h2>

          {/* OAuth Buttons */}
          <OAuthButtons />

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">{t.login.dividerEmail}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Input
              label={t.register.email}
              type="email"
              placeholder={t.register.emailPlaceholder}
              leftIcon={<Mail size={16} />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label={t.register.password}
              type="password"
              placeholder="••••••••"
              leftIcon={<Lock size={16} />}
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex justify-end">
              <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">
                {t.login.forgotPassword}
              </Link>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <Button type="submit" loading={isSubmitting} fullWidth size="lg">
              {t.login.submit}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {t.login.noAccount}{' '}
          <Link href="/auth/register" className="text-primary font-medium hover:underline">
            {t.login.registerHere}
          </Link>
        </p>
      </div>
    </div>
  );
}

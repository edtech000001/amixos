'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useLang } from '@/i18n/LangProvider';

export default function RegisterPage() {
  const { t: full } = useLang();
  const t = full.auth;
  const supabase = createSupabaseClient();
  const [error, setError] = useState('');

  const registerSchema = useMemo(() => z.object({
    firstName: z.string().min(1, t.register.errors.firstNameRequired),
    lastName: z.string().min(1, t.register.errors.lastNameRequired),
    email: z.string().email(t.register.errors.emailInvalid),
    password: z.string().min(8, t.register.errors.passwordShort),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t.register.errors.passwordMismatch,
    path: ['confirmPassword'],
  }), [t]);

  type RegisterForm = z.infer<typeof registerSchema>;

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setError(t.register.errors.alreadyRegistered);
      } else {
        setError(t.register.errors.generic);
      }
      return;
    }

    window.location.href = '/onboarding';
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-12 flex flex-col items-center justify-start">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">{t.brand.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t.register.tagline}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">{t.register.heading}</h2>
          <p className="text-sm text-gray-400 mb-6">{t.register.sub}</p>

          {/* OAuth Buttons */}
          <OAuthButtons mode="register" />

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">{t.register.dividerEmail}</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t.register.firstName}
                placeholder={t.register.firstNamePlaceholder}
                leftIcon={<User size={16} />}
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label={t.register.lastName}
                placeholder={t.register.lastNamePlaceholder}
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </div>

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
              placeholder={t.register.passwordPlaceholder}
              leftIcon={<Lock size={16} />}
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label={t.register.confirmPassword}
              type="password"
              placeholder={t.register.confirmPasswordPlaceholder}
              leftIcon={<Lock size={16} />}
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 text-blue-600 text-xs rounded-xl px-4 py-3">
              {t.register.verificationNote}
            </div>

            <Button type="submit" loading={isSubmitting} fullWidth size="lg">
              {t.register.submit}
            </Button>

            <p className="text-xs text-center text-gray-400">
              {t.register.termsBefore}{' '}
              <Link href="/terms" className="text-primary hover:underline">{t.register.terms}</Link>
              {' '}{t.register.termsAnd}{' '}
              <Link href="/privacy" className="text-primary hover:underline">{t.register.privacy}</Link>
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {t.register.alreadyAccount}{' '}
          <Link href="/auth/login" className="text-primary font-medium hover:underline">
            {t.register.loginHere}
          </Link>
        </p>
      </div>
    </div>
  );
}

'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OAuthButtons } from '@/components/auth/OAuthButtons';

const registerSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  email: z.string().email('Ingresa un correo válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [error, setError] = useState('');

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
        setError('Ya existe una cuenta con ese correo. ¿Quieres iniciar sesión?');
      } else {
        setError('Algo salió mal. Intenta de nuevo.');
      }
      return;
    }

    // Supabase sends a confirmation email — let user know
    if (true) {
      setError('');
    }

    // Hard redirect — commits session cookies before onboarding tries to read them
    window.location.href = '/onboarding';
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-12 flex flex-col items-center justify-start">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Amixos</h1>
          <p className="text-gray-500 mt-1 text-sm">Construye tu negocio. Maneja tu equipo.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Crea tu cuenta</h2>
          <p className="text-sm text-gray-400 mb-6">30 días gratis. Sin tarjeta de crédito.</p>

          {/* OAuth Buttons */}
          <OAuthButtons mode="register" />

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">o regístrate con correo</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nombre"
                placeholder="Carlos"
                leftIcon={<User size={16} />}
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Apellido"
                placeholder="Mendoza"
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </div>

            <Input
              label="Correo"
              type="email"
              placeholder="tu@correo.com"
              leftIcon={<Mail size={16} />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              leftIcon={<Lock size={16} />}
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              placeholder="••••••••"
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
              📧 Al registrarte recibirás un correo de verificación. Revísalo antes de iniciar sesión.
            </div>

            <Button type="submit" loading={isSubmitting} fullWidth size="lg">
              Crear Cuenta
            </Button>

            <p className="text-xs text-center text-gray-400">
              Al registrarte aceptas nuestros{' '}
              <Link href="/terms" className="text-primary hover:underline">Términos</Link>
              {' '}y{' '}
              <Link href="/privacy" className="text-primary hover:underline">Política de privacidad</Link>
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link href="/auth/login" className="text-primary font-medium hover:underline">
            Entra aquí
          </Link>
        </p>
      </div>
    </div>
  );
}

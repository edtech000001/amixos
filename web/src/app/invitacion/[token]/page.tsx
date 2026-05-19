'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Check, X, ArrowRight } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useLang } from '@/i18n/LangProvider';
import { Button } from '@/components/ui/Button';
import { ROLE_LABELS, type Role } from '@amixos/shared/lib/permissions';

interface InviteInfo {
  id: string;
  business_id: string;
  business_name: string;
  email: string;
  role: Role;
  expires_at: string;
  accepted_at: string | null;
}

export default function AceptarInvitacionPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const supabase = createSupabaseClient();
  const router = useRouter();
  const { t: full, locale } = useLang();
  const tw = full.dashboard.workspaces;
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

  const [status, setStatus] = useState<'loading' | 'need_login' | 'ready' | 'error' | 'accepted' | 'accepting'>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus('need_login');
        return;
      }
      const { data, error } = await supabase.rpc('lookup_invite', { invite_token: token });
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
        return;
      }
      const row = (data?.[0] ?? null) as InviteInfo | null;
      if (!row) {
        setStatus('error');
        setErrorMsg('Invite not found, expired, or for a different account.');
        return;
      }
      setInvite(row);
      setStatus(row.accepted_at ? 'accepted' : 'ready');
    })();
  }, [token, supabase]);

  const accept = async () => {
    setStatus('accepting');
    const { error } = await supabase.rpc('accept_invite', { invite_token: token });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStatus('accepted');
    // Set the cookie so the dashboard lands on this business.
    if (invite) {
      document.cookie = `amixos-active-business=${encodeURIComponent(invite.business_id)}; path=/; max-age=31536000; samesite=lax`;
    }
    setTimeout(() => router.push('/dashboard'), 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-white to-primary/10 px-6">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-lg max-w-md w-full p-8">
        {status === 'loading' && (
          <div className="py-10 flex justify-center">
            <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{animationDelay: `${i*0.15}s`}}/>)}</div>
          </div>
        )}

        {status === 'need_login' && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center mb-4">
              <Building2 size={24} className="text-primary"/>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{lang === 'es' ? 'Inicia sesión para aceptar' : 'Sign in to accept'}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {lang === 'es'
                ? 'Inicia sesión o crea una cuenta para aceptar esta invitación.'
                : 'Log in or create an account to accept this invitation.'}
            </p>
            <Link href={`/auth/login?next=/invitacion/${token}`}>
              <Button fullWidth>{lang === 'es' ? 'Iniciar sesión' : 'Log in'}</Button>
            </Link>
            <Link href={`/auth/register?next=/invitacion/${token}`} className="text-sm text-primary mt-3 inline-block hover:underline">
              {lang === 'es' ? 'Crear cuenta' : 'Create account'}
            </Link>
          </div>
        )}

        {(status === 'ready' || status === 'accepting') && invite && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center mb-4">
              <Building2 size={24} className="text-primary"/>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">
              {lang === 'es' ? 'Te han invitado a' : "You've been invited to"}
            </h1>
            <p className="text-lg font-semibold text-primary mb-1">{invite.business_name}</p>
            <p className="text-sm text-gray-500 mb-6">
              {lang === 'es' ? 'Rol: ' : 'Role: '}<span className="font-semibold">{ROLE_LABELS[invite.role][lang]}</span>
            </p>
            <Button onClick={accept} loading={status === 'accepting'} fullWidth>
              {lang === 'es' ? 'Aceptar invitación' : 'Accept invitation'} <ArrowRight size={14} className="ml-2"/>
            </Button>
          </div>
        )}

        {status === 'accepted' && invite && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 mx-auto flex items-center justify-center mb-4">
              <Check size={24} className="text-emerald-600"/>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {lang === 'es' ? '¡Bienvenido!' : 'Welcome!'}
            </h1>
            <p className="text-sm text-gray-500">
              {lang === 'es' ? `Ahora eres parte de ${invite.business_name}.` : `You're now part of ${invite.business_name}.`}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-100 mx-auto flex items-center justify-center mb-4">
              <X size={24} className="text-red-600"/>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {lang === 'es' ? 'No se pudo aceptar' : "Couldn't accept"}
            </h1>
            <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
            <Link href="/dashboard">
              <Button variant="secondary" fullWidth>
                {lang === 'es' ? 'Ir al panel' : 'Go to dashboard'}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

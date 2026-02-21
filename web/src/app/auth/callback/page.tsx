'use client';

import { useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase';

export default function AuthCallbackPage() {
  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createSupabaseClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        window.location.href = `/auth/login?error=${encodeURIComponent(error)}`;
        return;
      }

      if (code) {
        // Exchange code for session — stores in localStorage via our createClient
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError || !data.session) {
          window.location.href = '/auth/login?error=verification_failed';
          return;
        }

        // Check if user has a business already
        const { data: businesses } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', data.session.user.id)
          .limit(1);

        if (!businesses || businesses.length === 0) {
          window.location.href = '/onboarding';
        } else {
          window.location.href = '/dashboard';
        }
        return;
      }

      // No code — just check current session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/auth/login';
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <p className="text-sm text-gray-500">Verificando...</p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/i18n/LangProvider';

interface OAuthButtonsProps {
  mode?: 'login' | 'register';
}

export function OAuthButtons({ mode = 'login' }: OAuthButtonsProps) {
  const { t } = useLang();
  const supabase = createSupabaseClient();
  const [loading, setLoading] = useState<string | null>(null);

  const signInWith = async (provider: 'google' | 'apple' | 'facebook') => {
    setLoading(provider);
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(null);
  };

  const label = mode === 'login' ? t.auth.oauth.continueWith : t.auth.oauth.registerWith;

  return (
    <div className="flex flex-col gap-3">
      {/* Google */}
      <Button
        variant="secondary"
        fullWidth
        loading={loading === 'google'}
        onClick={() => signInWith('google')}
        className="flex items-center gap-3"
      >
        <GoogleIcon />
        {label} Google
      </Button>

      {/* Apple */}
      <Button
        variant="secondary"
        fullWidth
        loading={loading === 'apple'}
        onClick={() => signInWith('apple')}
        className="flex items-center gap-3"
      >
        <AppleIcon />
        {label} Apple
      </Button>

      {/* Facebook */}
      <Button
        variant="secondary"
        fullWidth
        loading={loading === 'facebook'}
        onClick={() => signInWith('facebook')}
        className="flex items-center gap-3"
      >
        <FacebookIcon />
        {label} Facebook
      </Button>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 814 1000">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 134.4-317.3 266.5-317.3 99.4 0 173.3 65.8 233.5 65.8 56.4 0 144.1-69.9 216.9-69.9 33.9 0 108.2 12.8 162.1 64.4zM617.3 174.3c-30.8 34.9-86.9 61.7-135.1 61.7-7.7 0-15.4-.6-22.4-1.9 1.3-47.6 22.4-96.8 56.3-130.5 34.6-34.9 90.7-61 135.1-61 6.4 0 12.8.6 19.2 1.3-1.3 50.2-20.7 99.4-53.1 130.4z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

'use client';

export const dynamic = 'force-dynamic';

import { useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';
import {
  OnboardingScreen,
  type OnboardingData,
  type PickLogoResult,
} from '@amixos/shared/screens/onboarding/OnboardingScreen';
import { useLang } from '@/i18n/LangProvider';

export default function OnboardingPage() {
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.onboarding;

  // Hidden file input + a promise we resolve when the user picks a file
  // (or cancels). The shared screen calls handlePickLogo() and awaits the
  // resulting URL — we trigger the input click and resolve on change.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingResolveRef = useRef<((r: PickLogoResult) => void) | null>(null);

  const handlePickLogo = (): Promise<PickLogoResult> => {
    return new Promise<PickLogoResult>((resolve) => {
      if (!inputRef.current) {
        resolve({ error: t.logo.uploadError });
        return;
      }
      pendingResolveRef.current = resolve;
      inputRef.current.value = ''; // allow picking the same file twice
      inputRef.current.click();
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    if (!resolve) return;

    const file = e.target.files?.[0];
    if (!file) {
      resolve(null); // cancelled
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      resolve({ error: t.logo.sizeError });
      return;
    }

    // The cookie/SSR client returns the session from cookies but doesn't load
    // it into the in-memory session that supabase-js uses to set the storage
    // Authorization header — so storage uploads go out anonymous and the logos
    // RLS policy (`auth.uid() is not null`) denies them. A global Authorization
    // header doesn't help: supabase-js overrides it with its own resolver.
    // Fix: a dedicated client with the session set via setSession(), so its
    // resolver returns the real user token. (Isolated storageKey so it doesn't
    // collide with the app's auth state.)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      resolve({ error: t.page.finishGenericError });
      return;
    }
    const uploadClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'amixos-logo-upload' } },
    );
    const setRes = await uploadClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    // TEMP DIAGNOSTIC — decode the token + server-validate it so we can see why
    // auth.uid() is null. Remove once the upload works.
    try {
      const claims = JSON.parse(atob(session.access_token.split('.')[1]));
      const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sessUrlRef = /https?:\/\/([^.]+)\./.exec(envUrl || '')?.[1];
      const { data: u, error: ue } = await uploadClient.auth.getUser();
      console.log('[logo-diag]', {
        envUrlRef: sessUrlRef,
        tokenIssuer: claims.iss,
        role: claims.role,
        sub: claims.sub?.slice(0, 8),
        exp: new Date(claims.exp * 1000).toISOString(),
        now: new Date().toISOString(),
        expired: claims.exp * 1000 < Date.now(),
        setSessionErr: setRes.error?.message,
        uploadClientUserId: u?.user?.id?.slice(0, 8),
        uploadClientUserErr: ue?.message,
      });
    } catch (e) {
      console.log('[logo-diag] decode failed', e);
    }

    const ext = file.name.split('.').pop();
    const path = `logos/${Date.now()}.${ext}`;

    const { error: uploadError } = await uploadClient.storage
      .from('business-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error('Logo upload error:', uploadError);
      resolve({ error: uploadError.message || t.logo.uploadError });
      return;
    }

    const { data } = supabase.storage.from('business-assets').getPublicUrl(path);
    resolve({ url: data.publicUrl });
  };

  const handleFinish = async (data: OnboardingData) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        window.location.href = '/auth/login';
        return { ok: true as const };
      }

      // Create the business
      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: data.businessName,
          service_type: data.serviceType,
          address: data.address,
          city: data.city,
          state: data.state,
          postal_code: data.postalCode,
          country: data.country,
          logo_url: data.logoUrl,
          operating_hours: data.operatingHours,
        })
        .select()
        .single();

      if (bizError) {
        console.error('Business insert error:', bizError);
        return { ok: false as const, error: `${t.page.bizCreateError}: ${bizError.message}` };
      }

      // Add owner as a business member
      const { error: memberError } = await supabase.from('business_members').insert({
        business_id: business.id,
        user_id: user.id,
        role: 'owner',
      });
      if (memberError) console.warn('Member insert warning:', memberError.message);

      // Activate the industry-recommended modules the user kept enabled.
      if (data.features.length > 0) {
        const { error: modulesError } = await supabase.from('business_modules').insert(
          data.features.map((key) => ({ business_id: business.id, module_key: key })),
        );
        if (modulesError) console.warn('Modules insert warning:', modulesError.message);
      }

      // Hard redirect so SSR session cookies are read fresh on the next page.
      window.location.href = '/dashboard';
      return { ok: true as const };
    } catch (err: any) {
      console.error('Finish error:', err);
      return { ok: false as const, error: err?.message || t.page.finishGenericError };
    }
  };

  return (
    <>
      <OnboardingScreen onPickLogo={handlePickLogo} onFinish={handleFinish} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}

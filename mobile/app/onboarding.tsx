import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth/store';
import { useLang } from '@/lib/i18n/LangProvider';
import {
  OnboardingScreen,
  type OnboardingData,
  type PickLogoResult,
} from '@amixos/shared/screens/onboarding/OnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();
  // ?adding=1 → the user already has a business and is creating another (from
  // the switcher). Show a "Cancel" escape instead of "Sign out" so they aren't
  // trapped in onboarding.
  const { adding } = useLocalSearchParams<{ adding?: string }>();
  const supabase = createSupabaseClient();
  const { t: full } = useLang();
  const t = full.onboarding;

  const handlePickLogo = async (): Promise<PickLogoResult> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { error: t.logo.uploadError };

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled) return null;

    const asset = result.assets?.[0];
    if (!asset) return null;

    // Enforce ~2MB limit when fileSize is reported (some platforms omit it).
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      return { error: t.logo.sizeError };
    }

    try {
      // Storage uploads need the user's token in the client's in-memory
      // session (supabase-js sets the Authorization header from there and
      // overrides any global header). A dedicated client with setSession()
      // guarantees the token is sent, else the logos RLS denies it as anon.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: t.page.finishGenericError };
      const uploadClient = createClient(
        process.env.EXPO_PUBLIC_SUPABASE_URL!,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'amixos-logo-upload' } },
      );
      await uploadClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      // Read the file as an ArrayBuffer for upload to Supabase Storage.
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `logos/${Date.now()}.${ext}`;
      const contentType = asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const { error: uploadError } = await uploadClient.storage
        .from('business-assets')
        .upload(path, arrayBuffer, { upsert: true, contentType });

      if (uploadError) {
        console.error('Logo upload error:', uploadError);
        return { error: uploadError.message || t.logo.uploadError };
      }

      const { data } = supabase.storage.from('business-assets').getPublicUrl(path);
      return { url: data.publicUrl };
    } catch (err: any) {
      console.error('Logo upload error:', err);
      return { error: err?.message || t.logo.uploadError };
    }
  };

  const handleFinish = async (data: OnboardingData) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace('/auth/login');
        return { ok: true as const };
      }

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

      // Pull the new business into the auth store before navigating —
      // otherwise the route gate still sees business: null from the
      // SIGNED_IN-time fetch and bounces us back to /onboarding.
      await useAuthStore.getState().refetchBusiness();

      // Make the just-created business the active workspace. Harmless for the
      // first business; for additional ones it switches the app's data context.
      useAuthStore.getState().setActiveBusiness(business.id);

      router.replace('/(tabs)');
      return { ok: true as const };
    } catch (err: any) {
      console.error('Finish error:', err);
      return { ok: false as const, error: err?.message || t.page.finishGenericError };
    }
  };

  // Pending invites for this email — the user may be here BECAUSE someone
  // invited them (account created before the invite existed). Requires
  // migration 129 (my_pending_invites RPC).
  const [pendingInvites, setPendingInvites] = useState<
    { token: string; businessName: string; role: string; businessId: string }[]
  >([]);
  useEffect(() => {
    supabase
      .rpc('my_pending_invites')
      .then(({ data }: { data: { token: string; business_id: string; business_name: string; role: string }[] | null }) => {
        setPendingInvites((data ?? []).map((r) => ({
          token: r.token,
          businessId: r.business_id,
          businessName: r.business_name,
          role: r.role,
        })));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const acceptInvite = async (token: string): Promise<string | null> => {
    const { error } = await supabase.rpc('accept_invite', { invite_token: token });
    if (error) return error.message;
    const inv = pendingInvites.find((i) => i.token === token);
    await useAuthStore.getState().refetchBusiness();
    if (inv) useAuthStore.getState().setActiveBusiness(inv.businessId);
    router.replace('/(tabs)');
    return null;
  };

  return (
    <OnboardingScreen
      onPickLogo={handlePickLogo}
      onFinish={handleFinish}
      onLogout={() => { void useAuthStore.getState().logout(); }}
      onCancel={adding ? () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); } : undefined}
      pendingInvites={pendingInvites}
      onAcceptInvite={acceptInvite}
    />
  );
}

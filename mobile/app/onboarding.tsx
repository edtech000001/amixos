import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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
      // Ensure the auth session is hydrated so the storage request carries the
      // user's token (else the logos RLS policy denies the anonymous upload).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: t.page.finishGenericError };

      // Read the file as an ArrayBuffer for upload to Supabase Storage.
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `logos/${Date.now()}.${ext}`;
      const contentType = asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const { error: uploadError } = await supabase.storage
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

      router.replace('/(tabs)');
      return { ok: true as const };
    } catch (err: any) {
      console.error('Finish error:', err);
      return { ok: false as const, error: err?.message || t.page.finishGenericError };
    }
  };

  return <OnboardingScreen onPickLogo={handlePickLogo} onFinish={handleFinish} />;
}

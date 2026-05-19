import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Check, X, ArrowRight } from 'lucide-react-native';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';
import { Button } from '@amixos/shared/ui';
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

export default function AceptarInvitacionPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { user, refetchBusiness, setActiveBusiness } = useApp();
  const { locale } = useLang();
  const lang: 'es' | 'en' = locale === 'es' ? 'es' : 'en';

  const [status, setStatus] = useState<'loading' | 'need_login' | 'ready' | 'error' | 'accepted' | 'accepting'>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus('error');
        setErrorMsg('Missing token');
        return;
      }
      if (!user) {
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
        setErrorMsg(lang === 'es' ? 'Invitación no encontrada, expirada, o para otra cuenta.' : 'Invite not found, expired, or for a different account.');
        return;
      }
      setInvite(row);
      setStatus(row.accepted_at ? 'accepted' : 'ready');
    })();
  }, [token, user, supabase, lang]);

  const accept = async () => {
    if (!invite) return;
    setStatus('accepting');
    const { error } = await supabase.rpc('accept_invite', { invite_token: token });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }
    setStatus('accepted');
    await refetchBusiness();
    setActiveBusiness(invite.business_id);
    setTimeout(() => router.replace('/dashboard'), 800);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-6">
        <View className="bg-white rounded-3xl border border-gray-100 max-w-md w-full p-8">
          {status === 'loading' && (
            <View className="py-10 items-center">
              <View className="flex-row gap-1">{[0,1,2].map(i => <View key={i} className="w-2 h-2 rounded-full bg-primary" />)}</View>
            </View>
          )}

          {status === 'need_login' && (
            <View className="items-center">
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                <Building2 size={24} color="#4F46E5"/>
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-2 text-center">
                {lang === 'es' ? 'Inicia sesión para aceptar' : 'Sign in to accept'}
              </Text>
              <Text className="text-sm text-gray-500 mb-6 text-center">
                {lang === 'es' ? 'Inicia sesión o crea una cuenta para aceptar esta invitación.' : 'Log in or create an account to accept this invitation.'}
              </Text>
              <View className="w-full">
                <Button onPress={() => router.push(`/auth/login?next=/invitacion/${token}`)} fullWidth>
                  {lang === 'es' ? 'Iniciar sesión' : 'Log in'}
                </Button>
              </View>
              <Pressable onPress={() => router.push(`/auth/register?next=/invitacion/${token}`)} className="mt-3">
                <Text className="text-sm text-primary font-semibold">
                  {lang === 'es' ? 'Crear cuenta' : 'Create account'}
                </Text>
              </Pressable>
            </View>
          )}

          {(status === 'ready' || status === 'accepting') && invite && (
            <View className="items-center">
              <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                <Building2 size={24} color="#4F46E5"/>
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-1 text-center">
                {lang === 'es' ? 'Te han invitado a' : "You've been invited to"}
              </Text>
              <Text className="text-lg font-semibold text-primary mb-1">{invite.business_name}</Text>
              <Text className="text-sm text-gray-500 mb-6">
                {lang === 'es' ? 'Rol: ' : 'Role: '}<Text className="font-semibold">{ROLE_LABELS[invite.role][lang]}</Text>
              </Text>
              <View className="w-full">
                <Button onPress={accept} loading={status === 'accepting'} fullWidth>
                  {lang === 'es' ? 'Aceptar invitación' : 'Accept invitation'}
                </Button>
              </View>
            </View>
          )}

          {status === 'accepted' && invite && (
            <View className="items-center">
              <View className="w-14 h-14 rounded-2xl bg-emerald-100 items-center justify-center mb-4">
                <Check size={24} color="#059669"/>
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-2">
                {lang === 'es' ? '¡Bienvenido!' : 'Welcome!'}
              </Text>
              <Text className="text-sm text-gray-500 text-center">
                {lang === 'es' ? `Ahora eres parte de ${invite.business_name}.` : `You're now part of ${invite.business_name}.`}
              </Text>
            </View>
          )}

          {status === 'error' && (
            <View className="items-center">
              <View className="w-14 h-14 rounded-2xl bg-red-100 items-center justify-center mb-4">
                <X size={24} color="#DC2626"/>
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-2 text-center">
                {lang === 'es' ? 'No se pudo aceptar' : "Couldn't accept"}
              </Text>
              <Text className="text-sm text-gray-500 mb-6 text-center">{errorMsg}</Text>
              <View className="w-full">
                <Button variant="secondary" onPress={() => router.replace('/dashboard')} fullWidth>
                  {lang === 'es' ? 'Ir al panel' : 'Go to dashboard'}
                </Button>
              </View>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

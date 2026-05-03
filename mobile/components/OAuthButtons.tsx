import { useState } from 'react';
import { View, Pressable, Platform, Alert, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { signInWithApple, signInWithGoogle, signInWithFacebook, type OAuthResult } from '@/lib/oauth';

export interface OAuthButtonsProps {
  onSuccess: () => void;
}

type Provider = 'google' | 'apple' | 'facebook';

export function OAuthButtons({ onSuccess }: OAuthButtonsProps) {
  const [busy, setBusy] = useState<Provider | null>(null);

  const handle = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    try {
      const result =
        provider === 'apple'
          ? await signInWithApple()
          : provider === 'google'
            ? await signInWithGoogle()
            : await signInWithFacebook();
      handleResult(result, provider);
    } finally {
      setBusy(null);
    }
  };

  const handleResult = (result: OAuthResult, provider: Provider) => {
    if (result.ok) return onSuccess();
    if (result.reason === 'cancelled') return;
    if (result.reason === 'apple-not-available') {
      Alert.alert('Apple Sign In', 'Not available on this device.');
      return;
    }
    if (result.reason === 'provider-not-configured') {
      Alert.alert(
        `${labels[provider]} sign-in`,
        `Configure the ${labels[provider]} provider in Supabase → Authentication → Providers, then try again.`,
      );
      return;
    }
    Alert.alert('Sign-in failed', result.message ?? 'Please try again.');
  };

  const showApple = Platform.OS === 'ios';

  return (
    <View className="w-full flex-row" style={{ gap: 12 }}>
      <OAuthIconButton
        provider="google"
        loading={busy === 'google'}
        disabled={!!busy && busy !== 'google'}
        onPress={() => handle('google')}
      />
      {showApple ? (
        <OAuthIconButton
          provider="apple"
          loading={busy === 'apple'}
          disabled={!!busy && busy !== 'apple'}
          onPress={() => handle('apple')}
        />
      ) : null}
      <OAuthIconButton
        provider="facebook"
        loading={busy === 'facebook'}
        disabled={!!busy && busy !== 'facebook'}
        onPress={() => handle('facebook')}
      />
    </View>
  );
}

const labels: Record<Provider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
};

interface OAuthIconButtonProps {
  provider: Provider;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}

function OAuthIconButton({ provider, loading, disabled, onPress }: OAuthIconButtonProps) {
  const isApple = provider === 'apple';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className="flex-1"
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <View
        className="w-full items-center justify-center rounded-2xl border h-14"
        style={{
          backgroundColor: isApple ? '#000000' : '#FFFFFF',
          borderColor: isApple ? '#000000' : '#E5E7EB',
        }}
      >
        {loading ? (
          <ActivityIndicator color={isApple ? '#FFFFFF' : '#374151'} />
        ) : (
          <ProviderIcon provider={provider} />
        )}
      </View>
    </Pressable>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === 'google') {
    return (
      <Svg width={22} height={22} viewBox="0 0 18 18">
        <Path
          fill="#4285F4"
          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        />
        <Path
          fill="#34A853"
          d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        />
        <Path
          fill="#FBBC05"
          d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
        />
        <Path
          fill="#EA4335"
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
        />
      </Svg>
    );
  }
  if (provider === 'apple') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          fill="#FFFFFF"
          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        fill="#1877F2"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </Svg>
  );
}

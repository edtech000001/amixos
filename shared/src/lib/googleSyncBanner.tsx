// Native view for the Google-Contacts sync banner.
// State and queue live in ./googleSyncBannerCore; the web view is in
// ./googleSyncBanner.web.tsx. Keep the two views in step — they are the same
// banner, and only the primitives differ.

import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { CheckCircle2, AlertCircle, X } from 'lucide-react-native';
import { useGoogleSyncBanner } from './googleSyncBannerCore';

export * from './googleSyncBannerCore';

export function GoogleSyncBanner() {
  const { status, dismiss, cancelImport } = useGoogleSyncBanner();
  if (status.kind === 'idle') return null;

  const palette =
    status.kind === 'success'
      ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: '#059669' }
      : status.kind === 'error'
        ? { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '#DC2626' }
        : { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: '#2563EB' };

  const remaining = status.kind === 'syncing' ? status.total - status.done : 0;
  const verb =
    status.kind !== 'syncing'
      ? ''
      : status.mode === 'delete'
        ? 'Limpiando de Google Contacts'
        : status.mode === 'update'
          ? 'Actualizando en Google Contacts'
          : 'Agregando a Google Contacts';
  const message =
    status.kind === 'syncing'
      ? `${verb} · ${status.done} de ${status.total} (${remaining} restante${remaining !== 1 ? 's' : ''})`
      : status.message;

  const Icon = status.kind === 'success' ? CheckCircle2 : status.kind === 'error' ? AlertCircle : null;

  return (
    <View className={`${palette.bg} border ${palette.border} flex-row items-center px-4 py-2.5 gap-2`}>
      {status.kind === 'syncing' ? (
        <ActivityIndicator size="small" color={palette.icon} />
      ) : Icon ? (
        <Icon size={16} color={palette.icon} />
      ) : null}
      <Text className={`flex-1 text-xs font-medium ${palette.text}`} numberOfLines={2}>
        {message}
      </Text>
      {status.kind === 'syncing' ? (
        <Pressable
          onPress={cancelImport}
          className="px-2 py-1 rounded-md active:bg-black/5"
          accessibilityLabel="Cancel sync"
        >
          <Text className={`text-xs font-semibold ${palette.text}`}>Cancelar</Text>
        </Pressable>
      ) : (
        <Pressable onPress={dismiss} className="p-1 rounded-md active:bg-black/5" accessibilityLabel="Dismiss">
          <X size={14} color={palette.icon} />
        </Pressable>
      )}
    </View>
  );
}

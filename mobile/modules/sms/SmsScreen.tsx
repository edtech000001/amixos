import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useAuthStore } from '@/lib/auth/store';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { can } from '@amixos/shared/lib/permissions';
import { fetchAll } from '@amixos/shared/lib/supabaseFetch';
import {
  SmsModuleScreen,
  type SmsStatus,
  type SmsClientOption,
  type SmsConnectInput,
  type SmsSendInput,
} from '@amixos/shared/screens/modules/SmsModuleScreen';

interface ApiResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

export default function SmsScreen() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const currentRole = useAuthStore(s => s.currentRole);
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [clients, setClients] = useState<SmsClientOption[]>([]);

  const canConfigure = can.manageIntegrations(currentRole);

  const api = useCallback(async (path: string, init?: RequestInit): Promise<ApiResult> => {
    const jwt = await getJwt();
    if (!jwt) return { ok: false, message: 'network_error' };
    try {
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, ...(init?.headers ?? {}) },
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: unknown };
      return { ok: res.ok && json.success !== false, message: json.message, data: json.data };
    } catch {
      return { ok: false, message: 'network_error' };
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!business) return;
    setLoadingStatus(true);
    const r = await api(`/api/v1/sms/status?business_id=${business.id}`);
    if (r.ok) setStatus(r.data as SmsStatus);
    setLoadingStatus(false);
  }, [api, business]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!business) return;
    const businessId = business.id;
    fetchAll<{ id: string; first_name: string; last_name: string; phone_cell: string | null; phone: string | null }>(
      (from, to) =>
        supabase
          .from('clients')
          .select('id, first_name, last_name, phone_cell, phone')
          .eq('business_id', businessId)
          .order('first_name')
          .range(from, to),
    ).then(rows =>
      setClients(
        rows.map(c => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          phone: c.phone_cell ?? c.phone,
        })),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  const onConnect = async (input: SmsConnectInput) => {
    if (!business) return { ok: false, error: 'generic' };
    const r = await api('/api/v1/sms/connect', {
      method: 'POST',
      body: JSON.stringify({
        business_id: business.id,
        provider: input.provider,
        from_number: input.fromNumber,
        credentials: input.credentials,
      }),
    });
    if (r.ok) await loadStatus();
    return { ok: r.ok, error: r.message };
  };

  const onDisconnect = async () => {
    if (!business) return { ok: false, error: 'generic' };
    const r = await api('/api/v1/sms/disconnect', {
      method: 'POST',
      body: JSON.stringify({ business_id: business.id }),
    });
    if (r.ok) await loadStatus();
    return { ok: r.ok, error: r.message };
  };

  const onSend = async (input: SmsSendInput) => {
    if (!business) return { ok: false, error: 'generic' };
    const r = await api('/api/v1/sms/send', {
      method: 'POST',
      body: JSON.stringify({
        business_id: business.id,
        to: input.to,
        body: input.body,
        client_id: input.clientId,
      }),
    });
    return { ok: r.ok, error: r.message };
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <SmsModuleScreen
        status={status}
        loadingStatus={loadingStatus}
        clients={clients}
        canConfigure={canConfigure}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSend={onSend}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}

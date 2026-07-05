import { useMemo } from 'react';
import {
  useAssistantCore,
  type AssistantFetcher,
} from '@amixos/shared/assistant/useAssistantCore';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { useLang } from '@/lib/i18n/LangProvider';

// Mobile glue for the shared Ami state machine: builds the fetcher from the
// app's API helpers ({success,data} envelope, Bearer JWT) and hands it to
// useAssistantCore. The app's language rides on every request so Ami
// defaults to it.
export function useAssistant(businessId: string | null) {
  const { locale } = useLang();
  const fetcher = useMemo<AssistantFetcher>(
    () => ({
      post: async <T,>(path: string, body: unknown): Promise<T> => {
        const jwt = await getJwt();
        const res = await fetch(`${getApiBaseUrl()}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ ...(body as object), locale }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
        }
        return json.data as T;
      },
    }),
    [locale],
  );

  return useAssistantCore(businessId, fetcher);
}

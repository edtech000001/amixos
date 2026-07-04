'use client';

import { useMemo } from 'react';
import {
  useAssistantCore,
  type AssistantFetcher,
} from '@amixos/shared/assistant/useAssistantCore';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';

/**
 * Web wiring for the platform-agnostic Ami chat core: builds the fetcher
 * from the web API helpers and hands it to useAssistantCore.
 */
export function useAssistant(businessId: string | null) {
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
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
        return json.data as T;
      },
    }),
    [],
  );

  return useAssistantCore(businessId, fetcher);
}

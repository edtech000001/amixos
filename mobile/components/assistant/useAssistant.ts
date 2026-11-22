import { useMemo, useRef } from 'react';
import {
  useAssistantCore,
  type AssistantFetcher,
} from '@amixos/shared/assistant/useAssistantCore';
import type { AssistantClientAction } from '@amixos/shared/assistant/types';
import { usePathname } from 'expo-router';
import { getApiBaseUrl, getJwt } from '@/lib/apiClient';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/lib/i18n/LangProvider';

// Mobile glue for the shared Ami state machine: builds the fetcher from the
// app's API helpers ({success,data} envelope, Bearer JWT) and hands it to
// useAssistantCore. The app's language rides on every request so Ami
// defaults to it.
export function useAssistant(
  businessId: string | null,
  onNavigate?: (a: Extract<AssistantClientAction, { type: 'navigate' }>) => void,
) {
  const { t: full, locale } = useLang();
  const { business, user, activeLocationId } = useApp();
  // The open screen rides along so Ami knows what "this job" means. A ref
  // keeps the fetcher stable across navigation.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
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
          body: JSON.stringify({ ...(body as object), locale, screen_path: pathRef.current, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
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

  // Lets Ami's confirmed actions run through the app's own shared helpers.
  const local = useMemo(() => {
    if (!business) return undefined;
    const jt = full.dashboard.jobs.new;
    const a = full.dashboard.assistant;
    return {
      supabase: createSupabaseClient(),
      businessId: business.id,
      userId: user?.id ?? null,
      locationId: activeLocationId ?? null,
      business,
      labels: {
        itemTypes: { labor: jt.itemTypeLabor, material: jt.itemTypeMaterial, equipment: jt.itemTypeEquipment, other: jt.itemTypeOther },
        notesLabel: full.dashboard.sidebar.trabajos,
        payMethods: full.dashboard.invoices.payments.methods as Record<string, string>,
      },
      messages: { undone: a.undone, nothingToUndo: a.nothingToUndo },
    };
  }, [business, user?.id, activeLocationId, full]);

  return useAssistantCore(businessId, fetcher, onNavigate, local);
}

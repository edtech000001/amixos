// Is the active business scheduled for deletion? (migrations 230/232)
//
// Lifted out of the banner components so the LAYOUT owns the answer: on mobile
// the top banner stack is absolutely positioned and the content below is
// pushed down by a measured offset, so the layout has to know a banner is
// coming before it renders. Both platforms now read this one hook and pass the
// date down, which also keeps the web/native banners from drifting apart.
//
// Reads business_deletions directly: 232 makes the row readable by any member
// of that business, and it carries nothing sensitive (a date and who asked).

import { useCallback, useEffect, useState } from 'react';

// Loosely typed on purpose: web and mobile each build their own Supabase
// client, and pinning the generated Database generics here makes tsc walk the
// whole schema type ("Type instantiation is excessively deep").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface MinimalClient { from(table: string): any }

export interface BusinessDeletion {
  /** ISO date the business gets purged, or null when none is pending. */
  purgeAfter: string | null;
  /** Re-read after the owner cancels the deletion, so the banner goes away
   *  without a page reload — and stays if the cancel silently failed. */
  refresh: () => void;
}

export function useBusinessDeletionDate(
  client: MinimalClient,
  businessId: string | null | undefined
): BusinessDeletion {
  const [purgeAfter, setPurgeAfter] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!businessId) { setPurgeAfter(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await client
        .from('business_deletions')
        .select('purge_after')
        .eq('business_id', businessId)
        .maybeSingle();
      // Table missing (migration 230 not run) → null → no banner. Never invent
      // a deletion warning out of an error.
      if (!cancelled) {
        setPurgeAfter((data as { purge_after?: string } | null)?.purge_after ?? null);
      }
    })();
    return () => { cancelled = true; };
    // `client` is recreated per render in some callers — key off the id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, nonce]);

  return { purgeAfter, refresh: useCallback(() => setNonce(n => n + 1), []) };
}

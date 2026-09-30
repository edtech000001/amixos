// "Copy prices to other companies" — mirrors this business's price sheet onto
// other businesses the user runs (migration 242, public.sync_price_sheet).
// The database does the work and the permission check: the caller must be
// owner/admin of BOTH businesses. What's copied and how client prices are
// re-matched is documented on the SQL function.

import type { Role } from './permissions';

type Supa = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type ClientMatchHow = 'email' | 'phone' | 'name' | 'company' | 'none' | 'ambiguous';

export interface PriceSyncClientPrice {
  item: string;
  client: string;
  rate: number | null;
  how: ClientMatchHow;
  candidates: number;
}

export interface PriceSyncReport {
  preview: boolean;
  updated: number;
  added: number;
  removed: number;
  clientPrices: PriceSyncClientPrice[];
}

export interface PriceSyncTarget {
  id: string;
  name: string;
}

const ADMIN_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

/** Businesses this one's prices can be copied to: every OTHER business where
 *  the user is owner/admin — and only when they're owner/admin HERE too
 *  (the SQL function enforces the same rule). Empty = hide the action. */
export function priceSyncTargets(
  businesses: { id: string; name: string | null }[],
  roles: Record<string, Role | string | null | undefined>,
  currentBusinessId: string | null | undefined,
): PriceSyncTarget[] {
  if (!currentBusinessId || !ADMIN_ROLES.has(String(roles[currentBusinessId] ?? ''))) return [];
  return businesses
    .filter(b => b.id !== currentBusinessId && ADMIN_ROLES.has(String(roles[b.id] ?? '')))
    .map(b => ({ id: b.id, name: b.name ?? '' }));
}

/** Preview (nothing written) or run a sync from source → target. */
export async function syncPriceSheet(
  supabase: Supa,
  sourceId: string,
  targetId: string,
  preview: boolean,
): Promise<{ ok: true; report: PriceSyncReport } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('sync_price_sheet', {
    p_source: sourceId,
    p_target: targetId,
    p_preview: preview,
  });
  if (error || !data) return { ok: false, error: error?.message ?? 'no data' };
  const r = data as Partial<PriceSyncReport>;
  return {
    ok: true,
    report: {
      preview: !!r.preview,
      updated: Number(r.updated) || 0,
      added: Number(r.added) || 0,
      removed: Number(r.removed) || 0,
      clientPrices: Array.isArray(r.clientPrices) ? r.clientPrices : [],
    },
  };
}

/** Client prices that did / would not carry over. */
export const skippedClientPrices = (r: PriceSyncReport) =>
  r.clientPrices.filter(c => c.how === 'none' || c.how === 'ambiguous');

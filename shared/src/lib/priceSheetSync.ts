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

// ── Auto-sync (migration 259) ───────────────────────────────────────────────
// A target can follow ONE source and is then kept an exact mirror by database
// triggers. The database owns every rule (owner/admin of both to turn on,
// either to turn off, no chains, links dropped when the person who turned it
// on loses admin) — the app only shows the state and offers the switches.

export interface PriceAutosyncLink {
  sourceId: string;
  targetId: string;
}

type SupaFull = Supa & { from: (t: string) => any };

/** Every link the user can see (their businesses on either side). */
export async function fetchAutosyncLinks(supabase: SupaFull): Promise<PriceAutosyncLink[]> {
  const { data } = await supabase.from('price_sheet_autosync').select('source_business_id, target_business_id');
  return ((data ?? []) as { source_business_id: string; target_business_id: string }[])
    .map(r => ({ sourceId: r.source_business_id, targetId: r.target_business_id }));
}

export async function setPriceAutosync(
  supabase: Supa,
  sourceId: string,
  targetId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('set_price_sheet_autosync', {
    p_source: sourceId,
    p_target: targetId,
    p_enabled: enabled,
  });
  return error ? { ok: false, error: error.message ?? 'error' } : { ok: true };
}

/** Why a business can't be copied to / auto-synced from `sourceId`, or null. */
export function autosyncBlock(
  links: PriceAutosyncLink[],
  sourceId: string,
  targetId: string,
): { kind: 'follows'; otherSourceId: string } | { kind: 'isSource' } | null {
  const follows = links.find(l => l.targetId === targetId);
  if (follows && follows.sourceId !== sourceId) return { kind: 'follows', otherSourceId: follows.sourceId };
  if (links.some(l => l.sourceId === targetId)) return { kind: 'isSource' };
  return null;
}

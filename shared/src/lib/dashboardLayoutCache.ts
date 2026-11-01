// Device copy of the user's dashboard layout (user_dashboard_layouts), per
// user + business. The dashboard used to render the DEFAULT layout until the
// layout query returned, then rearrange every card a moment later. Painting
// from this copy first keeps the first frame in the user's own order; the
// query still refreshes it. `amixos_cache_` prefix → wiped on sign-out.

import { kvGet, kvSet } from './kvStore';

const keyFor = (userId: string, businessId: string) => `amixos_cache_dash_layout_${userId}_${businessId}`;

/** The cached layout, `null` for "cached: default layout", or undefined
 *  when nothing is cached yet. */
export async function readCachedDashLayout<T>(userId: string, businessId: string): Promise<T | null | undefined> {
  const raw = await kvGet(keyFor(userId, businessId)).catch(() => null);
  if (raw == null) return undefined;
  try { return JSON.parse(raw) as T | null; } catch { return undefined; }
}

export function writeCachedDashLayout(userId: string, businessId: string, layout: unknown): void {
  void kvSet(keyFor(userId, businessId), JSON.stringify(layout ?? null)).catch(() => {});
}

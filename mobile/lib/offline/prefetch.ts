// Proactive offline warming.
//
// `loadCached` is READ-THROUGH: a screen's data only lands on disk after it's
// been fetched online at least once. Field crews need the job-form pickers
// (clients, crew, custom-field templates) to work with NO signal even on the
// FIRST offline open of the form — so this module fetches those reference lists
// while there's still a connection and writes them to the SAME cache keys the
// job form reads. When a tech opens the form offline, `loadCached`'s live fetch
// throws and falls back to these warmed copies.
//
// Scope is deliberately small: for a Field role, RLS already limits clients to
// those on their assigned jobs, so the warmed dataset is kilobytes, not the
// whole business. Price sheets are intentionally NOT warmed (owner's choice).

import { fetchAllById } from '@amixos/shared/lib/supabaseFetch';
import { createSupabaseClient } from '@/lib/supabase';
import { writeCached } from './cache';
import { isOnlineNow } from './network';

// Debounce: reconnect + foreground + mount can all fire close together; one warm
// per minute is plenty for reference data that changes slowly.
let lastWarm = 0;
const MIN_INTERVAL_MS = 60_000;

interface RawClient { id: string; first_name: string; last_name: string; company: string | null; city?: string; state?: string }
interface RawEmployee { id: string; first_name: string; last_name: string; role: string; show_in_roster?: boolean | null }
interface RawContact { id: string; client_id: string; name: string; role: string | null }

/**
 * Warm the offline cache for the job form's pickers. No-op when offline or when
 * called again within the debounce window. Keys MUST stay in sync with the
 * `loadCached` keys in `mobile/app/dashboard/trabajos/nuevo.tsx`.
 */
export async function prefetchForOffline(businessId: string): Promise<void> {
  if (!businessId || !isOnlineNow()) return;
  const now = Date.now();
  if (now - lastWarm < MIN_INTERVAL_MS) return;
  lastWarm = now;

  const supabase = createSupabaseClient();

  // Best-effort and independent: one failing read must not block the others, and
  // a partial warm still beats none. allSettled so nothing rejects the batch.
  // Keyset (by id) — offset .range() re-scans under RLS and is slow to warm
  // once a business has thousands of clients/contacts.
  await Promise.allSettled([
    fetchAllById<RawClient>((afterId, pageSize) => {
      let q = supabase.from('clients')
        .select('id, first_name, last_name, company, city, state')
        .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    })
      .then(rows => writeCached(`jobform_clients_${businessId}`, rows)),

    // employees_roster (view, migration 178): names-only roster readable by
    // every member, so the job-form picker cache warms for field crew too.
    // Fallback to the table (privileged roles) if the view is missing/stale,
    // so a good cache is never overwritten with an empty roster.
    (async () => {
      const fromTable = (table: string) =>
        fetchAllById<RawEmployee>((afterId, pageSize) => {
          let q = supabase.from(table)
            .select('id, first_name, last_name, role, show_in_roster')
            .eq('business_id', businessId).eq('active', true).order('id', { ascending: true }).limit(pageSize);
          if (afterId) q = q.gt('id', afterId);
          return q;
        });
      let rows: RawEmployee[] = [];
      try { rows = await fromTable('employees_roster'); } catch { /* view missing */ }
      if (rows.length === 0) rows = await fromTable('employees');
      await writeCached(`jobform_employees_${businessId}`, rows);
    })(),

    fetchAllById<RawContact>((afterId, pageSize) => {
      let q = supabase.from('client_contacts')
        .select('id, client_id, name, role')
        .eq('business_id', businessId).order('id', { ascending: true }).limit(pageSize);
      if (afterId) q = q.gt('id', afterId);
      return q;
    })
      .then(rows => writeCached(`jobform_contacts_${businessId}`, rows)),

    (async () => {
      const { data, error } = await supabase.from('job_field_templates')
        .select('*').eq('business_id', businessId).order('sort_order');
      if (error) throw error;
      await writeCached(`jobform_templates_${businessId}`, data ?? []);
    })(),
  ]);
}

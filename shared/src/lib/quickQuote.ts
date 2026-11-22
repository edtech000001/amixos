// Quick quote: a "maybe" job jotted down in seconds — client, what, price —
// saved as a normal Possible job (status 'posible', migration 041) so it lives
// with the client and can later be scheduled, turned into an estimate or
// cleared. The price becomes one line item; totals are exact (no rounding).

import type { SupabaseClient } from '@supabase/supabase-js';
import { daysSince } from './format';

/** Possible jobs older than this are flagged as stale on the list. */
export const POSSIBLE_STALE_DAYS = 30;

export function possibleAgeDays(createdAt: string | null | undefined): number {
  return createdAt ? daysSince(createdAt) : 0;
}

export async function createQuickQuote(
  supabase: SupabaseClient,
  q: { businessId: string; locationId: string | null; userId: string | null; clientId: string | null; title: string; price: number | null; notes: string },
): Promise<string> {
  const price = q.price && q.price > 0 ? q.price : null;
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      business_id: q.businessId,
      location_id: q.locationId,
      client_id: q.clientId,
      title: q.title.trim(),
      status: 'posible',
      priority: 'normal',
      created_by: q.userId,
      internal_notes: q.notes.trim() || null,
      ...(price ? { subtotal_amount: price, tax_amount: 0, total_amount: price } : {}),
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('insert failed');
  const id = (data as { id: string }).id;
  if (price) {
    const { error: itemErr } = await supabase
      .from('job_items')
      .insert({ job_id: id, description: q.title.trim(), quantity: 1, unit_price: price });
    // The job exists with its total; a missing line item is fixable on the job page.
    if (itemErr) console.warn('[quickQuote] line item not saved', itemErr.message);
  }
  return id;
}

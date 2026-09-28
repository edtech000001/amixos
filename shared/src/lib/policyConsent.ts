// Reading and writing policy acceptance (migration 239).
//
// Intentionally tolerant: a consent record is important, but a failure to READ
// one must never lock a paying user out of their business. Every read failure
// resolves to "nothing accepted", and the gate above it decides what to do —
// see the note on fetchAcceptedVersions.

import { POLICY_DOCS, POLICY_VERSIONS, type PolicyDoc } from '../legal/versions';

export type ConsentMethod = 'signup' | 'consent_screen' | 'update_prompt';

type MinimalClient = {
  from: (table: string) => any;
};

export interface AcceptanceRow {
  doc: PolicyDoc;
  version: string;
  accepted_at: string;
}

/**
 * Latest accepted version per document, as { privacy: '2026-09-22', … }.
 *
 * Returns an EMPTY map on any error rather than throwing. The caller must
 * therefore treat "empty" as "unknown", not as "definitely never accepted" —
 * the gate only ever uses this to decide whether to SHOW a screen, never to
 * revoke access, so the worst case is a prompt someone has seen before.
 */
export async function fetchAcceptedVersions(
  supabase: MinimalClient,
  userId: string,
): Promise<Partial<Record<PolicyDoc, string>>> {
  try {
    const { data, error } = await supabase
      .from('user_policy_acceptances')
      .select('doc, version, accepted_at')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false });

    if (error || !data) return {};

    const out: Partial<Record<PolicyDoc, string>> = {};
    for (const row of data as AcceptanceRow[]) {
      // Rows arrive newest-first, so the first sighting of a doc is its latest.
      if (!out[row.doc]) out[row.doc] = row.version;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Records acceptance of the CURRENT version of every document.
 *
 * Upserts on the unique (user_id, doc, version) index so a reinstall or a
 * second device cannot pile up duplicate rows for the same agreement — and
 * ignoreDuplicates keeps the ORIGINAL accepted_at, which is the date that
 * actually matters.
 *
 * Throws on failure. Unlike the read, this one the caller should notice: a
 * consent screen that silently fails to record leaves us worse off than not
 * showing it, because the user believes they have accepted.
 */
export async function recordAcceptance(
  supabase: MinimalClient,
  userId: string,
  opts: { method: ConsentMethod; scrolledToEnd: boolean; platform: 'web' | 'ios' | 'android' },
): Promise<void> {
  const rows = POLICY_DOCS.map((doc) => ({
    user_id: userId,
    doc,
    version: POLICY_VERSIONS[doc].version,
    method: opts.method,
    scrolled_to_end: opts.scrolledToEnd,
    platform: opts.platform,
  }));

  const { error } = await supabase
    .from('user_policy_acceptances')
    .upsert(rows, { onConflict: 'user_id,doc,version', ignoreDuplicates: true });

  if (error) throw error;
}

/** Fire-and-forget variant for the signup path, where the account has just
 *  been created and a failed insert must not block the user from reaching
 *  their dashboard. The consent gate catches anyone this misses. */
export function recordAcceptanceQuietly(
  supabase: MinimalClient,
  userId: string,
  opts: { method: ConsentMethod; scrolledToEnd: boolean; platform: 'web' | 'ios' | 'android' },
): void {
  void recordAcceptance(supabase, userId, opts).catch(() => {
    /* the gate is the backstop */
  });
}

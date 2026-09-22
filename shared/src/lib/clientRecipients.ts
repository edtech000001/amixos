// Who a client's email actually goes to.
//
// A client can have an email on file that should never be written to — the mail
// goes to a bookkeeper or office manager instead. `client_contacts
// .receives_email` (migration 220) marks those people, and this is the single
// place that rule is applied.
//
// It lives here rather than in each screen because SIX places send mail to a
// client: the invoice, the proposal, the client detail "Email" button, the map
// pin card, rentals, and the client-communications helper. Six copies of a
// precedence rule is six chances for one to be forgotten — which is exactly how
// a client who asked not to be emailed ends up emailed.

type Supa = { from: (table: string) => any };

export interface ClientRecipients {
  /** Addressed TO. Empty means there is nobody to send to — callers should not
   *  open a blank mail composer, they should say so. */
  to: string[];
  /** Copied. Only ever populated for invoice sends. */
  cc: string[];
}

/** Trim, drop blanks, and de-duplicate case-insensitively while keeping the
 *  first spelling seen — mail clients treat addresses case-insensitively but
 *  people notice when their own capitalisation is rewritten. */
function cleanEmails(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const e = (v ?? '').trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** The client's own address columns + their include flags (migration 231). */
export interface ClientEmailFields {
  email?: string | null;
  email_office?: string | null;
  email_home?: string | null;
  /** Migration 231. Absent (undefined) = the migration hasn't run → included. */
  email_office_included?: boolean | null;
  email_home_included?: boolean | null;
}

/**
 * The client's OWN addresses that should receive mail, in order.
 *
 * Only an explicit `false` excludes an address: a database without migration
 * 231 returns undefined for these columns, and an address nobody has opted out
 * of must still be written to.
 *
 * This says nothing about contact people — a contact flagged receives_email
 * still replaces this whole set, and cc_on_invoices contacts are still CC.
 */
export function clientOwnEmails(c: ClientEmailFields | null | undefined): string[] {
  if (!c) return [];
  const out: (string | null | undefined)[] = [];
  if (c.email_office_included !== false) out.push(c.email_office);
  if (c.email_home_included !== false) out.push(c.email_home);
  // The legacy single `email` column predates both flags, so it has no switch
  // of its own; it trails the two named fields.
  out.push(c.email);
  return cleanEmails(out);
}

/** The columns clientOwnEmails() needs — for .select() calls. */
export const CLIENT_EMAIL_SELECT =
  'email, email_office, email_home, email_office_included, email_home_included';

/** Drop the migration-231 columns from a payload — used to retry a write on a
 *  database that hasn't run it yet (42703 = undefined column). */
export function withoutEmailIncludeFlags<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload } as Record<string, unknown>;
  delete copy.email_office_included;
  delete copy.email_home_included;
  return copy as T;
}

/** True when a PostgREST error is "that column doesn't exist". */
export const isUndefinedColumn = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { code?: string }).code === '42703';

/**
 * Read a client's own mailable addresses, fresh.
 *
 * Senders call this at send time rather than trusting the screen's copy (a
 * user may have just added an address), and it degrades on a database that
 * hasn't run migration 231: 42703 = the flag columns don't exist yet, so it
 * retries with the plain address columns and treats both as included.
 */
export async function fetchClientOwnEmails(
  supabase: Supa,
  clientId: string | null | undefined,
): Promise<string[]> {
  if (!clientId) return [];
  const { data, error } = await (supabase.from('clients') as any)
    .select(CLIENT_EMAIL_SELECT).eq('id', clientId).maybeSingle();
  if (!error) return clientOwnEmails(data as ClientEmailFields | null);
  if ((error as { code?: string }).code !== '42703') return [];
  const { data: legacy } = await (supabase.from('clients') as any)
    .select('email, email_office, email_home').eq('id', clientId).maybeSingle();
  return clientOwnEmails(legacy as ClientEmailFields | null);
}

/**
 * Resolve the recipients for one client.
 *
 * @param clientEmail the client's OWN addresses (office + personal — pass both;
 *   a single string is still accepted). All of them are addressed, because a
 *   client who gave you two addresses expects mail at both: sending only to
 *   the office one quietly dropped the personal address, even when the office
 *   address was merely a CC contact's. Used only when no contact is flagged as
 *   the recipient.
 * @param opts.includeInvoiceCc true for invoice sends, which additionally copy
 *   contacts flagged cc_on_invoices. Other sends have no CC concept.
 *
 * Fails OPEN: if the contacts query errors (offline, RLS), the client's own
 * address is used. Silently sending nothing would be worse than sending to the
 * address that was already being used before this feature existed.
 */
export async function resolveClientRecipients(
  supabase: Supa,
  clientId: string | null | undefined,
  clientEmail: string | string[] | null | undefined,
  opts?: { includeInvoiceCc?: boolean },
): Promise<ClientRecipients> {
  const own = Array.isArray(clientEmail) ? clientEmail : [clientEmail];
  const fallback: ClientRecipients = { to: cleanEmails(own), cc: [] };
  if (!clientId) return fallback;

  const { data, error } = await supabase
    .from('client_contacts')
    .select('email, receives_email, cc_on_invoices')
    .eq('client_id', clientId)
    .not('email', 'is', null);
  if (error || !data) return fallback;

  const rows = data as { email: string | null; receives_email: boolean | null; cc_on_invoices: boolean | null }[];

  // A flagged contact with no usable address is ignored rather than counted —
  // otherwise a half-filled contact would make the client unreachable by
  // suppressing the client's own address and supplying nothing in its place.
  const to = cleanEmails(rows.filter(r => r.receives_email).map(r => r.email));
  const resolvedTo = to.length ? to : cleanEmails(own);

  if (!opts?.includeInvoiceCc) return { to: resolvedTo, cc: [] };

  const toKeys = new Set(resolvedTo.map(e => e.toLowerCase()));
  const cc = cleanEmails(rows.filter(r => r.cc_on_invoices).map(r => r.email))
    .filter(e => !toKeys.has(e.toLowerCase()));
  return { to: resolvedTo, cc };
}

/** `a@x.com,b@y.com` for a mailto target, or '' when there is nobody. */
export function joinRecipients(list: string[]): string {
  return list.join(',');
}

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

/**
 * Resolve the recipients for one client.
 *
 * @param clientEmail the client's own address — used only when no contact is
 *   flagged as the recipient.
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
  clientEmail: string | null | undefined,
  opts?: { includeInvoiceCc?: boolean },
): Promise<ClientRecipients> {
  const fallback: ClientRecipients = { to: cleanEmails([clientEmail]), cc: [] };
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
  const resolvedTo = to.length ? to : cleanEmails([clientEmail]);

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

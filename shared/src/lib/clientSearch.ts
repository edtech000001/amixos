// Shared search logic for the Clientes list — used by both the list screen
// components (.tsx / .web.tsx) and the page wrappers' select-all/bulk-delete
// filters, so "what's visible" and "what gets selected" always agree.
//
// Search matches a client's own fields AND its contact people (person of
// contact) by name + role, so typing a contact's name surfaces the company
// they belong to. State name ↔ abbreviation expansion is inherited from
// searchMatches (see usStates).

import { searchMatches } from './usStates';

export interface ClientSearchContact {
  name: string;
  role: string | null;
}

// Structural shape of the searchable fields on a ClientListItem. Declared
// here (rather than importing ClientListItem) to avoid a screen ↔ lib cycle.
export interface ClientSearchable {
  firstName: string;
  lastName: string;
  company: string | null;
  phoneDisplay: string | null;
  emailDisplay: string | null;
  city: string | null;
  state: string | null;
  contacts?: ClientSearchContact[];
}

function contactTerms(c: ClientSearchable): string[] {
  return (c.contacts ?? []).flatMap((ct) => [ct.name, ct.role]);
}

export function clientSearchHaystack(c: ClientSearchable): string {
  return [
    c.firstName,
    c.lastName,
    c.company,
    c.phoneDisplay,
    c.emailDisplay,
    c.city,
    c.state,
    ...contactTerms(c),
  ]
    .filter(Boolean)
    .join(' ');
}

export function clientMatchesSearch(c: ClientSearchable, search: string): boolean {
  return searchMatches(clientSearchHaystack(c), search);
}

// The two-line display for a client in a picker list: a person name on top,
// the company below. When a client has no distinct person name (e.g. it was
// imported as a company, so first_name == company), the company becomes the
// top line and is NOT repeated below — otherwise the picker shows the business
// name twice.
export function clientPickerDisplay(c: {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
}): { top: string; sub: string | null } {
  const person = [c.first_name, c.last_name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const company = (c.company ?? '').trim();
  const top = person || company;
  const sub = company && company !== top ? company : null;
  return { top, sub };
}

// Contacts whose name or role matches the active query. Empty when the
// search is blank — the list only surfaces a contact line to explain *why*
// a client showed up, so there's nothing to show without a query.
export function matchingContacts(
  c: ClientSearchable,
  search: string,
): ClientSearchContact[] {
  if (!search.trim()) return [];
  return (c.contacts ?? []).filter((ct) =>
    searchMatches([ct.name, ct.role].filter(Boolean).join(' '), search),
  );
}

// ─── Server-side picker search (job form) ──────────────────────────────────
// The job-form client picker used to depend on downloading EVERY client +
// contact before it was usable (minutes on big businesses). This searches the
// server instead: one alphabetical page matching the term across client
// fields AND contact names (via clientsQuery's searchOrClause), plus the
// matched clients' contacts so the picker can show "who you searched".
// Callers fall back to their locally-cached list when this throws (offline).

import { fetchClientsPage } from './clientsQuery';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = { from: (table: string) => any };

export async function searchClientsServer<T extends { id: string; first_name: string; last_name: string }>(
  supabase: AnySupabaseClient,
  businessId: string,
  term: string,
  select: string,
  limit = 50,
): Promise<(T & { contacts?: ClientSearchContact[] })[]> {
  const page = await fetchClientsPage<T>(supabase as never, select, {
    businessId,
    search: term.trim() || undefined,
    pageSize: limit,
  });
  const ids = page.clients.map((c) => c.id);
  const contactsByClient = new Map<string, ClientSearchContact[]>();
  if (ids.length) {
    const { data } = await supabase
      .from('client_contacts')
      .select('client_id, name, role')
      .in('client_id', ids)
      .limit(400);
    for (const ct of (data ?? []) as { client_id: string; name: string; role: string | null }[]) {
      (contactsByClient.get(ct.client_id) ?? contactsByClient.set(ct.client_id, []).get(ct.client_id)!)
        .push({ name: ct.name, role: ct.role });
    }
  }
  return page.clients.map((c) => ({ ...c, contacts: contactsByClient.get(c.id) }));
}

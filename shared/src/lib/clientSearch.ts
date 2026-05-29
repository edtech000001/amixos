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

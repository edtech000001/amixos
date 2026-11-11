// Duplicate handling for the client CSV import.
//
// The importer used to INSERT unconditionally, so re-importing a file — or
// importing a client that already existed — silently created a second copy of
// the client and of every contact. Nothing flagged it.
//
// These are pure functions so the decision logic can be tested directly and
// shared by both platforms; each app supplies its own dialog and does its own
// writes.

/** What to do with rows whose client already exists. */
export type DuplicateStrategy =
  /** Leave the existing client completely alone; import only genuinely new rows. */
  | 'skip'
  /** Fill in blanks only — never overwrite something already recorded — and add
   *  contacts that are not already on the client. */
  | 'merge'
  /** Overwrite the client's fields with whatever the file provides, and replace
   *  its contact list with the file's. */
  | 'replace';

/** Answer to a duplicate prompt: a strategy, or import those rows as new clients anyway. */
export type PossibleDuplicateChoice = DuplicateStrategy | 'new';

export interface ExistingClientLite {
  id: string;
  first_name: string;
  last_name: string | null;
  company: string | null;
}

export interface ContactLite {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  receives_email?: boolean;
  cc_on_invoices?: boolean;
  is_primary?: boolean;
}

/** Lowercase, collapse whitespace, strip accents — so "José  Ramos" and
 *  "Jose Ramos" are the same client. Mirrors normalizeName in dataImport.ts. */
export function normalizeKey(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lookup for "does this client already exist". A sure match needs BOTH the
 * person's name and the company to match: same name at a different company is
 * a different client, and so is a different person at the same company.
 * Company-only clients key on an empty name. A collision keeps the FIRST id.
 */
export interface ClientIndex {
  exact: Map<string, string>;
  byName: Map<string, string>;
  byCompany: Map<string, string>;
}

export function buildClientIndex(clients: ExistingClientLite[]): ClientIndex {
  const index: ClientIndex = { exact: new Map(), byName: new Map(), byCompany: new Map() };
  const put = (m: Map<string, string>, k: string, id: string) => { if (k && !m.has(k)) m.set(k, id); };
  for (const c of clients) {
    const name = normalizeKey(`${c.first_name} ${c.last_name ?? ''}`);
    const co = normalizeKey(c.company);
    if (name || co) put(index.exact, `${name}|${co}`, c.id);
    put(index.byName, name, c.id);
    put(index.byCompany, co, c.id);
  }
  return index;
}

/**
 * The existing client this row refers to, or null when it is new.
 * `possible` = the FILE is missing the name or the company, so only half could
 * be compared (name matches but the file has no company, or the reverse). The
 * user decides whether those are the same client or a new one.
 */
export function matchExistingClient(
  index: ClientIndex,
  fullName: string | null | undefined,
  company: string | null | undefined,
): { id: string; possible: boolean } | null {
  const name = normalizeKey(fullName);
  const co = normalizeKey(company);
  if (!name && !co) return null;
  const exact = index.exact.get(`${name}|${co}`);
  if (exact) return { id: exact, possible: false };
  const half = name && !co ? index.byName.get(name) : !name && co ? index.byCompany.get(co) : undefined;
  return half ? { id: half, possible: true } : null;
}

/** Treat '', null, undefined and whitespace as "not recorded". 0 and false are
 *  real values and must survive. */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Client columns an import can fill. 'replace' clears whichever of these the
 * file leaves blank or doesn't have (value = what "cleared" is for that
 * column). first_name and the timestamps are never cleared.
 */
const REPLACE_CLEARS: Record<string, unknown> = {
  last_name: '', company: null,
  phone_cell: null, phone_office: null, email_office: null, email_home: null,
  address: null, city: null, state: null, zip_code: null, notes: null,
  custom_fields: {},
};

/**
 * Fields to write for an existing client.
 *
 * merge   → only where the existing value is blank. Never destroys data the
 *           user has in the app: a stale CSV cannot overwrite a corrected
 *           phone number.
 * replace → the file is the master copy: every field it provides is written,
 *           and every importable field it is blank or silent about is cleared.
 */
export function clientFieldPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  strategy: Extract<DuplicateStrategy, 'merge' | 'replace'>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (isBlank(value)) continue;
    if (strategy === 'merge' && !isBlank(existing[key])) continue;
    if (existing[key] === value) continue; // no-op write
    patch[key] = value;
  }
  if (strategy === 'replace') {
    for (const [key, cleared] of Object.entries(REPLACE_CLEARS)) {
      if (!isBlank(incoming[key])) continue; // the file provides it
      const had = existing[key];
      if (isBlank(had) || (typeof had === 'object' && !Object.keys(had as object).length)) continue; // already empty
      patch[key] = cleared;
    }
  }
  return patch;
}

/** Identity of a contact within one client: email when present (people change
 *  roles and get renamed, addresses are stabler), else the name. */
function contactKey(c: ContactLite): string {
  const email = normalizeKey(c.email);
  return email ? `e:${email}` : `n:${normalizeKey(c.name)}`;
}

export interface ContactMergeResult {
  /** Contacts to insert. */
  toInsert: ContactLite[];
  /** Existing contacts to delete first — only ever populated for 'replace'. */
  toDeleteKeys: string[];
  /** How many incoming contacts were already present and left alone. */
  skipped: number;
}

/**
 * merge   → add only contacts the client does not already have. An existing
 *           contact is never modified, so a flag set by hand in the app is not
 *           reverted by an older export.
 * replace → the file's list becomes the list.
 */
export function mergeContacts(
  existing: ContactLite[],
  incoming: ContactLite[],
  strategy: Extract<DuplicateStrategy, 'merge' | 'replace'>,
): ContactMergeResult {
  if (strategy === 'replace') {
    return { toInsert: incoming, toDeleteKeys: existing.map(contactKey), skipped: 0 };
  }
  const have = new Set(existing.map(contactKey));
  const toInsert: ContactLite[] = [];
  let skipped = 0;
  for (const c of incoming) {
    const key = contactKey(c);
    // Also guard against the file listing the same person twice.
    if (have.has(key)) { skipped++; continue; }
    have.add(key);
    toInsert.push(c);
  }
  return { toInsert, toDeleteKeys: [], skipped };
}

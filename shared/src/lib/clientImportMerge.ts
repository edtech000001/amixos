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
 * Name → id and company → id, matching createClientResolver in importRunners so
 * the two importers agree on what "already exists" means. A collision keeps the
 * FIRST id: with two clients of the same name there is no right answer, and
 * picking deterministically beats picking arbitrarily.
 */
export function buildClientIndex(clients: ExistingClientLite[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of clients) {
    const name = normalizeKey(`${c.first_name} ${c.last_name ?? ''}`);
    if (name && !index.has(name)) index.set(name, c.id);
    const company = normalizeKey(c.company);
    if (company && !index.has(company)) index.set(company, c.id);
  }
  return index;
}

/** The existing client this row refers to, or null when it is new. Name wins
 *  over company: two people at one company must not collapse into one client. */
export function matchExistingClient(
  index: Map<string, string>,
  fullName: string | null | undefined,
  company: string | null | undefined,
): string | null {
  const byName = normalizeKey(fullName);
  if (byName && index.has(byName)) return index.get(byName)!;
  const byCompany = normalizeKey(company);
  if (byCompany && index.has(byCompany)) return index.get(byCompany)!;
  return null;
}

/** Treat '', null, undefined and whitespace as "not recorded". 0 and false are
 *  real values and must survive. */
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Fields to write for an existing client.
 *
 * merge   → only where the existing value is blank. Never destroys data the
 *           user has in the app: a stale CSV cannot overwrite a corrected
 *           phone number.
 * replace → every field the file actually provides. Blank cells are still
 *           skipped, so an empty column does not wipe a populated field —
 *           "replace" means "the file wins where it says something", not
 *           "erase everything the file is silent about".
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

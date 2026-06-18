// Alphabetical grouping for the clients list (web + mobile share the same
// ordering so the two platforms always show clients in the same sequence).

export interface NamedClient {
  firstName: string;
  lastName: string;
}

export interface ClientSection<T> {
  /** Single letter A–Z, '#' for digits/symbols, or '' for the flat search-results section. */
  title: string;
  data: T[];
}

export function clientDisplayName(c: NamedClient): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function clientSectionLetter(c: NamedClient): string {
  const first = clientDisplayName(c)
    .charAt(0)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

// Group key for the clients list: alphabetical by name (default), by a client
// field, or by a custom field (`custom:<field_key>`).
export type ClientGroupKey =
  | 'name'
  | 'company'
  | 'state'
  | 'city'
  | `custom:${string}`;

interface GroupableClient extends NamedClient {
  company?: string | null;
  city?: string | null;
  state?: string | null;
  customFields?: Record<string, string> | null;
}

// Persisted group-by preference (web: localStorage, mobile: AsyncStorage).
export const CLIENTS_GROUP_KEY = 'amixos.clients.groupBy';

/** Coerce a stored value into a valid ClientGroupKey; defaults to 'name'. */
export function parseClientGroupKey(raw: string | null | undefined): ClientGroupKey {
  if (raw === 'company' || raw === 'state' || raw === 'city') return raw;
  if (raw && raw.startsWith('custom:')) return raw as ClientGroupKey;
  return 'name';
}

/**
 * Group clients by the chosen key into titled sections (mirrors the jobs list).
 * `name` delegates to the A–Z grouping; the others bucket by the field value,
 * sort clients by name within each bucket, sort buckets alphabetically, and pin
 * the "missing value" bucket (title = opts.emptyLabel) last. `state` titles are
 * spelled out via opts.formatState. Searching collapses to one flat section.
 */
export function groupClients<T extends GroupableClient>(
  clients: T[],
  groupBy: ClientGroupKey,
  searching: boolean,
  opts: { emptyLabel: string; formatState?: (s: string) => string },
): ClientSection<T>[] {
  if (groupBy === 'name') return groupClientsByLetter(clients, searching);

  const sorted = [...clients].sort((a, b) =>
    clientDisplayName(a).localeCompare(clientDisplayName(b), 'es', { sensitivity: 'base' }),
  );
  if (searching) return sorted.length > 0 ? [{ title: '', data: sorted }] : [];

  const valueOf = (c: T): string | null => {
    if (groupBy === 'company') return c.company ?? null;
    if (groupBy === 'state') return c.state ?? null;
    if (groupBy === 'city') return c.city ?? null;
    return c.customFields?.[groupBy.slice('custom:'.length)] ?? null;
  };

  const map = new Map<string, { title: string; empty: boolean; data: T[] }>();
  for (const c of sorted) {
    const raw = valueOf(c)?.trim();
    const empty = !raw;
    const title = empty
      ? opts.emptyLabel
      : groupBy === 'state' && opts.formatState
        ? opts.formatState(raw as string)
        : (raw as string);
    const existing = map.get(title);
    if (existing) existing.data.push(c);
    else map.set(title, { title, empty, data: [c] });
  }

  return Array.from(map.values())
    .sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    })
    .map(({ title, data }) => ({ title, data }));
}

/**
 * Sort clients alphabetically and group them into letter sections.
 * While searching, returns a single untitled section (few results — letter
 * headers would just be noise).
 */
export function groupClientsByLetter<T extends NamedClient>(
  clients: T[],
  searching: boolean,
): ClientSection<T>[] {
  const sorted = [...clients].sort((a, b) =>
    clientDisplayName(a).localeCompare(clientDisplayName(b), 'es', { sensitivity: 'base' }),
  );
  if (searching) return sorted.length > 0 ? [{ title: '', data: sorted }] : [];

  const map = new Map<string, T[]>();
  for (const c of sorted) {
    const letter = clientSectionLetter(c);
    const arr = map.get(letter);
    if (arr) arr.push(c);
    else map.set(letter, [c]);
  }
  const sections = Array.from(map.entries(), ([title, data]) => ({ title, data }));
  // Digits/symbols sort before 'A'; move the '#' bucket to the end like the
  // iOS contacts index.
  const hashIdx = sections.findIndex(s => s.title === '#');
  if (hashIdx >= 0) sections.push(...sections.splice(hashIdx, 1));
  return sections;
}

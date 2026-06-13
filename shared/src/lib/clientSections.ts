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

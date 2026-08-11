// Full-name search arms for PostgREST or() clauses.
//
// Server-mode lists match first_name / last_name / company each against the
// WHOLE search term — so a multi-word term ("Jim McAllister") could never
// match anyone (no single column contains the full name) and full-name search
// silently failed everywhere server search is used (invoices, jobs, clients,
// pickers). Small businesses never noticed because their lists filter locally
// against the joined display name.
//
// These arms add the missing case: the term split across first + last name,
// in either order ("Jim McAllister" and "McAllister Jim" both hit). Terms
// with 3+ words treat the first word as one name part and the rest as the
// other ("Maria de la Cruz").

export const escLike = (s: string): string => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function fullNameOrArms(
  term: string,
  first = 'first_name',
  last = 'last_name',
): string[] {
  const words = term.trim().split(/\s+/);
  if (words.length < 2) return [];
  const like = (s: string) => `%${escLike(s)}%`;
  const head = words[0];
  const tail = words.slice(1).join(' ');
  return [
    `and(${first}.ilike.${like(head)},${last}.ilike.${like(tail)})`,
    `and(${first}.ilike.${like(tail)},${last}.ilike.${like(head)})`,
  ];
}
